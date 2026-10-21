//! Chat with an AI about the user's reports.
//!
//! Three providers: the official Claude Code and Codex CLIs (they use the user's own
//! subscription login) and any OpenAI-compatible endpoint with an API key, such as
//! OpenCode Go. The API key stays on this side and is never sent back to the UI.

use serde::{Deserialize, Serialize};
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::time::{Duration, Instant};

const CLI_TIMEOUT: Duration = Duration::from_secs(240);
const MAX_PROMPT_BYTES: usize = 400 * 1024;
pub const DEFAULT_BASE_URL: &str = "https://opencode.ai/zen/go/v1";

#[derive(Debug, Clone, Copy, Deserialize, Serialize, PartialEq, Eq)]
#[serde(rename_all = "kebab-case")]
pub enum Provider {
    ClaudeCli,
    CodexCli,
    OpenaiCompatible,
}

#[derive(Debug, Clone, Deserialize, Serialize, PartialEq, Eq)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ChatRequest {
    pub provider: Provider,
    pub system: String,
    pub messages: Vec<ChatMessage>,
    pub model: Option<String>,
    pub base_url: Option<String>,
}

#[derive(Debug, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AiStatus {
    pub claude: Option<String>,
    pub codex: Option<String>,
    pub has_key: bool,
}

/// Model names are passed as process arguments and JSON; keep them to a plain alphabet.
pub fn valid_model(model: &str) -> bool {
    !model.is_empty()
        && model.len() <= 100
        && model.chars().all(|c| c.is_ascii_alphanumeric() || "._:/-".contains(c))
}

pub fn validate(req: &ChatRequest) -> Result<(), String> {
    if req.messages.is_empty() || req.messages.last().map(|m| m.role.as_str()) != Some("user") {
        return Err("The conversation must end with a user message.".into());
    }
    if req.messages.iter().any(|m| m.role != "user" && m.role != "assistant") {
        return Err("Unknown message role.".into());
    }
    let size = req.system.len() + req.messages.iter().map(|m| m.content.len()).sum::<usize>();
    if size > MAX_PROMPT_BYTES {
        return Err("The conversation is too long. Start a new chat.".into());
    }
    if let Some(m) = req.model.as_deref().filter(|m| !m.is_empty()) {
        if !valid_model(m) {
            return Err("Invalid model name.".into());
        }
    }
    Ok(())
}

/// CLIs take one prompt: the transcript is flattened with clear speaker labels.
pub fn transcript(messages: &[ChatMessage]) -> String {
    if messages.len() == 1 {
        return messages[0].content.clone();
    }
    let mut out = String::from("Conversation so far:\n\n");
    for m in messages {
        let who = if m.role == "user" { "User" } else { "Assistant" };
        out.push_str(&format!("{who}: {}\n\n", m.content));
    }
    out.push_str("Reply to the last user message.");
    out
}

/// GUI launches often miss the shell PATH, so common install folders are searched too.
pub fn find_binary(name: &str, path_var: Option<&str>, home: Option<&Path>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = path_var.map(|p| std::env::split_paths(p).collect()).unwrap_or_default();
    if let Some(h) = home {
        for d in [".local/bin", ".local/share/mise/shims", ".npm-global/bin", ".bun/bin", ".volta/bin"] {
            dirs.push(h.join(d));
        }
    }
    dirs.push(PathBuf::from("/usr/local/bin"));
    dirs.push(PathBuf::from("/usr/bin"));
    dirs.into_iter().map(|d| d.join(name)).find(|p| is_executable(p))
}

fn is_executable(p: &Path) -> bool {
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        p.metadata().map(|m| m.is_file() && m.permissions().mode() & 0o111 != 0).unwrap_or(false)
    }
    #[cfg(not(unix))]
    {
        p.is_file()
    }
}

fn locate(name: &str) -> Option<PathBuf> {
    let home = std::env::var_os("HOME").map(PathBuf::from);
    find_binary(name, std::env::var("PATH").ok().as_deref(), home.as_deref())
}

pub fn status(key_file: &Path) -> AiStatus {
    AiStatus {
        claude: locate("claude").map(|p| p.display().to_string()),
        codex: locate("codex").map(|p| p.display().to_string()),
        has_key: read_key(key_file).is_some(),
    }
}

/// Runs a CLI with the prompt on stdin and a time limit; stderr becomes the error text.
pub fn run_cli(mut cmd: Command, stdin: &str, timeout: Duration) -> Result<String, String> {
    cmd.stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    let mut child = cmd.spawn().map_err(|e| format!("Could not start the assistant: {e}"))?;
    let mut input = child.stdin.take().ok_or("No stdin")?;
    let text = stdin.to_owned();
    let writer = std::thread::spawn(move || {
        let _ = input.write_all(text.as_bytes());
    });
    let mut out_pipe = child.stdout.take().ok_or("No stdout")?;
    let mut err_pipe = child.stderr.take().ok_or("No stderr")?;
    let out_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = out_pipe.read_to_string(&mut s);
        s
    });
    let err_reader = std::thread::spawn(move || {
        let mut s = String::new();
        let _ = err_pipe.read_to_string(&mut s);
        s
    });
    let start = Instant::now();
    let code = loop {
        if let Some(st) = child.try_wait().map_err(|e| e.to_string())? {
            break st;
        }
        if start.elapsed() > timeout {
            let _ = child.kill();
            let _ = child.wait();
            return Err("The assistant took too long to answer.".into());
        }
        std::thread::sleep(Duration::from_millis(100));
    };
    let _ = writer.join();
    let out = out_reader.join().unwrap_or_default();
    let err = err_reader.join().unwrap_or_default();
    if !code.success() {
        return Err(cli_error(&err, &out));
    }
    let answer = out.trim().to_string();
    if answer.is_empty() {
        return Err(cli_error(&err, "The assistant returned an empty answer."));
    }
    Ok(answer)
}

/// The most useful line of a CLI failure: its last ERROR line, else its last non-empty line.
pub fn cli_error(stderr: &str, fallback: &str) -> String {
    let lines: Vec<&str> = stderr.lines().map(str::trim).filter(|l| !l.is_empty()).collect();
    let pick = lines.iter().rev().find(|l| l.to_ascii_lowercase().contains("error")).or(lines.last());
    match pick {
        Some(l) => l.trim_start_matches("ERROR:").trim().chars().take(500).collect(),
        None => fallback.trim().chars().take(500).collect(),
    }
}

/// No tools, no session files, no MCP servers, no user settings: a plain answer only.
pub fn claude_command(bin: &Path, req: &ChatRequest) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(["-p", "--output-format", "text", "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", ""]);
    cmd.args(["--system-prompt", &req.system]);
    if let Some(m) = req.model.as_deref().filter(|m| !m.is_empty()) {
        cmd.args(["--model", m]);
    }
    cmd
}

/// Read-only sandbox, nothing persisted; the final message is written to `out_file`.
pub fn codex_command(bin: &Path, req: &ChatRequest, out_file: &Path, workdir: &Path) -> Command {
    let mut cmd = Command::new(bin);
    cmd.args(["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "--color", "never"]);
    cmd.arg("-C").arg(workdir);
    cmd.arg("-o").arg(out_file);
    if let Some(m) = req.model.as_deref().filter(|m| !m.is_empty()) {
        cmd.args(["-m", m]);
    }
    cmd.arg("-");
    cmd
}

pub fn chat_cli(req: &ChatRequest, scratch: &Path) -> Result<String, String> {
    match req.provider {
        Provider::ClaudeCli => {
            let bin = locate("claude").ok_or("Claude Code is not installed. Install it and run `claude` once to sign in.")?;
            run_cli(claude_command(&bin, req), &transcript(&req.messages), CLI_TIMEOUT)
        }
        Provider::CodexCli => {
            let bin = locate("codex").ok_or("Codex CLI is not installed. Install it and run `codex login` to sign in.")?;
            std::fs::create_dir_all(scratch).map_err(|e| e.to_string())?;
            let out_file = scratch.join(format!("codex-{}.txt", std::process::id()));
            // Codex has no system prompt flag, so the instructions lead the prompt.
            let prompt = format!("{}\n\n---\n\n{}", req.system, transcript(&req.messages));
            let result = run_cli(codex_command(&bin, req, &out_file, scratch), &prompt, CLI_TIMEOUT);
            let file = std::fs::read_to_string(&out_file).ok();
            let _ = std::fs::remove_file(&out_file);
            match (result, file) {
                (Ok(_), Some(text)) if !text.trim().is_empty() => Ok(text.trim().to_string()),
                (Ok(stdout), _) => Ok(stdout),
                (Err(e), _) => Err(e),
            }
        }
        Provider::OpenaiCompatible => Err("Not a CLI provider.".into()),
    }
}

/// Only HTTPS, or plain HTTP to this computer for local servers.
pub fn validate_base_url(raw: &str) -> Result<url::Url, String> {
    let u = url::Url::parse(raw.trim()).map_err(|_| "Invalid base URL.".to_string())?;
    let local = matches!(u.host_str(), Some("localhost") | Some("127.0.0.1") | Some("[::1]"));
    if u.scheme() == "https" || (u.scheme() == "http" && local) {
        Ok(u)
    } else {
        Err("The base URL must use https.".into())
    }
}

pub fn openai_body(req: &ChatRequest, model: &str) -> serde_json::Value {
    let mut messages = vec![serde_json::json!({ "role": "system", "content": req.system })];
    messages.extend(req.messages.iter().map(|m| serde_json::json!({ "role": m.role, "content": m.content })));
    serde_json::json!({ "model": model, "messages": messages })
}

pub fn parse_openai(status: u16, body: &str) -> Result<String, String> {
    let json: Option<serde_json::Value> = serde_json::from_str(body).ok();
    if !(200..300).contains(&status) {
        let detail = json
            .as_ref()
            .and_then(|j| j.pointer("/error/message").and_then(|v| v.as_str()).map(String::from))
            .unwrap_or_else(|| body.chars().take(300).collect());
        return Err(format!("The provider answered {status}: {detail}"));
    }
    json.as_ref()
        .and_then(|j| j.pointer("/choices/0/message/content"))
        .and_then(|v| v.as_str())
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .ok_or_else(|| "The provider returned no answer.".to_string())
}

pub async fn chat_openai(req: &ChatRequest, key: &str) -> Result<String, String> {
    let model = req.model.as_deref().filter(|m| !m.is_empty()).ok_or("Choose a model for this provider.")?;
    let base = validate_base_url(req.base_url.as_deref().unwrap_or(DEFAULT_BASE_URL))?;
    let endpoint = format!("{}/chat/completions", base.as_str().trim_end_matches('/'));
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(180))
        .redirect(reqwest::redirect::Policy::none())
        .build()
        .map_err(|e| e.to_string())?;
    let res = client
        .post(endpoint)
        .bearer_auth(key)
        .header("content-type", "application/json")
        .body(openai_body(req, model).to_string())
        .send()
        .await
        .map_err(|e| format!("Could not reach the provider: {e}"))?;
    let status = res.status().as_u16();
    let body = res.text().await.map_err(|e| e.to_string())?;
    parse_openai(status, &body)
}

pub fn read_key(file: &Path) -> Option<String> {
    std::fs::read_to_string(file).ok().map(|s| s.trim().to_string()).filter(|s| !s.is_empty())
}

/// Saves the key readable only by this user, or removes it with `None`.
pub fn write_key(file: &Path, key: Option<&str>) -> Result<(), String> {
    let key = key.map(str::trim).filter(|k| !k.is_empty());
    let Some(key) = key else {
        return match std::fs::remove_file(file) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    };
    if key.len() > 4096 || key.chars().any(|c| c.is_control()) {
        return Err("That does not look like an API key.".into());
    }
    if let Some(dir) = file.parent() {
        std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    }
    let mut opts = std::fs::OpenOptions::new();
    opts.write(true).create(true).truncate(true);
    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        opts.mode(0o600);
    }
    let mut f = opts.open(file).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        f.set_permissions(std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    f.write_all(key.as_bytes()).map_err(|e| e.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn msg(role: &str, content: &str) -> ChatMessage {
        ChatMessage { role: role.into(), content: content.into() }
    }
    fn req(provider: Provider, messages: Vec<ChatMessage>) -> ChatRequest {
        ChatRequest { provider, system: "sys".into(), messages, model: None, base_url: None }
    }
    fn scratch(name: &str) -> PathBuf {
        let d = std::env::temp_dir().join(format!("mm-ai-{name}-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&d);
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    #[test]
    fn validates_conversation_shape_and_model() {
        assert!(validate(&req(Provider::ClaudeCli, vec![msg("user", "hi")])).is_ok());
        assert!(validate(&req(Provider::ClaudeCli, vec![])).is_err());
        assert!(validate(&req(Provider::ClaudeCli, vec![msg("user", "a"), msg("assistant", "b")])).is_err());
        assert!(validate(&req(Provider::ClaudeCli, vec![msg("system", "x"), msg("user", "a")])).is_err());
        let mut r = req(Provider::ClaudeCli, vec![msg("user", "hi")]);
        r.model = Some("kimi-k2; rm -rf".into());
        assert!(validate(&r).is_err());
        r.model = Some("anthropic/claude-sonnet-4.5".into());
        assert!(validate(&r).is_ok());
    }

    #[test]
    fn flattens_history_for_clis() {
        assert_eq!(transcript(&[msg("user", "hi")]), "hi");
        let t = transcript(&[msg("user", "a"), msg("assistant", "b"), msg("user", "c")]);
        assert!(t.contains("User: a\n\nAssistant: b\n\nUser: c"));
        assert!(t.ends_with("Reply to the last user message."));
    }

    #[test]
    fn claude_runs_without_tools_sessions_or_settings() {
        let mut r = req(Provider::ClaudeCli, vec![msg("user", "hi")]);
        r.model = Some("sonnet".into());
        let cmd = claude_command(Path::new("/bin/claude"), &r);
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(args, ["-p", "--output-format", "text", "--tools", "", "--no-session-persistence", "--strict-mcp-config", "--setting-sources", "", "--system-prompt", "sys", "--model", "sonnet"]);
    }

    #[test]
    fn codex_runs_read_only_and_ephemeral() {
        let r = req(Provider::CodexCli, vec![msg("user", "hi")]);
        let cmd = codex_command(Path::new("/bin/codex"), &r, Path::new("/tmp/o.txt"), Path::new("/tmp/w"));
        let args: Vec<_> = cmd.get_args().map(|a| a.to_string_lossy().to_string()).collect();
        assert_eq!(args, ["exec", "--ephemeral", "--skip-git-repo-check", "-s", "read-only", "--color", "never", "-C", "/tmp/w", "-o", "/tmp/o.txt", "-"]);
    }

    #[cfg(unix)]
    #[test]
    fn runs_a_cli_and_reports_its_error_line() {
        let mut ok = Command::new("sh");
        ok.args(["-c", "cat"]);
        assert_eq!(run_cli(ok, "hello", Duration::from_secs(5)).unwrap(), "hello");
        let mut fail = Command::new("sh");
        fail.args(["-c", "echo 'hook: done' >&2; echo 'ERROR: You hit your usage limit.' >&2; exit 1"]);
        assert_eq!(run_cli(fail, "", Duration::from_secs(5)).unwrap_err(), "You hit your usage limit.");
        let mut slow = Command::new("sh");
        slow.args(["-c", "sleep 5"]);
        assert_eq!(run_cli(slow, "", Duration::from_millis(200)).unwrap_err(), "The assistant took too long to answer.");
    }

    #[cfg(unix)]
    #[test]
    fn finds_binaries_in_common_folders_when_path_is_short() {
        use std::os::unix::fs::PermissionsExt;
        let home = scratch("home");
        let bin = home.join(".local/bin");
        std::fs::create_dir_all(&bin).unwrap();
        let tool = bin.join("claude");
        std::fs::write(&tool, "#!/bin/sh\n").unwrap();
        std::fs::set_permissions(&tool, std::fs::Permissions::from_mode(0o755)).unwrap();
        assert_eq!(find_binary("claude", Some("/nonexistent"), Some(&home)), Some(tool));
        assert_eq!(find_binary("mm-no-such-tool", Some("/nonexistent"), Some(&home)), None);
        let _ = std::fs::remove_dir_all(home);
    }

    #[test]
    fn base_url_must_be_https_or_local() {
        assert!(validate_base_url("https://opencode.ai/zen/go/v1").is_ok());
        assert!(validate_base_url("http://localhost:11434/v1").is_ok());
        assert!(validate_base_url("http://example.com/v1").is_err());
        assert!(validate_base_url("file:///etc/passwd").is_err());
    }

    #[test]
    fn builds_and_parses_openai_requests() {
        let r = req(Provider::OpenaiCompatible, vec![msg("user", "hi")]);
        let body = openai_body(&r, "kimi-k2");
        assert_eq!(body["model"], "kimi-k2");
        assert_eq!(body["messages"][0], serde_json::json!({ "role": "system", "content": "sys" }));
        assert_eq!(body["messages"][1], serde_json::json!({ "role": "user", "content": "hi" }));
        assert_eq!(parse_openai(200, r#"{"choices":[{"message":{"content":" Hola "}}]}"#).unwrap(), "Hola");
        assert_eq!(parse_openai(401, r#"{"error":{"message":"Invalid key"}}"#).unwrap_err(), "The provider answered 401: Invalid key");
        assert!(parse_openai(200, "{}").is_err());
    }

    #[cfg(unix)]
    #[test]
    fn stores_the_key_private_and_removes_it() {
        use std::os::unix::fs::PermissionsExt;
        let dir = scratch("key");
        let file = dir.join("ai-key");
        write_key(&file, Some("  sk-test  ")).unwrap();
        assert_eq!(read_key(&file).as_deref(), Some("sk-test"));
        assert_eq!(file.metadata().unwrap().permissions().mode() & 0o777, 0o600);
        assert!(write_key(&file, Some("bad\nkey")).is_err());
        write_key(&file, None).unwrap();
        assert_eq!(read_key(&file), None);
        write_key(&file, None).unwrap();
        let _ = std::fs::remove_dir_all(dir);
    }
}

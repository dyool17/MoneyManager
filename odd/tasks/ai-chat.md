# AI chat over reports

Objective: chat with an AI about the user's reports. Branch `feat/ai-chat`. Delivery: single branch, work-unit commits. Tests: Vitest (frontend), `cargo test` (Rust).

## Specs

- S1. "quiero un chat conectado a una suscripción de ai que analice los datos y reportes y poder conversar al respecto."
- S2. Providers: Claude subscription through the official CLI (`claude -p`); ChatGPT subscription through the official CLI (`codex exec`); "opencodeGo? esa va por apikey dispongamos también de ese" (OpenAI-compatible endpoint by API key, base URL configurable, default `https://opencode.ai/zen/go/v1`).
- S3. Assumption: only aggregated reports are shared by default; transaction descriptions only when the user turns it on. The exact context sent is viewable.
- S4. Assumption: the API key lives in the Rust side (file with 0600 permissions in app data) and is never returned to the UI.
- S5. Provider errors (for example the Codex usage limit message) are shown to the user as returned.
- S6. Help view and README describe the chat, providers and what is shared.

## Tasks

| ID | Specs | Route | Status | Commit |
|---|---|---|---|---|
| T1 | S2, S4, S5 | inline | done | b541730 |
| T2 | S1, S3, S5, S6 | inline | done | e2aebd3 |

## Log

- L1 (2026-10-20): "quiero un chat conectado a una suscripción de ai que analice los datos y reportes y poder conversar al respecto ."
- L2: "pero entonces como le hace opencode o pi para hace los //login con suscripción de chatgpt por ejemplo?" → verified: ChatGPT via Codex OAuth (unofficial for third parties); Claude subscription OAuth blocked for third-party tools since 2026-01; official CLIs remain valid.
- L3: "y opencodeGo? esa va por apikey dispongamos también de ese"
- L4: Probes: `claude -p --tools "" --no-session-persistence --strict-mcp-config --setting-sources ""` answered OK. `codex exec --ephemeral --skip-git-repo-check -s read-only -o FILE -` reached the account, which hit its usage limit (exit 1, message on stderr).
- Route: inline, no writer trigger (two dependent units, parent context fine).
- L5: T1 done: 9 Rust tests (commands, timeouts, error line, key 0600, URL policy, OpenAI parse). Live `cargo test live_claude -- --ignored` passed (3.2 s).
- L6: T2 done: context builder, safe markdown, chat store and view, Help and README. 76 Vitest tests pass. Pending: Codex live answer (account at usage limit) and OpenCode Go (no key available); UI not exercised inside the Tauri window.
- L7: Independent verifier (Sonnet, medium): no blockers. Fixed advisories: leading '-' models, unique Codex output file, Claude runs in scratch dir, 100 KiB system cap, one-line descriptions. Live Claude re-run passed.
- L8: "me dejara seleccionar proveedores, modelo y effort?" → added effort per provider (claude --effort, codex -c model_reasoning_effort, OpenAI reasoning_effort only when set). Live Claude with effort low passed.

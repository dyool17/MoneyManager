mod backup;
mod export;
mod pcmanager;
mod writes;

use pcmanager::{Endpoint, PcManager, ReadParams};
use tauri::Manager;

/// The single bridge to the phone: GET on an allowlisted read endpoint.
#[tauri::command]
async fn mm_read(
    state: tauri::State<'_, PcManager>,
    base_url: String,
    endpoint: Endpoint,
    params: Option<ReadParams>,
) -> Result<String, String> {
    state.read(&base_url, endpoint, &params.unwrap_or_default()).await
}

/// Saves a local backup (app SQLite backup + raw snapshot) in the app data folder.
#[tauri::command]
async fn mm_backup(
    app: tauri::AppHandle,
    state: tauri::State<'_, PcManager>,
    base_url: String,
    period: ReadParams,
) -> Result<backup::BackupReport, String> {
    let root = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("No app data folder: {e}"))?
        .join("backups");
    backup::take(&state, &root, &base_url, &period).await
}

/// Saves a CSV built by the UI into the Downloads folder and returns its path.
#[tauri::command]
async fn mm_export_csv(
    app: tauri::AppHandle,
    start_date: String,
    end_date: String,
    content: String,
) -> Result<String, String> {
    let path = app.path();
    let dir = path
        .download_dir()
        .or_else(|_| path.document_dir())
        .or_else(|_| path.home_dir())
        .map_err(|e| format!("No folder to save the export: {e}"))?;
    let stamp = chrono::Local::now().format("%H%M%S").to_string();
    export::save_csv(&dir, &start_date, &end_date, &stamp, &content).map(|p| p.display().to_string())
}

#[derive(serde::Serialize)]
struct WriteLog<'a> {
    at: String,
    phone: &'a str,
    op: &'a writes::WriteOp,
    outcome: &'a str,
    error: Option<&'a str>,
}

/// Appends one line per attempted change to `<app data>/writes.log` (JSON lines).
fn log_write(app: &tauri::AppHandle, entry: &WriteLog) {
    use std::io::Write;
    let Ok(dir) = app.path().app_data_dir() else { return };
    let _ = std::fs::create_dir_all(&dir);
    if let (Ok(mut f), Ok(line)) = (
        std::fs::OpenOptions::new().create(true).append(true).open(dir.join("writes.log")),
        serde_json::to_string(entry),
    ) {
        let _ = writeln!(f, "{line}");
    }
}

/// Applies one typed change on the phone, after checking a recent backup exists.
#[tauri::command]
async fn mm_write(
    app: tauri::AppHandle,
    state: tauri::State<'_, PcManager>,
    base_url: String,
    op: writes::WriteOp,
) -> Result<(), String> {
    let req = op.request()?;
    state.require_recent_backup(&base_url, pcmanager::BACKUP_MAX_AGE)?;
    let result = state.write(&base_url, &req).await;
    let at = chrono::Local::now().to_rfc3339();
    let (outcome, error) = match &result {
        Ok(_) => ("applied", None),
        Err(e) => ("failed", Some(e.as_str())),
    };
    log_write(&app, &WriteLog { at, phone: &base_url, op: &op, outcome, error });
    result.map(|_| ())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PcManager::new())
        .invoke_handler(tauri::generate_handler![mm_read, mm_backup, mm_export_csv, mm_write])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

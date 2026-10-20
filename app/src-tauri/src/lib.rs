mod backup;
mod export;
mod pcmanager;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PcManager::new())
        .invoke_handler(tauri::generate_handler![mm_read, mm_backup, mm_export_csv])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

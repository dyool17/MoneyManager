mod backup;
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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PcManager::new())
        .invoke_handler(tauri::generate_handler![mm_read, mm_backup])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

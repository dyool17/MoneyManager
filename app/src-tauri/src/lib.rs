mod pcmanager;

use pcmanager::{Endpoint, PcManager, ReadParams};

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(PcManager::new())
        .invoke_handler(tauri::generate_handler![mm_read])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

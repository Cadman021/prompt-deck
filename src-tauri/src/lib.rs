// src-tauri/src/lib.rs

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Initialize SQLite Plugin
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Open external URLs (e.g. API-key pages) in the system browser
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_process::init())
        // Signed in-app updates (see plugins.updater in tauri.conf.json)
        .plugin(tauri_plugin_updater::Builder::new().build())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

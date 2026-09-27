// src-tauri/src/lib.rs

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        // Initialize SQLite Plugin
        .plugin(tauri_plugin_sql::Builder::default().build())
        // Open external URLs (e.g. API-key pages) in the system browser
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

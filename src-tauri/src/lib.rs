// src-tauri/src/lib.rs

/// Service namespace is fixed in Rust on purpose: the frontend only ever
/// supplies the key id (`account`), so JS cannot read/write arbitrary
/// credential scopes even if the webview were compromised.
const KEYCHAIN_SERVICE: &str = "promptdeck-cloud";

/// OS keychain access for cloud API keys. Secrets never touch localStorage:
/// the frontend keeps only an in-memory cache plus a last-4 fingerprint.
#[tauri::command]
fn keychain_set(account: String, password: String) -> Result<(), String> {
    keyring::Entry::new(KEYCHAIN_SERVICE, &account)
        .and_then(|entry| entry.set_password(&password))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn keychain_get(account: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
fn keychain_delete(account: String) -> Result<(), String> {
    let entry = keyring::Entry::new(KEYCHAIN_SERVICE, &account).map_err(|e| e.to_string())?;
    match entry.delete_password() {
        Ok(()) => Ok(()),
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(e) => Err(e.to_string()),
    }
}

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
        .invoke_handler(tauri::generate_handler![
            keychain_set,
            keychain_get,
            keychain_delete
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

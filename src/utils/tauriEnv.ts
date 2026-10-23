// src/utils/tauriEnv.ts
// Is this build running inside the Tauri shell, or plain `vite dev` in a
// browser? Feature detection, not a build flag, so the same bundle works both
// ways — several util modules (notifications, updater, keychain) only exist
// under Tauri and must no-op elsewhere.

/** Tauri v2 marks the webview with this global before any app code runs. */
export function isTauri(): boolean {
  if (typeof window === 'undefined') return false;
  return '__TAURI_INTERNALS__' in window;
}

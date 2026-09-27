// src/utils/openExternal.ts
// Plain `<a target="_blank">` does nothing inside Tauri's webview — external
// URLs must go through the opener plugin (needs `opener:default` permission,
// already in capabilities/default.json). Falls back to window.open when
// running outside Tauri (plain `vite dev` in a browser).
import { openUrl } from '@tauri-apps/plugin-opener';

export async function openExternal(url: string): Promise<void> {
  try {
    await openUrl(url);
  } catch {
    window.open(url, '_blank', 'noopener,noreferrer');
  }
}

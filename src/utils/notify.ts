// src/utils/notify.ts
// Desktop notification for a finished run.
//
// A benchmark can take minutes on local hardware, and the whole point is that
// the user walks away while it runs. The notification only fires when the
// window is not focused — if they are looking at the app, the toast and the
// verdict bar already say what happened, and a system popup on top of that is
// noise.
//
// Degrades quietly: outside Tauri (`vite dev` in a browser) the import fails
// and this resolves to doing nothing.
import { isTauri } from './tauriEnv';

export interface NotifyOptions {
  title: string;
  body: string;
}

/** True when a system notification would actually be seen. */
export function shouldNotify(): boolean {
  // `document.hasFocus()` is the cheapest reliable signal, but a minimized
  // window also reports no focus, which is exactly when we do want to fire.
  return !document.hasFocus() || document.visibilityState === 'hidden';
}

/**
 * Posts a desktop notification. Resolves regardless of outcome — callers are
 * inside run-completion callbacks and must not handle failures.
 */
export async function notify({ title, body }: NotifyOptions): Promise<void> {
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, requestPermission, sendNotification } = await import(
      '@tauri-apps/plugin-notification'
    );
    let granted = await isPermissionGranted();
    if (!granted) {
      granted = (await requestPermission()) === 'granted';
    }
    if (!granted) return;
    sendNotification({ title, body });
  } catch {
    // Plugin missing, permission denied, or not in Tauri — all non-fatal.
  }
}

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

let permissionAsked = false;

/**
 * Asks the OS for notification permission exactly once per session.
 *
 * Called when the user turns notifications on in Settings — never from a run
 * callback. The request is a one-shot system dialog: firing it while a
 * benchmark ends in the background would (a) pop unexpectedly, (b) only be
 * seen as intrusive, and (c) on some platforms get silently denied, which
 * burns the single chance the OS gives us.
 *
 * Resolves to the final grant state. Safe to call outside Tauri (`false`).
 */
export async function requestNotifyPermission(): Promise<boolean> {
  if (!isTauri() || permissionAsked) return false;
  permissionAsked = true;
  try {
    const { isPermissionGranted, requestPermission } =
      await import('@tauri-apps/plugin-notification');
    if (await isPermissionGranted()) return true;
    return (await requestPermission()) === 'granted';
  } catch {
    return false;
  }
}

/**
 * Posts a desktop notification. Resolves regardless of outcome — callers are
 * inside run-completion callbacks and must not handle failures.
 *
 * Deliberately does NOT request permission: that one-shot dialog belongs to
 * the settings toggle (`requestNotifyPermission`). If permission is missing
 * here, the run still completes silently rather than interrupting the user.
 */
export async function notify({ title, body }: NotifyOptions): Promise<void> {
  if (!isTauri()) return;
  try {
    const { isPermissionGranted, sendNotification } =
      await import('@tauri-apps/plugin-notification');
    if (!(await isPermissionGranted())) return;
    sendNotification({ title, body });
  } catch {
    // Plugin missing, permission denied, or not in Tauri — all non-fatal.
  }
}

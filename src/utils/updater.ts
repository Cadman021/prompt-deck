// src/utils/updater.ts
// One place that knows how to ask GitHub for a newer release, so both the
// launch-time prompt and the manual "Check for updates" button in Settings
// behave identically. Everything no-ops (rather than throws) outside Tauri.

import { isTauri } from './tauriEnv';

export type UpdateCheck =
  | { kind: 'update'; version: string }
  | { kind: 'latest' }
  | { kind: 'unavailable' }
  | { kind: 'error'; message: string };

/**
 * Queries the updater endpoint configured in tauri.conf.json.
 *
 * `latest` means the endpoint answered and nothing newer exists — that is the
 * distinction that makes a release verifiable: seeing "You're on the latest
 * version" proves latest.json is reachable and signed correctly.
 */
export async function checkForUpdate(currentVersion: string): Promise<UpdateCheck> {
  if (!isTauri()) return { kind: 'unavailable' };
  try {
    const { check } = await import('@tauri-apps/plugin-updater');
    const update = await check();
    if (!update) return { kind: 'latest' };
    if (update.version === currentVersion) return { kind: 'latest' };
    return { kind: 'update', version: update.version };
  } catch (error) {
    return { kind: 'error', message: error instanceof Error ? error.message : String(error) };
  }
}

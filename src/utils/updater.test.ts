// Unit tests for the update-check helper (no Tauri, no network).
import { describe, expect, it } from 'vitest';
import { checkForUpdate } from './updater';

describe('checkForUpdate', () => {
  it('reports "unavailable" outside Tauri instead of throwing', async () => {
    // Vitest runs in plain Node — no `__TAURI_INTERNALS__` global.
    await expect(checkForUpdate('1.6.0')).resolves.toEqual({ kind: 'unavailable' });
  });
});

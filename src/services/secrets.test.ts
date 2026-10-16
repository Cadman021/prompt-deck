// Unit tests for the secrets cache + keychain migration logic.
// The real keychain (Tauri invoke) is unavailable in node, so keychain paths
// are exercised through their failure fallbacks.
import { describe, expect, it } from 'vitest';
import {
  cacheSecret,
  detectBackend,
  fingerprint,
  initSecrets,
  migrateToKeychain,
  secretFor,
} from './secrets';

describe('secrets cache', () => {
  it('seeds from stored fields and prefers the cache', async () => {
    await initSecrets(() => [{ id: 'k1', apiKey: 'sk-live' }]);
    // Cache hit wins even if the field later changes.
    expect(secretFor({ id: 'k1', apiKey: 'sk-stale' })).toBe('sk-live');
  });

  it('falls back to the field for unknown ids', () => {
    expect(secretFor({ id: 'nope', apiKey: 'sk-fallback' })).toBe('sk-fallback');
    expect(secretFor({ id: 'nope', apiKey: '' })).toBe('');
  });

  it('evicts on delete', () => {
    cacheSecret('k2', 'sk-x');
    expect(secretFor({ id: 'k2', apiKey: '' })).toBe('sk-x');
    cacheSecret('k2', null);
    expect(secretFor({ id: 'k2', apiKey: '' })).toBe('');
  });

  it('fingerprints without leaking', () => {
    expect(fingerprint('sk-abcdefgh')).toBe('••••efgh');
    expect(fingerprint('')).toBe('');
    expect(fingerprint(undefined)).toBe('');
  });
});

describe('keychain backend detection', () => {
  it('falls back to local outside Tauri', async () => {
    await expect(detectBackend()).resolves.toBe('local');
  });
});

describe('migrateToKeychain', () => {
  it('reports failures without throwing when the keychain is unreachable', async () => {
    const persisted: { id: string; keyHint: string }[] = [];
    const result = await migrateToKeychain({
      keys: [{ id: 'k3', apiKey: 'sk-y' }],
      persistMigrated: (id, keyHint) => {
        persisted.push({ id, keyHint });
      },
    });
    // No keychain in node: nothing migrated, nothing persisted, nothing thrown.
    expect(result).toEqual({ migrated: [], failed: ['k3'] });
    expect(persisted).toEqual([]);
  });

  it('skips empty fields and already-migrated keys', async () => {
    const result = await migrateToKeychain({
      keys: [
        { id: 'e1', apiKey: '' },
        { id: 'e2', apiKey: 'sk-z', storage: 'keychain' },
      ],
      persistMigrated: () => {
        throw new Error('must not be called');
      },
    });
    expect(result).toEqual({ migrated: [], failed: [] });
  });
});

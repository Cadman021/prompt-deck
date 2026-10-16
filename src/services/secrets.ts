// src/services/secrets.ts
// Single choke point for cloud API-key secrets.
//
// Backends:
// - `local` (fallback): the persisted store field (plaintext, same trust as
//   the rest of this single-user local app). Used in plain-browser dev and
//   whenever the keychain is unreachable.
// - `keychain` (preferred under Tauri): OS credential store via three tiny
//   Rust commands (`keychain_set/get/delete`, see src-tauri/src/lib.rs).
//   Secrets live in the keychain + this module's in-memory cache — never in
//   localStorage. Reads stay synchronous through the cache so hot paths
//   (endpoint resolution) don't turn async.

import { invoke } from '@tauri-apps/api/core';

export const KEYCHAIN_SERVICE = 'promptdeck-cloud';

export interface SecretHolder {
  id: string;
  apiKey: string;
  storage?: 'keychain' | 'local';
}

const cache = new Map<string, string>();
let backend: 'keychain' | 'local' | null = null;

/** Low-level keychain wrappers (throw when unavailable). */
export async function keychainSet(account: string, password: string): Promise<void> {
  await invoke('keychain_set', { service: KEYCHAIN_SERVICE, account, password });
}

export async function keychainGet(account: string): Promise<string | null> {
  return await invoke<string | null>('keychain_get', {
    service: KEYCHAIN_SERVICE,
    account,
  });
}

export async function keychainDelete(account: string): Promise<void> {
  await invoke('keychain_delete', { service: KEYCHAIN_SERVICE, account });
}

/** Probe once whether the keychain backend answers. */
export async function detectBackend(): Promise<'keychain' | 'local'> {
  if (backend) return backend;
  try {
    await keychainGet('__probe__');
    backend = 'keychain';
  } catch {
    backend = 'local';
  }
  return backend;
}

export function currentBackend(): 'keychain' | 'local' {
  return backend ?? 'local';
}

export interface MigrationIo {
  keys: SecretHolder[];
  /** Persist a migrated key: store secret location + fingerprint, clear field. */
  persistMigrated: (id: string, keyHint: string) => void;
}

/**
 * Move plaintext store secrets into the keychain (one time). Returns per-key
 * results so the caller can report; keys that fail stay local and keep
 * working — migration never breaks a working setup.
 */
export async function migrateToKeychain(io: MigrationIo): Promise<{ migrated: string[]; failed: string[] }> {
  const migrated: string[] = [];
  const failed: string[] = [];
  for (const k of io.keys) {
    if (!k.apiKey?.trim() || k.storage === 'keychain') continue;
    try {
      await keychainSet(k.id, k.apiKey.trim());
      io.persistMigrated(k.id, fingerprint(k.apiKey));
      cache.set(k.id, k.apiKey.trim());
      migrated.push(k.id);
    } catch {
      failed.push(k.id);
    }
  }
  return { migrated, failed };
}

/**
 * Startup entry point. Detects the backend, migrates legacy plaintext fields
 * into the keychain when possible, then seeds the read cache (keychain first,
 * store fields as fallback). Never throws. Must complete before the first
 * cloud run so sync reads never observe an empty cache.
 */
export async function initSecrets(
  getKeys: () => SecretHolder[],
  persistMigrated?: (id: string, keyHint: string) => void
): Promise<'keychain' | 'local'> {
  cache.clear();
  let mode: 'keychain' | 'local';
  try {
    mode = await detectBackend();
  } catch {
    mode = 'local';
  }
  if (mode !== 'keychain') {
    for (const k of getKeys()) {
      if (k.apiKey?.trim()) cache.set(k.id, k.apiKey);
    }
    return 'local';
  }
  if (persistMigrated) {
    try {
      await migrateToKeychain({ keys: getKeys(), persistMigrated });
    } catch {
      // Per-key failures are collected inside migrateToKeychain; a total
      // failure just means everything falls back to store fields below.
    }
  }
  for (const k of getKeys()) {
    if (k.storage === 'keychain' || !k.apiKey) {
      try {
        const v = await keychainGet(k.id);
        if (v) {
          cache.set(k.id, v);
          continue;
        }
      } catch {
        // Fall through to the persisted field below.
      }
    }
    if (k.apiKey?.trim()) cache.set(k.id, k.apiKey);
  }
  return 'keychain';
}

/** The secret to actually send. Cache first, persisted field as fallback. */
export function secretFor(conn: SecretHolder): string {
  return cache.get(conn.id) ?? conn.apiKey;
}

/** Keep the cache in sync on save/delete. */
export function cacheSecret(id: string, value: string | null): void {
  if (value) cache.set(id, value);
  else cache.delete(id);
}

/** Display-safe fingerprint for UI (last 4 chars only, never the secret). */
export function fingerprint(secret: string | undefined | null): string {
  if (!secret) return '';
  return `••••${secret.slice(-4)}`;
}

/** Test-only: inspect cache state. */
export function __cacheSizeForTests(): number {
  return cache.size;
}

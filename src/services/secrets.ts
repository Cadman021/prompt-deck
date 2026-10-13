// src/services/secrets.ts
// Single choke point for cloud API-key secrets.
//
// Current backend is the persisted store field (plaintext, same trust level
// as the rest of this single-user local app). The planned OS-keychain backend
// plugs in here WITHOUT touching call sites:
//
//   1. Add the `keyring` crate + 3 tiny commands (get/set/delete) + capability
//      entries, and verify the Tauri build on a real OS (cannot be checked
//      from a frontend-only environment — do not ship blind).
//   2. In initSecrets(): pull each id from the keychain into `cache`, then
//      clear the store fields (one store write).
//   3. In cacheSecret(): write through to the keychain first.
//
// Until then, every secret read goes through secretFor() and every write
// through cacheSecret(), so nothing else needs to change.

export interface SecretHolder {
  id: string;
  apiKey: string;
}

const cache = new Map<string, string>();

/** Seed the cache (call once at startup, after store rehydration). */
export function initSecrets(keys: SecretHolder[]): void {
  cache.clear();
  for (const k of keys) {
    if (k.apiKey?.trim()) cache.set(k.id, k.apiKey);
  }
}

/** The secret to actually send. Cache first, persisted field as fallback. */
export function secretFor(conn: SecretHolder): string {
  return cache.get(conn.id) ?? conn.apiKey;
}

/** Keep the cache in sync on save/delete. Returns the value for chaining. */
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

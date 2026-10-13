// Unit tests for the secrets cache (single choke point for API keys).
import { describe, expect, it } from 'vitest';
import { cacheSecret, fingerprint, initSecrets, secretFor } from './secrets';

describe('secrets cache', () => {
  it('seeds from stored fields and prefers the cache', () => {
    initSecrets([{ id: 'k1', apiKey: 'sk-live' }]);
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

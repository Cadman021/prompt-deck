// Unit tests for the model-target helpers (source disambiguation + cost).
import { describe, expect, it } from 'vitest';
import {
  CLOUD_PREFIX,
  calcCost,
  formatCost,
  parseQualified,
  qualifiedName,
  resolveCloudTarget,
  shortModelName,
} from './modelTarget';
import { applyUrlVars, missingUrlVars } from '../data/cloudProviders';

describe('qualifiedName', () => {
  it('leaves local models untouched', () => {
    expect(qualifiedName({ kind: 'local' }, 'llama3')).toBe('llama3');
    expect(qualifiedName({ kind: 'local' }, 'openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b');
  });

  it('prefixes cloud models explicitly', () => {
    expect(qualifiedName({ kind: 'cloud', providerId: 'openrouter' }, 'openai/gpt-4o-mini')).toBe(
      'cloud:openrouter/openai/gpt-4o-mini'
    );
  });
});

describe('parseQualified', () => {
  const custom = [
    {
      id: 'mine',
      name: 'Mine',
      defaultBaseUrl: 'https://x/v1',
      protocol: 'openai-compatible' as const,
      keyUrl: '',
      color: '',
      initials: '',
      custom: true as const,
    },
  ];

  it('parses the explicit cloud: prefix without consulting the catalog', () => {
    // A local LM Studio model that happens to share a provider id must NOT
    // match here — the prefix is the only thing that makes it cloud.
    expect(parseQualified('cloud:openai/gpt-4o', [])).toEqual({
      source: { kind: 'cloud', providerId: 'openai' },
      model: 'gpt-4o',
    });
  });

  it('treats unknown prefixes as local (no catalog match, no prefix)', () => {
    expect(parseQualified('acme/gpt-oss-20b', [])).toEqual({
      source: { kind: 'local' },
      model: 'acme/gpt-oss-20b',
    });
    expect(parseQualified('llama3', [])).toEqual({
      source: { kind: 'local' },
      model: 'llama3',
    });
  });

  it('honors legacy provider/model rows from old history', () => {
    // NOTE: the collision fix lives on the write side (explicit `cloud:`
    // prefix + DB source columns). This branch preserves the old resolution
    // byte-for-byte for pre-prefix rows; genuinely ambiguous legacy rows
    // (local `openai/*` models) resolve as before and can be re-picked
    // from the dropdown in one click.
    expect(parseQualified('openrouter/openai/gpt-4o-mini', custom)).toEqual({
      source: { kind: 'cloud', providerId: 'openrouter' },
      model: 'openai/gpt-4o-mini',
    });
  });

  it('resolves custom provider ids in both formats', () => {
    expect(parseQualified('cloud:mine/foo', custom)).toEqual({
      source: { kind: 'cloud', providerId: 'mine' },
      model: 'foo',
    });
    expect(parseQualified('mine/foo', custom)).toEqual({
      source: { kind: 'cloud', providerId: 'mine' },
      model: 'foo',
    });
  });

  it('round-trips qualifiedName', () => {
    const q = qualifiedName({ kind: 'cloud', providerId: 'groq' }, 'llama-3.3-70b-versatile');
    expect(parseQualified(q, [])).toEqual({
      source: { kind: 'cloud', providerId: 'groq' },
      model: 'llama-3.3-70b-versatile',
    });
  });
});

describe('shortModelName', () => {
  it('strips the cloud prefix', () => {
    expect(shortModelName('cloud:openrouter/openai/gpt-4o-mini')).toBe('openai/gpt-4o-mini');
  });

  it('never truncates local names', () => {
    expect(shortModelName('openai/gpt-oss-20b')).toBe('openai/gpt-oss-20b');
    expect(shortModelName('llama3:latest')).toBe('llama3:latest');
  });
});

describe('calcCost / formatCost', () => {
  it('returns null unless tokens and pricing are all known', () => {
    expect(calcCost(undefined, 10, { prompt: 1, completion: 2 })).toBeNull();
    expect(calcCost(10, undefined, { prompt: 1, completion: 2 })).toBeNull();
    expect(calcCost(10, 10, undefined)).toBeNull();
    expect(calcCost(1000, 500, { prompt: 0.000002, completion: 0.00001 })).toBeCloseTo(0.007, 9);
  });

  it('formats without scientific notation', () => {
    expect(formatCost(0.0000123)).toBe('$0.00001');
    expect(formatCost(0.123456)).toBe('$0.1235');
    expect(formatCost(1.234)).toBe('$1.23');
    expect(formatCost(2500)).toBe('$2.50K');
  });
});

describe('resolveCloudTarget', () => {
  const keys = [{ id: 'k1', providerId: 'openrouter', apiKey: 'sk-x', enabled: true }];
  const custom: Parameters<typeof resolveCloudTarget>[1] = [];

  it('resolves a known provider with an enabled key', () => {
    const r = resolveCloudTarget('openrouter', custom, keys);
    expect('config' in r && r.config.baseUrl).toBe('https://openrouter.ai/api/v1');
    expect('config' in r && r.config.apiKey).toBe('sk-x');
  });

  it('reports unknown providers and missing keys distinctly', () => {
    expect(resolveCloudTarget('nope', custom, keys)).toEqual({ error: 'unknownProvider' });
    expect(resolveCloudTarget('openrouter', custom, [])).toEqual({ error: 'noCloudKey' });
    expect(
      resolveCloudTarget('openrouter', custom, [
        { id: 'k2', providerId: 'openrouter', apiKey: ' ', enabled: true },
      ])
    ).toEqual({ error: 'noCloudKey' });
  });

  it('fills base-URL placeholders from the connection vars', () => {
    const r = resolveCloudTarget('cloudflare', custom, [
      {
        id: 'cf1',
        providerId: 'cloudflare',
        apiKey: 'sk-cf',
        enabled: true,
        connectionVars: { ACCOUNT_ID: 'abc123' },
      },
    ]);
    expect('config' in r && r.config.baseUrl).toBe(
      'https://api.cloudflare.com/client/v4/accounts/abc123/ai/v1'
    );
  });

  it('refuses a connection whose placeholder is still empty', () => {
    expect(
      resolveCloudTarget('cloudflare', custom, [
        { id: 'cf2', providerId: 'cloudflare', apiKey: 'sk-cf', enabled: true },
      ])
    ).toEqual({ error: 'missingUrlVar' });
  });

  it('skips an incomplete connection when another one is complete', () => {
    const r = resolveCloudTarget('cloudflare', custom, [
      { id: 'cf3', providerId: 'cloudflare', apiKey: 'sk-a', enabled: true },
      {
        id: 'cf4',
        providerId: 'cloudflare',
        apiKey: 'sk-b',
        enabled: true,
        connectionVars: { ACCOUNT_ID: 'zzz' },
      },
    ]);
    expect('config' in r && r.config.apiKey).toBe('sk-b');
  });
});

describe('applyUrlVars / missingUrlVars', () => {
  it('substitutes only known, non-empty values', () => {
    expect(applyUrlVars('https://x/{A}/v1', { A: 'one' })).toBe('https://x/one/v1');
    expect(applyUrlVars('https://x/{A}/v1', { A: '  ' })).toBe('https://x/{A}/v1');
    expect(applyUrlVars('https://x/v1', undefined)).toBe('https://x/v1');
  });

  it('lists the tokens still missing', () => {
    expect(missingUrlVars('https://x/{A}/{B}/v1', { A: '1' })).toEqual(['B']);
    expect(missingUrlVars('https://x/v1', undefined)).toEqual([]);
  });

  it('refuses values that could escape their URL segment', () => {
    // A slash would silently retarget the path; a `?` would add a query.
    expect(applyUrlVars('https://x/{A}/v1', { A: 'a/b' })).toBe('https://x/{A}/v1');
    expect(applyUrlVars('https://x/{A}/v1', { A: 'a?key=b' })).toBe('https://x/{A}/v1');
    expect(applyUrlVars('https://x/{A}/v1', { A: 'a{b}' })).toBe('https://x/{A}/v1');
    expect(applyUrlVars('https://x/{A}/v1', { A: 'a b' })).toBe('https://x/{A}/v1');
    // Percent-encoded characters must not smuggle a slash back in.
    expect(applyUrlVars('https://x/{A}/v1', { A: 'a%2Fb' })).toBe('https://x/{A}/v1');
  });

  it('reports an unusable value as missing, not as filled', () => {
    expect(missingUrlVars('https://x/{A}/v1', { A: 'a/b' })).toEqual(['A']);
  });

  it('accepts the id shapes providers actually issue', () => {
    for (const ok of ['abc123', 'aB3-_x.y~z', 'f'.repeat(32)]) {
      expect(applyUrlVars('https://x/{A}', { A: ok })).toBe(`https://x/${ok}`);
    }
  });
});

describe('CLOUD_PREFIX', () => {
  it('is a non-empty namespaced marker', () => {
    expect(CLOUD_PREFIX).toBe('cloud:');
  });
});

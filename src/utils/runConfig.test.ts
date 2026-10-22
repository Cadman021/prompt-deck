import { describe, expect, it } from 'vitest';
import { parseRunConfig } from './runConfig';

describe('parseRunConfig', () => {
  it('returns an empty config for missing or broken JSON', () => {
    expect(parseRunConfig(undefined)).toEqual({});
    expect(parseRunConfig(null)).toEqual({});
    expect(parseRunConfig('')).toEqual({});
    expect(parseRunConfig('{not json')).toEqual({});
    expect(parseRunConfig('[1,2,3]')).toEqual({});
    expect(parseRunConfig('"text"')).toEqual({});
  });

  it('restores the sampling settings a run was made with', () => {
    const cfg = parseRunConfig(
      JSON.stringify({
        system: 'Answer briefly.',
        temperature: 0.3,
        top_p: 0.8,
        num_ctx: 8192,
        serverDefaults: false,
        seed: 42,
        maxTokens: 512,
        repeats: 3,
      })
    );
    expect(cfg).toEqual({
      system: 'Answer briefly.',
      temperature: 0.3,
      top_p: 0.8,
      num_ctx: 8192,
      serverDefaults: false,
      seed: 42,
      maxTokens: 512,
      repeats: 3,
    });
  });

  it('ignores unknown keys written by older or newer versions', () => {
    const cfg = parseRunConfig(
      JSON.stringify({
        provider: 'ollama',
        host: 'http://x',
        runMode: 'parallel',
        temperature: 0.5,
      })
    );
    expect(cfg).toEqual({ temperature: 0.5 });
  });

  it('drops fields with the wrong type instead of casting them', () => {
    const cfg = parseRunConfig(
      JSON.stringify({
        system: 7,
        temperature: 'hot',
        top_p: null,
        num_ctx: Number.NaN,
        serverDefaults: 'yes',
        seed: 'abc',
        maxTokens: {},
        repeats: 0,
      })
    );
    expect(cfg).toEqual({});
  });

  it('keeps an explicit null cap and seed', () => {
    expect(parseRunConfig(JSON.stringify({ maxTokens: null, seed: null }))).toEqual({
      maxTokens: null,
      seed: null,
    });
  });

  it('rounds repeats down and rejects zero', () => {
    expect(parseRunConfig(JSON.stringify({ repeats: 2.7 })).repeats).toBe(2);
    expect(parseRunConfig(JSON.stringify({ repeats: 0.5 })).repeats).toBeUndefined();
  });

  it('restores per-model overrides, dropping junk entries', () => {
    const cfg = parseRunConfig(
      JSON.stringify({
        slotParams: {
          'local:llama3': { temperature: 1.1, maxTokens: 128 },
          'cloud:openai/gpt-4o-mini': { top_p: 0.5, num_ctx: 4096 },
          broken: 'nope',
          empty: {},
          stringy: { temperature: 'warm' },
        },
      })
    );
    expect(cfg.slotParams).toEqual({
      'local:llama3': { temperature: 1.1, maxTokens: 128 },
      'cloud:openai/gpt-4o-mini': { top_p: 0.5, num_ctx: 4096 },
    });
  });

  it('omits slotParams entirely when nothing survives', () => {
    expect(parseRunConfig(JSON.stringify({ slotParams: { a: 'x' } })).slotParams).toBeUndefined();
    expect(parseRunConfig(JSON.stringify({ slotParams: [] })).slotParams).toBeUndefined();
  });
});

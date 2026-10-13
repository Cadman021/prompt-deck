// Unit tests for OpenRouter-style pricing parsing.
import { describe, expect, it } from 'vitest';
import { parsePricing } from './llmService';

describe('parsePricing', () => {
  it('parses string and numeric per-token prices', () => {
    expect(parsePricing({ prompt: '0.0000025', completion: '0.00001' })).toEqual({
      prompt: 0.0000025,
      completion: 0.00001,
    });
    expect(parsePricing({ prompt: 0, completion: 0 })).toEqual({ prompt: 0, completion: 0 });
  });

  it('rejects missing, negative, or non-numeric pricing', () => {
    expect(parsePricing(null)).toBeNull();
    expect(parsePricing({})).toBeNull();
    expect(parsePricing({ prompt: -1, completion: 1 })).toBeNull();
    expect(parsePricing({ prompt: 'free', completion: 0 })).toBeNull();
  });
});

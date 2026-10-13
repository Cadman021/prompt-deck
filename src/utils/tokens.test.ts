// Unit tests for the script-aware token heuristic.
import { describe, expect, it } from 'vitest';
import { estimateTokens } from './tokens';

describe('estimateTokens', () => {
  it('estimates ~4 latin chars per token', () => {
    expect(estimateTokens('a'.repeat(400))).toBe(100);
  });

  it('uses a denser ratio for Persian/Arabic script', () => {
    const fa = 'ب'.repeat(250);
    expect(estimateTokens(fa)).toBe(100);
    // Mixed content splits per script, not a flat divisor.
    expect(estimateTokens('a'.repeat(200) + 'ب'.repeat(125))).toBe(100);
  });

  it('uses the densest ratio for CJK', () => {
    expect(estimateTokens('中'.repeat(150))).toBe(100);
  });

  it('never returns zero', () => {
    expect(estimateTokens('')).toBe(1);
    expect(estimateTokens('hi')).toBe(1);
  });
});

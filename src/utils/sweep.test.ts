import { describe, expect, it } from 'vitest';
import { buildSweepPrompt, labelForContext } from './sweep';
import { estimateTokens } from './tokens';

describe('buildSweepPrompt', () => {
  it('leaves the prompt untouched when it already fills the target', () => {
    const prompt = 'Explain quantum tunnelling in one paragraph.';
    expect(buildSweepPrompt(prompt, 10)).toBe(prompt);
  });

  it('reaches the requested size (within one sentence)', () => {
    const prompt = 'Summarize the following notes.';
    const filled = buildSweepPrompt(prompt, 1000);
    const tokens = estimateTokens(filled);
    expect(tokens).toBeGreaterThanOrEqual(1000);
    // Filler is added one sentence at a time, so the overshoot stays small.
    expect(tokens).toBeLessThan(1000 + 20);
  });

  it('keeps the real prompt at the end', () => {
    const prompt = 'What is 2+2?';
    expect(buildSweepPrompt(prompt, 200).endsWith(prompt)).toBe(true);
  });
});

describe('labelForContext', () => {
  it('labels sizes in K tokens', () => {
    expect(labelForContext(4096)).toBe('4K');
    expect(labelForContext(65536)).toBe('64K');
  });
});

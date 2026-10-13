// Unit tests for the LCS line diff.
import { describe, expect, it } from 'vitest';
import { diffLines, summarizeDiff } from './diffUtils';

describe('diffLines', () => {
  it('marks identical texts fully same', () => {
    const rows = diffLines('a\nb', 'a\nb');
    expect(rows.every((r) => r.kind === 'same')).toBe(true);
    expect(rows).toHaveLength(2);
  });

  it('marks empty-vs-text as all added and vice versa', () => {
    expect(diffLines('', 'x\ny').every((r) => r.kind === 'added')).toBe(true);
    expect(diffLines('x\ny', '').every((r) => r.kind === 'removed')).toBe(true);
  });

  it('detects a single changed line among shared context', () => {
    const rows = diffLines('a\nb\nc', 'a\nB\nc');
    expect(rows.filter((r) => r.kind === 'same').map((r) => r.text)).toEqual(['a', 'c']);
    expect(rows.some((r) => r.kind === 'removed' && r.text === 'b')).toBe(true);
    expect(rows.some((r) => r.kind === 'added' && r.text === 'B')).toBe(true);
  });

  it('summarizes counts', () => {
    const summary = summarizeDiff(diffLines('a\nb', 'a\nc\nd'));
    expect(summary.similarity).toBeGreaterThanOrEqual(0);
    expect(summary.similarity).toBeLessThanOrEqual(1);
    expect(summary.added).toBe(2);
    expect(summary.removed).toBe(1);
  });
});

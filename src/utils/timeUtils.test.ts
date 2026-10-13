// Unit tests for relative-time buckets.
import { describe, expect, it } from 'vitest';
import { formatRelativeTime } from './timeUtils';

const isoAgo = (ms: number): string => new Date(Date.now() - ms).toISOString();

describe('formatRelativeTime', () => {
  it('buckets now / minutes / hours / days', () => {
    expect(formatRelativeTime(isoAgo(10_000))).toEqual({ kind: 'now' });
    expect(formatRelativeTime(isoAgo(5 * 60_000))).toEqual({ kind: 'minutes', count: 5 });
    expect(formatRelativeTime(isoAgo(3 * 3_600_000))).toEqual({ kind: 'hours', count: 3 });
    expect(formatRelativeTime(isoAgo(2 * 86_400_000))).toEqual({ kind: 'days', count: 2 });
  });

  it('falls back to a locale date after 7 days', () => {
    const r = formatRelativeTime(isoAgo(30 * 86_400_000));
    expect(r.kind).toBe('date');
  });

  it('parses SQLite CURRENT_TIMESTAMP format', () => {
    const d = new Date(Date.now() - 90_000);
    const pad = (n: number): string => String(n).padStart(2, '0');
    const sqlite = `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`;
    const r = formatRelativeTime(sqlite);
    expect(r.kind === 'minutes' || r.kind === 'now').toBe(true);
  });

  it('never returns NaN on garbage input', () => {
    const r = formatRelativeTime('not-a-date');
    expect(r).toEqual({ kind: 'date', date: '' });
  });
});

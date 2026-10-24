import { describe, expect, it } from 'vitest';
import { analyseTrend, type TrendPoint } from './trend';

const series = (tps: number[]): TrendPoint[] =>
  tps.map((t, i) => ({ at: i * 1000, tps: t, ttftMs: 100 }));

describe('analyseTrend', () => {
  it('refuses to judge two runs', () => {
    expect(analyseTrend(series([50, 50])).verdict).toBe('insufficient');
  });

  it('calls a noisy but flat series stable', () => {
    expect(analyseTrend(series([50, 52, 49, 51, 50, 52, 49])).verdict).toBe('stable');
  });

  it('detects a clear regression and reports the change', () => {
    const r = analyseTrend(series([60, 61, 59, 60, 62, 30, 31, 30]));
    expect(r.verdict).toBe('regression');
    expect(r.changePct).toBeLessThan(-45);
  });

  it('detects a clear improvement', () => {
    expect(analyseTrend(series([30, 31, 29, 30, 60, 61, 59])).verdict).toBe('improvement');
  });

  it('does not cry regression on a drop smaller than the model noise', () => {
    // Baseline swings 45..80, so a 23% drop is inside its normal range.
    const r = analyseTrend(series([50, 70, 45, 80, 44, 46, 48]));
    expect(r.verdict).toBe('stable');
    expect(r.noisePct).toBeGreaterThan(20);
  });

  it('applies a noise floor so flat baselines cannot make small drops significant', () => {
    // Baseline is almost perfectly flat; a 4% drop must still read as stable.
    expect(analyseTrend(series([100, 100.2, 99.9, 96, 96.1, 95.9])).verdict).toBe('stable');
  });

  it('reports a drop just past the floor', () => {
    expect(analyseTrend(series([100, 100.2, 99.9, 90, 90.1, 89.9])).verdict).toBe('regression');
  });

  it('ignores rows with no measured speed', () => {
    const withZero: TrendPoint[] = [
      { at: 0, tps: 0, ttftMs: 0 },
      { at: 1, tps: 50, ttftMs: 1 },
      { at: 2, tps: 50, ttftMs: 1 },
      { at: 3, tps: 50, ttftMs: 1 },
      { at: 4, tps: 50, ttftMs: 1 },
      { at: 5, tps: 50, ttftMs: 1 },
    ];
    const r = analyseTrend(withZero);
    expect(r.baselineCount).toBe(2);
    expect(r.recentCount).toBe(3);
  });

  it('orders unsorted input before choosing windows', () => {
    const shuffled: TrendPoint[] = [
      { at: 3000, tps: 30, ttftMs: 1 },
      { at: 1000, tps: 60, ttftMs: 1 },
      { at: 2000, tps: 60, ttftMs: 1 },
      { at: 4000, tps: 30, ttftMs: 1 },
      { at: 5000, tps: 30, ttftMs: 1 },
      { at: 0, tps: 60, ttftMs: 1 },
    ];
    // Oldest three are 60,60,60; newest three are 30,30,30.
    expect(analyseTrend(shuffled).verdict).toBe('regression');
  });
});

// Unit tests for repeat-run statistics.
import { describe, expect, it } from 'vitest';
import { mean, median, stdev, wilsonLowerBound } from './stats';

describe('median', () => {
  it('picks the middle of odd samples', () => {
    expect(median([30, 10, 20])).toBe(20);
  });

  it('averages the middle two of even samples', () => {
    expect(median([10, 40, 20, 30])).toBe(25);
  });

  it('is robust to a single outlier where mean is not', () => {
    expect(median([50, 51, 52, 500])).toBe(51.5);
    expect(mean([50, 51, 52, 500])).toBeGreaterThan(100);
  });

  it('handles empty input', () => {
    expect(median([])).toBe(0);
    expect(mean([])).toBe(0);
    expect(stdev([])).toBe(0);
  });
});

describe('wilsonLowerBound', () => {
  it('ranks 45/50 above 1/1', () => {
    expect(wilsonLowerBound(45, 50)).toBeGreaterThan(wilsonLowerBound(1, 1));
  });

  it('is zero with no runs and bounded by the raw rate', () => {
    expect(wilsonLowerBound(0, 0)).toBe(0);
    expect(wilsonLowerBound(3, 10)).toBeLessThan(0.3);
    expect(wilsonLowerBound(3, 10)).toBeGreaterThan(0);
  });
});

describe('stdev', () => {
  it('is zero for identical or single samples', () => {
    expect(stdev([7, 7, 7])).toBe(0);
    expect(stdev([7])).toBe(0);
  });

  it('matches the known population value', () => {
    // mean 5, deviations 2,1,0,1,2 → variance 2
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2, 9);
  });
});

// Unit tests for repeat-run statistics.
import { describe, expect, it } from 'vitest';
import {
  computeElo,
  ELO_INITIAL,
  eloExpected,
  eloUpdate,
  mean,
  median,
  stdev,
  wilsonLowerBound,
} from './stats';

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

describe('elo', () => {
  it('favors the winner symmetrically (zero-sum per match)', () => {
    const [w, l] = eloUpdate(1200, 1200);
    expect(w).toBeCloseTo(1216, 9);
    expect(l).toBeCloseTo(1184, 9);
    expect(eloExpected(1200, 1200)).toBe(0.5);
  });

  it('rewards beating stronger opponents more', () => {
    const [upset] = eloUpdate(1000, 1400);
    const [expected] = eloUpdate(1400, 1000);
    expect(upset - 1000).toBeGreaterThan(expected - 1400);
  });

  it('counts multi-model wins as multiple pairwise victories', () => {
    const ratings = computeElo([
      { winner: 'a', opponents: ['b', 'c', 'd'] },
      { winner: 'b', opponents: ['a'] },
    ]);
    expect(ratings.get('a')).toBeGreaterThan(ELO_INITIAL);
    // a beat 3 models then lost 1; b lost 1 then beat a: a stays ahead.
    expect(ratings.get('a')).toBeGreaterThan(ratings.get('b')!);
    expect(ratings.has('d')).toBe(true);
  });

  it('ignores self-matches', () => {
    const ratings = computeElo([{ winner: 'a', opponents: ['a'] }]);
    expect(ratings.has('a')).toBe(false);
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

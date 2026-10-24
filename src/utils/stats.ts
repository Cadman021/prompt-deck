// src/utils/stats.ts
// Small repeat-run statistics for benchmark aggregation.
// A single generation-speed sample jitters between runs, so repeated runs
// report the median (robust) while keeping mean/stdev visible in tooltips.

export function mean(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

/** Population standard deviation (0 for <2 samples). */
export function stdev(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((s, v) => s + (v - m) ** 2, 0) / values.length);
}

/**
 * Wilson score interval lower bound (95% by default) for a win rate.
 * Ranks 1-win-in-1-run (100%) below 45-wins-in-50-runs (~82% lower bound),
 * so newcomers can't top the board on a single lucky vote.
 */
export function wilsonLowerBound(wins: number, n: number, z = 1.96): number {
  if (n <= 0) return 0;
  const p = Math.min(1, Math.max(0, wins / n));
  const denom = 1 + (z * z) / n;
  const center = p + (z * z) / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * n)) / n);
  return Math.max(0, (center - margin) / denom);
}

/** Elo rating system for pairwise vote outcomes. */
export const ELO_INITIAL = 1200;
export const ELO_K = 32;

export function eloExpected(a: number, b: number): number {
  return 1 / (1 + Math.pow(10, (b - a) / 400));
}

/** One winner-beats-loser match → updated [winner, loser] ratings. */
export function eloUpdate(winner: number, loser: number, k = ELO_K): [number, number] {
  const expected = eloExpected(winner, loser);
  return [winner + k * (1 - expected), loser + k * (0 - (1 - expected))];
}

/**
 * Ratings from voted runs: each run counts the winner as beating every
 * other model in that run pairwise (a 4-model win moves more points than a
 * head-to-head). Matches must arrive in chronological order.
 */
export function computeElo(
  matches: { winner: string; opponents: string[] }[]
): Map<string, number> {
  const ratings = new Map<string, number>();
  const get = (m: string): number => ratings.get(m) ?? ELO_INITIAL;
  for (const match of matches) {
    for (const opponent of match.opponents) {
      if (opponent === match.winner) continue;
      const [w, l] = eloUpdate(get(match.winner), get(opponent));
      ratings.set(match.winner, w);
      ratings.set(opponent, l);
    }
  }
  return ratings;
}

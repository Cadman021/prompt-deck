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
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
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
export function wilsonLowerBound(wins: number, runs: number, z = 1.96): number {
  if (runs <= 0) return 0;
  const p = Math.min(1, Math.max(0, wins / runs));
  const denom = 1 + (z * z) / runs;
  const center = p + (z * z) / (2 * runs);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * runs)) / runs);
  return Math.max(0, (center - margin) / denom);
}

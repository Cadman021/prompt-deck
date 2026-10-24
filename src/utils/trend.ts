// src/utils/trend.ts
// "Did this model get slower?" — the question a local-LLM user actually asks
// after a driver update, a new quant, or a fresh Ollama build.
//
// A benchmark number on its own cannot answer it, because run-to-run jitter on
// local hardware is large. So the comparison here is explicitly a *change
// against the model's own noise*: a shift is only called a regression when it
// is larger than the spread the model already showed. That keeps the feature
// from crying wolf every time a run lands a little low.

export interface TrendPoint {
  /** Epoch ms, for ordering and the x axis. */
  at: number;
  tps: number;
  ttftMs: number;
  itlMs?: number | null;
}

export type TrendVerdict = 'regression' | 'improvement' | 'stable' | 'insufficient';

export interface TrendResult {
  verdict: TrendVerdict;
  /** Median TPS of the baseline window (older runs). */
  baselineTps: number;
  /** Median TPS of the recent window (newest runs). */
  recentTps: number;
  /** Signed relative change of the medians, e.g. -0.12 for 12% slower. */
  changePct: number;
  /**
   * The model's own run-to-run spread (relative stdev of the baseline).
   * The change must exceed this to be called anything but stable.
   */
  noisePct: number;
  baselineCount: number;
  recentCount: number;
}

/** Fewer runs than this on either side cannot separate signal from jitter. */
export const MIN_TREND_SAMPLES = 3;

/** Recent window size; the baseline is everything before it. */
export const RECENT_WINDOW = 3;

const median = (values: number[]): number => {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 0 ? (s[mid - 1] + s[mid]) / 2 : s[mid];
};

const stdev = (values: number[]): number => {
  if (values.length < 2) return 0;
  const m = values.reduce((a, b) => a + b, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - m) ** 2, 0) / values.length);
};

/**
 * Compares the newest `RECENT_WINDOW` runs against everything before them.
 *
 * Points must already be sorted oldest-first; unsorted input is sorted here so
 * callers cannot silently compare the wrong windows.
 *
 * Verdicts:
 *   insufficient — either window is too small to say anything
 *   stable       — the change is within the model's own noise
 *   regression   — slower by more than the noise floor
 *   improvement  — faster by more than the noise floor
 */
export function analyseTrend(points: TrendPoint[]): TrendResult {
  const ordered = [...points].sort((a, b) => a.at - b.at);
  const usable = ordered.filter((p) => Number.isFinite(p.tps) && p.tps > 0);

  const recent = usable.slice(-RECENT_WINDOW);
  const baseline = usable.slice(0, Math.max(0, usable.length - recent.length));

  const empty: TrendResult = {
    verdict: 'insufficient',
    baselineTps: 0,
    recentTps: 0,
    changePct: 0,
    noisePct: 0,
    baselineCount: baseline.length,
    recentCount: recent.length,
  };
  if (baseline.length < MIN_TREND_SAMPLES || recent.length < 2) return empty;

  const baseValues = baseline.map((p) => p.tps);
  const recentValues = recent.map((p) => p.tps);
  const baselineTps = median(baseValues);
  const recentTps = median(recentValues);
  if (baselineTps <= 0) return empty;

  const changePct = (recentTps - baselineTps) / baselineTps;
  // Coefficient of variation of the baseline: "how much does this model
  // normally move?" A 5% drop is meaningless on a model that swings 20%.
  const noisePct = stdev(baseValues) / baselineTps;

  // A floor on the noise gate: three near-identical runs produce a tiny stdev,
  // which would make any difference at all look significant. Local inference
  // always jitters at least a few percent.
  const threshold = Math.max(noisePct, 0.05);

  let verdict: TrendVerdict = 'stable';
  if (changePct < -threshold) verdict = 'regression';
  else if (changePct > threshold) verdict = 'improvement';

  return {
    verdict,
    baselineTps: Number(baselineTps.toFixed(2)),
    recentTps: Number(recentTps.toFixed(2)),
    changePct: Number((changePct * 100).toFixed(1)),
    noisePct: Number((noisePct * 100).toFixed(1)),
    baselineCount: baseline.length,
    recentCount: recent.length,
  };
}

/**
 * Groups trend points by model, newest run per model last. Used by the view to
 * offer a picker without re-querying for every model.
 */
export function groupByModel<T extends { model: string }>(rows: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
  for (const row of rows) {
    const list = out.get(row.model) ?? [];
    list.push(row);
    out.set(row.model, list);
  }
  return out;
}

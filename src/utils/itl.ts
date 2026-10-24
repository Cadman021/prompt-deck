// src/utils/itl.ts
// Inter-token latency: the gap between consecutive tokens, which is what
// "does this model feel responsive while it writes?" actually means.
//
// TPS averages the whole generation, so a model that starts fast then crawls
// reports a healthy average. ITL's distribution exposes that: a flat median
// with a fat p95 is a model that stutters.
//
// Approximation, stated plainly: streams deliver *chunks*, not tokens, and a
// chunk may carry several tokens. Each gap is therefore divided by the token
// estimate of the chunk that arrived at its end, which is the closest we can
// get without server-side timings. The result is flagged `estimated` whenever
// any contributing chunk was counted heuristically, so the UI can render it
// with the same `~` convention the rest of the app uses.

/** Guards against pathological streams: ~40KB of samples at the cap. */
const MAX_SAMPLES = 5000;

export interface ItlStats {
  /** Median gap per token, in ms. */
  medianMs: number;
  /** 95th percentile gap per token, in ms — the "stutter" number. */
  p95Ms: number;
  /** Mean gap per token, in ms. */
  meanMs: number;
  /** Samples actually collected (capped). */
  samples: number;
  /** True when per-chunk token counts were heuristic. */
  estimated: boolean;
}

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0];
  // Linear interpolation between the two nearest ranks. With small sample
  // counts (a 40-token answer) a nearest-rank p95 would just be the max,
  // which overstates the tail.
  const rank = (p / 100) * (sorted.length - 1);
  const lo = Math.floor(rank);
  const hi = Math.ceil(rank);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (rank - lo);
}

/**
 * Collects chunk arrival times and turns them into per-token latency stats.
 * Pure and dependency-free so it can be unit-tested without a stream.
 */
export class ItlTracker {
  private readonly intervals: number[] = [];
  private lastAt: number | null = null;
  private anyHeuristic = false;
  private dropped = 0;

  /**
   * Records a chunk that arrived at `at` (a `performance.now()` reading) and
   * carried `tokens` tokens (>= 1).
   */
  add(at: number, tokens: number): void {
    const prev = this.lastAt;
    this.lastAt = at;
    if (prev === null) return; // the first chunk IS the first token
    const gap = at - prev;
    if (!Number.isFinite(gap) || gap < 0) {
      this.anyHeuristic = true;
      return;
    }
    if (tokens <= 0) {
      // A chunk with no measurable text still consumed wall time; without a
      // token count its gap cannot be attributed, so it is skipped rather
      // than smeared onto the next chunk.
      this.dropped += 1;
      return;
    }
    if (this.intervals.length >= MAX_SAMPLES) {
      this.dropped += 1;
      return;
    }
    this.intervals.push(gap / tokens);
  }

  /** Marks the samples as a heuristic estimate (no exact server token counts). */
  markEstimated(estimated = true): void {
    this.anyHeuristic = estimated;
  }

  get count(): number {
    return this.intervals.length;
  }

  /** Null when fewer than two chunks arrived — one gap is not a distribution. */
  stats(): ItlStats | null {
    if (this.intervals.length === 0) return null;
    const sorted = [...this.intervals].sort((a, b) => a - b);
    const sum = sorted.reduce((s, v) => s + v, 0);
    return {
      medianMs: Number(percentile(sorted, 50).toFixed(2)),
      p95Ms: Number(percentile(sorted, 95).toFixed(2)),
      meanMs: Number((sum / sorted.length).toFixed(2)),
      samples: sorted.length,
      estimated: this.anyHeuristic,
    };
  }
}

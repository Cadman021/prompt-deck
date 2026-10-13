// src/services/runTarget.ts
// Shared streaming core for Bench slots and Test Suite cells.
// Both pages used to duplicate: endpoint resolution + stream-callback wiring
// + cost computation. They now share this; page code only handles its own
// state updates.

import { LLMService } from './llmService';
import type { BenchmarkMetrics, PromptOptions } from '../types/ollama';
import type { Provider } from '../store/useSettingsStore';
import { mean, median, stdev } from '../utils/stats';
import {
  calcCost,
  resolveCloudTarget,
  type ModelSource,
  type TargetConfig,
} from './modelTarget';
import { useCloudStore } from '../store/useCloudStore';

export interface LocalEndpoint {
  provider: Provider;
  baseUrl: string;
}

export type EndpointError = 'noCloudKey' | 'unknownProvider';

export interface ResolvedRun {
  config: TargetConfig;
  /** Raw model id to send to the endpoint. */
  model: string;
}

/**
 * Resolve a (source, model) pair to a runnable endpoint. Local sources use
 * the passed settings; cloud sources use the first enabled stored key.
 */
export function resolveRunEndpoint(
  source: ModelSource,
  model: string,
  local: LocalEndpoint
): { run: ResolvedRun } | { error: EndpointError } {
  if (source.kind === 'local') {
    return { run: { config: { provider: local.provider, baseUrl: local.baseUrl }, model } };
  }
  const cloud = useCloudStore.getState();
  const resolved = resolveCloudTarget(source.providerId, cloud.customProviders, cloud.keys);
  if ('error' in resolved) return { error: resolved.error };
  return { run: { config: resolved.config, model } };
}

export interface RunStreamCallbacks {
  onChunk?: (fullText: string) => void;
  onReasoning?: (fullReasoning: string) => void;
  /**
   * Always called exactly once per stream (success, error, or abort).
   * `aborted` is true when the stop came from our own AbortController —
   * callers typically finalize quietly instead of showing an error.
   */
  onDone: (
    output: string,
    metrics: BenchmarkMetrics | null,
    error: string | null,
    aborted: boolean
  ) => void;
}

export interface CostInput {
  providerId: string;
  model: string;
  metrics: BenchmarkMetrics | null;
}

/** Frozen run cost, or null when tokens/pricing are unknown. Never guesses. */
export function runCost(pricing: Record<string, Record<string, { prompt: number; completion: number }>>, input: CostInput): number | null {
  if (!input.metrics || input.metrics.tokenSource !== 'server') return null;
  return calcCost(
    input.metrics.promptTokens,
    input.metrics.completionTokens,
    (pricing[input.providerId] ?? {})[input.model]
  );
}

/**
 * Streams one completion and normalizes every ending (complete / error /
 * hang / abort) into a single onDone call. Accumulates output + reasoning
 * across chunks so callers only mirror state.
 */
export function runTargetStream(
  config: TargetConfig,
  options: PromptOptions,
  signal: AbortSignal,
  cb: RunStreamCallbacks
): void {
  let output = '';
  let done = false;
  const finish = (
    out: string,
    metrics: BenchmarkMetrics | null,
    error: string | null,
    aborted: boolean
  ): void => {
    if (done) return;
    done = true;
    cb.onDone(out, metrics, error, aborted);
  };

  LLMService.generateStream(
    config,
    options,
    {
      onChunk: (_, fullText) => {
        output = fullText;
        cb.onChunk?.(fullText);
      },
      onReasoning: (fullReasoning) => {
        cb.onReasoning?.(fullReasoning);
      },
      onComplete: (fullText, metrics) => {
        finish(fullText, metrics, null, false);
      },
      onError: (err) => {
        if (signal.aborted) {
          finish(output, null, null, true);
          return;
        }
        finish(output || `Error: ${err.message}`, null, err.message, false);
      },
    },
    signal
  );
}

/**
 * Runs the same completion N times back-to-back and aggregates: median TPS /
 * TTFT are reported (robust to single-run jitter), token counts are summed
 * (every repeat is really billed/processed), and the last output wins.
 * A repeat that errors aborts the whole series with that error.
 * N is clamped to 1–5; N<=1 behaves exactly like a single runTargetStream.
 */
export function runRepeatedStream(
  config: TargetConfig,
  options: PromptOptions,
  signal: AbortSignal,
  repeats: number,
  cb: RunStreamCallbacks & { onRepeat?: (index: number, total: number) => void }
): void {
  const n = Math.max(1, Math.min(5, Math.floor(repeats || 1)));
  if (n <= 1) {
    runTargetStream(config, options, signal, cb);
    return;
  }

  const tpsSamples: number[] = [];
  const ttftSamples: number[] = [];
  let promptTokens = 0;
  let completionTokens = 0;
  let totalDurationMs = 0;
  let lastOutput = '';
  let lastMetrics: BenchmarkMetrics | null = null;

  const runOne = (index: number): void => {
    if (signal.aborted) {
      cb.onDone(lastOutput, null, null, true);
      return;
    }
    cb.onRepeat?.(index, n);
    runTargetStream(config, options, signal, {
      onChunk: cb.onChunk,
      onReasoning: cb.onReasoning,
      onDone: (output, metrics, error, aborted) => {
        if (aborted) {
          cb.onDone(lastOutput || output, lastMetrics, null, true);
          return;
        }
        if (error || !metrics) {
          cb.onDone(output, null, error ?? 'Empty response.', false);
          return;
        }
        tpsSamples.push(metrics.tps);
        ttftSamples.push(metrics.ttftMs);
        promptTokens += metrics.promptTokens ?? 0;
        completionTokens += metrics.completionTokens ?? 0;
        totalDurationMs += metrics.totalDurationMs;
        lastOutput = output;
        lastMetrics = metrics;
        if (index + 1 >= n) {
          cb.onDone(lastOutput, {
            ...metrics,
            tps: median(tpsSamples),
            tpsMean: mean(tpsSamples),
            tpsStd: stdev(tpsSamples),
            ttftMs: Math.round(median(ttftSamples)),
            totalDurationMs,
            totalTokens: promptTokens + completionTokens,
            promptTokens,
            completionTokens,
            repeatCount: n,
          }, null, false);
          return;
        }
        runOne(index + 1);
      },
    });
  };
  runOne(0);
}

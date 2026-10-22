// src/types/ollama.ts

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    parameter_size: string;
    quantization_level: string;
  };
}

/**
 * Per-slot overrides for generation settings. Every field is optional: unset
 * fields inherit the global Advanced settings, so a column only needs to list
 * what actually differs (e.g. two copies of one model at different temps).
 */
export interface GenerationOverrides {
  temperature?: number;
  top_p?: number;
  maxTokens?: number | null;
  num_ctx?: number;
}

/** True when the slot has no override at all (renders as "using global"). */
export function hasOverrides(o: GenerationOverrides | null | undefined): boolean {
  if (!o) return false;
  return (
    o.temperature !== undefined ||
    o.top_p !== undefined ||
    (o.maxTokens !== undefined && o.maxTokens !== null) ||
    o.num_ctx !== undefined
  );
}

export interface PromptOptions {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  top_p?: number;
  num_ctx?: number;
  serverDefaults?: boolean;
  seed?: number | null;
  maxTokens?: number | null;
}

export type TokenSource = 'server' | 'heuristic';

export interface BenchmarkMetrics {
  ttftMs: number; // Time To First Token (ms)
  tps: number; // Tokens Per Second (generation phase only)
  totalDurationMs: number;
  totalTokens: number;
  evalDurationMs?: number;
  /** true when TPS is estimated (server did not report usage) — render with `~`. */
  tpsEstimated: boolean;
  tokenSource: TokenSource;
  /** Exact completion tokens, when reported by the server. */
  completionTokens?: number;
  /** Exact prompt tokens, when reported by the server. */
  promptTokens?: number;
  /** Model-load time in ms (Ollama `load_duration`), part of cold-start TTFT. */
  loadDurationMs?: number;
  /** Prompt-processing speed in tok/s (Ollama `prompt_eval_*`), when reported. */
  promptTps?: number;
  /** Repeat count this median aggregates (present when > 1). */
  repeatCount?: number;
  /** Mean TPS across repeats (for tooltips; median is displayed). */
  tpsMean?: number;
  /** Population stdev of TPS across repeats (for tooltips). */
  tpsStd?: number;
}

/** Per-token USD prices, as reported by OpenRouter-style `/models` pricing. */
export interface ModelPricing {
  prompt: number;
  completion: number;
}

export interface StreamCallbacks {
  onChunk: (chunkText: string, fullText: string) => void;
  onFirstToken?: (ttftMs: number) => void;
  /** Thinking/reasoning deltas (`reasoning_content`), kept separate from the answer. */
  onReasoning?: (fullReasoning: string) => void;
  onComplete: (fullText: string, metrics: BenchmarkMetrics) => void;
  onError: (error: Error) => void;
}

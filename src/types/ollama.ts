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

export interface PromptOptions {
  model: string;
  prompt: string;
  system?: string;
  temperature?: number;
  top_p?: number;
  num_ctx?: number;
}

export type TokenSource = 'server' | 'heuristic';

export interface BenchmarkMetrics {
  ttftMs: number;           // Time To First Token (ms)
  tps: number;              // Tokens Per Second (generation phase only)
  totalDurationMs: number;
  totalTokens: number;
  evalDurationMs?: number;
  /** true when TPS is estimated (server did not report usage) — render with `~`. */
  tpsEstimated: boolean;
  tokenSource: TokenSource;
}

export interface StreamCallbacks {
  onChunk: (chunkText: string, fullText: string) => void;
  onFirstToken?: (ttftMs: number) => void;
  onComplete: (fullText: string, metrics: BenchmarkMetrics) => void;
  onError: (error: Error) => void;
}

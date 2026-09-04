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

export interface BenchmarkMetrics {
  ttftMs: number;           // Time To First Token (ms)
  tps: number;              // Tokens Per Second
  totalDurationMs: number;
  totalTokens: number;
  evalDurationMs?: number;
}

export interface StreamCallbacks {
  onChunk: (chunkText: string, fullText: string) => void;
  onFirstToken?: (ttftMs: number) => void;
  onComplete: (fullText: string, metrics: BenchmarkMetrics) => void;
  onError: (error: Error) => void;
}
// src/services/ollamaService.ts
import { OllamaModel, PromptOptions, StreamCallbacks, BenchmarkMetrics } from '../types/ollama';
import { httpError } from '../utils/httpError';
import i18next from 'i18next';

const OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaService {
  /**
   * Retrieve a list of all models installed on the user's system.
   */
  static async getInstalledModels(baseUrl = OLLAMA_BASE_URL): Promise<OllamaModel[]> {
    let response: Response;
    try {
      response = await fetch(`${baseUrl}/api/tags`);
    } catch (error) {
      console.error('Ollama connection error:', error);
      throw new Error(i18next.t("service.connectOllama"));
    }
    if (!response.ok) {
      throw await httpError(i18next.t("service.errorModels"), response);
    }
    const data = await response.json();
    return data.models || [];
  }

  /**
   * Sending prompts, streaming responses, and calculating benchmarks.
   */
  static async generateStream(
    options: PromptOptions,
    callbacks: StreamCallbacks,
    signal?: AbortSignal,
    baseUrl = OLLAMA_BASE_URL
  ): Promise<void> {
    const startTime = performance.now();
    let firstTokenTime: number | null = null;
    let fullText = '';
    let tokenCount = 0;

    try {
      // With serverDefaults, sampling params are omitted entirely so the
      // model's own recommended defaults apply instead of ours.
      const ollamaOptions: Record<string, number> = {};
      if (!options.serverDefaults) {
        ollamaOptions.temperature = options.temperature ?? 0.7;
        ollamaOptions.top_p = options.top_p ?? 0.9;
        ollamaOptions.num_ctx = options.num_ctx ?? 4096;
      }
      if (options.seed != null) ollamaOptions.seed = options.seed;
      if (options.maxTokens != null) ollamaOptions.num_predict = options.maxTokens;

      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: options.model,
          prompt: options.prompt,
          system: options.system,
          stream: true,
          options: ollamaOptions,
        }),
      });

      if (!response.ok || !response.body) {
        throw await httpError(i18next.t("service.errorModels"), response);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';
      let finished = false;
      let lastEvalCount: number | null = null;
      let lastEvalDurationNs: number | null = null;
      let lastPromptEvalCount: number | null = null;
      let lastPromptEvalDurationNs: number | null = null;
      let lastLoadDurationNs: number | null = null;

      const finish = (estimated: boolean): void => {
        if (finished) return;
        finished = true;
        const endTime = performance.now();
        const totalDurationMs = Math.round(endTime - startTime);
        const ttftMs = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

        const evalCount = lastEvalCount ?? tokenCount;
        const evalDurationNs = lastEvalDurationNs ?? totalDurationMs * 1e6;

        // TPS (Tokens Per Second)
        const tps = evalDurationNs > 0
          ? Number((evalCount / (evalDurationNs / 1e9)).toFixed(2))
          : 0;

        // Prompt-processing speed + model-load time (cold-start share of TTFT).
        const promptTps = lastPromptEvalCount != null && (lastPromptEvalDurationNs ?? 0) > 0
          ? Number((lastPromptEvalCount / ((lastPromptEvalDurationNs ?? 1) / 1e9)).toFixed(2))
          : undefined;

        const metrics: BenchmarkMetrics = {
          ttftMs,
          tps,
          totalDurationMs,
          totalTokens: evalCount,
          evalDurationMs: Math.round(evalDurationNs / 1e6),
          tpsEstimated: estimated,
          tokenSource: estimated ? 'heuristic' : 'server',
          completionTokens: evalCount,
          promptTokens: lastPromptEvalCount ?? undefined,
          loadDurationMs: lastLoadDurationNs != null ? Math.round(lastLoadDurationNs / 1e6) : undefined,
          promptTps,
        };

        callbacks.onComplete(fullText, metrics);
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          let json: {
            response?: string;
            done?: boolean;
            error?: string;
            eval_count?: number;
            eval_duration?: number;
            prompt_eval_count?: number;
            prompt_eval_duration?: number;
            load_duration?: number;
          };
          try {
            json = JSON.parse(line);
          } catch {
            continue; // ignore malformed NDJSON lines
          }

          // Mid-stream server errors (e.g. out of memory) arrive as plain
          // {"error": "..."} lines — surface them instead of ignoring.
          if (json.error && !json.done) {
            callbacks.onError(new Error(json.error));
            return;
          }

          //Time To First Token (TTFT)
          if (!firstTokenTime && json.response) {
            firstTokenTime = performance.now();
            const ttft = Math.round(firstTokenTime - startTime);
            callbacks.onFirstToken?.(ttft);
          }

          if (json.response) {
            fullText += json.response;
            tokenCount++;
            callbacks.onChunk(json.response, fullText);
          }

          if (typeof json.eval_count === 'number') lastEvalCount = json.eval_count;
          if (typeof json.eval_duration === 'number') lastEvalDurationNs = json.eval_duration;
          if (typeof json.prompt_eval_count === 'number') lastPromptEvalCount = json.prompt_eval_count;
          if (typeof json.prompt_eval_duration === 'number') lastPromptEvalDurationNs = json.prompt_eval_duration;
          if (typeof json.load_duration === 'number') lastLoadDurationNs = json.load_duration;

          if (json.done) {
            finish(false);
            return;
          }
        }
      }

      // Stream closed without a final done=true: finish with whatever we
      // accumulated (marked estimated) instead of hanging the UI forever.
      if (!signal?.aborted) finish(true);
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
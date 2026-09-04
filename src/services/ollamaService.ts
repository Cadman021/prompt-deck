// src/services/ollamaService.ts
import { OllamaModel, PromptOptions, StreamCallbacks, BenchmarkMetrics } from '../types/ollama';
import i18next from 'i18next';

const OLLAMA_BASE_URL = 'http://localhost:11434';

export class OllamaService {
  /**
   * Retrieve a list of all models installed on the user's system.
   */
  static async getInstalledModels(baseUrl = OLLAMA_BASE_URL): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${baseUrl}/api/tags`);
      if (!response.ok) {
        throw new Error(`${i18next.t("service.errorModels")}: ${response.statusText}`);
      }
      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Ollama connection error:', error);
      throw new Error(i18next.t("service.connectOllama"));
    }
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
      const response = await fetch(`${baseUrl}/api/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal,
        body: JSON.stringify({
          model: options.model,
          prompt: options.prompt,
          system: options.system,
          stream: true,
          options: {
            temperature: options.temperature ?? 0.7,
            top_p: options.top_p ?? 0.9,
            num_ctx: options.num_ctx ?? 4096,
          },
        }),
      });

      if (!response.ok || !response.body) {
        throw new Error(`${i18next.t("service.errorModels")}: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.trim()) continue;

          const json = JSON.parse(line);

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

          if (json.done) {
            const endTime = performance.now();
            const totalDurationMs = Math.round(endTime - startTime);
            const ttftMs = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

            const evalCount = json.eval_count || tokenCount;
            const evalDurationNs = json.eval_duration || (totalDurationMs * 1e6);

            // TPS (Tokens Per Second)
            const tps = evalDurationNs > 0
              ? Number((evalCount / (evalDurationNs / 1e9)).toFixed(2))
              : 0;

            const metrics: BenchmarkMetrics = {
              ttftMs,
              tps,
              totalDurationMs,
              totalTokens: evalCount,
              evalDurationMs: Math.round(evalDurationNs / 1e6),
            };

            callbacks.onComplete(fullText, metrics);
            return;
          }
        }
      }
    } catch (error) {
      callbacks.onError(error instanceof Error ? error : new Error(String(error)));
    }
  }
}
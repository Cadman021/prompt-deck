// src/services/llmService.ts
import { OllamaService } from './ollamaService';
import { Provider } from '../store/useSettingsStore';
import { OllamaModel, PromptOptions, StreamCallbacks, BenchmarkMetrics } from '../types/ollama';

interface ProviderConfig {
  provider: Provider;
  baseUrl: string;
}

/**
 * Fetches the list of available models regardless of backend.
 * - Ollama: GET {baseUrl}/api/tags
 * - OpenAI-compatible (LM Studio / llama.cpp): GET {baseUrl}/models
 */
async function getInstalledModels(config: ProviderConfig): Promise<OllamaModel[]> {
  if (config.provider === 'ollama') {
    return OllamaService.getInstalledModels(config.baseUrl);
  }

  try {
    const response = await fetch(`${config.baseUrl}/models`);
    if (!response.ok) {
      throw new Error(`Server error: ${response.statusText}`);
    }
    const data = await response.json();
    const models = data.data || [];
    return models.map((m: { id: string }) => ({
      name: m.id,
      modified_at: '',
      size: 0,
      digest: '',
    }));
  } catch (error) {
    console.error('OpenAI-compatible server connection error:', error);
    throw new Error(
      'Could not connect to the local server. Make sure LM Studio (or llama.cpp server) is running and the base URL is correct.'
    );
  }
}

/**
 * Streams a chat completion from an OpenAI-compatible server (LM Studio, llama.cpp).
 * Parses Server-Sent Events (SSE) in the standard `data: {...}` format.
 *
 * Note: OpenAI-compatible streaming responses generally do not report exact
 * token counts per chunk, so TPS here is an approximation based on elapsed
 * time and streamed chunk count, unless the server includes a final `usage`
 * object (LM Studio supports this via `stream_options: { include_usage: true }`).
 */
async function generateOpenAICompatibleStream(
  baseUrl: string,
  options: PromptOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let fullText = '';
  let chunkCount = 0;
  let usageTokens: number | null = null;

  try {
    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: options.prompt });

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal,
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        temperature: options.temperature ?? 0.7,
        top_p: options.top_p ?? 0.9,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Server error: ${response.statusText}`);
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
        const trimmed = line.trim();
        if (!trimmed.startsWith('data:')) continue;

        const payload = trimmed.slice(5).trim();
        if (payload === '[DONE]') {
          const endTime = performance.now();
          const totalDurationMs = Math.round(endTime - startTime);
          const ttftMs = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

          const totalTokens = usageTokens ?? chunkCount;
          const tps =
            totalDurationMs > 0 ? Number((totalTokens / (totalDurationMs / 1000)).toFixed(2)) : 0;

          const metrics: BenchmarkMetrics = {
            ttftMs,
            tps,
            totalDurationMs,
            totalTokens,
          };

          callbacks.onComplete(fullText, metrics);
          return;
        }

        try {
          const json = JSON.parse(payload);

          if (json.usage?.completion_tokens) {
            usageTokens = json.usage.completion_tokens;
          }

          const delta = json.choices?.[0]?.delta?.content;
          if (delta) {
            if (!firstTokenTime) {
              firstTokenTime = performance.now();
              const ttft = Math.round(firstTokenTime - startTime);
              callbacks.onFirstToken?.(ttft);
            }
            fullText += delta;
            chunkCount++;
            callbacks.onChunk(delta, fullText);
          }
        } catch {
          // Ignore malformed SSE lines (e.g. keep-alive comments)
        }
      }
    }
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

async function generateStream(
  config: ProviderConfig,
  options: PromptOptions,
  callbacks: StreamCallbacks,
  signal?: AbortSignal
): Promise<void> {
  if (config.provider === 'ollama') {
    return OllamaService.generateStream(options, callbacks, signal, config.baseUrl);
  }
  return generateOpenAICompatibleStream(config.baseUrl, options, callbacks, signal);
}

export const LLMService = {
  getInstalledModels,
  generateStream,
};

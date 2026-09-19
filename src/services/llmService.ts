// src/services/llmService.ts
import { OllamaService } from './ollamaService';
import { Provider } from '../store/useSettingsStore';
import { OllamaModel, PromptOptions, StreamCallbacks, BenchmarkMetrics } from '../types/ollama';

interface ProviderConfig {
  provider: Provider;
  baseUrl: string;
  /** Optional Bearer token for cloud (OpenAI-compatible) endpoints. Never logged. */
  apiKey?: string;
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
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    const response = await fetch(`${config.baseUrl}/models`, { headers });
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
  signal?: AbortSignal,
  apiKey?: string
): Promise<void> {
  const startTime = performance.now();
  let firstTokenTime: number | null = null;
  let fullText = '';
  let usageTokens: number | null = null;

  try {
    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: options.prompt });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
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

          // Unit definition (same meaning as Ollama's eval_count/eval_duration):
          // TPS measures the generation phase only, excluding time-to-first-token.
          // Token source is exact when the server reports usage, otherwise a
          // chars/4 heuristic flagged as estimated so the UI can render `~`.
          const tokenSource = usageTokens != null ? 'server' : 'heuristic';
          const totalTokens = usageTokens ?? Math.max(1, Math.ceil(fullText.length / 4));
          const evalMs = Math.max(1, totalDurationMs - ttftMs);
          const tps = Number((totalTokens / (evalMs / 1000)).toFixed(2));

          const metrics: BenchmarkMetrics = {
            ttftMs,
            tps,
            totalDurationMs,
            totalTokens,
            evalDurationMs: evalMs,
            tpsEstimated: tokenSource === 'heuristic',
            tokenSource,
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

export interface CloudTestResult {
  ok: boolean;
  modelCount?: number;
  /** Model ids reported by `GET /models` (capped). */
  models?: string[];
  error?: string;
}

/**
 * Tests a cloud (OpenAI-compatible) endpoint: `GET {baseUrl}/models` with an
 * optional `Authorization: Bearer` header. Used by the Cloud providers page.
 * The key itself is never logged.
 */
async function testCloudConnection(baseUrl: string, apiKey?: string): Promise<CloudTestResult> {
  const normalized = baseUrl.replace(/\/+$/, '');
  try {
    const headers: Record<string, string> = {};
    if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;
    const response = await fetch(`${normalized}/models`, { headers });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, error: 'Unauthorized — check the API key.' };
      }
      return { ok: false, error: `Server error: ${response.status} ${response.statusText}` };
    }
    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    const ids = models
      .map((m: { id?: unknown }) => (typeof m?.id === 'string' ? m.id : null))
      .filter((id: string | null): id is string => Boolean(id))
      .slice(0, 300);
    return { ok: true, modelCount: models.length, models: ids };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Connection failed.',
    };
  }
}

export interface ModelProbeResult {
  ok: boolean;
  latencyMs?: number;
  error?: string;
}

/**
 * Probes a single cloud model with a minimal 1-token completion.
 * Used for per-model Test buttons (a model can be listed but unreachable
 * for a given key). Never logs the key.
 */
async function probeCloudModel(
  baseUrl: string,
  apiKey: string,
  model: string
): Promise<ModelProbeResult> {
  const normalized = baseUrl.replace(/\/+$/, '');
  const started = performance.now();
  try {
    const response = await fetch(`${normalized}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (!response.ok) {
      let detail = `${response.status} ${response.statusText}`;
      try {
        const data = await response.json();
        const msg = data?.error?.message;
        if (typeof msg === 'string' && msg) detail = msg.slice(0, 160);
      } catch {
        // keep HTTP status text
      }
      return { ok: false, error: detail };
    }
    return { ok: true, latencyMs: Math.round(performance.now() - started) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : 'Connection failed.',
    };
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
  return generateOpenAICompatibleStream(config.baseUrl, options, callbacks, signal, config.apiKey);
}

export const LLMService = {
  getInstalledModels,
  generateStream,
  testCloudConnection,
  probeCloudModel,
};

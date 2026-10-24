// src/services/llmService.ts
import { OllamaService } from './ollamaService';
import { Provider } from '../store/useSettingsStore';
import { OllamaModel, PromptOptions, StreamCallbacks, BenchmarkMetrics } from '../types/ollama';
import { httpError } from '../utils/httpError';
import { estimateTokens } from '../utils/tokens';
import { ItlTracker } from '../utils/itl';
import { applyUrlVars, missingUrlVars } from '../data/cloudProviders';

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

  let response: Response;
  try {
    const headers: Record<string, string> = {};
    if (config.apiKey?.trim()) headers['Authorization'] = `Bearer ${config.apiKey.trim()}`;
    response = await fetch(`${config.baseUrl}/models`, { headers });
  } catch (error) {
    console.error('OpenAI-compatible server connection error:', error);
    throw new Error(
      'Could not connect to the local server. Make sure LM Studio (or llama.cpp server) is running and the base URL is correct.',
      { cause: error }
    );
  }
  if (!response.ok) {
    throw await httpError('Server error', response);
  }
  const data = await response.json();
  const models = data.data || [];
  return models.map((m: { id: string }) => ({
    name: m.id,
    modified_at: '',
    size: 0,
    digest: '',
  }));
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
  let fullReasoning = '';
  // Chunk arrival times for inter-token latency. Fed where the token is known
  // to have arrived, not where the SSE line was parsed.
  const itl = new ItlTracker();
  let usageTokens: number | null = null;
  let usagePromptTokens: number | null = null;
  // llama.cpp (`timings`) and some LM Studio builds report exact per-second
  // rates inside stream payloads. Only honored when present and sane —
  // otherwise the computed values below stand.
  let reportedTps: number | null = null;
  let reportedPromptTps: number | null = null;

  try {
    const messages = [];
    if (options.system) {
      messages.push({ role: 'system', content: options.system });
    }
    messages.push({ role: 'user', content: options.prompt });

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (apiKey?.trim()) headers['Authorization'] = `Bearer ${apiKey.trim()}`;

    // With serverDefaults, sampling params are omitted entirely so the
    // model's own recommended defaults apply instead of ours.
    const sampling: Record<string, number> = {};
    if (!options.serverDefaults) {
      sampling.temperature = options.temperature ?? 0.7;
      sampling.top_p = options.top_p ?? 0.9;
    }
    if (options.seed != null) sampling.seed = options.seed;
    if (options.maxTokens != null) sampling.max_tokens = options.maxTokens;

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      signal,
      body: JSON.stringify({
        model: options.model,
        messages,
        stream: true,
        stream_options: { include_usage: true },
        ...sampling,
      }),
    });

    if (!response.ok || !response.body) {
      throw await httpError('Server error', response);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '';
    let finished = false;

    const buildMetrics = (): BenchmarkMetrics => {
      const endTime = performance.now();
      const totalDurationMs = Math.round(endTime - startTime);
      const ttftMs = firstTokenTime ? Math.round(firstTokenTime - startTime) : 0;

      // Unit definition (same meaning as Ollama's eval_count/eval_duration):
      // TPS measures the generation phase only, excluding time-to-first-token.
      // Token source is exact when the server reports usage, otherwise a
      // script-aware heuristic flagged as estimated so the UI can render `~`.
      const tokenSource = usageTokens != null ? 'server' : 'heuristic';
      const totalTokens = usageTokens ?? estimateTokens(fullText);
      const evalMs = Math.max(1, totalDurationMs - ttftMs);
      const tps = reportedTps ?? Number((totalTokens / (evalMs / 1000)).toFixed(2));

      return {
        ttftMs,
        tps,
        totalDurationMs,
        totalTokens,
        evalDurationMs: evalMs,
        tpsEstimated: tokenSource === 'heuristic',
        tokenSource,
        completionTokens: usageTokens ?? undefined,
        promptTokens: usagePromptTokens ?? undefined,
        promptTps: reportedPromptTps ?? undefined,
        ...itlFields(),
      };
    };

    /** ITL is a heuristic whenever the server did not report token usage. */
    const itlFields = (): Partial<BenchmarkMetrics> => {
      itl.markEstimated(usageTokens == null);
      const stats = itl.stats();
      if (!stats) return {};
      return {
        itlMs: stats.medianMs,
        itlP95Ms: stats.p95Ms,
        itlEstimated: stats.estimated,
      };
    };

    const finish = (): void => {
      if (finished) return;
      finished = true;
      callbacks.onComplete(fullText, buildMetrics());
    };

    // Returns true when the stream is complete ([DONE]).
    // Throws on server-side error payloads so they surface instead of hanging.
    const ingestLine = (trimmed: string): boolean => {
      if (!trimmed.startsWith('data:')) return false;
      const payload = trimmed.slice(5).trim();
      if (payload === '[DONE]') return true;
      let json: {
        usage?: { completion_tokens?: number; prompt_tokens?: number };
        choices?: { delta?: { content?: string } }[];
        error?: { message?: string } | string;
        timings?: Record<string, unknown>;
        stats?: Record<string, unknown>;
      };
      try {
        json = JSON.parse(payload);
      } catch {
        return false; // Ignore malformed SSE lines (e.g. keep-alive comments)
      }
      // Defensive: some servers embed exact rates (llama.cpp `timings`,
      // LM Studio `stats`). Field names differ by version, so probe a few.
      const timingBag = json.timings ?? json.stats;
      if (timingBag && typeof timingBag === 'object') {
        const bag = timingBag as Record<string, unknown>;
        const pred = Number(bag.predicted_per_second ?? bag.tokens_per_second);
        if (Number.isFinite(pred) && pred > 0) reportedTps = pred;
        const qp = Number(
          bag.prompt_per_second ?? bag.prompt_tokens_per_second ?? bag['prompt tokens per second']
        );
        if (Number.isFinite(qp) && qp > 0) reportedPromptTps = qp;
      }
      if (json.error) {
        const msg = typeof json.error === 'string' ? json.error : json.error.message;
        throw new Error(msg || 'Server-side stream error.');
      }
      if (json.usage?.completion_tokens) {
        usageTokens = json.usage.completion_tokens;
      }
      if (json.usage?.prompt_tokens) {
        usagePromptTokens = json.usage.prompt_tokens;
      }
      const deltaChoice = json.choices?.[0]?.delta as
        { content?: string; reasoning_content?: string } | undefined;
      // Thinking tokens arrive before (and separately from) the answer on
      // reasoning models (R1/QwQ via OpenRouter-style gateways). TTFT counts
      // the very first token of either kind; the answer stream stays clean.
      const reasoning = deltaChoice?.reasoning_content;
      if (reasoning) {
        if (!firstTokenTime) {
          firstTokenTime = performance.now();
          const ttft = Math.round(firstTokenTime - startTime);
          callbacks.onFirstToken?.(ttft);
        }
        fullReasoning += reasoning;
        callbacks.onReasoning?.(fullReasoning);
      }
      const delta = deltaChoice?.content;
      if (delta) {
        if (!firstTokenTime) {
          firstTokenTime = performance.now();
          const ttft = Math.round(firstTokenTime - startTime);
          callbacks.onFirstToken?.(ttft);
        }
        // Tokens per chunk: exact when the server reports usage, otherwise
        // the same estimate the TPS fallback uses. Either way the gap is
        // divided by it so a chunk of 5 tokens is not counted as one token.
        itl.add(performance.now(), Math.max(1, estimateTokens(delta)));
        fullText += delta;
        callbacks.onChunk(delta, fullText);
      }
      return false;
    };

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (ingestLine(line.trim())) {
          finish();
          return;
        }
      }
    }

    // Some servers (llama.cpp, certain cloud gateways) close the stream
    // without sending [DONE]. Finish with whatever accumulated instead of
    // hanging the UI forever. Trailing buffered bytes get one last parse.
    buffer += decoder.decode();
    for (const line of buffer.split('\n')) {
      if (ingestLine(line.trim())) break;
    }
    if (!signal?.aborted) finish();
  } catch (error) {
    callbacks.onError(error instanceof Error ? error : new Error(String(error)));
  }
}

/**
 * Network-level failures (DNS, reset connection, regional blocking, VPN/proxy
 * issues) surface as a bare TypeError ("Failed to fetch") with no status.
 * Translate that into something actionable instead of showing the raw text.
 */
function fetchFailedMessage(error: unknown): string {
  const msg = error instanceof Error ? error.message : String(error);
  if (
    error instanceof TypeError ||
    /failed to fetch|networkerror|load failed|network request failed/i.test(msg)
  ) {
    return 'Network unreachable — the host cannot be reached. Check your connection/VPN: some providers block certain regions or IPs.';
  }
  return msg || 'Connection failed.';
}

export interface CloudTestResult {
  ok: boolean;
  modelCount?: number;
  /** Model ids reported by `GET /models` (capped). */
  models?: string[];
  /**
   * Per-token USD prices for models whose `/models` entry carries an
   * OpenRouter-style `pricing: { prompt, completion }` object.
   */
  pricing?: Record<string, { prompt: number; completion: number }>;
  /** False when the provider has no `/models` endpoint (key verified via probe instead). */
  modelsListed: boolean;
  /** Set when the base URL still had an unfilled `{PLACEHOLDER}` — no request was sent. */
  missingVar?: string;
  error?: string;
}

/** Parse OpenRouter-style pricing (per-token USD as string or number). Exported for unit tests. */
export function parsePricing(raw: unknown): { prompt: number; completion: number } | null {
  if (!raw || typeof raw !== 'object') return null;
  const p = Number((raw as { prompt?: unknown }).prompt);
  const c = Number((raw as { completion?: unknown }).completion);
  if (!Number.isFinite(p) || !Number.isFinite(c) || p < 0 || c < 0) return null;
  return { prompt: p, completion: c };
}

/**
 * Tests a cloud (OpenAI-compatible) endpoint: `GET {baseUrl}/models` with an
 * optional `Authorization: Bearer` header. Used by the Cloud providers page.
 * The key itself is never logged.
 *
 * `vars` fills `{PLACEHOLDER}` tokens in the base URL (Cloudflare's
 * `{ACCOUNT_ID}`); an unfilled token is reported as `missingVar` instead of
 * firing a request at a URL that can only 404.
 *
 * Some providers (e.g. Poolside) don't implement `/models` but serve
 * `/chat/completions` fine. In that case (404/405/501) we fall back to a
 * key-only probe: a 401/403 means a bad key, anything else means the key
 * was accepted — reported as ok with `modelsListed: false` so the UI can
 * suggest adding model ids manually.
 */
async function testCloudConnection(
  baseUrl: string,
  apiKey?: string,
  vars?: Record<string, string>
): Promise<CloudTestResult> {
  const missing = missingUrlVars(baseUrl, vars);
  if (missing.length > 0) {
    return {
      ok: false,
      modelsListed: true,
      missingVar: missing[0],
      error: `Missing ${missing[0]} — fill it in above.`,
    };
  }
  baseUrl = applyUrlVars(baseUrl, vars);
  const normalized = baseUrl.replace(/\/+$/, '');
  const auth: Record<string, string> = {};
  if (apiKey?.trim()) auth['Authorization'] = `Bearer ${apiKey.trim()}`;
  try {
    const response = await fetch(`${normalized}/models`, { headers: auth });
    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { ok: false, modelsListed: true, error: 'Unauthorized — check the API key.' };
      }
      if (
        (response.status === 404 || response.status === 405 || response.status === 501) &&
        apiKey?.trim()
      ) {
        return await probeKeyOnly(normalized, apiKey.trim());
      }
      return {
        ok: false,
        modelsListed: true,
        error: (await httpError('Server error', response)).message,
      };
    }
    const data = await response.json();
    const models = Array.isArray(data?.data) ? data.data : [];
    const ids = models
      .map((m: { id?: unknown }) => (typeof m?.id === 'string' ? m.id : null))
      .filter((id: string | null): id is string => Boolean(id))
      .slice(0, 300);
    const pricing: Record<string, { prompt: number; completion: number }> = {};
    for (const m of models) {
      if (m && typeof m.id === 'string') {
        const parsed = parsePricing((m as { pricing?: unknown }).pricing);
        if (parsed) pricing[m.id] = parsed;
      }
    }
    return {
      ok: true,
      modelCount: models.length,
      models: ids,
      pricing: Object.keys(pricing).length > 0 ? pricing : undefined,
      modelsListed: true,
    };
  } catch (error) {
    return {
      ok: false,
      modelsListed: true,
      error: fetchFailedMessage(error),
    };
  }
}

/** Key-only check for providers without a `/models` endpoint. */
async function probeKeyOnly(baseUrl: string, apiKey: string): Promise<CloudTestResult> {
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: '__promptdeck_key_check__',
        messages: [{ role: 'user', content: 'Hi' }],
        max_tokens: 1,
        stream: false,
      }),
    });
    if (response.status === 401 || response.status === 403) {
      return { ok: false, modelsListed: false, error: 'Unauthorized — check the API key.' };
    }
    // Any other status (unknown-model 404, quota 402/429, bad request 400…)
    // proves the key itself was accepted.
    return { ok: true, modelCount: 0, models: [], modelsListed: false };
  } catch (error) {
    return {
      ok: false,
      modelsListed: false,
      error: fetchFailedMessage(error),
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
      error: fetchFailedMessage(error),
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

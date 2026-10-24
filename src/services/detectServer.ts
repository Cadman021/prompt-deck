// src/services/detectServer.ts
// Best-effort discovery of local inference servers on their default ports.
//
// The app talks to Ollama (`/api/tags`) and OpenAI-compatible servers
// (`/models`) over plain `fetch`, so detection just probes those two shapes on
// the common localhost ports. Any failure (offline, CORS, wrong shape) is
// treated as "not running" rather than an error — the caller only cares about
// what answered.

export type LocalProvider = 'ollama' | 'openai-compatible';

export interface DetectedServer {
  provider: LocalProvider;
  baseUrl: string;
  models: string[];
}

export interface DetectCandidate {
  provider: LocalProvider;
  baseUrl: string;
  path: string;
}

/**
 * Default ports, in probe order.
 *
 * Every non-Ollama entry speaks the OpenAI-compatible `/v1/models` shape that
 * `extractModelNames` expects (`data[].id`), so supporting a server is just one
 * more row here.
 *
 * KoboldCpp exposes its OpenAI layer under `/api/v1` rather than `/v1` (the
 * bare `/v1` is a different, older surface) and defaults to port 5001. Jan runs
 * a Cortex server on 1337.
 *
 * Both extra entries are best-effort: a server that isn't running simply fails
 * its probe and is skipped, so a wrong port costs one timed-out request and can
 * never break detection. Both are probed last, after the two servers whose
 * addresses are stable.
 */
export const DETECT_CANDIDATES: readonly DetectCandidate[] = [
  { provider: 'ollama', baseUrl: 'http://localhost:11434', path: '/api/tags' },
  { provider: 'openai-compatible', baseUrl: 'http://localhost:1234/v1', path: '/models' },
  { provider: 'openai-compatible', baseUrl: 'http://localhost:8080/v1', path: '/models' },
  { provider: 'openai-compatible', baseUrl: 'http://localhost:5001/api/v1', path: '/models' },
  { provider: 'openai-compatible', baseUrl: 'http://localhost:1337/v1', path: '/models' },
];

export const DEFAULT_DETECT_TIMEOUT_MS = 600;

function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Pulls model ids out of either `/api/tags` (`models[].name`) or `/models` (`data[].id`). */
export function extractModelNames(data: unknown): string[] {
  const root = asRecord(data);
  if (!root) return [];
  const list = Array.isArray(root.models) ? root.models : Array.isArray(root.data) ? root.data : [];
  const names: string[] = [];
  for (const item of list) {
    const entry = asRecord(item);
    const name = entry?.name ?? entry?.id ?? entry?.model;
    if (typeof name === 'string' && name.length > 0) names.push(name);
  }
  return names;
}

/**
 * Probes one candidate. Resolves to the detected server (with its model list)
 * if it answered with a recognizable body, otherwise `null`.
 */
export async function probeServer(
  candidate: DetectCandidate,
  timeoutMs = DEFAULT_DETECT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<DetectedServer | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(`${candidate.baseUrl}${candidate.path}`, {
      signal: controller.signal,
    });
    if (!response.ok) return null;
    const models = extractModelNames(await response.json());
    // A 200 with no recognizable model list is some *other* service on the
    // port (or a server still loading). Reporting it would show the user a
    // phantom server with zero models, which they cannot select anyway.
    if (models.length === 0) return null;
    return { provider: candidate.provider, baseUrl: candidate.baseUrl, models };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Probes every default candidate in parallel and returns the ones that answered. */
export async function detectLocalServers(
  timeoutMs = DEFAULT_DETECT_TIMEOUT_MS,
  fetchImpl: typeof fetch = fetch
): Promise<DetectedServer[]> {
  const results = await Promise.all(
    DETECT_CANDIDATES.map((c) => probeServer(c, timeoutMs, fetchImpl))
  );
  return results.filter((r): r is DetectedServer => r !== null);
}

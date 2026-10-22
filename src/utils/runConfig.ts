// src/utils/runConfig.ts
import type { GenerationOverrides } from '../types/ollama';

/** The `run_config` JSON snapshot saved with every run (see `finalizeRun`). */
export interface SavedRunConfig {
  system?: string;
  temperature?: number;
  top_p?: number;
  num_ctx?: number;
  serverDefaults?: boolean;
  seed?: number | null;
  maxTokens?: number | null;
  repeats?: number;
  slotParams?: Record<string, GenerationOverrides>;
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

const finite = (v: unknown): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) ? v : undefined;

/** Keeps only known, well-typed override fields; null maxTokens is meaningful. */
function sanitizeOverrides(value: unknown): GenerationOverrides | null {
  if (!isRecord(value)) return null;
  const out: GenerationOverrides = {};

  const temperature = finite(value.temperature);
  if (temperature !== undefined) out.temperature = temperature;
  const topP = finite(value.top_p);
  if (topP !== undefined) out.top_p = topP;
  const numCtx = finite(value.num_ctx);
  if (numCtx !== undefined) out.num_ctx = numCtx;
  const maxTokens = finite(value.maxTokens);
  if (maxTokens !== undefined) out.maxTokens = maxTokens;
  else if (value.maxTokens === null) out.maxTokens = null;

  return Object.keys(out).length > 0 ? out : null;
}

/**
 * Tolerant parse of a history row's `run_config`. Rows from older versions may
 * lack it, and the column is plain text a user can edit by hand, so anything
 * that is not a recognised field with the right type is dropped rather than
 * trusted.
 */
export function parseRunConfig(json?: string | null): SavedRunConfig {
  if (!json) return {};

  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return {};
  }
  if (!isRecord(raw)) return {};

  const out: SavedRunConfig = {};
  if (typeof raw.system === 'string') out.system = raw.system;

  const temperature = finite(raw.temperature);
  if (temperature !== undefined) out.temperature = temperature;
  const topP = finite(raw.top_p);
  if (topP !== undefined) out.top_p = topP;
  const numCtx = finite(raw.num_ctx);
  if (numCtx !== undefined) out.num_ctx = numCtx;

  if (typeof raw.serverDefaults === 'boolean') out.serverDefaults = raw.serverDefaults;
  if (raw.seed === null) out.seed = null;
  else {
    const seed = finite(raw.seed);
    if (seed !== undefined) out.seed = seed;
  }

  if (raw.maxTokens === null) out.maxTokens = null;
  else {
    const maxTokens = finite(raw.maxTokens);
    if (maxTokens !== undefined) out.maxTokens = maxTokens;
  }

  const repeats = finite(raw.repeats);
  if (repeats !== undefined && repeats >= 1) out.repeats = Math.floor(repeats);

  if (isRecord(raw.slotParams)) {
    const slotParams: Record<string, GenerationOverrides> = {};
    for (const [name, value] of Object.entries(raw.slotParams)) {
      const overrides = sanitizeOverrides(value);
      if (overrides) slotParams[name] = overrides;
    }
    if (Object.keys(slotParams).length > 0) out.slotParams = slotParams;
  }

  return out;
}

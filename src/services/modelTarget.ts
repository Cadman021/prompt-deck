// src/services/modelTarget.ts
// Model source abstraction: a bench/test target is either a local model
// (current provider + base URL from settings) or a cloud model
// (`cloud:providerId/model` qualified name + stored API key).
//
// Qualified names (`cloud:openrouter/openai/gpt-4o-mini`) flow through history,
// leaderboard, votes, charts and exports as plain strings — no DB migration.
// The `cloud:` prefix is explicit so a local model id can never collide with
// a provider id (e.g. LM Studio's `openai/gpt-oss-20b` stays local).

import {
  CLOUD_CATALOG,
  CustomProviderDef,
  applyUrlVars,
  missingUrlVars,
} from '../data/cloudProviders';
import type { Provider } from '../store/useSettingsStore';
import type { ModelPricing } from '../types/ollama';
import { secretFor } from './secrets';

export type ModelSource = { kind: 'local' } | { kind: 'cloud'; providerId: string };

export interface TargetConfig {
  provider: Provider;
  baseUrl: string;
  apiKey?: string;
}

export interface CloudGroup {
  providerId: string;
  name: string;
  models: string[];
}

export const CLOUD_PREFIX = 'cloud:';

export function qualifiedName(source: ModelSource, model: string): string {
  return source.kind === 'cloud' ? `${CLOUD_PREFIX}${source.providerId}/${model}` : model;
}

/** Short display name: cloud drops the `cloud:providerId/` prefix. Local names are never truncated. */
export function shortModelName(qualified: string, source?: ModelSource): string {
  const isCloud =
    source?.kind === 'cloud' || (source === undefined && qualified.startsWith(CLOUD_PREFIX));
  if (!isCloud) return qualified;
  const rest = qualified.startsWith(CLOUD_PREFIX)
    ? qualified.slice(CLOUD_PREFIX.length)
    : qualified;
  const slash = rest.indexOf('/');
  return slash >= 0 ? rest.slice(slash + 1) : rest;
}

function knownProviderIds(custom: CustomProviderDef[]): Set<string> {
  return new Set([...CLOUD_CATALOG.map((d) => d.id), ...custom.map((d) => d.id)]);
}

/** Split a stored qualified name back into source + raw model id. */
export function parseQualified(
  qualified: string,
  custom: CustomProviderDef[]
): { source: ModelSource; model: string } {
  // Explicit new format: `cloud:providerId/model`. Unambiguous by construction.
  if (qualified.startsWith(CLOUD_PREFIX)) {
    const rest = qualified.slice(CLOUD_PREFIX.length);
    const slash = rest.indexOf('/');
    if (slash > 0) {
      return {
        source: { kind: 'cloud', providerId: rest.slice(0, slash) },
        model: rest.slice(slash + 1),
      };
    }
    // Malformed `cloud:` name — keep everything so nothing is silently lost.
    return { source: { kind: 'local' }, model: qualified };
  }
  // Legacy format (`providerId/model`, written before the prefix existed):
  // still honored so old history/leaderboard rows keep resolving.
  const slash = qualified.indexOf('/');
  if (slash > 0) {
    const head = qualified.slice(0, slash);
    if (knownProviderIds(custom).has(head)) {
      return { source: { kind: 'cloud', providerId: head }, model: qualified.slice(slash + 1) };
    }
  }
  return { source: { kind: 'local' }, model: qualified };
}

export function buildCloudGroups(
  custom: CustomProviderDef[],
  enabledModels: Record<string, string[]>
): CloudGroup[] {
  const defs = [...CLOUD_CATALOG, ...custom];
  return defs
    .map((d) => ({
      providerId: d.id,
      name: d.name,
      models: enabledModels[d.id] ?? [],
    }))
    .filter((g) => g.models.length > 0);
}

export function findCloudBaseUrl(providerId: string, custom: CustomProviderDef[]): string | null {
  const def =
    CLOUD_CATALOG.find((d) => d.id === providerId) ?? custom.find((d) => d.id === providerId);
  return def ? def.defaultBaseUrl : null;
}

/**
 * Base URL with every `{PLACEHOLDER}` filled from the connection's stored
 * vars (Cloudflare `{ACCOUNT_ID}`, …). Placeholders without a value are left
 * as-is so callers can detect `missingUrlVars`.
 */
export function findResolvedBaseUrl(
  providerId: string,
  custom: CustomProviderDef[],
  connectionVars?: Record<string, string>
): string | null {
  const baseUrl = findCloudBaseUrl(providerId, custom);
  return baseUrl ? applyUrlVars(baseUrl, connectionVars) : null;
}

/**
 * Estimated USD cost of one run. Returns null unless exact server-reported
 * token counts AND per-token pricing are both available — never guess.
 */
export function calcCost(
  promptTokens: number | undefined,
  completionTokens: number | undefined,
  pricing: ModelPricing | undefined
): number | null {
  if (promptTokens == null || completionTokens == null || !pricing) return null;
  return promptTokens * pricing.prompt + completionTokens * pricing.completion;
}

/** Compact USD formatting: $0.00234, $1.24, $12.5K (never scientific). */
export function formatCost(usd: number): string {
  if (usd < 0.01) return `$${usd.toFixed(5)}`;
  if (usd < 1) return `$${usd.toFixed(4)}`;
  if (usd < 1000) return `$${usd.toFixed(2)}`;
  return `$${(usd / 1000).toFixed(2)}K`;
}

export type ResolveError = 'noCloudKey' | 'unknownProvider' | 'missingUrlVar';

/**
 * Resolve a cloud target to a runnable config using the first enabled key
 * that has an API key. Returns the error code when it can't run.
 */
export function resolveCloudTarget(
  providerId: string,
  custom: CustomProviderDef[],
  keys: {
    id: string;
    providerId: string;
    apiKey: string;
    enabled: boolean;
    connectionVars?: Record<string, string>;
  }[]
): { config: TargetConfig } | { error: ResolveError } {
  const baseUrl = findCloudBaseUrl(providerId, custom);
  if (!baseUrl) return { error: 'unknownProvider' };
  const candidates = keys.filter(
    (k) => k.providerId === providerId && k.enabled && secretFor(k).trim()
  );
  if (candidates.length === 0) return { error: 'noCloudKey' };
  // Prefer a connection whose placeholder vars are all filled (Cloudflare).
  const key = candidates.find((k) => missingUrlVars(baseUrl, k.connectionVars).length === 0);
  if (!key) return { error: 'missingUrlVar' };
  return {
    config: {
      provider: 'openai-compatible',
      baseUrl: applyUrlVars(baseUrl, key.connectionVars),
      apiKey: secretFor(key).trim(),
    },
  };
}

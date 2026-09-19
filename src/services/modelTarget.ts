// src/services/modelTarget.ts
// Model source abstraction: a bench/test target is either a local model
// (current provider + base URL from settings) or a cloud model
// (`providerId/model` qualified name + stored API key).
//
// Qualified names (`openrouter/openai/gpt-4o-mini`) flow through history,
// leaderboard, votes, charts and exports as plain strings — no DB migration.

import { CLOUD_CATALOG, CustomProviderDef } from '../data/cloudProviders';
import type { Provider } from '../store/useSettingsStore';

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

export function qualifiedName(source: ModelSource, model: string): string {
  return source.kind === 'cloud' ? `${source.providerId}/${model}` : model;
}

/** Short display name: cloud drops the `providerId/` prefix. */
export function shortModelName(qualified: string, source?: ModelSource): string {
  if (source?.kind === 'cloud' || (source === undefined && qualified.includes('/'))) {
    const slash = qualified.indexOf('/');
    return slash >= 0 ? qualified.slice(slash + 1) : qualified;
  }
  return qualified;
}

function knownProviderIds(custom: CustomProviderDef[]): Set<string> {
  return new Set([...CLOUD_CATALOG.map((d) => d.id), ...custom.map((d) => d.id)]);
}

/** Split a stored qualified name back into source + raw model id. */
export function parseQualified(
  qualified: string,
  custom: CustomProviderDef[]
): { source: ModelSource; model: string } {
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

export type ResolveError = 'noCloudKey' | 'unknownProvider';

/**
 * Resolve a cloud target to a runnable config using the first enabled key
 * that has an API key. Returns the error code when it can't run.
 */
export function resolveCloudTarget(
  providerId: string,
  custom: CustomProviderDef[],
  keys: { providerId: string; apiKey: string; enabled: boolean }[]
): { config: TargetConfig } | { error: ResolveError } {
  const baseUrl = findCloudBaseUrl(providerId, custom);
  if (!baseUrl) return { error: 'unknownProvider' };
  const key = keys.find((k) => k.providerId === providerId && k.enabled && k.apiKey.trim());
  if (!key) return { error: 'noCloudKey' };
  return { config: { provider: 'openai-compatible', baseUrl, apiKey: key.apiKey.trim() } };
}

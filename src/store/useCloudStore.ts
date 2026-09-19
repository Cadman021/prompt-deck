// src/store/useCloudStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { CustomProviderDef } from '../data/cloudProviders';

/**
 * SECURITY NOTE (v1): API keys are kept in the persisted zustand store
 * (localStorage) — same trust level as the rest of this fully-local app.
 * Planned follow-up: migrate secrets to the OS keychain via
 * `tauri-plugin-keyring` so keys never sit in plaintext on disk.
 */

export type CloudStatus = 'unknown' | 'ok' | 'error';

/** One named API key (connection) under a provider. */
export interface CloudApiKey {
  id: string;
  providerId: string;
  label: string;
  apiKey: string;
  enabled: boolean;
  status: CloudStatus;
  lastTested?: string;
  error?: string;
}

interface CloudState {
  keys: CloudApiKey[];
  customProviders: CustomProviderDef[];
  /** providerId -> model ids the user wants to use (bench integration reads this). */
  enabledModels: Record<string, string[]>;
  /** providerId -> model ids discovered via /models or added manually. */
  knownModels: Record<string, string[]>;
  addKey: (key: CloudApiKey) => void;
  updateKey: (id: string, patch: Partial<CloudApiKey>) => void;
  removeKey: (id: string) => void;
  setKnownModels: (providerId: string, models: string[]) => void;
  addKnownModel: (providerId: string, model: string) => void;
  removeKnownModel: (providerId: string, model: string) => void;
  toggleModel: (providerId: string, model: string) => void;
  setAllModels: (providerId: string, enabled: boolean) => void;
  addCustomProvider: (def: CustomProviderDef) => void;
  removeCustomProvider: (providerId: string) => void;
}

const newKeyId = (): string =>
  `key-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export const createKeyId = newKeyId;

export const useCloudStore = create<CloudState>()(
  persist(
    (set) => ({
      keys: [],
      customProviders: [],
      enabledModels: {},
      knownModels: {},
      addKey: (key) => set((s) => ({ keys: [...s.keys, key] })),
      updateKey: (id, patch) =>
        set((s) => ({ keys: s.keys.map((k) => (k.id === id ? { ...k, ...patch } : k)) })),
      removeKey: (id) => set((s) => ({ keys: s.keys.filter((k) => k.id !== id) })),
      setKnownModels: (providerId, models) =>
        set((s) => {
          const uniq = [...new Set(models)];
          // First discovery auto-enables everything; later refreshes keep user choices
          // but include brand-new models as enabled.
          const prevEnabled = s.enabledModels[providerId];
          const nextEnabled =
            prevEnabled === undefined
              ? uniq
              : [...prevEnabled, ...uniq.filter((m) => !s.knownModels[providerId]?.includes(m))];
          return {
            knownModels: { ...s.knownModels, [providerId]: uniq },
            enabledModels: { ...s.enabledModels, [providerId]: nextEnabled },
          };
        }),
      addKnownModel: (providerId, model) =>
        set((s) => {
          const m = model.trim();
          if (!m) return s;
          const known = s.knownModels[providerId] ?? [];
          const enabled = s.enabledModels[providerId] ?? [];
          return {
            knownModels: {
              ...s.knownModels,
              [providerId]: known.includes(m) ? known : [...known, m],
            },
            enabledModels: {
              ...s.enabledModels,
              [providerId]: enabled.includes(m) ? enabled : [...enabled, m],
            },
          };
        }),
      removeKnownModel: (providerId, model) =>
        set((s) => ({
          knownModels: {
            ...s.knownModels,
            [providerId]: (s.knownModels[providerId] ?? []).filter((m) => m !== model),
          },
          enabledModels: {
            ...s.enabledModels,
            [providerId]: (s.enabledModels[providerId] ?? []).filter((m) => m !== model),
          },
        })),
      toggleModel: (providerId, model) =>
        set((s) => {
          const enabled = s.enabledModels[providerId] ?? [];
          return {
            enabledModels: {
              ...s.enabledModels,
              [providerId]: enabled.includes(model)
                ? enabled.filter((m) => m !== model)
                : [...enabled, model],
            },
          };
        }),
      setAllModels: (providerId, enabled) =>
        set((s) => ({
          enabledModels: {
            ...s.enabledModels,
            [providerId]: enabled ? [...(s.knownModels[providerId] ?? [])] : [],
          },
        })),
      addCustomProvider: (def) =>
        set((s) =>
          s.customProviders.some((p) => p.id === def.id)
            ? s
            : { customProviders: [...s.customProviders, def] }
        ),
      removeCustomProvider: (providerId) =>
        set((s) => ({
          keys: s.keys.filter((k) => k.providerId !== providerId),
          customProviders: s.customProviders.filter((p) => p.id !== providerId),
          enabledModels: Object.fromEntries(
            Object.entries(s.enabledModels).filter(([k]) => k !== providerId)
          ),
          knownModels: Object.fromEntries(
            Object.entries(s.knownModels).filter(([k]) => k !== providerId)
          ),
        })),
    }),
    {
      name: 'promptdeck-cloud',
      version: 2,
      // v1 -> v2: one connection per provider becomes a keys array.
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as Record<string, unknown>;
        if (p['connections'] && !p['keys']) {
          const old = p['connections'] as Record<
            string,
            {
              providerId: string;
              apiKey: string;
              baseUrl?: string;
              enabled: boolean;
              status: CloudStatus;
              modelCount?: number;
              lastTested?: string;
              error?: string;
            }
          >;
          const keys: CloudApiKey[] = Object.values(old).map((c, i) => ({
            id: `key-migrated-${i}`,
            providerId: c.providerId,
            label: 'Default',
            apiKey: c.apiKey,
            enabled: c.enabled,
            status: c.status,
            lastTested: c.lastTested,
            error: c.error,
          }));
          // Old per-provider baseUrl overrides are dropped (custom defs carry their own URL).
          return {
            keys,
            customProviders: (p['customProviders'] as CustomProviderDef[]) ?? [],
            enabledModels: {},
            knownModels: {},
          };
        }
        return (persisted ?? {}) as object;
      },
      partialize: (s) => ({
        keys: s.keys,
        customProviders: s.customProviders,
        enabledModels: s.enabledModels,
        knownModels: s.knownModels,
      }),
    }
  )
);

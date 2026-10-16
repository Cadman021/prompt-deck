// src/store/useSettingsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n/config';
import type { AdvancedConfig } from '../components/AdvancedSettings';

export type Theme = 'dark' | 'light' | 'amoled';
export type Language = 'en' | 'fa' | 'de' | 'fr' | 'zh' | 'ru';
export type Provider = 'ollama' | 'openai-compatible';
/** Parallel streams all slots at once; sequential runs them one by one for uncontaminated local numbers. */
export type RunMode = 'parallel' | 'sequential';

const DEFAULT_BASE_URLS: Record<Provider, string> = {
  ollama: 'http://localhost:11434',
  'openai-compatible': 'http://localhost:1234/v1', // LM Studio default
};

const DEFAULT_ADVANCED: AdvancedConfig = {
  system: '',
  temperature: 0.7,
  top_p: 0.9,
  num_ctx: 4096,
  serverDefaults: false,
  seed: null,
  maxTokens: null,
};

interface SettingsState {
  theme: Theme;
  language: Language;
  provider: Provider;
  baseUrl: string;
  advancedConfig: AdvancedConfig;
  runMode: RunMode;
  /** Blind voting: mask model identities everywhere in Bench. */
  blindMode: boolean;
  setBlindMode: (blind: boolean) => void;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setProvider: (provider: Provider) => void;
  setBaseUrl: (url: string) => void;
  setAdvancedConfig: (config: AdvancedConfig) => void;
  setRunMode: (mode: RunMode) => void;
  resetSettings: () => void;
}

interface PersistedSettings {
  theme: Theme;
  language: Language;
  provider: Provider;
  baseUrl: string;
  advancedConfig: AdvancedConfig;
  runMode: RunMode;
  blindMode: boolean;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      language: 'en',
      provider: 'ollama',
      baseUrl: DEFAULT_BASE_URLS.ollama,
      advancedConfig: DEFAULT_ADVANCED,
      runMode: 'sequential',
      blindMode: false,
      setBlindMode: (blindMode) => set({ blindMode }),
      setTheme: (theme) => set({ theme }),
      setLanguage: (language) => set({ language }),
      setProvider: (provider) => {
        // Only reset the URL when the provider actually changed,
        // so a manual URL edit is never wiped by a re-render.
        if (get().provider === provider) return;
        set({ provider, baseUrl: DEFAULT_BASE_URLS[provider] });
      },
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setAdvancedConfig: (advancedConfig) => set({ advancedConfig }),
      setRunMode: (runMode) => set({ runMode }),
      resetSettings: () =>
        set({
          provider: 'ollama',
          baseUrl: DEFAULT_BASE_URLS.ollama,
          advancedConfig: { ...DEFAULT_ADVANCED },
        }),
    }),
    {
      name: 'promptdeck-settings',
      version: 3,
      // v2 -> v3: 'runMode' added (defaults to 'sequential' via initial state
      // when absent — zustand merges persisted state over it).
      migrate: (persisted: unknown) => (persisted ?? {}) as PersistedSettings,
      partialize: (s): PersistedSettings => ({
        theme: s.theme,
        language: s.language,
        provider: s.provider,
        baseUrl: s.baseUrl,
        advancedConfig: s.advancedConfig,
        runMode: s.runMode,
        blindMode: s.blindMode,
      }),
    }
  )
);

/**
 * Applies DOM / i18n side effects for the current settings.
 * Called once at startup and on every store change (see main.tsx),
 * so setters stay pure and StrictMode-safe.
 */
export function applySettingsSideEffects(s: Pick<SettingsState, 'theme' | 'language'>): void {
  // AMOLED builds on top of dark mode (keeps all `dark:` styles) + `.amoled` overrides for pure black + neon.
  document.documentElement.classList.toggle('dark', s.theme !== 'light');
  document.documentElement.classList.toggle('amoled', s.theme === 'amoled');
  document.documentElement.dir = s.language === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.lang = s.language;
  if (i18n.language !== s.language) {
    void i18n.changeLanguage(s.language);
  }
}

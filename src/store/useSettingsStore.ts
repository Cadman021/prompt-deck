// src/store/useSettingsStore.ts
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import i18n from '../i18n/config';
import type { AdvancedConfig } from '../components/AdvancedSettings';

type Theme = 'dark' | 'light';
type Language = 'en' | 'fa' | 'de';
export type Provider = 'ollama' | 'openai-compatible';

const DEFAULT_BASE_URLS: Record<Provider, string> = {
  ollama: 'http://localhost:11434',
  'openai-compatible': 'http://localhost:1234/v1', // LM Studio default
};

const DEFAULT_ADVANCED: AdvancedConfig = {
  system: '',
  temperature: 0.7,
  top_p: 0.9,
  num_ctx: 4096,
};

interface SettingsState {
  theme: Theme;
  language: Language;
  provider: Provider;
  baseUrl: string;
  advancedConfig: AdvancedConfig;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setProvider: (provider: Provider) => void;
  setBaseUrl: (url: string) => void;
  setAdvancedConfig: (config: AdvancedConfig) => void;
}

interface PersistedSettings {
  theme: Theme;
  language: Language;
  provider: Provider;
  baseUrl: string;
  advancedConfig: AdvancedConfig;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set, get) => ({
      theme: 'dark',
      language: 'en',
      provider: 'ollama',
      baseUrl: DEFAULT_BASE_URLS.ollama,
      advancedConfig: DEFAULT_ADVANCED,
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
    }),
    {
      name: 'promptdeck-settings',
      version: 1,
      partialize: (s): PersistedSettings => ({
        theme: s.theme,
        language: s.language,
        provider: s.provider,
        baseUrl: s.baseUrl,
        advancedConfig: s.advancedConfig,
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
  document.documentElement.classList.toggle('dark', s.theme === 'dark');
  document.documentElement.dir = s.language === 'fa' ? 'rtl' : 'ltr';
  document.documentElement.lang = s.language;
  if (i18n.language !== s.language) {
    void i18n.changeLanguage(s.language);
  }
}

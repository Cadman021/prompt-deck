// src/store/useSettingsStore.ts
import { create } from 'zustand';
import i18n from '../i18n/config';

type Theme = 'dark' | 'light';
type Language = 'en' | 'fa';
export type Provider = 'ollama' | 'openai-compatible';

const DEFAULT_BASE_URLS: Record<Provider, string> = {
  ollama: 'http://localhost:11434',
  'openai-compatible': 'http://localhost:1234/v1', // LM Studio default
};

interface SettingsState {
  theme: Theme;
  language: Language;
  provider: Provider;
  baseUrl: string;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
  setProvider: (provider: Provider) => void;
  setBaseUrl: (url: string) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  language: 'en',
  provider: 'ollama',
  baseUrl: DEFAULT_BASE_URLS.ollama,
  setTheme: (theme) => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },
  setLanguage: (language) => {
    i18n.changeLanguage(language);
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    set({ language });
  },
  setProvider: (provider) => {
    // Reset base URL to the sensible default for the newly selected provider
    set({ provider, baseUrl: DEFAULT_BASE_URLS[provider] });
  },
  setBaseUrl: (baseUrl) => set({ baseUrl }),
}));
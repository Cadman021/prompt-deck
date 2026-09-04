// src/store/useSettingsStore.ts
import { create } from 'zustand';
import i18n from '../i18n/config';

type Theme = 'dark' | 'light';
type Language = 'en' | 'fa';

interface SettingsState {
  theme: Theme;
  language: Language;
  setTheme: (theme: Theme) => void;
  setLanguage: (lang: Language) => void;
}

export const useSettingsStore = create<SettingsState>((set) => ({
  theme: 'dark',
  language: 'en',
  setTheme: (theme) => {
    // Update HTML root class for Tailwind dark mode
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    set({ theme });
  },
  setLanguage: (language) => {
    i18n.changeLanguage(language);
    // Adjust document direction for RTL/LTR support
    document.documentElement.dir = language === 'fa' ? 'rtl' : 'ltr';
    document.documentElement.lang = language;
    set({ language });
  },
}));
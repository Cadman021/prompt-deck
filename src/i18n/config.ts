// src/i18n/config.ts
import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from './locales/en.json';
import fa from './locales/fa.json';
import de from './locales/de.json';

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    fa: { translation: fa },
    de: { translation: de },
  },
  lng: 'en', // Default language for OSS accessibility
  fallbackLng: 'en',
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
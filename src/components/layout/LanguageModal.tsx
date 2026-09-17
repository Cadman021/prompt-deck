// src/components/layout/LanguageModal.tsx
import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Check } from 'lucide-react';
import { useSettingsStore, Language } from '../../store/useSettingsStore';

export interface SupportedLanguage {
  id: Language;
  /** Short region code shown big, like the reference popup (US / DE / IR). */
  code: string;
  /** Native name shown under the code. */
  native: string;
}

// Add new locales here — the grid grows automatically.
export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { id: 'en', code: 'US', native: 'English' },
  { id: 'de', code: 'DE', native: 'Deutsch' },
  { id: 'fa', code: 'IR', native: 'فارسی' },
];

interface LanguageModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const LanguageModal: React.FC<LanguageModalProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const { language, setLanguage } = useSettingsStore();

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  // Portal to <body>: the TopBar header uses `backdrop-blur`, which creates a
  // containing block for `fixed` descendants — without this the modal would be
  // clipped to the header instead of covering the viewport.
  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="relative w-[640px] max-w-full max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-base font-bold">{t('language.title', 'Select Language')}</h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 hover:text-slate-900 dark:hover:text-white transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-4">
          <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
            {SUPPORTED_LANGUAGES.map((l) => {
              const selected = language === l.id;
              return (
                <button
                  key={l.id}
                  onClick={() => {
                    setLanguage(l.id);
                    onClose();
                  }}
                  className={`flex flex-col items-center gap-1 rounded-xl px-3 py-5 transition-all border ${
                    selected
                      ? 'border-indigo-500 bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 shadow-[0_0_16px_rgba(99,102,241,0.35)]'
                      : 'border-transparent text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-white/5 hover:border-slate-200 dark:hover:border-white/10'
                  }`}
                >
                  <span className="text-base font-bold tracking-wide">{l.code}</span>
                  <span className={`text-xs ${selected ? '' : 'opacity-80'}`}>{l.native}</span>
                  {selected && <Check className="w-4 h-4 mt-1" />}
                </button>
              );
            })}
          </div>
          <p className="mt-3 px-1 text-[11px] text-slate-400 dark:text-slate-500">
            {t('language.hint', 'More languages coming soon — English, Deutsch and فارسی are fully supported.')}
          </p>
        </div>
      </div>
    </div>,
    document.body
  );
};

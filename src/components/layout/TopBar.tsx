// src/components/layout/TopBar.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw, Sun, Moon, Zap, Languages, Settings } from 'lucide-react';
import { useSettingsStore, Theme } from '../../store/useSettingsStore';
import { APP_VERSION } from '../../version';
import { LanguageModal } from './LanguageModal';

interface TopBarProps {
  modelsCount: number;
  loadingModels: boolean;
  onRefresh: () => void;
  onOpenSettings: () => void;
}

// dark -> amoled -> light -> dark
const NEXT_THEME: Record<Theme, Theme> = {
  dark: 'amoled',
  amoled: 'light',
  light: 'dark',
};

export const TopBar: React.FC<TopBarProps> = ({
  modelsCount,
  loadingModels,
  onRefresh,
  onOpenSettings,
}) => {
  const { t } = useTranslation();
  const { theme, setTheme, language, provider, baseUrl } = useSettingsStore();
  const [isLangOpen, setIsLangOpen] = useState(false);

  const connected = modelsCount > 0;
  const shortUrl = baseUrl.replace(/^https?:\/\//, '').replace(/\/v1\/?$/, '');

  return (
    <header className="h-12 shrink-0 flex items-center justify-between gap-3 px-4 border-b border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur z-20">
      {/* Left: title + connection */}
      <div className="flex items-center gap-3 min-w-0">
        <div className="flex items-center gap-2">
          <h1 className="text-sm font-bold tracking-tight bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent whitespace-nowrap">
            {t('app.title')}
          </h1>
          <span className="hidden sm:inline text-[10px] px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-mono">
            v{APP_VERSION}
          </span>
        </div>

        <div className="hidden md:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700/60 text-[11px] min-w-0">
          <span
            className={`w-1.5 h-1.5 rounded-full shrink-0 ${
              connected ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]' : 'bg-rose-500'
            }`}
          />
          <span className="font-semibold text-slate-700 dark:text-slate-200 whitespace-nowrap">
            {provider === 'ollama' ? 'Ollama' : 'LM Studio'}
          </span>
          <span className="text-slate-400 dark:text-slate-500 font-mono truncate max-w-[160px]" title={baseUrl}>
            {shortUrl}
          </span>
          <span className="font-mono text-slate-500 dark:text-slate-400">·</span>
          <span className="font-mono text-slate-600 dark:text-slate-300">
            {modelsCount} {t('nav.models', 'models')}
          </span>
        </div>
      </div>

      {/* Right: global actions only */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setIsLangOpen(true)}
          className="flex items-center gap-1 text-[11px] px-2 py-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title={t('app.switchLanguage')}
        >
          <Languages className="w-4 h-4" />
          <span className="font-bold uppercase hidden sm:inline">{language}</span>
        </button>

        <button
          onClick={() => setTheme(NEXT_THEME[theme] ?? 'dark')}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          title={t('theme.switchTo', { theme: t(`theme.${NEXT_THEME[theme] ?? 'dark'}`, NEXT_THEME[theme] ?? 'dark') })}
        >
          {theme === 'light' ? (
            <Sun className="w-4 h-4" />
          ) : theme === 'amoled' ? (
            <Zap className="w-4 h-4 text-cyan-400" />
          ) : (
            <Moon className="w-4 h-4" />
          )}
        </button>

        <button
          onClick={onRefresh}
          disabled={loadingModels}
          className="flex items-center gap-1.5 text-[11px] font-medium px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
          <span className="hidden sm:inline">{t('app.refreshModels')}</span>
        </button>

        <button
          onClick={onOpenSettings}
          className="p-1.5 rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition"
          title={t('nav.settings', 'Config')}
        >
          <Settings className="w-4 h-4" />
        </button>
      </div>

      <LanguageModal isOpen={isLangOpen} onClose={() => setIsLangOpen(false)} />
    </header>
  );
};

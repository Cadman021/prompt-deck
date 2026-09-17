// src/components/layout/SettingsPanel.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Server, SlidersHorizontal, Palette, Languages, Sun, Moon, Zap, Check } from 'lucide-react';
import { ProviderSettings } from '../ProviderSettings';
import type { AdvancedConfig } from '../AdvancedSettings';
import { useSettingsStore, Theme } from '../../store/useSettingsStore';
import { LanguageModal, SUPPORTED_LANGUAGES } from './LanguageModal';

interface SettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  advancedConfig: AdvancedConfig;
  onAdvancedChange: (c: AdvancedConfig) => void;
}

export const SettingsPanel: React.FC<SettingsPanelProps> = ({
  isOpen,
  onClose,
  advancedConfig,
  onAdvancedChange,
}) => {
  const { t } = useTranslation();
  const { theme, setTheme, language } = useSettingsStore();
  const [isLangOpen, setIsLangOpen] = useState(false);
  if (!isOpen) return null;

  const themeOption = (id: Theme, icon: React.ReactNode, labelKey: string, fallback: string) => {
    const selected = theme === id;
    return (
      <button
        key={id}
        onClick={() => setTheme(id)}
        className={`flex-1 flex flex-col items-center gap-1 rounded-xl px-2 py-3 border text-[11px] font-medium transition-all ${
          selected
            ? 'border-indigo-500 bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 shadow-[0_0_14px_rgba(99,102,241,0.3)]'
            : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
        }`}
      >
        {icon}
        <span>{t(labelKey, fallback)}</span>
        {selected && <Check className="w-3.5 h-3.5" />}
      </button>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="relative w-[380px] max-w-full h-full bg-white dark:bg-slate-900 border-s border-slate-200 dark:border-slate-800 shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h2 className="text-sm font-bold">{t('nav.settings', 'Config')}</h2>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          <section>
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Palette className="w-4 h-4 text-indigo-500" />
              <span>{t('theme.appearance', 'Appearance')}</span>
            </div>
            <div className="flex gap-2">
              {themeOption('light', <Sun className="w-4 h-4" />, 'theme.light', 'Light')}
              {themeOption('dark', <Moon className="w-4 h-4" />, 'theme.dark', 'Dark')}
              {themeOption('amoled', <Zap className="w-4 h-4" />, 'theme.amoled', 'AMOLED')}
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Languages className="w-4 h-4 text-indigo-500" />
              <span>{t('language.title', 'Select Language')}</span>
            </div>
            <button
              onClick={() => setIsLangOpen(true)}
              className="w-full flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60 hover:border-indigo-400 transition text-xs"
            >
              <span className="font-semibold">
                {SUPPORTED_LANGUAGES.find((l) => l.id === language)?.native ?? language.toUpperCase()}
              </span>
              <span className="font-mono text-slate-400">{language.toUpperCase()}</span>
            </button>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <Server className="w-4 h-4 text-indigo-500" />
              <span>{t('settings.providerTitle', 'Provider & Connection')}</span>
            </div>
            <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/60">
              <ProviderSettings />
              <p className="mt-2 text-[11px] text-slate-400 dark:text-slate-500 leading-relaxed">
                {t('settings.providerHint', 'Ollama for local models, OpenAI-compatible for LM Studio / llama.cpp server.')}
              </p>
            </div>
          </section>

          <section>
            <div className="flex items-center gap-2 mb-2 text-xs font-semibold text-slate-600 dark:text-slate-300">
              <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
              <span>{t('advanced.title')}</span>
            </div>
            {/* Reuse existing controls but always expanded inside the panel */}
            <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 overflow-hidden">
              <div className="p-3 space-y-4 text-xs bg-slate-50 dark:bg-slate-800/50">
                <div>
                  <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
                    {t('advanced.systemPrompt')}:
                  </label>
                  <textarea
                    rows={3}
                    value={advancedConfig.system || ''}
                    onChange={(e) => onAdvancedChange({ ...advancedConfig, system: e.target.value })}
                    placeholder={t('advanced.systemPromptPlaceholder')}
                    className="w-full p-2.5 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs resize-none"
                    dir="auto"
                  />
                </div>
                <div className="space-y-3">
                  <div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                      <span>{t('advanced.temperature')}:</span>
                      <span className="font-mono font-bold text-indigo-500">{advancedConfig.temperature ?? 0.7}</span>
                    </div>
                    <input
                      type="range" min="0" max="1.5" step="0.05"
                      value={advancedConfig.temperature ?? 0.7}
                      onChange={(e) => onAdvancedChange({ ...advancedConfig, temperature: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <div className="flex justify-between text-slate-600 dark:text-slate-400 mb-1">
                      <span>{t('advanced.topP')}:</span>
                      <span className="font-mono font-bold text-indigo-500">{advancedConfig.top_p ?? 0.9}</span>
                    </div>
                    <input
                      type="range" min="0.1" max="1" step="0.05"
                      value={advancedConfig.top_p ?? 0.9}
                      onChange={(e) => onAdvancedChange({ ...advancedConfig, top_p: parseFloat(e.target.value) })}
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-600 dark:text-slate-400 mb-1">
                      {t('advanced.contextLength')}:
                    </label>
                    <select
                      value={advancedConfig.num_ctx ?? 4096}
                      onChange={(e) => onAdvancedChange({ ...advancedConfig, num_ctx: parseInt(e.target.value) })}
                      className="w-full p-2 rounded-lg bg-white dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-xs font-mono"
                    >
                      <option value={2048}>2048 (2K)</option>
                      <option value={4096}>4096 (4K)</option>
                      <option value={8192}>8192 (8K)</option>
                      <option value={16384}>16384 (16K)</option>
                      <option value={32768}>32768 (32K)</option>
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </section>
        </div>
      </div>
      <LanguageModal isOpen={isLangOpen} onClose={() => setIsLangOpen(false)} />
    </div>
  );
};

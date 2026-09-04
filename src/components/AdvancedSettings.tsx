// src/components/AdvancedSettings.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';

export interface AdvancedConfig {
  system?: string;
  temperature?: number;
  top_p?: number;
  num_ctx?: number;
}

interface AdvancedSettingsProps {
  config: AdvancedConfig;
  onChange: (newConfig: AdvancedConfig) => void;
}

export const AdvancedSettings: React.FC<AdvancedSettingsProps> = ({ config, onChange }) => {
  const { t } = useTranslation();
  const [isOpen, setIsOpen] = useState(false);

  const handleChange = (key: keyof AdvancedConfig, value: any) => {
    onChange({
      ...config,
      [key]: value,
    });
  };

  return (
    <div className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg shadow-sm transition-all overflow-hidden mb-3">
      {/* Accordion Header */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-2.5 flex items-center justify-between text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors"
      >
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-indigo-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
          </svg>
          <span>{t("advanced.title")}</span>
        </div>
        <svg
          className={`w-4 h-4 text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Accordion Content */}
      {isOpen && (
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-4 text-xs">
          {/* System Prompt */}
          <div>
            <label className="block text-slate-700 dark:text-slate-300 font-medium mb-1">
             {t("advanced.systemPrompt")}:
            </label>
            <textarea
              rows={2}
              value={config.system || ''}
              onChange={(e) => handleChange('system', e.target.value)}
              placeholder={t("advanced.systemPromptPlaceholder")}
              className="w-full p-2.5 rounded-md bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs resize-none"
              dir="auto"
            />
          </div>

          {/* Sliders Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            {/* Temperature */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t("advanced.temperature")}:</span>
                <span className="font-mono font-bold text-indigo-500">{config.temperature ?? 0.7}</span>
              </div>
              <input
                type="range"
                min="0"
                max="1.5"
                step="0.05"
                value={config.temperature ?? 0.7}
                onChange={(e) => handleChange('temperature', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Top-P */}
            <div className="space-y-1">
              <div className="flex justify-between text-slate-600 dark:text-slate-400">
                <span>{t("advanced.topP")}:</span>
                <span className="font-mono font-bold text-indigo-500">{config.top_p ?? 0.9}</span>
              </div>
              <input
                type="range"
                min="0.1"
                max="1"
                step="0.05"
                value={config.top_p ?? 0.9}
                onChange={(e) => handleChange('top_p', parseFloat(e.target.value))}
                className="w-full accent-indigo-500 cursor-pointer"
              />
            </div>

            {/* Context Length */}
            <div className="space-y-1">
              <label className="block text-slate-600 dark:text-slate-400">
                {t("advanced.contextLength")}:
              </label>
              <select
                value={config.num_ctx ?? 4096}
                onChange={(e) => handleChange('num_ctx', parseInt(e.target.value))}
                className="w-full p-1.5 rounded bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 text-slate-800 dark:text-slate-200 focus:outline-none focus:ring-1 focus:ring-indigo-500 text-xs font-mono"
              >
                <option value={2048}>2048 (2K Context)</option>
                <option value={4096}>4096 (4K Context)</option>
                <option value={8192}>8192 (8K Context)</option>
                <option value={16384}>16384 (16K Context)</option>
                <option value={32768}>32768 (32K Context)</option>
              </select>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
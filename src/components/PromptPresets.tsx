// src/components/PromptPresets.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';

interface Preset {
  id: string;
  label: string;
  prompt: string;
}

interface PromptPresetsProps {
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const PromptPresets: React.FC<PromptPresetsProps> = ({ onSelect, disabled }) => {
  const { t } = useTranslation();

  const PRESETS: Preset[] = [
    {
      id: 'code',
      label: t("presets.codeLabel"),
      prompt: t("presets.codePrompt"),
    },
    {
      id: 'logic',
      label: t("presets.logicLabel"),
      prompt: t("presets.logicPrompt"),
    },
    {
      id: 'summary',
      label: t("presets.summaryLabel"),
      prompt: t("presets.summaryPrompt"),
    },
  ];
  return (
    <div className="flex flex-wrap items-center gap-2 my-2">
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">{t("presets.quickPrompts")}:</span>
      {PRESETS.map((preset) => (
        <button
          key={preset.id}
          type="button"
          disabled={disabled}
          onClick={() => onSelect(preset.prompt)}
          className="px-2.5 py-1 text-xs font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-indigo-50 dark:hover:bg-indigo-950 hover:text-indigo-600 dark:hover:text-indigo-300 hover:border-indigo-300 transition-all disabled:opacity-50"
        >
          {preset.label}
        </button>
      ))}
    </div>
  );
};
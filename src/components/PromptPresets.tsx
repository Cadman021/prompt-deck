// src/components/PromptPresets.tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, X, Bookmark } from 'lucide-react';
import { DbService, UserPreset } from '../services/dbService';

interface PromptPresetsProps {
  currentPrompt: string;
  onSelect: (prompt: string) => void;
  disabled?: boolean;
}

export const PromptPresets: React.FC<PromptPresetsProps> = ({
  currentPrompt,
  onSelect,
  disabled,
}) => {
  const { t } = useTranslation();
  const [userPresets, setUserPresets] = useState<UserPreset[]>([]);

  const BUILT_IN_PRESETS = [
    { id: 'code', label: t('presets.codeLabel'), prompt: t('presets.codePrompt') },
    { id: 'logic', label: t('presets.logicLabel'), prompt: t('presets.logicPrompt') },
    { id: 'summary', label: t('presets.summaryLabel'), prompt: t('presets.summaryPrompt') },
  ];

  const loadPresets = async () => {
    const data = await DbService.getUserPresets();
    setUserPresets(data);
  };

  useEffect(() => {
    loadPresets();
  }, []);

  const handleSaveCurrent = async () => {
    if (!currentPrompt.trim()) return;
    const label = window.prompt(t('presets.namePromptTitle') || 'Name this preset:');
    if (!label || !label.trim()) return;
    await DbService.savePreset(label.trim(), currentPrompt);
    await loadPresets();
  };

  const handleDelete = async (e: React.MouseEvent, id?: number) => {
    e.stopPropagation();
    if (!id) return;
    await DbService.deletePreset(id);
    setUserPresets((prev) => prev.filter((p) => p.id !== id));
  };

  return (
    <div className="flex flex-wrap items-center gap-2 my-2">
      <span className="text-xs text-slate-500 dark:text-slate-400 font-medium">
        {t('presets.quickPrompts')}
      </span>

      {BUILT_IN_PRESETS.map((preset) => (
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

      {userPresets.length > 0 && (
        <span className="w-px h-4 bg-slate-300 dark:bg-slate-700 mx-1" />
      )}

      {/* User presets: the pill is a container, not a button — a button inside
          a button is invalid and left the delete action keyboard-unreachable. */}
      {userPresets.map((preset) => (
        <span
          key={preset.id}
          className="group inline-flex items-center gap-1 ps-2.5 pe-1 py-1 text-xs font-medium rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 transition-all"
        >
          <button
            type="button"
            disabled={disabled}
            onClick={() => onSelect(preset.prompt)}
            title={preset.prompt}
            className="inline-flex items-center gap-1.5 disabled:opacity-50"
          >
            <Bookmark className="w-3 h-3" />
            <span>{preset.label}</span>
          </button>
          <button
            type="button"
            onClick={(e) => handleDelete(e, preset.id)}
            title={t('presets.deletePreset', 'Delete preset')}
            aria-label={t('presets.deletePreset', 'Delete preset')}
            className="rounded-full p-0.5 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-rose-500 transition-opacity"
          >
            <X className="w-3 h-3" />
          </button>
        </span>
      ))}

      <button
        type="button"
        disabled={disabled || !currentPrompt.trim()}
        onClick={handleSaveCurrent}
        title={t('presets.saveCurrentTitle') || 'Save current prompt as preset'}
        className="flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-full border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition-all disabled:opacity-40"
      >
        <Plus className="w-3 h-3" />
        <span>{t('presets.saveCurrent') || 'Save current'}</span>
      </button>
    </div>
  );
};
// src/components/ModelColumn.tsx
import React from 'react';
import { Cpu, Zap, Clock, X } from 'lucide-react';
import { OllamaModel, BenchmarkMetrics } from '../types/ollama';
import { MarkdownRenderer } from './MarkdownRenderer';
import { useTranslation } from 'react-i18next';

const COLUMN_COLORS = [
  'text-indigo-500',
  'text-cyan-500',
  'text-emerald-500',
  'text-amber-500',
  'text-rose-500',
  'text-violet-500',
];

interface ModelColumnProps {
  index: number;
  models: OllamaModel[];
  selectedModel: string;
  output: string;
  metrics: BenchmarkMetrics | null;
  onModelChange: (name: string) => void;
  onRemove?: () => void;
  canRemove: boolean;
}

export const ModelColumn: React.FC<ModelColumnProps> = ({
  index,
  models,
  selectedModel,
  output,
  metrics,
  onModelChange,
  onRemove,
  canRemove,
}) => {
  const { t } = useTranslation();
  const color = COLUMN_COLORS[index % COLUMN_COLORS.length];

  return (
    <div className="flex flex-col bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm min-w-0">
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          <Cpu className={`w-4 h-4 ${color} shrink-0`} />
          <select
            value={selectedModel}
            onChange={(e) => onModelChange(e.target.value)}
            className="bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none w-full min-w-0"
          >
            {models.map((m) => (
              <option key={m.name} value={m.name}>
                {m.name}
              </option>
            ))}
          </select>
        </div>
        {canRemove && onRemove && (
          <button
            onClick={onRemove}
            title="Remove this model"
            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {metrics && (
        <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono">
          <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
            <Zap className="w-3 h-3" />
            <span>{metrics.tps} {t('metrics.tps')}</span>
          </div>
          <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
            <Clock className="w-3 h-3" />
            <span>{t('metrics.ttft')}: {metrics.ttftMs}ms</span>
          </div>
          <div className="text-slate-500 dark:text-slate-400 text-end">
            {(metrics.totalDurationMs / 1000).toFixed(2)}s
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto p-4">
        {output ? (
          <MarkdownRenderer content={output} />
        ) : (
          <div className="text-slate-500 text-sm italic">{t('app.waitingOutput')}</div>
        )}
      </div>
    </div>
  );
};

// src/components/ModelColumn.tsx
import React from 'react';
import { Cpu, Zap, Clock, Cloud, X, RotateCcw, ThumbsUp, Crown, Copy, Check } from 'lucide-react';
import { OllamaModel, BenchmarkMetrics } from '../types/ollama';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ModelSource, CloudGroup } from '../services/modelTarget';
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
  source: ModelSource;
  selectedModel: string;
  cloudGroups: CloudGroup[];
  output: string;
  metrics: BenchmarkMetrics | null;
  error: string | null;
  canRemove: boolean;
  isWinner: boolean;
  onSourceChange: (source: ModelSource, name: string) => void;
  onRemove?: () => void;
  onRetry?: () => void;
  onVote?: () => void;
}

const encodeValue = (source: ModelSource, model: string): string =>
  JSON.stringify({ kind: source.kind, providerId: source.kind === 'cloud' ? source.providerId : undefined, model });

const decodeValue = (value: string): { source: ModelSource; model: string } => {
  try {
    const parsed = JSON.parse(value) as { kind?: string; providerId?: string; model?: string };
    if (parsed && typeof parsed.model === 'string') {
      if (parsed.kind === 'cloud' && parsed.providerId) {
        return { source: { kind: 'cloud', providerId: parsed.providerId }, model: parsed.model };
      }
      return { source: { kind: 'local' }, model: parsed.model };
    }
  } catch {
    // legacy plain model name
  }
  return { source: { kind: 'local' }, model: value };
};

function formatTps(metrics: BenchmarkMetrics): string {
  const value = metrics.tpsEstimated ? `~${metrics.tps}` : `${metrics.tps}`;
  return value;
}

export const ModelColumn: React.FC<ModelColumnProps> = ({
  index,
  models,
  source,
  selectedModel,
  cloudGroups,
  output,
  metrics,
  error,
  onSourceChange,
  onRemove,
  canRemove,
  isWinner,
  onRetry,
  onVote,
}) => {
  const { t } = useTranslation();
  const color = COLUMN_COLORS[index % COLUMN_COLORS.length];
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className={`flex flex-col bg-white dark:bg-slate-900/60 border rounded-xl overflow-hidden shadow-sm min-w-0 transition-colors ${
        isWinner
          ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/40'
          : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 flex-1 min-w-0">
          {isWinner ? (
            <Crown className="w-4 h-4 text-amber-500 shrink-0" />
          ) : (
            <Cpu className={`w-4 h-4 ${color} shrink-0`} />
          )}
          {source.kind === 'cloud' && (
            <span
              className="shrink-0 inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-1 rounded-md bg-cyan-500/10 text-cyan-600 dark:text-cyan-300 border border-cyan-500/30"
              title={cloudGroups.find((g) => g.providerId === source.providerId)?.name}
            >
              <Cloud className="w-3 h-3" />
              {cloudGroups.find((g) => g.providerId === source.providerId)?.name.split(' ')[0] ?? '☁'}
            </span>
          )}
          <select
            value={encodeValue(source, selectedModel)}
            onChange={(e) => {
              const next = decodeValue(e.target.value);
              onSourceChange(next.source, next.model);
            }}
            className="bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none w-full min-w-0"
          >
            <optgroup label={t('bench.localModels', 'Local models')}>
              {models.map((m) => (
                <option key={`local:${m.name}`} value={encodeValue({ kind: 'local' }, m.name)}>
                  {m.name}
                </option>
              ))}
            </optgroup>
            {cloudGroups.map((g) => (
              <optgroup key={g.providerId} label={`☁ ${g.name}`}>
                {g.models.map((m) => (
                  <option
                    key={`cloud:${g.providerId}:${m}`}
                    value={encodeValue({ kind: 'cloud', providerId: g.providerId }, m)}
                  >
                    {m}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {output && !error && (
            <button
              onClick={handleCopy}
              title={copied ? t('app.copyOutputDone') : t('app.copyOutput')}
              className="p-1 rounded text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition shrink-0"
            >
              {copied ? (
                <Check className="w-4 h-4 text-emerald-500" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
            </button>
          )}
          {output && !error && onVote && (
            <button
              onClick={onVote}
              title={t('vote.voteTitle')}
              className={`p-1 rounded transition ${
                isWinner
                  ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
                  : 'text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
              }`}
            >
              <ThumbsUp className={`w-4 h-4 ${isWinner ? 'fill-current' : ''}`} />
            </button>
          )}
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
      </div>

      {isWinner && (
        <div className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/50 text-[11px] font-semibold text-amber-600 dark:text-amber-300 flex items-center gap-1">
          <Crown className="w-3 h-3" />
          <span>{t('vote.winner')}</span>
        </div>
      )}

      {metrics && (
        <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono">
          <div
            className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400"
            title={metrics.tpsEstimated ? t('metrics.estimatedTooltip') : undefined}
          >
            <Zap className="w-3 h-3" />
            <span>
              {formatTps(metrics)} {t('metrics.tps')}
            </span>
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
        {error ? (
          <div className="rounded-lg bg-rose-500/10 border border-rose-500/30 p-3 text-xs">
            <p className="text-rose-600 dark:text-rose-400 font-medium mb-2" dir="auto">
              {error}
            </p>
            {onRetry && (
              <button
                onClick={onRetry}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-md bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('app.retry')}</span>
              </button>
            )}
          </div>
        ) : output ? (
          <MarkdownRenderer content={output} />
        ) : (
          <div className="text-slate-500 text-sm italic">{t('app.waitingOutput')}</div>
        )}
      </div>
    </div>
  );
};

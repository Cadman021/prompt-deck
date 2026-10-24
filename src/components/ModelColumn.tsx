// src/components/ModelColumn.tsx
import React from 'react';
import {
  Cpu,
  Zap,
  Clock,
  Cloud,
  EyeOff,
  X,
  RotateCcw,
  ThumbsUp,
  Crown,
  Copy,
  SlidersHorizontal,
} from 'lucide-react';
import { OllamaModel, BenchmarkMetrics, GenerationOverrides, hasOverrides } from '../types/ollama';
import { MarkdownRenderer } from './MarkdownRenderer';
import { ModelSource, CloudGroup, qualifiedName } from '../services/modelTarget';
import { modelColorHex } from '../utils/modelColor';
import { useTranslation } from 'react-i18next';
import { formatDurationMs } from '../utils/timeUtils';
import { toast } from '../store/useToastStore';

interface ModelColumnProps {
  models: OllamaModel[];
  source: ModelSource;
  selectedModel: string;
  cloudGroups: CloudGroup[];
  output: string;
  reasoning?: string;
  metrics: BenchmarkMetrics | null;
  error: string | null;
  /** True while this column's stream is in flight. */
  loading?: boolean;
  /** Epoch ms when the stream started — drives the cold-start phase timer. */
  streamStartedAt?: number | null;
  /** Epoch ms when the first token arrived; null until then. */
  firstTokenAt?: number | null;
  canRemove: boolean;
  isWinner: boolean;
  /** Pre-formatted run cost (e.g. "$0.00234"), shown only for priced cloud runs. */
  costLabel?: string | null;
  /** Blind voting: show this label instead of any model identity. */
  blindLabel?: string | null;
  /** Per-model overrides; omitted fields inherit `defaults`. */
  params?: GenerationOverrides;
  /** Global Advanced values, shown when a field is not overridden. */
  defaults?: { temperature: number; top_p: number; maxTokens: number | null };
  onParamsChange?: (params: GenerationOverrides) => void;
  onSourceChange: (source: ModelSource, name: string) => void;
  onRemove?: () => void;
  onRetry?: () => void;
  onVote?: () => void;
}

const encodeValue = (source: ModelSource, model: string): string =>
  JSON.stringify({
    kind: source.kind,
    providerId: source.kind === 'cloud' ? source.providerId : undefined,
    model,
  });

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
  models,
  source,
  selectedModel,
  cloudGroups,
  output,
  reasoning,
  metrics,
  error,
  loading,
  streamStartedAt,
  firstTokenAt,
  onSourceChange,
  onRemove,
  canRemove,
  isWinner,
  costLabel,
  blindLabel,
  params,
  defaults,
  onParamsChange,
  onRetry,
  onVote,
}) => {
  const { t } = useTranslation();
  // Color follows the model, not the column position, so a shuffle can't
  // repaint the comparison and a model keeps its color across every view.
  // In blind mode it is derived from the anonymous label instead: a stable
  // per-model color is a fingerprint, and would identify the model that
  // blind mode is explicitly hiding.
  const colorIdentity = blindLabel ?? qualifiedName(source, selectedModel);
  const color = modelColorHex(colorIdentity);
  const [paramsOpen, setParamsOpen] = React.useState(false);
  const overridden = hasOverrides(params);

  const setParam = <K extends keyof GenerationOverrides>(
    key: K,
    value: GenerationOverrides[K]
  ): void => {
    const next: GenerationOverrides = { ...(params ?? {}) };
    if (value === undefined) delete next[key];
    else next[key] = value;
    onParamsChange?.(next);
  };

  // Live phase clock: only ticks while streaming, so idle columns cost nothing.
  const [tick, setTick] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!loading) return;
    const id = window.setInterval(() => setTick(Date.now()), 400);
    return () => window.clearInterval(id);
  }, [loading]);

  const generating = !!loading && firstTokenAt != null;
  const waitMs = loading && streamStartedAt ? Math.max(0, tick - streamStartedAt) : 0;
  const genMs = generating && firstTokenAt ? Math.max(0, tick - firstTokenAt) : 0;
  // Streamed text has no token count; ~4 chars/token is a good live estimate
  // (the exact number still comes from the server once the run finishes).
  const liveTps = generating && genMs > 400 ? Math.round(output.length / 4 / (genMs / 1000)) : 0;

  /**
   * A stream "stutters" when its 95th-percentile gap is more than 2x the median:
   * the average speed can look fine while every so often the model pauses.
   * Needs enough samples for p95 to mean anything, hence the median floor.
   */
  const stutters =
    metrics?.itlMs != null &&
    metrics.itlP95Ms != null &&
    metrics.itlMs > 0 &&
    metrics.itlP95Ms > metrics.itlMs * 2;

  const handleCopy = async () => {
    if (!output) return;
    await navigator.clipboard.writeText(output);
    toast(t('app.copyOutputDone'), 'success');
  };

  return (
    <div
      className={`flex flex-col bg-white dark:bg-slate-900/60 border rounded-xl overflow-hidden shadow-sm min-w-0 transition-colors ${
        loading
          ? 'border-indigo-300 dark:border-indigo-500/60 ring-1 ring-indigo-300/40 dark:ring-indigo-500/20'
          : isWinner
            ? 'border-amber-400 dark:border-amber-500 ring-1 ring-amber-400/40'
            : 'border-slate-200 dark:border-slate-800'
      }`}
    >
      {/* Model-colored rule: identifies the column at a glance even when the
          header is scrolled away, and matches the chart / scoreboard bars. */}
      <div className="h-0.5 shrink-0" style={{ backgroundColor: color }} aria-hidden="true" />
      <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900 space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            {isWinner ? (
              <Crown className="w-4 h-4 text-amber-500 shrink-0" />
            ) : (
              <Cpu className="w-4 h-4 shrink-0" style={{ color }} />
            )}
            {blindLabel ? (
              <span
                className="shrink-0 inline-flex items-center gap-1 text-nano font-bold px-1.5 py-1 rounded-md bg-slate-500/10 text-slate-500 dark:text-slate-400 border border-slate-500/30"
                title={t('bench.blindTitle', 'Blind mode: identities hidden for unbiased voting')}
              >
                <EyeOff className="w-3 h-3" />
                {blindLabel}
              </span>
            ) : (
              source.kind === 'cloud' && (
                <span
                  className="shrink-0 inline-flex items-center gap-1 text-nano font-bold px-1.5 py-1 rounded-md bg-cyan-500/10 text-cyan-700 dark:text-cyan-300 border border-cyan-500/30"
                  title={cloudGroups.find((g) => g.providerId === source.providerId)?.name}
                >
                  <Cloud className="w-3 h-3" />
                  {cloudGroups
                    .find((g) => g.providerId === source.providerId)
                    ?.name.split(' ')[0] ?? '☁'}
                </span>
              )
            )}
          </div>
          <div className="flex items-center gap-1 shrink-0">
            {onParamsChange && (
              <button
                onClick={() => setParamsOpen((v) => !v)}
                aria-pressed={paramsOpen}
                title={t('bench.paramsTitle', 'Per-model parameters (unset fields use global)')}
                aria-label={t(
                  'bench.paramsTitle',
                  'Per-model parameters (unset fields use global)'
                )}
                className={`relative p-1 rounded transition shrink-0 ${
                  paramsOpen || overridden
                    ? 'text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40'
                    : 'text-slate-500 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40'
                }`}
              >
                <SlidersHorizontal className="w-4 h-4" />
                {overridden && (
                  <span className="absolute -top-0.5 -end-0.5 w-1.5 h-1.5 rounded-full bg-indigo-500" />
                )}
              </button>
            )}
            {output && !error && (
              <button
                onClick={handleCopy}
                title={t('app.copyOutput')}
                aria-label={t('app.copyOutput')}
                className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            )}
            {output && !error && onVote && (
              <button
                onClick={onVote}
                title={t('vote.voteTitle')}
                aria-pressed={isWinner}
                aria-label={t('vote.voteTitle')}
                className={`p-1 rounded transition ${
                  isWinner
                    ? 'text-amber-500 bg-amber-50 dark:bg-amber-950/50'
                    : 'text-slate-500 dark:text-slate-400 hover:text-amber-500 hover:bg-amber-50 dark:hover:bg-amber-950/40'
                }`}
              >
                <ThumbsUp className={`w-4 h-4 ${isWinner ? 'fill-current' : ''}`} />
              </button>
            )}
            {canRemove && onRemove && (
              <button
                onClick={onRemove}
                title={t('bench.removeModel', 'Remove this model')}
                aria-label={t('bench.removeModel', 'Remove this model')}
                className="p-1 rounded text-slate-500 dark:text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {!blindLabel && (
          <select
            dir="ltr"
            value={encodeValue(source, selectedModel)}
            onChange={(e) => {
              const next = decodeValue(e.target.value);
              onSourceChange(next.source, next.model);
            }}
            aria-label={t('bench.selectModel', 'Model')}
            title={selectedModel}
            className="w-full min-w-0 bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 text-left"
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
        )}
      </div>

      {paramsOpen && onParamsChange && (
        <div className="px-3 py-2 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/40 text-micro space-y-1.5">
          <div className="flex items-center justify-between">
            <span className="font-semibold text-slate-600 dark:text-slate-300">
              {t('bench.params', 'Parameters')}
            </span>
            <button
              onClick={() => onParamsChange({})}
              disabled={!overridden}
              className="text-nano text-indigo-500 hover:underline disabled:opacity-40 disabled:no-underline"
            >
              {t('bench.paramsReset', 'Use global')}
            </button>
          </div>

          <label className="flex items-center gap-2">
            <span
              className={`w-14 shrink-0 ${
                params?.temperature !== undefined
                  ? 'text-indigo-500 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t('advanced.temperature')}
            </span>
            <input
              type="range"
              min="0"
              max="1.5"
              step="0.05"
              value={params?.temperature ?? defaults?.temperature ?? 0.7}
              onChange={(e) => setParam('temperature', parseFloat(e.target.value))}
              className="flex-1 min-w-0 accent-indigo-500 cursor-pointer"
            />
            <span className="w-9 text-end font-mono tabular-nums text-indigo-500">
              {(params?.temperature ?? defaults?.temperature ?? 0.7).toFixed(2)}
            </span>
          </label>

          <label className="flex items-center gap-2">
            <span
              className={`w-14 shrink-0 ${
                params?.top_p !== undefined
                  ? 'text-indigo-500 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t('advanced.topP')}
            </span>
            <input
              type="range"
              min="0.1"
              max="1"
              step="0.05"
              value={params?.top_p ?? defaults?.top_p ?? 0.9}
              onChange={(e) => setParam('top_p', parseFloat(e.target.value))}
              className="flex-1 min-w-0 accent-indigo-500 cursor-pointer"
            />
            <span className="w-9 text-end font-mono tabular-nums text-indigo-500">
              {(params?.top_p ?? defaults?.top_p ?? 0.9).toFixed(2)}
            </span>
          </label>

          <label className="flex items-center gap-2">
            <span
              className={`w-14 shrink-0 ${
                params?.maxTokens !== undefined && params.maxTokens !== null
                  ? 'text-indigo-500 font-semibold'
                  : 'text-slate-500 dark:text-slate-400'
              }`}
            >
              {t('advanced.maxTokens')}
            </span>
            <input
              type="number"
              min="1"
              value={params?.maxTokens ?? ''}
              placeholder={String(defaults?.maxTokens ?? t('bench.inherit', 'global'))}
              onChange={(e) =>
                setParam(
                  'maxTokens',
                  e.target.value === ''
                    ? undefined
                    : Math.max(1, Math.floor(Number(e.target.value) || 0))
                )
              }
              className="flex-1 min-w-0 p-1 rounded bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </label>
        </div>
      )}

      {isWinner && (
        <div className="px-3 py-1 bg-amber-50 dark:bg-amber-950/40 border-b border-amber-200 dark:border-amber-800/50 text-micro font-semibold text-amber-700 dark:text-amber-300 flex items-center gap-1">
          <Crown className="w-3 h-3" />
          <span>{t('vote.winner')}</span>
        </div>
      )}

      {metrics && (
        <div
          className={`grid ${costLabel ? 'grid-cols-4' : 'grid-cols-3'} gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-micro font-mono tabular-nums`}
        >
          <div
            className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400"
            title={
              [
                metrics.tpsEstimated ? t('metrics.estimatedTooltip') : '',
                metrics.repeatCount != null && metrics.repeatCount > 1
                  ? t('metrics.medianOf', 'median of {{n}} runs', { n: metrics.repeatCount }) +
                    (metrics.tpsMean != null
                      ? ` (mean ${metrics.tpsMean.toFixed(1)}, ±${(metrics.tpsStd ?? 0).toFixed(1)})`
                      : '')
                  : '',
              ]
                .filter(Boolean)
                .join('\n') || undefined
            }
          >
            <Zap className="w-3 h-3" />
            <span>
              {formatTps(metrics)} {t('metrics.tps')}
              {metrics.repeatCount != null && metrics.repeatCount > 1 && (
                <span className="opacity-70"> ×{metrics.repeatCount}</span>
              )}
            </span>
          </div>
          <div
            className="flex items-center gap-1 text-cyan-700 dark:text-cyan-400"
            title={
              [
                metrics.loadDurationMs != null
                  ? t('metrics.loadShare', 'incl. {{ms}}ms model load', {
                      ms: metrics.loadDurationMs,
                    })
                  : '',
                metrics.promptTps != null
                  ? t('metrics.promptSpeed', 'prompt {{v}} tok/s', { v: metrics.promptTps })
                  : '',
                // ITL belongs next to TTFT: both describe "how waiting feels"
                // rather than throughput. The tooltip carries the full picture
                // so the metrics row stays three tiles wide.
                metrics.itlMs != null
                  ? t(
                      'metrics.itlTooltip',
                      'Inter-token latency: {{median}}ms median, {{p95}}ms p95',
                      {
                        median: metrics.itlMs,
                        p95: metrics.itlP95Ms ?? metrics.itlMs,
                      }
                    ) + (metrics.itlEstimated ? ` (${t('metrics.estimatedShort')})` : '')
                  : '',
              ]
                .filter(Boolean)
                .join('\n') || undefined
            }
          >
            <Clock className="w-3 h-3" />
            <span>
              {t('metrics.ttft')}: {formatDurationMs(metrics.ttftMs)}
              {/* A p95 far above the median means the stream stutters even if
                  the average looks fine. Show it, don't just tooltip it. */}
              {stutters && (
                <span
                  className="ms-1 text-amber-700 dark:text-amber-300"
                  aria-hidden="true"
                  title={t('metrics.stutterTitle', 'Uneven token pacing (high p95 vs median)')}
                >
                  ⚡
                </span>
              )}
            </span>
          </div>
          <div className="text-slate-500 dark:text-slate-400 text-end tabular-nums">
            {formatDurationMs(metrics.totalDurationMs)}
          </div>
          {costLabel && (
            <div
              className="text-amber-700 dark:text-amber-300 text-end"
              title={t('metrics.costTitle', 'Estimated run cost')}
            >
              {costLabel}
            </div>
          )}
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
        ) : output || reasoning || loading ? (
          <>
            {loading && (
              <div className="mb-2 flex items-center gap-2 text-micro font-mono text-slate-500 dark:text-slate-400">
                <span className="relative flex h-2 w-2 shrink-0">
                  <span className="animate-ping motion-reduce:animate-none absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75" />
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-indigo-500" />
                </span>
                {generating ? (
                  <>
                    <span className="text-indigo-600 dark:text-indigo-300">
                      {t('bench.phaseGenerating', 'Generating')}
                    </span>
                    {liveTps > 0 && <span className="tabular-nums">~{liveTps} tok/s</span>}
                    <span className="tabular-nums opacity-70">{formatDurationMs(genMs)}</span>
                  </>
                ) : (
                  <>
                    <span>{t('bench.phasePreparing', 'Preparing model…')}</span>
                    <span className="tabular-nums opacity-70">{formatDurationMs(waitMs)}</span>
                  </>
                )}
              </div>
            )}
            {reasoning && (
              <details
                className="mb-3 rounded-lg bg-violet-500/5 dark:bg-violet-400/5 border border-violet-500/20 px-3 py-2"
                open={!output}
              >
                <summary className="text-micro font-semibold text-violet-600 dark:text-violet-300 cursor-pointer select-none">
                  {t('app.thinking', 'Thinking')}
                </summary>
                <div
                  className="mt-1.5 text-xs opacity-80 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono"
                  dir="auto"
                >
                  {reasoning}
                </div>
              </details>
            )}
            {output ? (
              <>
                <MarkdownRenderer content={output} streaming={loading} />
                {loading && (
                  <span className="inline-block w-2 h-4 -mb-0.5 align-text-bottom bg-indigo-500 animate-pulse motion-reduce:animate-none" />
                )}
              </>
            ) : (
              !loading && (
                <div className="text-slate-500 text-sm italic">{t('app.waitingOutput')}</div>
              )
            )}
          </>
        ) : (
          <div className="text-slate-500 text-sm italic">{t('app.waitingOutput')}</div>
        )}
      </div>
    </div>
  );
};

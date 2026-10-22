// src/components/ContextSweep.tsx
// Measures how generation speed holds up as the prompt grows: the same model
// answers the same prompt with increasing amounts of filler context, at
// context windows of 2Kâ€¦64K. Results show TTFT, tok/s and the drop versus the
// smallest window, which is what exposes a model/driver regression.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity, Square, X } from 'lucide-react';
import type { OllamaModel, PromptOptions } from '../types/ollama';
import { useSettingsStore } from '../store/useSettingsStore';
import { resolveRunEndpoint, runTargetStream } from '../services/runTarget';
import type { CloudGroup, ModelSource } from '../services/modelTarget';
import { buildSweepPrompt, labelForContext } from '../utils/sweep';
import { formatDurationMs } from '../utils/timeUtils';

const SIZES = [2048, 4096, 8192, 16384, 32768, 65536] as const;
const DEFAULT_SIZES = [4096, 8192, 16384, 32768];
/** Small, fixed output so the measurement is generation speed, not length. */
const SWEEP_MAX_TOKENS = 256;
/** Fill this fraction of the window with context, leaving room for the answer. */
const FILL_RATIO = 0.9;

interface SweepPoint {
  ctx: number;
  label: string;
  tps: number;
  ttftMs: number;
  promptTokens: number | null;
  error?: string;
}

/** Encodes a select value as `local:<model>` or `cloud:<providerId>:<model>`. */
const encode = (source: ModelSource, model: string): string =>
  source.kind === 'cloud' ? `cloud:${source.providerId}:${model}` : `local:${model}`;

const decode = (value: string): { source: ModelSource; model: string } => {
  if (value.startsWith('cloud:')) {
    const rest = value.slice('cloud:'.length);
    const cut = rest.indexOf(':');
    return {
      source: { kind: 'cloud', providerId: rest.slice(0, cut) },
      model: rest.slice(cut + 1),
    };
  }
  return { source: { kind: 'local' }, model: value.replace(/^local:/, '') };
};

interface ContextSweepProps {
  isOpen: boolean;
  onClose: () => void;
  prompt: string;
  models: OllamaModel[];
  cloudGroups: CloudGroup[];
}

export const ContextSweep: React.FC<ContextSweepProps> = ({
  isOpen,
  onClose,
  prompt,
  models,
  cloudGroups,
}) => {
  const { t } = useTranslation();
  const [modelValue, setModelValue] = useState('');
  const [sizes, setSizes] = useState<number[]>(DEFAULT_SIZES);
  const [results, setResults] = useState<SweepPoint[]>([]);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number; size: number } | null>(
    null
  );
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Default to the first available model whenever the panel opens.
  useEffect(() => {
    if (!isOpen || modelValue) return;
    const firstLocal = models[0]?.name;
    const firstCloud = cloudGroups[0];
    if (firstLocal) setModelValue(encode({ kind: 'local' }, firstLocal));
    else if (firstCloud?.models[0]) {
      setModelValue(
        encode({ kind: 'cloud', providerId: firstCloud.providerId }, firstCloud.models[0])
      );
    }
  }, [isOpen, modelValue, models, cloudGroups]);

  // Escape closes; aborting an in-flight sweep on unmount.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  useEffect(() => () => abortRef.current?.abort(), []);

  const stop = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setRunning(false);
    setProgress(null);
  };

  const toggleSize = (size: number) => {
    setSizes((prev) =>
      prev.includes(size) ? prev.filter((s) => s !== size) : [...prev, size].sort((a, b) => a - b)
    );
  };

  const orderedSizes = useMemo(() => [...sizes].sort((a, b) => a - b), [sizes]);
  const canRun = orderedSizes.length > 0 && modelValue !== '' && prompt.trim() !== '' && !running;

  const runSweep = async () => {
    if (!canRun) return;
    const settings = useSettingsStore.getState();
    const { source, model } = decode(modelValue);
    const resolved = resolveRunEndpoint(source, model, {
      provider: settings.provider,
      baseUrl: settings.baseUrl,
    });
    if ('error' in resolved) {
      setError(t('bench.noCloudKey', 'No enabled API key for this cloud provider.'));
      return;
    }

    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(true);
    setError(null);
    setResults([]);

    const points: SweepPoint[] = [];
    for (const [index, ctx] of orderedSizes.entries()) {
      if (controller.signal.aborted) break;
      setProgress({ done: index, total: orderedSizes.length, size: ctx });

      const options: PromptOptions = {
        model: resolved.run.model,
        prompt: buildSweepPrompt(prompt, Math.floor(ctx * FILL_RATIO)),
        system: settings.advancedConfig.system,
        temperature: settings.advancedConfig.temperature,
        top_p: settings.advancedConfig.top_p,
        // Explicit num_ctx: the window under test must not inherit the global one.
        num_ctx: ctx,
        serverDefaults: false,
        seed: settings.advancedConfig.seed,
        maxTokens: SWEEP_MAX_TOKENS,
      };

      const point = await new Promise<SweepPoint>((resolve) => {
        runTargetStream(resolved.run.config, options, controller.signal, {
          onDone: (_output, metrics, err, aborted) => {
            resolve({
              ctx,
              label: labelForContext(ctx),
              tps: metrics?.tps ?? 0,
              ttftMs: metrics?.ttftMs ?? 0,
              promptTokens: metrics?.promptTokens ?? null,
              error: aborted ? 'aborted' : (err ?? undefined),
            });
          },
        });
      });

      if (controller.signal.aborted) break;

      points.push(point);
      setResults([...points]);
    }

    setRunning(false);
    setProgress(null);
    abortRef.current = null;
  };

  if (!isOpen) return null;

  const okPoints = results.filter((r) => !r.error && r.tps > 0);
  const baseline = okPoints[0]?.tps ?? 0;
  const hasModel = models.length > 0 || cloudGroups.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/50 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sweep-title"
        className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 shadow-2xl"
      >
        <div className="flex items-start justify-between gap-3 p-4 border-b border-slate-200 dark:border-slate-800">
          <div>
            <h2
              id="sweep-title"
              className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100"
            >
              <Activity className="w-4 h-4 text-indigo-500" />
              {t('sweep.title', 'Context sweep')}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              {t(
                'sweep.subtitle',
                'Same model, same prompt, growing context: see where generation speed drops.'
              )}
            </p>
          </div>
          <button
            onClick={onClose}
            title={t('sweep.close', 'Close')}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          {!hasModel ? (
            <p className="text-xs text-slate-500">{t('sweep.noModels', 'No models available.')}</p>
          ) : (
            <>
              <div className="grid sm:grid-cols-2 gap-3">
                <label className="space-y-1">
                  <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {t('sweep.model', 'Model')}
                  </span>
                  <select
                    value={modelValue}
                    onChange={(e) => setModelValue(e.target.value)}
                    disabled={running}
                    className="w-full text-xs p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-300 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  >
                    <optgroup label={t('bench.localModels', 'Local models')}>
                      {models.map((m) => (
                        <option key={`local:${m.name}`} value={encode({ kind: 'local' }, m.name)}>
                          {m.name}
                        </option>
                      ))}
                    </optgroup>
                    {cloudGroups.map((g) => (
                      <optgroup key={g.providerId} label={`â˜ ${g.name}`}>
                        {g.models.map((m) => (
                          <option
                            key={`cloud:${g.providerId}:${m}`}
                            value={encode({ kind: 'cloud', providerId: g.providerId }, m)}
                          >
                            {m}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </label>

                <div className="space-y-1">
                  <span className="block text-[11px] font-semibold text-slate-600 dark:text-slate-300">
                    {t('sweep.sizes', 'Context sizes')}
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {SIZES.map((size) => {
                      const active = sizes.includes(size);
                      return (
                        <button
                          key={size}
                          onClick={() => toggleSize(size)}
                          disabled={running}
                          aria-pressed={active}
                          className={`px-2 py-1 text-[11px] font-mono rounded-lg border transition disabled:opacity-50 ${
                            active
                              ? 'bg-indigo-600 text-white border-indigo-600'
                              : 'bg-slate-50 dark:bg-slate-950 text-slate-500 dark:text-slate-400 border-slate-300 dark:border-slate-700 hover:border-indigo-400'
                          }`}
                        >
                          {labelForContext(size)}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              <p className="text-[10px] leading-relaxed text-slate-400 dark:text-slate-500">
                {t(
                  'sweep.hint',
                  'Each step sends ~90% of the window as neutral filler plus your prompt, with a 256-token answer cap. Changing the window can make a local server reload the model, so the first TTFT at each size includes load time.'
                )}
              </p>

              {error && <p className="text-xs text-rose-500">{error}</p>}

              <div className="flex items-center gap-2">
                {running ? (
                  <button
                    onClick={stop}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-medium transition"
                  >
                    <Square className="w-3 h-3 fill-current" />
                    {t('sweep.stop', 'Stop')}
                  </button>
                ) : (
                  <button
                    onClick={() => void runSweep()}
                    disabled={!canRun}
                    title={
                      !prompt.trim()
                        ? t('sweep.noPrompt', 'Type a prompt in the Bench first.')
                        : undefined
                    }
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition disabled:opacity-50"
                  >
                    <Activity className="w-3 h-3" />
                    {t('sweep.run', 'Run sweep')}
                  </button>
                )}
                {progress && (
                  <span className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                    {t('sweep.progress', '{{done}}/{{total}} Â· {{size}}', {
                      done: progress.done + 1,
                      total: progress.total,
                      size: labelForContext(progress.size),
                    })}
                  </span>
                )}
              </div>

              {results.length === 0 ? (
                <p className="text-xs text-slate-400 dark:text-slate-500 py-4 text-center">
                  {t('sweep.empty', 'Run a sweep to see how speed holds up at longer contexts.')}
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto rounded-lg border border-slate-200 dark:border-slate-800">
                    <table className="w-full text-[11px] font-mono tabular-nums">
                      <thead className="bg-slate-50 dark:bg-slate-950/60 text-slate-500 dark:text-slate-400">
                        <tr>
                          <th className="text-start px-2 py-1.5">
                            {t('sweep.context', 'Context')}
                          </th>
                          <th className="text-end px-2 py-1.5">{t('sweep.tps', 'tok/s')}</th>
                          <th className="text-end px-2 py-1.5">{t('sweep.ttft', 'TTFT')}</th>
                          <th className="text-end px-2 py-1.5">
                            {t('sweep.promptTokens', 'prompt tok')}
                          </th>
                          <th className="text-end px-2 py-1.5">{t('sweep.drop', 'vs smallest')}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {results.map((r) => {
                          const drop =
                            baseline > 0 && r.tps > 0
                              ? Math.round((1 - r.tps / baseline) * 100)
                              : null;
                          return (
                            <tr
                              key={r.ctx}
                              className="border-t border-slate-100 dark:border-slate-800"
                            >
                              <td className="px-2 py-1.5 text-slate-600 dark:text-slate-300">
                                {r.label}
                              </td>
                              <td className="px-2 py-1.5 text-end text-emerald-600 dark:text-emerald-400">
                                {r.error ? (
                                  <span className="text-rose-500">
                                    {t('sweep.failed', 'failed')}
                                  </span>
                                ) : (
                                  r.tps.toFixed(1)
                                )}
                              </td>
                              <td className="px-2 py-1.5 text-end text-cyan-600 dark:text-cyan-400">
                                {r.ttftMs > 0 ? formatDurationMs(r.ttftMs) : 'â€”'}
                              </td>
                              <td className="px-2 py-1.5 text-end text-slate-500 dark:text-slate-400">
                                {r.promptTokens ?? 'â€”'}
                              </td>
                              <td
                                className={`px-2 py-1.5 text-end ${
                                  drop != null && drop >= 20
                                    ? 'text-rose-500'
                                    : 'text-slate-500 dark:text-slate-400'
                                }`}
                              >
                                {drop == null ? 'â€”' : `${drop}%`}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {okPoints.length >= 2 && (
                    <div className="grid sm:grid-cols-2 gap-3">
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          {t('sweep.tps', 'tok/s')}
                        </div>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={okPoints}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} width={34} />
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                            <Line
                              type="monotone"
                              dataKey="tps"
                              stroke="#10b981"
                              strokeWidth={2}
                              dot
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                      <div className="rounded-lg border border-slate-200 dark:border-slate-800 p-2">
                        <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-1">
                          {t('sweep.ttft', 'TTFT')} (ms)
                        </div>
                        <ResponsiveContainer width="100%" height={140}>
                          <LineChart data={okPoints}>
                            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.15} />
                            <XAxis dataKey="label" tick={{ fontSize: 10 }} />
                            <YAxis tick={{ fontSize: 10 }} width={46} />
                            <Tooltip contentStyle={{ fontSize: 11 }} />
                            <Line
                              type="monotone"
                              dataKey="ttftMs"
                              stroke="#06b6d4"
                              strokeWidth={2}
                              dot
                            />
                          </LineChart>
                        </ResponsiveContainer>
                      </div>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

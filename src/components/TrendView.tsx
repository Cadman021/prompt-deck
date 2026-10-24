// src/components/TrendView.tsx
// "Compare over time": one model's speed across its history, with a verdict
// that says whether a change is real or just this machine's jitter.
//
// The chart is deliberately one series, not a leaderboard: the question here is
// "is *this* model slower than it used to be", and putting other models on the
// same axis invites comparing them instead, which the Leaderboard already does
// (and does with votes, not just speed).
import React, { useEffect, useMemo, useState } from 'react';
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
import { TrendingDown, TrendingUp, Minus, HelpCircle, Activity } from 'lucide-react';
import { DbService, type HistoryRecord } from '../services/dbService';
import { analyseTrend, groupByModel, type TrendPoint } from '../utils/trend';
import { modelColorHex } from '../utils/modelColor';
import { formatDurationMs, parseTimestamp } from '../utils/timeUtils';

/** How much history to pull. Deeper than the sidebar: trends need a baseline. */
const HISTORY_LIMIT = 300;

export const TrendView: React.FC = () => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<HistoryRecord[] | null>(null);
  const [model, setModel] = useState<string | null>(null);
  const [metric, setMetric] = useState<'tps' | 'ttft'>('tps');

  useEffect(() => {
    let cancelled = false;
    void DbService.getHistory(HISTORY_LIMIT).then((rows) => {
      if (!cancelled) setRecords(rows);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Per-model points, oldest first. Rows without metrics are dropped. */
  const byModel = useMemo(() => {
    const rows: { model: string; point: TrendPoint }[] = [];
    for (const record of records ?? []) {
      // Shared parser: it knows the bare SQLite format is UTC and leaves a
      // proper ISO string's own offset alone.
      const at = parseTimestamp(record.created_at ?? '');
      if (!Number.isFinite(at)) continue;
      for (const r of record.results) {
        if (!(r.tps > 0)) continue;
        rows.push({
          model: r.model,
          point: {
            at,
            tps: r.tps,
            ttftMs: r.ttft,
            itlMs: r.itlMs ?? null,
          },
        });
      }
    }
    const grouped = groupByModel(rows.map((r) => ({ model: r.model, ...r.point })));
    const out = new Map<string, TrendPoint[]>();
    for (const [name, list] of grouped) {
      out.set(
        name,
        list.map((p) => ({ at: p.at, tps: p.tps, ttftMs: p.ttftMs, itlMs: p.itlMs }))
      );
    }
    return out;
  }, [records]);

  const models = useMemo(() => [...byModel.keys()].sort((a, b) => a.localeCompare(b)), [byModel]);

  // Pick the model with the most history by default — it is the one whose
  // trend can actually be judged.
  useEffect(() => {
    if (model && byModel.has(model)) return;
    let best: string | null = null;
    let bestCount = 0;
    for (const [name, points] of byModel) {
      if (points.length > bestCount) {
        best = name;
        bestCount = points.length;
      }
    }
    setModel(best);
  }, [byModel, model]);

  // Memoised so the identity is stable: `[]` is a fresh array every render and
  // would make the trend + chart memos below recompute on unrelated renders.
  const points = useMemo(() => (model ? (byModel.get(model) ?? []) : []), [byModel, model]);
  const trend = useMemo(() => analyseTrend(points), [points]);

  const chartData = useMemo(
    () =>
      points.map((p) => ({
        at: p.at,
        label: new Date(p.at).toLocaleDateString(undefined, {
          month: 'short',
          day: 'numeric',
        }),
        tps: p.tps,
        ttft: p.ttftMs,
        itl: p.itlMs ?? null,
      })),
    [points]
  );

  if (records === null) {
    return (
      <div className="p-6 text-xs text-slate-500 dark:text-slate-400">
        {t('app.loading', 'Loading…')}
      </div>
    );
  }

  if (models.length === 0) {
    return (
      <div className="p-6 max-w-3xl mx-auto">
        <div className="rounded-xl border border-dashed border-slate-300 dark:border-slate-700 p-8 text-center">
          <Activity className="w-6 h-6 mx-auto mb-2 text-slate-400" />
          <p className="text-sm text-slate-600 dark:text-slate-300">
            {t(
              'trend.empty',
              'No timed runs yet. Benchmark a model a few times and its trend appears here.'
            )}
          </p>
        </div>
      </div>
    );
  }

  const color = model ? modelColorHex(model) : '#6366f1';
  const value = metric === 'tps' ? trend.recentTps : (points.at(-1)?.ttftMs ?? 0);

  const verdictStyle = {
    regression: 'text-rose-700 dark:text-rose-400 bg-rose-500/10 border-rose-500/30',
    improvement: 'text-emerald-700 dark:text-emerald-400 bg-emerald-500/10 border-emerald-500/30',
    stable: 'text-slate-600 dark:text-slate-300 bg-slate-500/10 border-slate-500/30',
    insufficient: 'text-slate-500 dark:text-slate-400 bg-slate-500/5 border-slate-500/20',
  }[trend.verdict];

  const VerdictIcon =
    trend.verdict === 'regression'
      ? TrendingDown
      : trend.verdict === 'improvement'
        ? TrendingUp
        : trend.verdict === 'stable'
          ? Minus
          : HelpCircle;

  const verdictLabel = {
    regression: t('trend.regression', 'Slower than its baseline by {{pct}}%', {
      pct: Math.abs(trend.changePct),
    }),
    improvement: t('trend.improvement', 'Faster than its baseline by {{pct}}%', {
      pct: trend.changePct,
    }),
    stable: t('trend.stable', 'Within its normal run-to-run spread (±{{pct}}%)', {
      pct: trend.noisePct,
    }),
    insufficient: t(
      'trend.insufficient',
      'Not enough history yet — run this model {{n}} more time(s) to judge a trend.',
      { n: Math.max(0, 3 - trend.baselineCount) }
    ),
  }[trend.verdict];

  return (
    <div className="p-4 max-w-5xl mx-auto space-y-3">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 grid place-items-center shadow-sm shrink-0">
            <TrendingUp className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold">{t('trend.title', 'Compare over time')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('trend.subtitle', 'Did this model get slower? Judged against its own noise.')}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={model ?? ''}
            onChange={(e) => setModel(e.target.value)}
            aria-label={t('trend.pickModel', 'Model')}
            className="bg-white dark:bg-slate-800 text-xs border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 max-w-[280px]"
          >
            {models.map((m) => (
              <option key={m} value={m}>
                {m} ({byModel.get(m)?.length ?? 0})
              </option>
            ))}
          </select>

          <div className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800">
            {(['tps', 'ttft'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMetric(m)}
                aria-pressed={metric === m}
                className={`px-2 py-1 text-micro font-mono rounded-md transition ${
                  metric === m
                    ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm font-bold'
                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                }`}
              >
                {m === 'tps' ? t('metrics.tps') : t('metrics.ttft')}
              </button>
            ))}
          </div>
        </div>
      </header>

      <div className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-xs ${verdictStyle}`}>
        <VerdictIcon className="w-4 h-4 shrink-0 mt-0.5" />
        <div>
          <div className="font-semibold">{verdictLabel}</div>
          {trend.verdict !== 'insufficient' && (
            <div className="mt-0.5 opacity-80 font-mono tabular-nums text-micro">
              {t(
                'trend.detail',
                'baseline {{base}} tok/s ({{n}} runs) → recent {{recent}} tok/s ({{m}} runs)',
                {
                  base: trend.baselineTps,
                  n: trend.baselineCount,
                  recent: trend.recentTps,
                  m: trend.recentCount,
                }
              )}
            </div>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900/60 p-3">
        <ResponsiveContainer width="100%" height={260}>
          <LineChart data={chartData} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
            <CartesianGrid
              strokeDasharray="3 3"
              className="stroke-slate-200 dark:stroke-slate-800"
            />
            <XAxis
              dataKey="label"
              tick={{ fontSize: 10, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              minTickGap={16}
            />
            <YAxis
              tick={{ fontSize: 11, fill: 'currentColor' }}
              className="text-slate-500 dark:text-slate-400"
              width={44}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1e293b',
                border: '1px solid #334155',
                borderRadius: '8px',
                fontSize: '12px',
                color: '#f1f5f9',
              }}
              formatter={(v) => {
                const n = typeof v === 'number' ? v : Number(v) || 0;
                return metric === 'tps'
                  ? [`${n} tok/s`, t('metrics.tps')]
                  : [formatDurationMs(n), t('metrics.ttft')];
              }}
            />
            <Line
              type="monotone"
              dataKey={metric}
              stroke={color}
              strokeWidth={2}
              dot={{ r: 3, fill: color }}
              activeDot={{ r: 5 }}
              isAnimationActive={false}
              connectNulls
            />
          </LineChart>
        </ResponsiveContainer>
        <p className="mt-1 text-micro text-slate-500 dark:text-slate-400 text-center font-mono tabular-nums">
          {t('trend.axisHint', '{{n}} runs, oldest to newest · latest {{v}}', {
            n: points.length,
            v: metric === 'tps' ? `${value} tok/s` : formatDurationMs(value),
          })}
        </p>
      </div>
    </div>
  );
};

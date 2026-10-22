// src/components/SpendView.tsx
// Cloud-spend dashboard: totals, last-30-days trend, per-provider and
// per-model breakdown of the cost frozen into each run.
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { RefreshCw, Wallet } from 'lucide-react';
import { DbService } from '../services/dbService';
import { CLOUD_CATALOG, type CustomProviderDef } from '../data/cloudProviders';
import { formatCost } from '../services/modelTarget';
import { useCloudStore } from '../store/useCloudStore';
import { summarizeSpend, type SpendSummary } from '../utils/spend';
import { ProviderIcon } from './cloud/ProviderIcon';

const money = (usd: number): string => (usd === 0 ? '$0.00' : formatCost(usd));

const compact = (n: number): string =>
  new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(n);

const todayIso = (): string => new Date().toISOString().slice(0, 10);

const StatCard: React.FC<{ label: string; value: string; hint?: string }> = ({
  label,
  value,
  hint,
}) => (
  <div className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
    <div className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{label}</div>
    <div className="mt-1 text-xl font-semibold tabular-nums">{value}</div>
    {hint && <div className="mt-0.5 text-[10px] text-slate-400">{hint}</div>}
  </div>
);

export const SpendView: React.FC = () => {
  const { t } = useTranslation();
  const customProviders = useCloudStore((s) => s.customProviders);
  const [summary, setSummary] = useState<SpendSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { byModel, byDay } = await DbService.getSpendStats();
    setSummary(summarizeSpend(byModel, byDay, todayIso()));
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const providerDefs = useMemo(() => {
    const map = new Map<string, CustomProviderDef | (typeof CLOUD_CATALOG)[number]>();
    for (const def of CLOUD_CATALOG) map.set(def.id, def);
    for (const def of customProviders) map.set(def.id, def);
    return map;
  }, [customProviders]);

  const providerName = useCallback(
    (id: string) =>
      providerDefs.get(id)?.name ?? (id === 'unknown' ? t('spend.unknown', 'Unknown') : id),
    [providerDefs, t]
  );

  const share = (cost: number): number =>
    summary && summary.totalCost > 0 ? (cost / summary.totalCost) * 100 : 0;

  return (
    <div className="p-4 md:p-6 max-w-5xl mx-auto space-y-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-lg font-semibold">
            <Wallet className="w-4 h-4 text-indigo-500" />
            {t('spend.title', 'Cloud spend')}
          </h2>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {t(
              'spend.subtitle',
              'What your cloud runs cost, frozen at run time — by provider, model and day.'
            )}
          </p>
        </div>
        <button
          onClick={() => void load()}
          disabled={loading}
          title={t('spend.refresh', 'Refresh')}
          className="flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] rounded-lg border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:text-indigo-500 hover:border-indigo-400 disabled:opacity-50 transition shrink-0"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          {t('spend.refresh', 'Refresh')}
        </button>
      </div>

      {!summary ? (
        <div className="py-16 text-center text-xs text-slate-400">
          {t('app.loading', 'Loading…')}
        </div>
      ) : summary.totalCost === 0 ? (
        <div className="py-16 text-center space-y-2">
          <Wallet className="w-8 h-8 mx-auto text-slate-300 dark:text-slate-700" />
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
            {t('spend.empty', 'No cloud spend recorded yet.')}
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {t(
              'spend.emptyHint',
              'Benchmark a cloud model to start tracking cost here. Only runs with exact server token counts and known pricing are counted.'
            )}
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <StatCard
              label={t('spend.total', 'Total spend')}
              value={money(summary.totalCost)}
              hint={t('spend.runsCount', '{{n}} cloud runs', { n: summary.totalRuns })}
            />
            <StatCard
              label={t('spend.tokens', 'Tokens')}
              value={compact(summary.totalPromptTokens + summary.totalCompletionTokens)}
              hint={`${compact(summary.totalPromptTokens)} ${t('spend.promptTokens', 'prompt')} · ${compact(summary.totalCompletionTokens)} ${t('spend.completionTokens', 'completion')}`}
            />
            <StatCard
              label={t('spend.avgRun', 'Average per run')}
              value={money(summary.totalRuns > 0 ? summary.totalCost / summary.totalRuns : 0)}
              hint={t('spend.modelsTracked', '{{n}} models', { n: summary.models.length })}
            />
          </div>

          <div className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
            <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">
              {t('spend.last30', 'Last 30 days')}
            </h3>
            <ResponsiveContainer width="100%" height={170}>
              <AreaChart data={summary.last30} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#6366f1" stopOpacity={0.35} />
                    <stop offset="100%" stopColor="#6366f1" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-slate-200 dark:stroke-slate-800"
                />
                <XAxis
                  dataKey="day"
                  tick={{ fontSize: 9, fill: 'currentColor' }}
                  className="text-slate-500 dark:text-slate-400"
                  tickFormatter={(d: string) => d.slice(5)}
                  interval={6}
                />
                <YAxis
                  tick={{ fontSize: 10, fill: 'currentColor' }}
                  className="text-slate-500 dark:text-slate-400"
                  width={46}
                  tickFormatter={(v: number) => money(v)}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    border: '1px solid #334155',
                    borderRadius: '8px',
                    fontSize: '12px',
                    color: '#f1f5f9',
                  }}
                  labelStyle={{ color: '#f1f5f9', fontWeight: 600, marginBottom: 4 }}
                  itemStyle={{ color: '#f1f5f9' }}
                  formatter={(value) => [money(Number(value)), t('spend.cost', 'Cost')]}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#6366f1"
                  strokeWidth={2}
                  fill="url(#spendFill)"
                  isAnimationActive={false}
                />
              </AreaChart>
            </ResponsiveContainer>
            {summary.monthly.length > 1 && (
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-slate-400">
                {summary.monthly.slice(-6).map((m) => (
                  <span key={m.month} className="tabular-nums">
                    {m.month} · {money(m.cost)}
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-3">
                {t('spend.byProvider', 'By provider')}
              </h3>
              <div className="space-y-3">
                {summary.providers.map((p) => {
                  const def = providerDefs.get(p.providerId);
                  return (
                    <div key={p.providerId}>
                      <div className="flex items-center gap-2">
                        {def ? (
                          <ProviderIcon def={def} />
                        ) : (
                          <span className="w-9 h-9 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            <Wallet className="w-4 h-4 text-slate-400" />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="text-xs font-medium truncate">
                              {providerName(p.providerId)}
                            </span>
                            <span className="font-mono text-xs tabular-nums">{money(p.cost)}</span>
                          </div>
                          <div className="mt-1 flex items-center gap-2">
                            <div className="h-1.5 flex-1 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className="h-full rounded-full bg-indigo-500"
                                style={{ width: `${Math.max(2, share(p.cost))}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-slate-400 tabular-nums">
                              {t('spend.runsCount', '{{n}} cloud runs', { n: p.runs })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 shadow-sm">
              <h3 className="text-xs font-semibold text-slate-600 dark:text-slate-400 mb-3">
                {t('spend.byModel', 'By model')}
              </h3>
              <div className="max-h-64 overflow-y-auto -me-1 pe-1">
                <table className="w-full text-xs">
                  <thead className="text-[10px] text-slate-400">
                    <tr>
                      <th className="text-start font-medium pb-1.5">{t('spend.model', 'Model')}</th>
                      <th className="text-end font-medium pb-1.5">{t('spend.cost', 'Cost')}</th>
                      <th className="text-end font-medium pb-1.5 w-14">
                        {t('spend.share', 'Share')}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.models.map((m) => (
                      <tr
                        key={`${m.providerId}:${m.model}`}
                        className="border-t border-slate-100 dark:border-slate-800/70"
                      >
                        <td className="py-1.5 pe-2">
                          <div className="font-medium truncate max-w-[13rem]" title={m.model}>
                            {m.model}
                          </div>
                          <div className="text-[10px] text-slate-400">
                            {providerName(m.providerId)} ·{' '}
                            {t('spend.runsShort', '{{n}}×', { n: m.runs })}
                          </div>
                        </td>
                        <td className="py-1.5 text-end font-mono tabular-nums align-top">
                          {money(m.cost)}
                        </td>
                        <td className="py-1.5 text-end text-slate-400 tabular-nums align-top">
                          {share(m.cost).toFixed(0)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

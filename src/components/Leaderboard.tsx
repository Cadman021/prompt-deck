// src/components/Leaderboard.tsx
import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Trophy, Crown } from 'lucide-react';
import { DbService, ModelStat } from '../services/dbService';

interface LeaderboardProps {
  isOpen: boolean;
  onClose: () => void;
}

export const Leaderboard: React.FC<LeaderboardProps> = ({ isOpen, onClose }) => {
  const { t } = useTranslation();
  const [stats, setStats] = useState<ModelStat[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setLoading(true);
    DbService.getModelStats()
      .then((s) =>
        setStats(
          [...s].sort(
            (a, b) => b.winRate - a.winRate || b.avgTps - a.avgTps || b.runs - a.runs
          )
        )
      )
      .finally(() => setLoading(false));
  }, [isOpen]);

  if (!isOpen) return null;

  const maxTps = Math.max(0, ...stats.map((s) => s.avgTps));

  return (
    <div className="fixed inset-y-0 right-0 z-50 w-96 max-w-full bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800">
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-500" />
          <h2 className="font-bold text-lg">{t('leaderboard.title')}</h2>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded transition-colors text-lg leading-none"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
        {loading ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">
            {t('leaderboard.loading')}
          </div>
        ) : stats.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-8 px-4 text-sm leading-relaxed">
            {t('leaderboard.empty')}
          </div>
        ) : (
          stats.map((s, i) => (
            <div
              key={s.model}
              className="p-3 rounded-lg bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/50 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 mb-1">
                <div className="flex items-center gap-2 min-w-0">
                  {i === 0 && s.wins > 0 ? (
                    <Crown className="w-4 h-4 text-amber-500 shrink-0" />
                  ) : (
                    <span className="text-xs font-mono text-slate-400 w-4 shrink-0">{i + 1}</span>
                  )}
                  <span className="text-xs font-semibold font-mono truncate" title={s.model}>
                    {s.model}
                  </span>
                </div>
                <span className="text-[11px] font-mono text-slate-500 dark:text-slate-400 shrink-0">
                  {s.runs} {t('leaderboard.runs')}
                </span>
              </div>
              <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-1.5">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500"
                  style={{ width: `${maxTps > 0 ? Math.round((s.avgTps / maxTps) * 100) : 0}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono">
                <span className="text-emerald-600 dark:text-emerald-400">
                  {s.avgTps} {t('metrics.tps')}
                </span>
                <span className="text-amber-600 dark:text-amber-300">
                  {s.wins} {t('leaderboard.wins')} · {Math.round(s.winRate * 100)}%
                </span>
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500">
        {t('leaderboard.hint')}
      </div>
    </div>
  );
};

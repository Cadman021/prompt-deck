// src/components/HistorySidebar.tsx
import React, { useEffect, useState } from 'react';
import { DbService, HistoryRecord } from '../services/dbService';
import { useTranslation } from 'react-i18next';
import { Crown } from 'lucide-react';
import { formatRelativeTime } from '../utils/timeUtils';
import { useCloudStore } from '../store/useCloudStore';
import { formatCost, parseQualified } from '../services/modelTarget';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
}

/** One compact meta line per card: best TPS · total cost · age. */
const HistoryMetaLine: React.FC<{
  record: HistoryRecord;
  getRelativeLabel: (iso: string) => string;
}> = ({ record, getRelativeLabel }) => {
  const scored = record.results.filter((r) => r.tps > 0);
  const best = scored.length > 0
    ? scored.reduce((a, b) => (b.tps > a.tps ? b : a))
    : null;
  const totalCost = record.results.reduce<number | null>(
    (sum, r) => (r.costUsd != null ? (sum ?? 0) + r.costUsd : sum),
    null
  );
  const stats = [
    best ? `best ${best.tpsEstimated ? '~' : ''}${best.tps.toFixed(1)} tok/s` : '',
    totalCost != null ? formatCost(totalCost) : '',
  ].filter(Boolean).join(' · ');
  const age = record.created_at ? getRelativeLabel(record.created_at) : '';
  if (!stats && !age) return null;
  return (
    <div className="text-[10px] font-mono truncate">
      {stats && <span className="text-emerald-600 dark:text-emerald-400">{stats}</span>}
      {stats && age ? <span className="text-slate-400 dark:text-slate-500"> · {age}</span>
        : age ? <span className="text-slate-400 dark:text-slate-500">{age}</span> : null}
    </div>
  );
};

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  onSelectRecord,
}) => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [showWinnersOnly, setShowWinnersOnly] = useState(false);
  const cloudCustom = useCloudStore((s) => s.customProviders);

  /** Cloud `providerId/model` → short `model` for tight card rows. */
  const shortName = (model: string): string => {
    const parsed = parseQualified(model, cloudCustom);
    return parsed.source.kind === 'cloud' ? parsed.model : model;
  };

  const getRelativeLabel = (isoString: string): string => {
    const relative = formatRelativeTime(isoString);
    switch (relative.kind) {
      case 'now':
        return t('history.timeNow');
      case 'minutes':
        return t('history.timeMinutes', { count: relative.count });
      case 'hours':
        return t('history.timeHours', { count: relative.count });
      case 'days':
        return t('history.timeDays', { count: relative.count });
      case 'date':
        return relative.date;
    }
  };

  const fetchRecords = async () => {
    setLoading(true);
    const data = await DbService.getHistory();
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecords();
      setSearchQuery('');
      setShowWinnersOnly(false);
    }
  }, [isOpen]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await DbService.deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const handleClearAll = async () => {
    if (window.confirm(t('history.clearAllConfirm'))) {
      await DbService.clearHistory();
      setRecords([]);
    }
  };

  const filteredRecords = records.filter((record) => {
    if (showWinnersOnly && !record.winnerModel) return false;
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const promptMatch = record.prompt.toLowerCase().includes(q);
    const modelMatch = record.results.some((r) => r.model.toLowerCase().includes(q));
    return promptMatch || modelMatch;
  });

  if (!isOpen) return null;

  return (
    <>
      <div
        className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <div className="fixed inset-y-0 left-0 z-50 w-80 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-800 transition-all duration-300">
      {/* Header */}
      <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <svg className="w-5 h-5 text-indigo-500 dark:text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <h2 className="font-bold text-lg">{t('history.title')}</h2>
        </div>
        <div className="flex items-center gap-2">
          {records.length > 0 && (
            <button
              onClick={handleClearAll}
              title={t('history.clearAllTitle')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-500 dark:text-red-400 hover:text-rose-600 dark:hover:text-red-300 rounded transition-colors"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
              </svg>
            </button>
          )}
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* Search Bar */}
      {records.length > 0 && (
        <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 space-y-1.5">
          <div className="flex items-center gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={t('history.searchPlaceholder')}
              className="w-full min-w-0 bg-slate-100 dark:bg-slate-800 text-xs text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => setShowWinnersOnly((v) => !v)}
              title={t('history.winnersOnly')}
              aria-pressed={showWinnersOnly}
              className={`shrink-0 flex items-center gap-1 text-xs px-2 py-1.5 rounded-md border transition-colors ${
                showWinnersOnly
                  ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border-amber-300 dark:border-amber-600 font-semibold'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'
              }`}
            >
              <Crown className="w-3.5 h-3.5" />
              {t('history.winnersOnly')}
            </button>
          </div>
          {(searchQuery.trim() || showWinnersOnly) && (
            <div className="text-[11px] text-slate-500 dark:text-slate-400">
              {t('history.resultsCount', { count: filteredRecords.length })}
            </div>
          )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
        {loading ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">
            {t('history.loading')}
          </div>
        ) : records.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-8 px-4 text-sm leading-relaxed">
            {t('history.empty')}
          </div>
        ) : filteredRecords.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">
            {t('history.noResults')}
          </div>
        ) : (
          filteredRecords.map((record) => (
            <div
              key={record.id}
              onClick={() => {
                onSelectRecord(record);
                onClose();
              }}
              className="group p-3 rounded-lg bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-indigo-400 dark:hover:border-indigo-500/50 cursor-pointer transition-all relative shadow-sm dark:shadow-none"
            >
              <div className="flex justify-between items-center gap-2">
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate" dir="auto" title={record.prompt}>
                  {record.prompt}
                </p>
                <button
                  onClick={(e) => record.id && handleDelete(e, record.id)}
                  title={t('history.deleteRecordTitle')}
                  className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 dark:text-slate-400 hover:text-rose-500 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0"
                >
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              </div>

              {/* Models — single truncated line with short names */}
              <div
                className="text-[11px] text-slate-500 dark:text-slate-400 truncate"
                title={record.results.map((r) => r.model).join(' vs ')}
              >
                {record.results.map((r, i) => (
                  <span key={i}>
                    {record.winnerModel === r.model && (
                      <Crown className="w-3 h-3 inline-block -mt-0.5 me-0.5 text-amber-500" />
                    )}
                    <span className={record.winnerModel === r.model ? 'text-amber-600 dark:text-amber-300 font-semibold' : ''}>
                      {shortName(r.model).split(':')[0]}
                    </span>
                    {i < record.results.length - 1 && (
                      <span className="text-indigo-500 dark:text-indigo-400 font-mono text-[10px] mx-1">
                        {t('history.vs')}
                      </span>
                    )}
                  </span>
                ))}
              </div>

              <HistoryMetaLine record={record} getRelativeLabel={getRelativeLabel} />
            </div>
          ))
        )}
      </div>
      </div>
    </>
  );
};
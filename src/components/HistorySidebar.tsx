// src/components/HistorySidebar.tsx
import React, { useEffect, useState } from 'react';
import { DbService, HistoryRecord, type BenchmarkResult } from '../services/dbService';
import { useTranslation } from 'react-i18next';
import { Crown, Download, Upload } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { formatRelativeTime } from '../utils/timeUtils';
import { useCloudStore } from '../store/useCloudStore';
import { formatCost, parseQualified } from '../services/modelTarget';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
}

/** Human-readable run-config summary for the card tooltip (technical values, no i18n). */
const configSummary = (runConfig?: string | null): string => {
  if (!runConfig) return '';
  try {
    const c = JSON.parse(runConfig) as {
      provider?: string;
      host?: string;
      runMode?: string;
      temperature?: number;
      top_p?: number;
      num_ctx?: number;
      serverDefaults?: boolean;
      seed?: number;
      maxTokens?: number;
      appVersion?: string;
    };
    const parts: string[] = [];
    if (c.provider) parts.push(c.host ? `${c.provider} @ ${c.host}` : c.provider);
    if (c.runMode) parts.push(c.runMode);
    if (c.serverDefaults) {
      parts.push('server defaults');
    } else {
      if (c.temperature != null) parts.push(`temp ${c.temperature}`);
      if (c.top_p != null) parts.push(`top-p ${c.top_p}`);
      if (c.num_ctx != null) parts.push(`ctx ${c.num_ctx}`);
    }
    if (c.seed != null) parts.push(`seed ${c.seed}`);
    if (c.maxTokens != null) parts.push(`max ${c.maxTokens} tok`);
    if (c.appVersion) parts.push(`v${c.appVersion}`);
    return parts.join(' · ');
  } catch {
    return '';
  }
};

/** One compact meta line per card: best TPS · total cost · age. */
const HistoryMetaLine: React.FC<{
  record: HistoryRecord;
  getRelativeLabel: (iso: string) => string;
}> = ({ record, getRelativeLabel }) => {
  const scored = record.results.filter((r) => r.tps > 0);
  const best = scored.length > 0 ? scored.reduce((a, b) => (b.tps > a.tps ? b : a)) : null;
  const totalCost = record.results.reduce<number | null>(
    (sum, r) => (r.costUsd != null ? (sum ?? 0) + r.costUsd : sum),
    null
  );
  const stats = [
    best ? `best ${best.tpsEstimated ? '~' : ''}${best.tps.toFixed(1)} tok/s` : '',
    totalCost != null ? formatCost(totalCost) : '',
  ]
    .filter(Boolean)
    .join(' · ');
  const age = record.created_at ? getRelativeLabel(record.created_at) : '';
  if (!stats && !age) return null;
  return (
    <div className="text-[10px] font-mono truncate">
      {stats && <span className="text-emerald-600 dark:text-emerald-400">{stats}</span>}
      {stats && age ? (
        <span className="text-slate-400 dark:text-slate-500"> · {age}</span>
      ) : age ? (
        <span className="text-slate-400 dark:text-slate-500">{age}</span>
      ) : null}
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

  /**
   * Short display name for tight card rows. Explicit `source`/`providerId`
   * columns win (so a local `openai/gpt-oss-20b` is never mistaken for a
   * cloud model); parseQualified stays only as the legacy-rows fallback.
   */
  const shortName = (r: BenchmarkResult): string => {
    if (r.source === 'cloud' && r.providerId) {
      const prefix = `cloud:${r.providerId}/`;
      const raw = r.model.startsWith(prefix) ? r.model.slice(prefix.length) : r.model;
      return raw;
    }
    if (r.source === 'local') return r.model;
    const parsed = parseQualified(r.model, cloudCustom);
    return parsed.source.kind === 'cloud' ? parsed.model : r.model;
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

  const PAGE_SIZE = 50;
  const [totalCount, setTotalCount] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);
  // Debounced search text actually sent to SQL (LIKE %..% server-side, so
  // filtering works across the whole history, not just the loaded page).
  const [appliedQuery, setAppliedQuery] = useState('');

  const loadPage = React.useCallback(
    async (offset: number, query: string, winners: boolean, append: boolean) => {
      if (append) {
        setLoadingMore(true);
      } else {
        setLoading(true);
      }
      const [data, total] = await Promise.all([
        DbService.getHistory(PAGE_SIZE, offset, query, winners),
        DbService.countHistory(query, winners),
      ]);
      setRecords((prev) => (append ? [...prev, ...data] : data));
      setTotalCount(total);
      setLoading(false);
      setLoadingMore(false);
    },
    []
  );

  const wasOpen = React.useRef(false);
  useEffect(() => {
    if (!isOpen) {
      wasOpen.current = false;
      return;
    }
    if (!wasOpen.current) {
      // Freshly opened: reset filters and load the first page immediately.
      wasOpen.current = true;
      setSearchQuery('');
      setShowWinnersOnly(false);
      setAppliedQuery('');
      void loadPage(0, '', false, false);
      return;
    }
    const timer = setTimeout(() => {
      setAppliedQuery(searchQuery);
      void loadPage(0, searchQuery, showWinnersOnly, false);
    }, 300);
    return () => clearTimeout(timer);
  }, [isOpen, searchQuery, showWinnersOnly, loadPage]);

  const handleDelete = async (e: React.MouseEvent, id: number) => {
    e.stopPropagation();
    await DbService.deleteRecord(id);
    setRecords((prev) => prev.filter((r) => r.id !== id));
  };

  const [confirmClear, setConfirmClear] = useState(false);

  const handleClearAll = async () => {
    await DbService.clearHistory();
    setRecords([]);
    setTotalCount(0);
  };

  const fileRef = React.useRef<HTMLInputElement>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const flashNotice = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 3000);
  };

  const handleExportDb = async () => {
    try {
      const json = await DbService.exportDatabase();
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `promptdeck-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Backup export failed:', error);
      flashNotice(t('history.importError', 'Backup failed.'));
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const runs = await DbService.importDatabase(text);
      flashNotice(t('history.imported', 'Imported {{count}} runs.', { count: runs }));
      const q = appliedQuery;
      await loadPage(0, q, showWinnersOnly, false);
    } catch (error) {
      console.error('Backup import failed:', error);
      flashNotice(t('history.importError', 'Backup failed.'));
    }
  };

  // Filtering already happened in SQL (search text + winners toggle), so
  // `records` is exactly the current result set — no client-side pass.
  const hasFilter = appliedQuery.trim() !== '' || showWinnersOnly;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 left-0 z-50 w-80 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col border-r border-slate-200 dark:border-slate-800 transition-all duration-300">
        {/* Header */}
        <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <svg
              className="w-5 h-5 text-indigo-500 dark:text-indigo-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <h2 className="font-bold text-lg">{t('history.title')}</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handleExportDb}
              title={t('history.exportDb', 'Export full backup (JSON)')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 rounded transition-colors"
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              title={t('history.importDb', 'Import backup (JSON)')}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 rounded transition-colors"
            >
              <Upload className="w-4 h-4" />
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={handleImportFile}
            />
            {records.length > 0 && (
              <button
                onClick={() => setConfirmClear(true)}
                title={t('history.clearAllTitle')}
                className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-rose-500 dark:text-red-400 hover:text-rose-600 dark:hover:text-red-300 rounded transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                  />
                </svg>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white rounded transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
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
            {hasFilter && (
              <div className="text-[11px] text-slate-500 dark:text-slate-400">
                {t('history.resultsCount', { count: totalCount })}
              </div>
            )}
          </div>
        )}

        {notice && (
          <div className="px-4 py-1.5 text-[11px] text-center bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 border-b border-indigo-500/20">
            {notice}
          </div>
        )}

        <ConfirmModal
          isOpen={confirmClear}
          title={t('history.clearAllTitle')}
          message={t('history.clearAllConfirm')}
          onConfirm={() => void handleClearAll()}
          onClose={() => setConfirmClear(false)}
        />

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
          {loading ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">
              {t('history.loading')}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center text-slate-400 dark:text-slate-500 py-8 px-4 text-sm leading-relaxed">
              {hasFilter ? t('history.noResults') : t('history.empty')}
            </div>
          ) : (
            records.map((record) => (
              <div
                key={record.id}
                onClick={() => {
                  onSelectRecord(record);
                  onClose();
                }}
                title={[record.prompt, configSummary(record.runConfig)].filter(Boolean).join('\n')}
                className="group p-3 rounded-lg bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-indigo-400 dark:hover:border-indigo-500/50 cursor-pointer transition-all relative shadow-sm dark:shadow-none"
              >
                <div className="flex justify-between items-center gap-2">
                  <p
                    className="text-xs text-slate-700 dark:text-slate-300 font-medium truncate"
                    dir="auto"
                    title={record.prompt}
                  >
                    {record.prompt}
                  </p>
                  <button
                    onClick={(e) => record.id && handleDelete(e, record.id)}
                    title={t('history.deleteRecordTitle')}
                    className="opacity-0 group-hover:opacity-100 p-1 text-slate-400 dark:text-slate-400 hover:text-rose-500 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                      />
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
                      <span
                        className={
                          record.winnerModel === r.model
                            ? 'text-amber-600 dark:text-amber-300 font-semibold'
                            : ''
                        }
                      >
                        {shortName(r).split(':')[0]}
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
          {!loading && records.length < totalCount && (
            <button
              onClick={() => void loadPage(records.length, appliedQuery, showWinnersOnly, true)}
              disabled={loadingMore}
              className="w-full py-2 text-xs font-medium rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-50"
            >
              {loadingMore
                ? t('history.loading')
                : t('history.showMore', 'Show more ({{shown}} of {{total}})', {
                    shown: records.length,
                    total: totalCount,
                  })}
            </button>
          )}
        </div>
      </div>
    </>
  );
};

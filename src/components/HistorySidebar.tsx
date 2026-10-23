// src/components/HistorySidebar.tsx
import React, { useEffect, useState } from 'react';
import { DbService, HistoryRecord, type BenchmarkResult } from '../services/dbService';
import { useTranslation } from 'react-i18next';
import { Clock, Crown, Download, Upload, Trash2, X, Copy, FileText, RotateCcw } from 'lucide-react';
import { ConfirmModal } from './ConfirmModal';
import { formatRelativeTime } from '../utils/timeUtils';
import { modelColorHex } from '../utils/modelColor';
import { useCloudStore } from '../store/useCloudStore';
import { formatCost, parseQualified } from '../services/modelTarget';
import { copyHistoryAsJson, exportHistoryAsCsv } from '../utils/exportUtils';
import { toast } from '../store/useToastStore';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
  /** Restore the run's prompt/columns/settings and start it again. */
  onRerun?: (record: HistoryRecord) => void;
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
      slotParams?: Record<string, unknown>;
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
    const perModel = c.slotParams ? Object.keys(c.slotParams).length : 0;
    if (perModel > 0) parts.push(`${perModel} per-model`);
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
    <div className="text-micro font-mono tabular-nums truncate">
      {stats && <span className="text-emerald-700 dark:text-emerald-400">{stats}</span>}
      {stats && age ? (
        <span className="text-slate-500 dark:text-slate-400"> · {age}</span>
      ) : age ? (
        <span className="text-slate-500 dark:text-slate-400">{age}</span>
      ) : null}
    </div>
  );
};

const iconBtn =
  'p-1.5 rounded-md text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors';

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  onSelectRecord,
  onRerun,
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
      toast(t('history.importError', 'Backup failed.'), 'error');
    }
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await file.text();
      const runs = await DbService.importDatabase(text);
      toast(t('history.imported', 'Imported {{count}} runs.', { count: runs }), 'success');
      const q = appliedQuery;
      await loadPage(0, q, showWinnersOnly, false);
    } catch (error) {
      console.error('Backup import failed:', error);
      toast(t('history.importError', 'Backup failed.'), 'error');
    }
  };

  // Whole-history data actions — moved here from the run toolbar, since they
  // operate on every saved run rather than the current comparison.
  const handleCopyJson = async () => {
    const status = await copyHistoryAsJson();
    if (status === 'ok') toast(t('app.copyJsonDone', 'Copied!'), 'success');
    else toast(t('app.exportCsvEmpty', 'Nothing to export.'), 'info');
  };

  const handleExportCsv = async () => {
    const ok = await exportHistoryAsCsv();
    if (ok) toast(t('app.exportCsvDone', 'Exported'), 'success');
    else toast(t('app.exportCsvEmpty', 'Nothing to export.'), 'info');
  };

  // Filtering already happened in SQL (search text + winners toggle), so
  // `records` is exactly the current result set — no client-side pass.
  const hasFilter = appliedQuery.trim() !== '' || showWinnersOnly;

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]" onClick={onClose} />
      <div className="fixed inset-y-0 start-0 z-50 w-[28rem] max-w-[92vw] bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 shadow-2xl flex flex-col border-e border-slate-200 dark:border-slate-800">
        {/* Header */}
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 shrink-0">
            <Clock className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
            <h2 className="font-bold text-lg">{t('history.title')}</h2>
            {totalCount > 0 && (
              <span className="text-micro font-mono text-slate-500 dark:text-slate-400">
                {totalCount}
              </span>
            )}
          </div>
          <div className="flex items-center gap-0.5">
            <button
              onClick={handleCopyJson}
              title={t('app.copyJsonTitle')}
              aria-label={t('app.copyJsonTitle')}
              className={iconBtn}
            >
              <Copy className="w-4 h-4" />
            </button>
            <button
              onClick={handleExportCsv}
              title={t('app.exportCsvTitle')}
              aria-label={t('app.exportCsvTitle')}
              className={iconBtn}
            >
              <FileText className="w-4 h-4" />
            </button>
            <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
            <button
              onClick={handleExportDb}
              title={t('history.exportDb', 'Export full backup (JSON)')}
              aria-label={t('history.exportDb', 'Export full backup (JSON)')}
              className={iconBtn}
            >
              <Download className="w-4 h-4" />
            </button>
            <button
              onClick={() => fileRef.current?.click()}
              title={t('history.importDb', 'Import backup (JSON)')}
              aria-label={t('history.importDb', 'Import backup (JSON)')}
              className={iconBtn}
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
                aria-label={t('history.clearAllTitle')}
                className={`${iconBtn} text-rose-700 dark:text-red-400 hover:text-rose-600 dark:hover:text-red-300`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={onClose}
              aria-label={t('common.close', 'Close')}
              className={iconBtn}
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Search Bar */}
        {records.length > 0 && (
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 space-y-1.5">
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
              <div className="text-micro text-slate-500 dark:text-slate-400">
                {t('history.resultsCount', { count: totalCount })}
              </div>
            )}
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
        <div className="flex-1 overflow-y-auto p-3 space-y-2.5 bg-slate-50 dark:bg-slate-900">
          {loading ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">
              {t('history.loading')}
            </div>
          ) : records.length === 0 ? (
            <div className="text-center text-slate-500 dark:text-slate-400 py-8 px-4 text-sm leading-relaxed">
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
                title={configSummary(record.runConfig)}
                className="group p-3 rounded-xl bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-indigo-400 dark:hover:border-indigo-500/50 cursor-pointer transition-all relative shadow-sm dark:shadow-none"
              >
                <div className="flex items-start justify-between gap-2">
                  <p
                    className="text-[0.8125rem] text-slate-800 dark:text-slate-200 font-medium line-clamp-2 leading-snug"
                    dir="auto"
                    title={record.prompt}
                  >
                    {record.prompt}
                  </p>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {onRerun && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          onRerun(record);
                          onClose();
                        }}
                        title={t('history.rerunTitle', 'Re-run with the same prompt and settings')}
                        aria-label={t('history.rerun', 'Re-run')}
                        className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 dark:text-slate-400 hover:text-indigo-500 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0"
                      >
                        <RotateCcw className="w-3.5 h-3.5" />
                      </button>
                    )}
                    <button
                      onClick={(e) => record.id && handleDelete(e, record.id)}
                      title={t('history.deleteRecordTitle')}
                      aria-label={t('history.deleteRecordTitle')}
                      className="opacity-0 group-hover:opacity-100 p-1 text-slate-500 dark:text-slate-400 hover:text-rose-500 dark:hover:text-red-400 rounded hover:bg-slate-100 dark:hover:bg-slate-700 transition-all shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Models — wrapping chips, winners highlighted (no truncation) */}
                <div className="mt-2 flex flex-wrap gap-1">
                  {record.results.map((r, i) => {
                    const isWinner = record.winnerModel === r.model;
                    return (
                      <span
                        key={i}
                        title={r.model}
                        className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-micro font-mono max-w-full ${
                          isWinner
                            ? 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-semibold border border-amber-300/60 dark:border-amber-700/60'
                            : 'bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300'
                        }`}
                      >
                        {isWinner ? (
                          <Crown className="w-3 h-3 shrink-0" />
                        ) : (
                          <span
                            className="w-1.5 h-1.5 rounded-full shrink-0"
                            style={{ background: modelColorHex(r.model) }}
                            aria-hidden="true"
                          />
                        )}
                        <span className="truncate">{shortName(r).split(':')[0]}</span>
                      </span>
                    );
                  })}
                </div>

                <div className="mt-2">
                  <HistoryMetaLine record={record} getRelativeLabel={getRelativeLabel} />
                </div>
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

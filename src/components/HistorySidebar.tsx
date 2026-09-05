// src/components/HistorySidebar.tsx
import React, { useEffect, useState } from 'react';
import { DbService, HistoryRecord } from '../services/dbService';
import { useTranslation } from 'react-i18next';

interface HistorySidebarProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectRecord: (record: HistoryRecord) => void;
}

export const HistorySidebar: React.FC<HistorySidebarProps> = ({
  isOpen,
  onClose,
  onSelectRecord,
}) => {
  const { t } = useTranslation();
  const [records, setRecords] = useState<HistoryRecord[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRecords = async () => {
    setLoading(true);
    const data = await DbService.getHistory();
    setRecords(data);
    setLoading(false);
  };

  useEffect(() => {
    if (isOpen) {
      fetchRecords();
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

  if (!isOpen) return null;

  return (
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

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2 bg-slate-50 dark:bg-slate-900">
        {loading ? (
          <div className="text-center text-slate-500 dark:text-slate-400 py-8 text-sm">
            {t('history.loading')}
          </div>
        ) : records.length === 0 ? (
          <div className="text-center text-slate-400 dark:text-slate-500 py-8 text-sm">
            {t('history.empty')}
          </div>
        ) : (
          records.map((record) => (
            <div
              key={record.id}
              onClick={() => {
                onSelectRecord(record);
                onClose();
              }}
              className="group p-3 rounded-lg bg-white dark:bg-slate-800/60 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700/50 hover:border-indigo-400 dark:hover:border-indigo-500/50 cursor-pointer transition-all relative shadow-sm dark:shadow-none"
            >
              <div className="flex justify-between items-start mb-2 gap-2">
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium line-clamp-2" dir="auto">
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

              {/* Model chips — one row of comma-separated names, dynamic count */}
              <div className="text-[11px] text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-1.5 gap-y-1 pt-1 border-t border-slate-200 dark:border-slate-700/40">
                {record.results.map((r, i) => (
                  <span key={i} className="flex items-center gap-1">
                    <span className="truncate max-w-[90px]" title={r.model}>
                      {r.model.split(':')[0]}
                    </span>
                    {i < record.results.length - 1 && (
                      <span className="text-indigo-500 dark:text-indigo-400 font-mono text-[10px]">
                        {t('history.vs')}
                      </span>
                    )}
                  </span>
                ))}
              </div>

              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] font-mono text-emerald-600 dark:text-emerald-400">
                {record.results.map((r, i) => (
                  <span key={i}>{r.tps ? r.tps.toFixed(1) : '0'} tok/s</span>
                ))}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};
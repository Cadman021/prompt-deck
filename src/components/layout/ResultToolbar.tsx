// src/components/layout/ResultToolbar.tsx
import React from 'react';
import { useTranslation } from 'react-i18next';
import { FileDown, Check, GitCompare, Download, RefreshCw } from 'lucide-react';

interface ResultToolbarProps {
  hasOutput: boolean;
  canShowDiff: boolean;
  diffActive: boolean;
  onToggleDiff: () => void;
  copied: boolean;
  onCopyReport: () => void;
  pdfState: 'idle' | 'exporting' | 'done';
  onExportPdf: () => void;
  jsonCopied: boolean;
  onCopyJson: () => void;
  csvState: 'idle' | 'exporting' | 'done' | 'empty';
  onExportCsv: () => void;
  slotsLabel: string;
}

export const ResultToolbar: React.FC<ResultToolbarProps> = ({
  hasOutput,
  canShowDiff,
  diffActive,
  onToggleDiff,
  copied,
  onCopyReport,
  pdfState,
  onExportPdf,
  jsonCopied,
  onCopyJson,
  csvState,
  onExportCsv,
  slotsLabel,
}) => {
  const { t } = useTranslation();
  if (!hasOutput && !canShowDiff) return null;

  const btn =
    'flex items-center gap-1.5 px-2.5 py-1.5 text-[11px] font-medium rounded-lg border transition-all shadow-sm';

  return (
    <div className="shrink-0 flex items-center gap-2 px-4 py-2 border-b border-slate-200/70 dark:border-slate-800/70 bg-slate-50/80 dark:bg-slate-900/40 overflow-x-auto">
      <span className="text-[11px] font-mono text-slate-400 dark:text-slate-500 whitespace-nowrap">
        {slotsLabel}
      </span>
      <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 shrink-0" />

      {hasOutput && (
        <>
          <button
            onClick={onCopyReport}
            className={`${btn} bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/80`}
            title={t('app.copyReportTitle')}
          >
            {copied ? <Check className="w-3.5 h-3.5" /> : null}
            <span>{copied ? t('app.copyReportDone') : t('app.copyReport')}</span>
          </button>

          <button
            onClick={onExportPdf}
            disabled={pdfState === 'exporting'}
            className={`${btn} bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60`}
          >
            {pdfState === 'exporting' ? (
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
            ) : pdfState === 'done' ? (
              <Check className="w-3.5 h-3.5 text-emerald-500" />
            ) : (
              <FileDown className="w-3.5 h-3.5" />
            )}
            <span>{pdfState === 'done' ? t('app.exportCsvDone') : 'PDF'}</span>
          </button>
        </>
      )}

      {canShowDiff && (
        <button
          onClick={onToggleDiff}
          className={`${btn} ${
            diffActive
              ? 'bg-amber-500 text-white border-amber-500'
              : 'bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800 hover:bg-amber-100 dark:hover:bg-amber-900/60'
          }`}
          title={t('diff.toggleTitle')}
        >
          <GitCompare className="w-3.5 h-3.5" />
          <span>{t('diff.toggle')}</span>
        </button>
      )}

      <div className="flex-1" />

      <button
        onClick={onCopyJson}
        className={`${btn} bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700`}
        title={t('app.copyJsonTitle')}
      >
        <span>{jsonCopied ? t('app.copyJsonDone') : t('app.copyJson')}</span>
      </button>

      <button
        onClick={onExportCsv}
        disabled={csvState === 'exporting'}
        className={`${btn} bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 disabled:opacity-60`}
        title={t('app.exportCsvTitle')}
      >
        <Download className="w-3.5 h-3.5" />
        <span>
          {csvState === 'exporting'
            ? t('app.exportCsvWorking')
            : csvState === 'done'
              ? t('app.exportCsvDone')
              : csvState === 'empty'
                ? t('app.exportCsvEmpty')
                : t('app.exportCsv')}
        </span>
      </button>
    </div>
  );
};

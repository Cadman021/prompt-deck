// src/components/DiffView.tsx
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown } from 'lucide-react';
import { diffLines, summarizeDiff } from '../utils/diffUtils';

interface DiffViewProps {
  leftName: string;
  rightName: string;
  leftText: string;
  rightText: string;
  /** Indices of the compared pair within the comparable-slots list (for the pair picker). */
  pairIndex: [number, number];
  pairCount: number;
  onPairChange: (leftIdx: number, rightIdx: number) => void;
  onClose: () => void;
}

export const DiffView: React.FC<DiffViewProps> = ({
  leftName,
  rightName,
  leftText,
  rightText,
  pairIndex,
  pairCount,
  onPairChange,
  onClose,
}) => {
  const { t } = useTranslation();
  const [showUnchanged, setShowUnchanged] = useState(true);

  const rows = useMemo(() => diffLines(leftText, rightText), [leftText, rightText]);
  const summary = useMemo(() => summarizeDiff(rows), [rows]);
  const visible = useMemo(
    () => (showUnchanged ? rows : rows.filter((r) => r.kind !== 'same')),
    [rows, showUnchanged]
  );

  return (
    <div className="bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl shadow-sm overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2 border-b border-slate-200 dark:border-slate-800 flex-wrap">
        <div className="flex items-center gap-2 text-xs flex-wrap">
          <span className="font-semibold text-slate-700 dark:text-slate-300">{t('diff.title')}</span>
          {pairCount > 2 && (
            <span className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
              <select
                value={pairIndex[0]}
                onChange={(e) => onPairChange(Number(e.target.value), pairIndex[1])}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono focus:outline-none"
                aria-label={t('diff.leftSide')}
              >
                {Array.from({ length: pairCount }, (_, k) => (
                  <option key={k} value={k} disabled={k === pairIndex[1]}>
                    {k + 1}
                  </option>
                ))}
              </select>
              <span className="text-slate-400">vs</span>
              <select
                value={pairIndex[1]}
                onChange={(e) => onPairChange(pairIndex[0], Number(e.target.value))}
                className="bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded px-1.5 py-0.5 text-[11px] font-mono focus:outline-none"
                aria-label={t('diff.rightSide')}
              >
                {Array.from({ length: pairCount }, (_, k) => (
                  <option key={k} value={k} disabled={k === pairIndex[0]}>
                    {k + 1}
                  </option>
                ))}
              </select>
            </span>
          )}
          <span className="font-mono text-indigo-600 dark:text-indigo-300 truncate max-w-[180px]" title={leftName}>
            {leftName.split(':')[0]}
          </span>
          <span className="text-slate-400">↔</span>
          <span className="font-mono text-cyan-600 dark:text-cyan-300 truncate max-w-[180px]" title={rightName}>
            {rightName.split(':')[0]}
          </span>
          <span className="text-[11px] text-slate-500 dark:text-slate-400 font-mono">
            {Math.round(summary.similarity * 100)}% {t('diff.similar')}
          </span>
          <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-400">
            +{summary.added}
          </span>
          <span className="text-[11px] font-mono text-rose-500 dark:text-rose-400">
            −{summary.removed}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex items-center gap-1 text-[11px] text-slate-500 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={showUnchanged}
              onChange={(e) => setShowUnchanged(e.target.checked)}
              className="accent-indigo-500"
            />
            {t('diff.showUnchanged')}
          </label>
          <button
            onClick={onClose}
            title={t('diff.close')}
            className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 text-xs font-mono">
        <div className="px-3 py-1.5 border-b border-r border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-300 truncate" title={leftName}>
          {leftName}
        </div>
        <div className="px-3 py-1.5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 font-semibold text-slate-600 dark:text-slate-300 truncate" title={rightName}>
          {rightName}
        </div>
      </div>

      <div className="max-h-72 overflow-y-auto text-xs font-mono leading-5">
        {visible.length === 0 ? (
          <div className="p-4 text-center text-slate-400 text-xs font-sans">
            {t('diff.allSameHidden')}
          </div>
        ) : (
          visible.map((r, i) => (
            <div key={i} className="grid grid-cols-2 border-b border-slate-100 dark:border-slate-800/50">
              <div
                dir="auto"
                className={`px-2 py-0.5 whitespace-pre-wrap break-words border-r border-slate-200 dark:border-slate-800 ${
                  r.kind === 'removed'
                    ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300'
                    : r.kind === 'same'
                      ? 'text-slate-600 dark:text-slate-400'
                      : 'bg-slate-50 dark:bg-slate-900/40 text-slate-300 dark:text-slate-600'
                }`}
              >
                {r.kind !== 'added' ? r.text || ' ' : ' '}
              </div>
              <div
                dir="auto"
                className={`px-2 py-0.5 whitespace-pre-wrap break-words ${
                  r.kind === 'added'
                    ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300'
                    : r.kind === 'same'
                      ? 'text-slate-600 dark:text-slate-400'
                      : 'bg-slate-50 dark:bg-slate-900/40 text-slate-300 dark:text-slate-600'
                }`}
              >
                {r.kind !== 'removed' ? r.text || ' ' : ' '}
              </div>
            </div>
          ))
        )}
      </div>

      <div className="px-4 py-1.5 border-t border-slate-200 dark:border-slate-800 text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
        <ChevronDown className="w-3 h-3" />
        <span>{t('diff.hint')}</span>
      </div>
    </div>
  );
};

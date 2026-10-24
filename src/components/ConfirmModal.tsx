// src/components/ConfirmModal.tsx
// Native window.confirm/alert look and behave inconsistently inside Tauri,
// so destructive actions go through this instead. Rendered via portal so
// backdrop-blur ancestors (e.g. the header) can't clip it.
import React from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, AlertTriangle } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = true,
  onConfirm,
  onClose,
}) => {
  const { t } = useTranslation();
  React.useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[380px] max-w-full rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-2.5 px-5 py-4">
          <span className="w-8 h-8 rounded-full bg-rose-500/10 flex items-center justify-center shrink-0">
            <AlertTriangle className="w-4 h-4 text-rose-700 dark:text-rose-400" />
          </span>
          <h2 className="flex-1 text-sm font-bold">{title}</h2>
          <button
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        <p
          className="px-5 pb-1 text-xs text-slate-600 dark:text-slate-300 leading-relaxed"
          dir="auto"
        >
          {message}
        </p>
        <div className="flex items-center justify-end gap-2 px-5 py-4">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            {cancelLabel ?? t('common.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className={`px-5 py-2 text-xs font-semibold rounded-lg text-white transition ${
              danger ? 'bg-rose-600 hover:bg-rose-500' : 'bg-indigo-600 hover:bg-indigo-500'
            }`}
          >
            {confirmLabel ?? t('common.confirm', 'Confirm')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

// src/components/Toaster.tsx
// Renders the global toast queue, bottom-center. Mounted once in App.
import React from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';
import { useToastStore, type ToastKind } from '../store/useToastStore';

const ICONS: Record<ToastKind, React.ComponentType<{ className?: string }>> = {
  success: CheckCircle2,
  error: AlertTriangle,
  info: Info,
};

export const Toaster: React.FC = () => {
  const { t } = useTranslation();
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);
  if (toasts.length === 0) return null;

  return (
    <div
      role="region"
      aria-live="polite"
      aria-label={t('common.notifications', 'Notifications')}
      className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[100] flex flex-col items-center gap-2 pointer-events-none"
    >
      {toasts.map((toast) => {
        const Icon = ICONS[toast.kind];
        return (
          <div
            key={toast.id}
            role="status"
            className="pointer-events-auto flex items-center gap-2 ps-3 pe-2 py-2 rounded-xl bg-slate-900/95 dark:bg-slate-100/95 text-white dark:text-slate-900 text-xs font-medium shadow-lg border border-white/10 dark:border-black/10"
          >
            <Icon className="w-4 h-4 shrink-0" />
            <span className="max-w-xs truncate" dir="auto">
              {toast.message}
            </span>
            <button
              onClick={() => dismiss(toast.id)}
              aria-label={t('common.dismiss', 'Dismiss')}
              className="opacity-50 hover:opacity-100 transition-opacity"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
};

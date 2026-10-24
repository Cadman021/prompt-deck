// src/components/UpdaterPrompt.tsx
// Signed in-app updates: checks the GitHub latest.json once per launch and,
// with the user's consent, downloads + installs + relaunches.
// No-ops outside Tauri (plain browser dev) and when no update exists.
import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { ArrowDownToLine, X, RefreshCw } from 'lucide-react';
import { check, type Update } from '@tauri-apps/plugin-updater';
import { relaunch } from '@tauri-apps/plugin-process';
import { APP_VERSION } from '../version';
import { isTauri } from '../utils/tauriEnv';

type Phase =
  | { kind: 'idle' }
  | { kind: 'available'; update: Update }
  | { kind: 'downloading'; update: Update; downloadedKb: number }
  | { kind: 'restarting' };

export const UpdaterPrompt: React.FC = () => {
  const { t } = useTranslation();
  const [phase, setPhase] = useState<Phase>({ kind: 'idle' });

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      // Settings has a manual "Check for updates" button; this is the
      // launch-time prompt. Both go through the same plugin call.
      if (!isTauri()) return;
      try {
        const update = await check();
        if (update && update.version !== APP_VERSION && !cancelled) {
          setPhase({ kind: 'available', update });
        }
      } catch {
        // Not running under Tauri, offline, or updater misconfigured.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const startInstall = async (update: Update): Promise<void> => {
    setPhase({ kind: 'downloading', update, downloadedKb: 0 });
    try {
      // Progress events carry per-chunk sizes only (no total), so the bar is
      // indeterminate and the text shows downloaded KB.
      await update.downloadAndInstall((event) => {
        if (event.event === 'Progress') {
          const kb = Math.round(event.data.chunkLength / 1024);
          setPhase((p) => ({
            kind: 'downloading',
            update,
            downloadedKb: (p.kind === 'downloading' ? p.downloadedKb : 0) + kb,
          }));
        }
      });
      setPhase({ kind: 'restarting' });
      await relaunch();
    } catch {
      // Download/install failed (or relaunched already) — back to quiet.
      setPhase({ kind: 'idle' });
    }
  };

  if (phase.kind === 'idle') return null;

  const version = phase.kind === 'restarting' ? '' : `v${phase.update.version}`;
  const title =
    phase.kind === 'downloading'
      ? t('updater.downloading', 'Downloading update… ({{kb}} KB)', { kb: phase.downloadedKb })
      : phase.kind === 'restarting'
        ? t('updater.restarting', 'Restarting…')
        : t('updater.available', 'Update available: {{version}}', { version });

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <div className="relative w-[380px] max-w-full rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl p-5 space-y-4">
        <div className="flex items-center gap-3">
          <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shrink-0">
            {phase.kind === 'downloading' || phase.kind === 'restarting' ? (
              <RefreshCw className="w-4 h-4 text-white animate-spin" />
            ) : (
              <ArrowDownToLine className="w-4 h-4 text-white" />
            )}
          </span>
          <h2 className="text-sm font-bold flex-1">{title}</h2>
          {phase.kind === 'available' && (
            <button
              onClick={() => setPhase({ kind: 'idle' })}
              aria-label={t('common.close', 'Close')}
              className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {phase.kind === 'available' && (
          <>
            {phase.update.body && (
              <p
                className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-4"
                dir="auto"
              >
                {phase.update.body}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setPhase({ kind: 'idle' })}
                className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition"
              >
                {t('updater.later', 'Later')}
              </button>
              <button
                onClick={() => void startInstall(phase.update)}
                className="px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
              >
                {t('updater.install', 'Download & install')}
              </button>
            </div>
          </>
        )}

        {phase.kind === 'downloading' && (
          <div className="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
            <div className="h-full w-1/3 rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 animate-pulse" />
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

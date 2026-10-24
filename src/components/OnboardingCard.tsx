// src/components/OnboardingCard.tsx
// Shown on the bench page when no local models AND no cloud models are
// available — the empty-state that used to be just a red error bar. Scans the
// usual local ports and offers one-click connect + install links.
import React, { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ServerCog, Radar, RefreshCw, ExternalLink, X, Check } from 'lucide-react';
import {
  detectLocalServers,
  type DetectedServer,
  type LocalProvider,
} from '../services/detectServer';
import { openExternal } from '../utils/openExternal';

interface OnboardingCardProps {
  onConnect: (provider: LocalProvider, baseUrl: string) => void;
  onDismiss: () => void;
}

const INSTALL_LINKS = [
  { labelKey: 'onboarding.ollama', fallback: 'Get Ollama', url: 'https://ollama.com/download' },
  { labelKey: 'onboarding.lmstudio', fallback: 'Get LM Studio', url: 'https://lmstudio.ai' },
];

export const OnboardingCard: React.FC<OnboardingCardProps> = ({ onConnect, onDismiss }) => {
  const { t } = useTranslation();
  const [servers, setServers] = useState<DetectedServer[] | null>(null);

  const scan = useCallback(async () => {
    setServers(null);
    setServers(await detectLocalServers());
  }, []);

  useEffect(() => {
    void scan();
  }, [scan]);

  return (
    <div className="mx-3 mt-3 rounded-xl border border-indigo-200/70 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50 to-cyan-50 dark:from-indigo-950/40 dark:to-slate-900/40 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <ServerCog className="w-5 h-5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-800 dark:text-slate-100">
              {t('onboarding.title', 'Connect to a model server')}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'onboarding.subtitle',
                'No models available yet — start a local server or add a cloud provider.'
              )}
            </p>
          </div>
        </div>
        <button
          onClick={onDismiss}
          aria-label={t('onboarding.dismiss', 'Dismiss')}
          className="p-1 rounded-md text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-white/60 dark:hover:bg-slate-800 transition shrink-0"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="mt-3">
        {servers === null ? (
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <Radar className="w-4 h-4 animate-spin motion-reduce:animate-none" />
            {t('onboarding.scanning', 'Scanning for local servers…')}
          </div>
        ) : servers.length > 0 ? (
          <>
            <p className="text-micro font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400 mb-1.5">
              {t('onboarding.found', 'Local servers detected')}
            </p>
            <div className="flex flex-wrap gap-2">
              {servers.map((server) => (
                <button
                  key={`${server.provider}:${server.baseUrl}`}
                  onClick={() => onConnect(server.provider, server.baseUrl)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-xs transition shadow-sm"
                >
                  <Check className="w-3.5 h-3.5 text-emerald-500" />
                  <span className="font-mono text-slate-700 dark:text-slate-200">
                    {server.baseUrl}
                  </span>
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('onboarding.models', '{{count}} models', { count: server.models.length })}
                  </span>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-2">
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t(
                'onboarding.none',
                'No local server found. PromptDeck looks for Ollama, LM Studio, llama.cpp, KoboldCpp and Jan on their default ports — install one, then scan again:'
              )}
            </p>
            <div className="flex flex-wrap items-center gap-2">
              {INSTALL_LINKS.map((link) => (
                <button
                  key={link.url}
                  onClick={() => void openExternal(link.url)}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 dark:hover:border-indigo-500 text-xs font-medium text-slate-700 dark:text-slate-200 transition shadow-sm"
                >
                  <ExternalLink className="w-3.5 h-3.5" />
                  {t(link.labelKey, link.fallback)}
                </button>
              ))}
            </div>
          </div>
        )}

        <button
          onClick={() => void scan()}
          disabled={servers === null}
          className="mt-3 flex items-center gap-1.5 text-micro font-medium text-indigo-600 dark:text-indigo-400 hover:text-indigo-500 disabled:opacity-50 transition"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {t('onboarding.rescan', 'Scan again')}
        </button>
      </div>
    </div>
  );
};

// src/components/ProviderSettings.tsx
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Radar, Check } from 'lucide-react';
import { useSettingsStore, Provider } from '../store/useSettingsStore';
import { detectLocalServers, type DetectedServer } from '../services/detectServer';

export const ProviderSettings: React.FC = () => {
  const { t } = useTranslation();
  const { provider, baseUrl, setProvider, setBaseUrl } = useSettingsStore();
  const [detecting, setDetecting] = useState(false);
  const [detected, setDetected] = useState<DetectedServer[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  const handleDetect = async () => {
    setDetecting(true);
    setDetected([]);
    setNotice(null);
    try {
      const found = await detectLocalServers();
      setDetected(found);
      if (found.length === 0) {
        setNotice(t('settings.detectNone', 'No local servers found on the usual ports.'));
      }
    } finally {
      setDetecting(false);
    }
  };

  const apply = (server: DetectedServer) => {
    setProvider(server.provider);
    setBaseUrl(server.baseUrl);
    setNotice(t('settings.detectApplied', 'Connected to {{url}}', { url: server.baseUrl }));
  };

  return (
    <div className="flex flex-col gap-2 w-full">
      <select
        value={provider}
        onChange={(e) => setProvider(e.target.value as Provider)}
        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 focus:outline-none"
        title={t('settings.providerTitle', 'Provider & Connection')}
      >
        <option value="ollama">Ollama</option>
        <option value="openai-compatible">LM Studio / llama.cpp</option>
      </select>

      <input
        type="text"
        value={baseUrl}
        onChange={(e) => setBaseUrl(e.target.value)}
        placeholder={t('settings.serverUrl', 'Server base URL')}
        className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 focus:outline-none font-mono"
        title={t('settings.serverUrl', 'Server base URL')}
      />

      <button
        type="button"
        onClick={handleDetect}
        disabled={detecting}
        className="flex items-center justify-center gap-1.5 text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-md px-2 py-1.5 hover:bg-slate-200 dark:hover:bg-slate-700 transition disabled:opacity-50"
      >
        <Radar className={`w-3.5 h-3.5 ${detecting ? 'animate-spin' : ''}`} />
        <span>
          {detecting
            ? t('settings.detecting', 'Scanning…')
            : t('settings.detectServers', 'Detect local servers')}
        </span>
      </button>

      {detected.length > 0 && (
        <div className="flex flex-col gap-1">
          {detected.map((server) => {
            const active = provider === server.provider && baseUrl === server.baseUrl;
            return (
              <button
                key={`${server.provider}:${server.baseUrl}`}
                type="button"
                onClick={() => apply(server)}
                className={`flex items-center justify-between gap-2 text-left text-xs rounded-md px-2 py-1.5 border transition ${
                  active
                    ? 'border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-950/40'
                    : 'border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <span className="truncate font-mono">{server.baseUrl}</span>
                <span className="flex items-center gap-1 shrink-0 text-slate-500 dark:text-slate-400">
                  {active && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                  {t('settings.detectModels', '{{count}} models', { count: server.models.length })}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {notice && <p className="text-[11px] text-slate-500 dark:text-slate-400">{notice}</p>}
    </div>
  );
};

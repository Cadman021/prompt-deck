// src/components/cloud/AddKeyModal.tsx
// "Add <Provider> API Key" dialog: Name + API Key + Check, Save/Cancel.
// Used for both creating and editing a connection.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import { LLMService } from '../../services/llmService';

interface AddKeyModalProps {
  providerName: string;
  baseUrl: string;
  initialLabel?: string;
  initialKey?: string;
  onSave: (label: string, apiKey: string) => void;
  onClose: () => void;
}

export const AddKeyModal: React.FC<AddKeyModalProps> = ({
  providerName,
  baseUrl,
  initialLabel = '',
  initialKey = '',
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initialLabel);
  const [apiKey, setApiKey] = useState(initialKey);
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const handleCheck = async () => {
    if (checking || !apiKey.trim()) return;
    setChecking(true);
    setCheckMsg(null);
    const result = await LLMService.testCloudConnection(baseUrl, apiKey.trim());
    setCheckMsg(
      result.ok
        ? { ok: true, text: t('cloud.keyWorks', 'Key works — {{count}} models found.', { count: result.modelCount ?? 0 }) }
        : { ok: false, text: result.error || t('cloud.failed', 'Connection failed') }
    );
    setChecking(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[400px] max-w-full rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-white/10">
          <h2 className="text-sm font-bold">
            {t('cloud.addKeyTitle', 'Add {{name}} API Key', { name: providerName })}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="p-1.5 rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="p-5 space-y-4 text-xs">
          <div>
            <label className="block font-semibold mb-1.5 text-slate-600 dark:text-slate-300">
              {t('cloud.keyName', 'Name')}
            </label>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder={t('cloud.keyNamePlaceholder', 'Production Key')}
              className="w-full p-2.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block font-semibold mb-1.5 text-slate-600 dark:text-slate-300">
              {t('cloud.apiKey', 'API key')}
            </label>
            <div className="flex gap-2">
              <input
                type="password"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  setCheckMsg(null);
                }}
                dir="ltr"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk-…"
                className="flex-1 min-w-0 p-2.5 rounded-lg bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
              <button
                onClick={handleCheck}
                disabled={checking || !apiKey.trim()}
                className="px-3.5 rounded-lg bg-slate-100 dark:bg-white/10 hover:bg-slate-200 dark:hover:bg-white/15 font-semibold transition disabled:opacity-50 shrink-0"
              >
                {checking ? (
                  <span className="w-3.5 h-3.5 block rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
                ) : (
                  t('cloud.check', 'Check')
                )}
              </button>
            </div>
            {checkMsg && (
              <p className={`mt-1.5 text-[11px] ${checkMsg.ok ? 'text-emerald-600 dark:text-emerald-300' : 'text-rose-500'}`}>
                {checkMsg.text}
              </p>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-white/10">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            {t('cloud.cancel', 'Cancel')}
          </button>
          <button
            onClick={() => label.trim() && apiKey.trim() && onSave(label.trim(), apiKey.trim())}
            disabled={!label.trim() || !apiKey.trim()}
            className="px-5 py-2 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
          >
            {t('cloud.save', 'Save')}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};

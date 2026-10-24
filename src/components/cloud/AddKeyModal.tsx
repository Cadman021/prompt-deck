// src/components/cloud/AddKeyModal.tsx
// "Add <Provider> API Key" dialog: Name + API Key + provider-specific extra
// fields (e.g. Cloudflare's Account ID) + Check, Save/Cancel.
// Used for both creating and editing a connection.
import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Info } from 'lucide-react';
import { LLMService } from '../../services/llmService';
import type { CloudUrlVar } from '../../data/cloudProviders';
import { isValidUrlVarValue } from '../../data/cloudProviders';
import { openExternal } from '../../utils/openExternal';

interface AddKeyModalProps {
  providerName: string;
  baseUrl: string;
  /** Base-URL placeholders this provider needs (Cloudflare account id, …). */
  urlVars?: CloudUrlVar[];
  initialLabel?: string;
  initialKey?: string;
  initialVars?: Record<string, string>;
  onSave: (label: string, apiKey: string, vars: Record<string, string>) => void;
  onClose: () => void;
}

export const AddKeyModal: React.FC<AddKeyModalProps> = ({
  providerName,
  baseUrl,
  urlVars,
  initialLabel = '',
  initialKey = '',
  initialVars,
  onSave,
  onClose,
}) => {
  const { t } = useTranslation();
  const [label, setLabel] = useState(initialLabel);
  const [apiKey, setApiKey] = useState(initialKey);
  const [vars, setVars] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const v of urlVars ?? []) seed[v.token] = initialVars?.[v.token] ?? '';
    return seed;
  });
  const [checking, setChecking] = useState(false);
  const [checkMsg, setCheckMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const requiredVarsFilled = (urlVars ?? [])
    .filter((v) => v.required)
    .every((v) => (vars[v.token] ?? '').trim());

  // A filled-in value that cannot be put in a URL is as blocking as an empty
  // one: the request would go to a path the provider cannot serve.
  const invalidVars = (urlVars ?? []).filter(
    (v) => (vars[v.token] ?? '').trim() && !isValidUrlVarValue(vars[v.token])
  );
  const varsOk = requiredVarsFilled && invalidVars.length === 0;

  const handleCheck = async () => {
    if (checking || !apiKey.trim()) return;
    setChecking(true);
    setCheckMsg(null);
    const result = await LLMService.testCloudConnection(baseUrl, apiKey.trim(), vars);
    setCheckMsg(
      result.ok
        ? {
            ok: true,
            text: t('cloud.keyWorks', 'Key works — {{count}} models found.', {
              count: result.modelCount ?? 0,
            }),
          }
        : { ok: false, text: result.error || t('cloud.failed', 'Connection failed') }
    );
    setChecking(false);
  };

  return createPortal(
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-[400px] max-w-full max-h-[90vh] overflow-y-auto rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-white/10 bg-white dark:bg-[#161616]">
          <h2 className="text-sm font-bold">
            {t('cloud.addKeyTitle', 'Add {{name}} API Key', { name: providerName })}
          </h2>
          <button
            onClick={onClose}
            aria-label={t('common.close', 'Close')}
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
                disabled={checking || !apiKey.trim() || !varsOk}
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
              <p
                className={`mt-1.5 text-micro ${checkMsg.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-rose-700 dark:text-rose-400'}`}
              >
                {checkMsg.text}
              </p>
            )}
          </div>

          {urlVars && urlVars.length > 0 && (
            <div className="rounded-xl border border-slate-200 dark:border-white/10 bg-slate-50/60 dark:bg-white/[0.03] p-3.5 space-y-3">
              <p className="flex items-center gap-1.5 font-bold text-slate-600 dark:text-slate-300">
                <Info className="w-3.5 h-3.5 shrink-0" />
                {t('cloud.extraFields', '{{name}} connection details', { name: providerName })}
              </p>
              {urlVars.map((v) => (
                <div key={v.token}>
                  <label
                    htmlFor={`urlvar-${v.token}`}
                    className="block font-semibold mb-1.5 text-slate-600 dark:text-slate-300"
                  >
                    {t(v.labelKey, v.labelDefault)}
                    {v.required && <span className="text-rose-500 ms-0.5">*</span>}
                  </label>
                  <input
                    id={`urlvar-${v.token}`}
                    value={vars[v.token] ?? ''}
                    onChange={(e) => {
                      setVars((prev) => ({ ...prev, [v.token]: e.target.value }));
                      setCheckMsg(null);
                    }}
                    placeholder={v.example}
                    dir="ltr"
                    autoComplete="off"
                    spellCheck={false}
                    className="w-full p-2.5 rounded-lg bg-white dark:bg-white/5 border border-slate-200 dark:border-white/10 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                  />
                  {invalidVars.some((x) => x.token === v.token) && (
                    <p className="mt-1.5 text-micro text-rose-700 dark:text-rose-400">
                      {t(
                        'cloud.invalidVar',
                        'Only letters, digits and - . _ ~ are allowed here (it goes straight into the URL).'
                      )}
                    </p>
                  )}
                  {v.helpUrl ? (
                    <p className="mt-1.5 text-micro text-slate-500 dark:text-slate-400">
                      {t(v.helpKey, v.helpDefault)}{' '}
                      <button
                        type="button"
                        onClick={() => void openExternal(v.helpUrl)}
                        dir="ltr"
                        className="text-indigo-500 hover:underline"
                      >
                        {v.helpUrl.replace(/^https?:\/\//, '').replace(/\/$/, '')}
                      </button>
                    </p>
                  ) : (
                    <p className="mt-1.5 text-micro text-slate-500 dark:text-slate-400">
                      {t(v.helpKey, v.helpDefault)}
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-200 dark:border-white/10 bg-white dark:bg-[#161616]">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition"
          >
            {t('cloud.cancel', 'Cancel')}
          </button>
          <button
            onClick={() =>
              label.trim() && apiKey.trim() && varsOk && onSave(label.trim(), apiKey.trim(), vars)
            }
            disabled={!label.trim() || !apiKey.trim() || !varsOk}
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

// src/components/cloud/ProviderDetailPage.tsx
// 9Router-style provider detail: Connections (named API keys) on top,
// Available Models (user-picked) below.
import React, { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ArrowLeft,
  Plus,
  Pencil,
  Trash2,
  Play,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  Info,
  Search,
  FlaskConical,
  X,
} from 'lucide-react';
import { LLMService } from '../../services/llmService';
import { createKeyId, useCloudStore } from '../../store/useCloudStore';
import type { CloudProviderDef, CustomProviderDef } from '../../data/cloudProviders';
import { ProviderIcon } from './ProviderIcon';
import { AddKeyModal } from './AddKeyModal';

interface ProviderDetailPageProps {
  def: CloudProviderDef | CustomProviderDef;
  isCustom: boolean;
  onBack: () => void;
  onDeleteCustom?: (providerId: string) => void;
}

export const ProviderDetailPage: React.FC<ProviderDetailPageProps> = ({
  def,
  isCustom,
  onBack,
  onDeleteCustom,
}) => {
  const { t } = useTranslation();
  const {
    keys,
    knownModels,
    enabledModels,
    addKey,
    updateKey,
    removeKey,
    setKnownModels,
    addKnownModel,
    removeKnownModel,
    toggleModel,
    setAllModels,
  } = useCloudStore();

  const [keyModal, setKeyModal] = useState<{ mode: 'create' } | { mode: 'edit'; id: string } | null>(null);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [newModel, setNewModel] = useState('');
  const [copied, setCopied] = useState<string | null>(null);
  const [modelQuery, setModelQuery] = useState('');
  const [probes, setProbes] = useState<
    Record<string, { phase: 'testing' | 'ok' | 'error'; msg?: string }>
  >({});

  const providerKeys = keys.filter((k) => k.providerId === def.id);
  const known = knownModels[def.id] ?? [];
  const enabled = enabledModels[def.id] ?? [];
  const baseUrl = def.defaultBaseUrl;
  const info = def.infoKey ? t(def.infoKey, def.infoDefault || '') : def.infoDefault || '';

  const activeKey = providerKeys.find((k) => k.enabled && k.apiKey);

  const testOneKey = async (id: string) => {
    const key = providerKeys.find((k) => k.id === id);
    if (!key || testingKey) return;
    setTestingKey(id);
    const result = await LLMService.testCloudConnection(baseUrl, key.apiKey);
    updateKey(id, {
      status: result.ok ? 'ok' : 'error',
      lastTested: new Date().toISOString(),
      error: result.error,
    });
    if (result.ok && result.models) setKnownModels(def.id, result.models);
    setTestingKey(null);
  };

  const handleRefreshModels = async () => {
    if (refreshing || !activeKey) return;
    setRefreshing(true);
    setRefreshError(null);
    const result = await LLMService.testCloudConnection(baseUrl, activeKey.apiKey);
    if (result.ok && result.models) {
      setKnownModels(def.id, result.models);
    } else {
      setRefreshError(result.error || t('cloud.failed', 'Connection failed'));
    }
    setRefreshing(false);
  };

  const handleCopyId = async (model: string) => {
    await navigator.clipboard.writeText(model);
    setCopied(model);
    setTimeout(() => setCopied(null), 1500);
  };

  const handleProbeModel = async (model: string) => {
    if (!activeKey || probes[model]?.phase === 'testing') return;
    setProbes((p) => ({ ...p, [model]: { phase: 'testing' } }));
    const result = await LLMService.probeCloudModel(baseUrl, activeKey.apiKey, model);
    setProbes((p) => ({
      ...p,
      [model]: result.ok
        ? { phase: 'ok', msg: `${result.latencyMs ?? 0}ms` }
        : { phase: 'error', msg: result.error },
    }));
  };

  const mq = modelQuery.trim().toLowerCase();
  const visibleModels = mq ? known.filter((m) => m.toLowerCase().includes(mq)) : known;

  const editingKey = keyModal?.mode === 'edit' ? providerKeys.find((k) => k.id === keyModal.id) : undefined;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
      <button
        onClick={onBack}
        className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-500 transition"
      >
        <ArrowLeft className="w-3.5 h-3.5" />
        {t('cloud.back', 'Back to Providers')}
      </button>

      {/* Provider header */}
      <div className="flex items-center gap-4 flex-wrap">
        <ProviderIcon def={def} size="lg" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold">{def.name}</h2>
            <a
              href={def.docsUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] text-indigo-500 hover:underline"
            >
              <ExternalLink className="w-3 h-3" />
              {t('cloud.getKey', 'Where to get an API key')}
            </a>
          </div>
          <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">
            {providerKeys.length} {t('cloud.connections', 'connections')} · {enabled.length}{' '}
            {t('cloud.modelsSelected', 'models selected')}
          </p>
        </div>
        {isCustom && onDeleteCustom && (
          <button
            onClick={() => onDeleteCustom(def.id)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-500/10 transition"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {t('cloud.deleteProvider', 'Delete provider')}
          </button>
        )}
      </div>

      {info && (
        <div className="flex items-center gap-2.5 px-4 py-2.5 rounded-xl bg-indigo-500/10 border border-indigo-500/25 text-xs text-indigo-600 dark:text-indigo-300">
          <Info className="w-4 h-4 shrink-0" />
          <span className="flex-1">{info}</span>
        </div>
      )}

      {/* Connections */}
      <section className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-800">
          <h3 className="text-xs font-bold">{t('cloud.connectionsTitle', 'Connections')}</h3>
          <button
            onClick={() => setKeyModal({ mode: 'create' })}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('cloud.addConnection', 'Add')}
          </button>
        </div>
        {providerKeys.length === 0 ? (
          <p className="px-4 py-5 text-xs text-slate-400 dark:text-slate-500 text-center">
            {t('cloud.noKeysYet', 'No connections yet — add your first API key.')}
          </p>
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800/60">
            {providerKeys.map((k) => (
              <li key={k.id} className="flex items-center gap-3 px-4 py-3">
                <span
                  className={`w-2 h-2 rounded-full shrink-0 ${
                    k.status === 'ok'
                      ? 'bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.8)]'
                      : k.status === 'error'
                        ? 'bg-rose-500'
                        : 'bg-slate-300 dark:bg-slate-600'
                  }`}
                  title={k.error || k.status}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-xs font-bold truncate">{k.label}</div>
                  <div className="text-[11px] font-mono text-slate-400 truncate" dir="ltr">
                    ••••{k.apiKey.slice(-4)}
                    {k.status === 'error' && k.error && (
                      <span className="ms-2 font-sans text-rose-500">{k.error}</span>
                    )}
                  </div>
                </div>
                <button
                  onClick={() => void testOneKey(k.id)}
                  disabled={testingKey !== null}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-950/50 transition disabled:opacity-50"
                  title={t('cloud.testKey', 'Test this key')}
                >
                  {testingKey === k.id ? (
                    <span className="w-3.5 h-3.5 block rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
                  ) : (
                    <Play className="w-3.5 h-3.5" />
                  )}
                </button>
                <button
                  onClick={() => setKeyModal({ mode: 'edit', id: k.id })}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                  title={t('cloud.editKey', 'Edit')}
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => removeKey(k.id)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                  title={t('cloud.disconnect', 'Disconnect')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
                <label className="relative inline-flex cursor-pointer items-center" title={t('cloud.enabled', 'Enabled')}>
                  <input
                    type="checkbox"
                    checked={k.enabled}
                    onChange={(e) => updateKey(k.id, { enabled: e.target.checked })}
                    className="peer sr-only"
                  />
                  <span className="w-8 h-[18px] rounded-full bg-slate-300 dark:bg-slate-700 peer-checked:bg-indigo-500 transition-colors after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:w-[14px] after:h-[14px] after:rounded-full after:bg-white after:transition-transform peer-checked:after:translate-x-[14px] rtl:peer-checked:after:-translate-x-[14px]" />
                </label>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Available models */}
      <section className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 dark:border-slate-800 flex-wrap gap-2">
          <h3 className="text-sm font-bold">
            {t('cloud.availableModels', 'Available Models')}
            <span className="ms-2 font-mono font-normal text-slate-400">
              {enabled.length}/{known.length}
              {mq && (
                <span> · {visibleModels.length} {t('cloud.shown', 'shown')}</span>
              )}
            </span>
          </h3>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="relative">
              <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <input
                value={modelQuery}
                onChange={(e) => setModelQuery(e.target.value)}
                placeholder={t('cloud.searchModels', 'Search models…')}
                className="text-xs ps-8 pe-3 py-1.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-48"
              />
            </div>
            {known.length > 0 && (
              <>
                <button
                  onClick={() => setAllModels(def.id, true)}
                  className="text-[11px] text-slate-500 hover:text-indigo-500 transition"
                >
                  {t('cloud.enableAll', 'Enable all')}
                </button>
                <button
                  onClick={() => setAllModels(def.id, false)}
                  className="text-[11px] text-slate-500 hover:text-rose-500 transition"
                >
                  {t('cloud.disableAll', 'Disable all')}
                </button>
              </>
            )}
            <button
              onClick={() => void handleRefreshModels()}
              disabled={refreshing || !activeKey}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
              title={!activeKey ? t('cloud.fetchHint', 'Add an enabled API key first') : t('cloud.refreshModels', 'Fetch model list from the provider')}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin' : ''}`} />
              {t('cloud.refresh', 'Refresh')}
            </button>
          </div>
        </div>

        <div className="p-4 sm:p-5 space-y-4">
          {refreshError && (
            <p className="text-[11px] text-rose-500 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">
              {refreshError}
            </p>
          )}
          {!activeKey && known.length === 0 && (
            <p className="text-xs text-slate-400 dark:text-slate-500 text-center py-2">
              {t('cloud.fetchHint', 'Add an enabled API key first')}
            </p>
          )}

          {visibleModels.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
              {visibleModels.map((m) => {
                const on = enabled.includes(m);
                const probe = probes[m];
                return (
                  <div
                    key={m}
                    onClick={() => toggleModel(def.id, m)}
                    className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border text-xs font-mono cursor-pointer transition ${
                      on
                        ? 'border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-950/30'
                        : 'border-slate-200 dark:border-slate-700/60 opacity-60 hover:opacity-100'
                    }`}
                    title={probe?.msg ? `${m}\n${probe.msg}` : m}
                  >
                    <span
                      className={`w-2 h-2 rounded-full shrink-0 ${on ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                    />
                    <span className="flex-1 truncate">{m}</span>
                    {probe?.phase === 'ok' && (
                      <Check className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                    )}
                    {probe?.phase === 'error' && (
                      <X className="w-3.5 h-3.5 text-rose-500 shrink-0" />
                    )}
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleProbeModel(m);
                      }}
                      disabled={!activeKey || probe?.phase === 'testing'}
                      className="p-1 rounded text-slate-400 hover:text-amber-500 transition shrink-0 disabled:opacity-40"
                      title={t('cloud.testModel', 'Test this model (1-token probe)')}
                    >
                      {probe?.phase === 'testing' ? (
                        <span className="w-3.5 h-3.5 block rounded-full border-2 border-slate-300 border-t-amber-500 animate-spin" />
                      ) : (
                        <FlaskConical className="w-3.5 h-3.5" />
                      )}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        void handleCopyId(m);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-indigo-500 transition shrink-0"
                      title={t('cloud.copyId', 'Copy model id')}
                    >
                      {copied === m ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeKnownModel(def.id, m);
                      }}
                      className="p-1 rounded text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition shrink-0"
                      title={t('cloud.deleteModel', 'Remove model from list')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
          {known.length > 0 && visibleModels.length === 0 && (
            <p className="text-xs text-slate-400 italic text-center">
              {t('cloud.noMatch', 'No providers match your search.')}
            </p>
          )}

          {/* Manual add */}
          <div className="flex gap-2">
            <input
              value={newModel}
              onChange={(e) => setNewModel(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && newModel.trim()) {
                  addKnownModel(def.id, newModel.trim());
                  setNewModel('');
                }
              }}
              placeholder={t('cloud.modelPlaceholder', 'Add model id manually, e.g. openai/gpt-4o-mini')}
              dir="ltr"
              className="flex-1 min-w-0 p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/60 text-[11px] font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
            <button
              onClick={() => {
                if (newModel.trim()) {
                  addKnownModel(def.id, newModel.trim());
                  setNewModel('');
                }
              }}
              disabled={!newModel.trim()}
              className="flex items-center gap-1 px-3 py-2 text-[11px] font-semibold rounded-lg border border-dashed border-slate-300 dark:border-slate-600 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40 shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {t('cloud.addModel', 'Add Model')}
            </button>
          </div>

          {/* Suggested */}
          {def.suggestedModels && def.suggestedModels.length > 0 && (
            <div>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-1.5">
                {t('cloud.suggested', 'Suggested:')}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {def.suggestedModels
                  .filter((m) => !known.includes(m))
                  .map((m) => (
                    <button
                      key={m}
                      onClick={() => addKnownModel(def.id, m)}
                      className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-500 transition"
                      title={m}
                    >
                      <Plus className="w-3 h-3" />
                      <span className="max-w-[220px] truncate">{m}</span>
                    </button>
                  ))}
              </div>
            </div>
          )}
        </div>
      </section>

      {keyModal && (
        <AddKeyModal
          providerName={def.name}
          baseUrl={baseUrl}
          initialLabel={editingKey?.label ?? ''}
          initialKey={editingKey?.apiKey ?? ''}
          onClose={() => setKeyModal(null)}
          onSave={(label, apiKey) => {
            if (keyModal.mode === 'edit' && editingKey) {
              updateKey(editingKey.id, { label, apiKey, status: 'unknown', error: undefined });
            } else {
              addKey({
                id: createKeyId(),
                providerId: def.id,
                label,
                apiKey,
                enabled: true,
                status: 'unknown',
              });
            }
            setKeyModal(null);
          }}
        />
      )}
    </div>
  );
};

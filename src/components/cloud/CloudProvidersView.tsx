// src/components/cloud/CloudProvidersView.tsx
// 9Router-style providers page: custom endpoints + curated API-key catalog.
// Clicking a card opens its detail page (connections + models).
import React, { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Server, Search, Plus } from 'lucide-react';
import { CLOUD_CATALOG, CloudProviderDef, CustomProviderDef } from '../../data/cloudProviders';
import { useCloudStore } from '../../store/useCloudStore';
import { LLMService } from '../../services/llmService';
import { ProviderIcon } from './ProviderIcon';
import { ProviderDetailPage } from './ProviderDetailPage';

type AnyDef = (CloudProviderDef | CustomProviderDef) & { isCustom: boolean };

const slugify = (name: string): string =>
  `custom-${name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'endpoint'}`;

export const CloudProvidersView: React.FC = () => {
  const { t } = useTranslation();
  const { keys, customProviders, addCustomProvider, removeCustomProvider, updateKey, setKnownModels } =
    useCloudStore();

  const [search, setSearch] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [testingAll, setTestingAll] = useState(false);

  const q = search.trim().toLowerCase();
  const match = (d: AnyDef) => !q || d.name.toLowerCase().includes(q);

  const customDefs: AnyDef[] = useMemo(
    () => customProviders.map((d) => ({ ...d, isCustom: true })).filter(match),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customProviders, q]
  );
  const catalogDefs: AnyDef[] = useMemo(
    () => CLOUD_CATALOG.map((d) => ({ ...d, isCustom: false })).filter(match),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [q]
  );
  const freeDefs = useMemo(() => catalogDefs.filter((d) => d.freeTier), [catalogDefs]);
  const keyDefs = useMemo(() => catalogDefs.filter((d) => !d.freeTier), [catalogDefs]);
  const selectedDef: AnyDef | null =
    [...customProviders.map((d) => ({ ...d, isCustom: true as const })),
     ...CLOUD_CATALOG.map((d) => ({ ...d, isCustom: false as const }))]
      .find((d) => d.id === selectedId) ?? null;

  const healthyCount = keys.filter((k) => k.enabled && k.status === 'ok').length;

  const handleCreateCustom = () => {
    const name = newName.trim();
    const url = newUrl.trim().replace(/\/+$/, '');
    if (!name || !url) return;
    const id = slugify(name);
    addCustomProvider({
      id,
      name,
      defaultBaseUrl: url,
      protocol: 'openai-compatible',
      docsUrl: url,
      color: '#6366f1',
      initials: name.slice(0, 2).toUpperCase(),
      custom: true,
    });
    setNewName('');
    setNewUrl('');
    setShowAdd(false);
    setSelectedId(id);
  };

  const handleTestAll = async (defs: AnyDef[]) => {
    if (testingAll) return;
    const targets = defs.filter((d) => keys.some((k) => k.providerId === d.id && k.apiKey));
    if (targets.length === 0) return;
    setTestingAll(true);
    for (const d of targets) {
      const key = keys.find((k) => k.providerId === d.id && k.apiKey);
      if (!key) continue;
      // eslint-disable-next-line no-await-in-loop
      const result = await LLMService.testCloudConnection(d.defaultBaseUrl, key.apiKey);
      updateKey(key.id, {
        status: result.ok ? 'ok' : 'error',
        lastTested: new Date().toISOString(),
        error: result.error,
      });
      if (result.ok && result.models) setKnownModels(d.id, result.models);
    }
    setTestingAll(false);
  };

  const renderTestAll = (defs: AnyDef[]) => (
    <button
      onClick={() => void handleTestAll(defs)}
      disabled={testingAll || !defs.some((d) => keys.some((k) => k.providerId === d.id && k.apiKey))}
      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
    >
      {testingAll ? (
        <span className="w-3.5 h-3.5 rounded-full border-2 border-slate-300 border-t-indigo-500 animate-spin" />
      ) : (
        <span className="text-[10px]">▶</span>
      )}
      {testingAll ? t('cloud.testing', 'Testing…') : t('cloud.testAll', 'Test All')}
    </button>
  );

  const renderCard = (d: AnyDef) => {
    const conns = keys.filter((k) => k.providerId === d.id);
    const healthy = conns.filter((k) => k.enabled && k.status === 'ok').length;
    let statusClass = 'text-slate-400 dark:text-slate-500';
    let statusText = t('cloud.noConnections', 'No connections');
    if (conns.length > 0) {
      if (healthy > 0) {
        statusClass = 'text-emerald-600 dark:text-emerald-300';
        statusText = `● ${healthy} ${t('cloud.connectedCount', 'Connected', { count: healthy })}`;
      } else {
        statusClass = 'text-amber-600 dark:text-amber-300';
        statusText = `${conns.length} ${t('cloud.connections', 'connections')}`;
      }
    }
    return (
      <button
        key={d.id}
        onClick={() => setSelectedId(d.id)}
        className="flex items-center gap-3 p-3.5 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-500/60 hover:shadow-md transition text-start"
      >
        <ProviderIcon def={d} />
        <span className="min-w-0">
          <span className="block text-xs font-bold truncate">{d.name}</span>
          <span className={`block text-[11px] font-medium truncate ${statusClass}`}>{statusText}</span>
        </span>
      </button>
    );
  };

  if (selectedDef) {
    return (
      <ProviderDetailPage
        def={selectedDef}
        isCustom={selectedDef.isCustom}
        onBack={() => setSelectedId(null)}
        onDeleteCustom={
          selectedDef.isCustom
            ? (id) => {
                removeCustomProvider(id);
                setSelectedId(null);
              }
            : undefined
        }
      />
    );
  }

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <Server className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold">{t('cloud.title', 'Providers')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('cloud.subtitle', 'Manage your AI provider connections')}
              {healthyCount > 0 && (
                <span className="ms-2 font-mono text-emerald-600 dark:text-emerald-300">
                  ● {healthyCount} {t('cloud.connected', 'Connected')}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="relative">
          <Search className="absolute start-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('cloud.search', 'Search providers…')}
            className="text-xs ps-8 pe-3 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 w-52"
          />
        </div>
      </div>

      <p className="text-[11px] text-slate-400 dark:text-slate-500 -mt-3">
        {t('cloud.benchHint', 'Connections are saved here first — using cloud models in Bench and Test Suite comes next.')}
      </p>

      {/* Custom providers */}
      <section>
        <div className="flex items-center justify-between gap-2 mb-3 flex-wrap">
          <h3 className="text-sm font-bold">
            {t('cloud.customTitle', 'Custom Providers (OpenAI Compatible)')}
          </h3>
          <button
            onClick={() => setShowAdd(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-500 transition"
          >
            <Plus className="w-3.5 h-3.5" />
            {t('cloud.addOpenAI', 'Add OpenAI Compatible')}
          </button>
        </div>

        {showAdd && (
          <div className="mb-3 p-4 rounded-xl bg-white dark:bg-slate-900/60 border border-indigo-300 dark:border-indigo-500/50 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                  {t('cloud.providerName', 'Provider name')}
                </label>
                <input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="My local server"
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold mb-1 text-slate-600 dark:text-slate-300">
                  {t('cloud.baseUrl', 'Base URL')}
                </label>
                <input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="https://your-server.example.com/v1"
                  dir="ltr"
                  className="w-full p-2 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700 text-xs font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={() => setShowAdd(false)}
                className="px-3 py-1.5 text-xs rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
              >
                {t('cloud.cancel', 'Cancel')}
              </button>
              <button
                onClick={handleCreateCustom}
                disabled={!newName.trim() || !newUrl.trim()}
                className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
              >
                {t('cloud.create', 'Create')}
              </button>
            </div>
          </div>
        )}

        {customDefs.length === 0 && !showAdd ? (
          <div className="p-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-700 text-center text-xs text-slate-400 dark:text-slate-500">
            {t('cloud.noCustom', 'No custom providers — use the button above to add OpenAI-compatible endpoints.')}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {customDefs.map(renderCard)}
          </div>
        )}
      </section>

      {/* Free Tier */}
      {freeDefs.length > 0 && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold">{t('cloud.freeTitle', 'Free Tier Providers')}</h3>
            {renderTestAll(freeDefs)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {freeDefs.map(renderCard)}
          </div>
        </section>
      )}

      {/* API Key Providers */}
      {(keyDefs.length > 0 || q) && (
        <section>
          <div className="flex items-center justify-between gap-2 mb-3">
            <h3 className="text-sm font-bold">{t('cloud.catalogTitle', 'API Key Providers')}</h3>
            {renderTestAll(keyDefs)}
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
            {keyDefs.map(renderCard)}
          </div>
          {keyDefs.length === 0 && (
            <p className="text-xs text-slate-400 italic">{t('cloud.noMatch', 'No providers match your search.')}</p>
          )}
        </section>
      )}
    </div>
  );
};

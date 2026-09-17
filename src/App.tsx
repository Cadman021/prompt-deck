// src/App.tsx
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { LLMService } from './services/llmService';
import { OllamaModel, BenchmarkMetrics } from './types/ollama';
import { useSettingsStore } from './store/useSettingsStore';
import { HistorySidebar } from './components/HistorySidebar';
import { ModelColumn } from './components/ModelColumn';
import { generateMarkdownReport, copyHistoryAsJson, exportHistoryAsCsv } from './utils/exportUtils';
import { PromptPresets } from './components/PromptPresets';
import { DbService, HistoryRecord, BenchmarkResult } from './services/dbService';
import { BenchmarkChart } from './components/BenchmarkChart';
import { DiffView } from './components/DiffView';
import { Leaderboard } from './components/Leaderboard';
import { exportElementAsPdf } from './utils/pdfExport';
import { ReportPrintView } from './components/ReportPrintView';
import { AppSidebar, SidebarView } from './components/layout/AppSidebar';
import { TestSuiteView } from './components/testsuite/TestSuiteView';
import { TopBar } from './components/layout/TopBar';
import { ResultToolbar } from './components/layout/ResultToolbar';
import { SettingsPanel } from './components/layout/SettingsPanel';
import './i18n/config';
import {
  Play,
  Plus,
} from 'lucide-react';

const MAX_MODELS = 4;
const MIN_MODELS = 2;

interface Slot {
  id: string;
  model: string;
  output: string;
  metrics: BenchmarkMetrics | null;
  loading: boolean;
  error: string | null;
}

const createSlot = (model = ''): Slot => ({
  id: Math.random().toString(36).slice(2),
  model,
  output: '',
  metrics: null,
  loading: false,
  error: null,
});

export default function App() {
  const { t } = useTranslation();
  const { provider, baseUrl, advancedConfig, setAdvancedConfig } =
    useSettingsStore();

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  // Dynamic list of model comparison slots (2 to MAX_MODELS)
  const [slots, setSlots] = useState<Slot[]>([createSlot(), createSlot()]);
  const outputRefs = useRef<Record<string, string>>({});
  const metricsRefs = useRef<Record<string, BenchmarkMetrics | null>>({});
  const finishedRefs = useRef<Record<string, boolean>>({});
  const slotsRef = useRef<Slot[]>([]);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // Winner vote (model name) for the current comparison
  const [winnerModel, setWinnerModel] = useState<string | null>(null);
  // Diff view: pair of slot ids to compare, null = closed
  const [diffPair, setDiffPair] = useState<[string, string] | null>(null);

  // Current run's history id (set after the run is saved) so votes persist
  const savedRunIdRef = useRef<number | null>(null);

  const [copied, setCopied] = useState(false);
  const [jsonCopied, setJsonCopied] = useState(false);
  const [csvState, setCsvState] = useState<'idle' | 'exporting' | 'done' | 'empty'>('idle');
  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [pdfState, setPdfState] = useState<'idle' | 'exporting' | 'done'>('idle');
  const printRef = useRef<HTMLDivElement>(null);

  // App Shell navigation: 'bench'/'tests' are pages, the rest are overlay panels.
  const [activePage, setActivePage] = useState<'bench' | 'tests'>('bench');
  const activeView: SidebarView = isSettingsOpen
    ? 'settings'
    : isLeaderboardOpen
      ? 'leaderboard'
      : isSidebarOpen
        ? 'history'
        : activePage;

  const handleSidebarNavigate = (view: SidebarView) => {
    if (view === 'bench' || view === 'tests') {
      setActivePage(view);
      setIsSidebarOpen(false);
      setIsLeaderboardOpen(false);
      setIsSettingsOpen(false);
      return;
    }
    setIsSidebarOpen(view === 'history');
    setIsLeaderboardOpen(view === 'leaderboard');
    setIsSettingsOpen(view === 'settings');
  };

  const handleStopGeneration = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsLoading(false);
    setSlots((prev) =>
      prev.map((s) =>
        s.loading
          ? { ...s, loading: false, error: s.error ?? 'Stopped by user' }
          : s
      )
    );
    Object.keys(finishedRefs.current).forEach((id) => {
      finishedRefs.current[id] = true;
    });
  }, []);

  const handleCopyJson = async () => {
    const success = await copyHistoryAsJson();
    if (success) {
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    }
  };

  const handleExportCsv = async () => {
    if (csvState === 'exporting') return;
    setCsvState('exporting');
    const ok = await exportHistoryAsCsv();
    setCsvState(ok ? 'done' : 'empty');
    setTimeout(() => setCsvState('idle'), 2500);
  };

  const handleExportPdf = async () => {
    if (pdfState === 'exporting' || !printRef.current) return;
    setPdfState('exporting');
    try {
      await exportElementAsPdf(printRef.current);
      setPdfState('done');
      setTimeout(() => setPdfState('idle'), 2500);
    } catch (err) {
      console.error('PDF export failed:', err);
      setError('خطا در ساخت فایل PDF. لطفاً دوباره تلاش کنید.');
      setPdfState('idle');
    }
  };

  const handleCopyReport = async () => {
    if (!slots.some((s) => s.output)) return;
    const results: BenchmarkResult[] = slots.map((s) => ({
      model: s.model,
      output: s.output,
      tps: s.metrics?.tps || 0,
      ttft: s.metrics?.ttftMs || 0,
      tpsEstimated: s.metrics?.tpsEstimated,
      tokenSource: s.metrics?.tokenSource,
    }));
    const report = generateMarkdownReport({ prompt, results });
    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const data = await LLMService.getInstalledModels({ provider, baseUrl });
      setModels(data);
      if (data.length > 0) {
        setSlots((prev) =>
          prev.map((s, i) => ({ ...s, model: data[i]?.name || data[0].name }))
        );
      } else {
        setError(t('app.noModelsFound'));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : t('app.ollamaError'));
    } finally {
      setLoadingModels(false);
    }
  };

  useEffect(() => {
    loadModels();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider, baseUrl]);

  const handleAddModel = () => {
    if (slotsRef.current.length >= MAX_MODELS) return;
    const count = slotsRef.current.length;
    const nextModel = models[count % models.length]?.name || models[0]?.name || '';
    setSlots((prev) => [...prev, createSlot(nextModel)]);
  };

  const handleRemoveSlot = (id: string) => {
    if (slotsRef.current.length <= MIN_MODELS) return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  const handleVote = (model: string) => {
    const next = winnerModel === model ? null : model;
    setWinnerModel(next);
    // Persist the vote onto the saved run row when we know it.
    if (savedRunIdRef.current != null) {
      void DbService.setWinner(savedRunIdRef.current, next);
    } else {
      // Run may still be saving — retry attaching the vote shortly after.
      setTimeout(async () => {
        const history = await DbService.getHistory();
        const latest = history[0];
        if (latest?.id != null) {
          savedRunIdRef.current = latest.id;
          await DbService.setWinner(latest.id, next);
        }
      }, 1500);
    }
  };

  const handleSelectHistoryRecord = (record: HistoryRecord) => {
    setPrompt(record.prompt);
    setWinnerModel(record.winnerModel ?? null);
    setDiffPair(null);
    savedRunIdRef.current = record.id ?? null;
    setSlots(
      record.results.map((r) => ({
        ...createSlot(models.some((m) => m.name === r.model) ? r.model : ''),
        output: r.output,
        metrics: {
          tps: r.tps,
          ttftMs: r.ttft,
          totalDurationMs: 0,
          totalTokens: 0,
          tpsEstimated: r.tpsEstimated ?? false,
          tokenSource: r.tokenSource === 'heuristic' ? 'heuristic' : 'server',
        },
      }))
    );
  };

  /** Runs a single slot; shared by full runs and per-slot retry. */
  const runSlot = useCallback(
    (
      slot: Slot,
      currentPrompt: string,
      signal: AbortSignal,
      onSlotFinished: (id: string) => void
    ) => {
      if (!slot.model) {
        onSlotFinished(slot.id);
        return;
      }

      const options = {
        model: slot.model,
        prompt: currentPrompt,
        system: advancedConfig.system,
        temperature: advancedConfig.temperature,
        top_p: advancedConfig.top_p,
        num_ctx: advancedConfig.num_ctx,
      };

      LLMService.generateStream(
        { provider, baseUrl },
        options,
        {
          onChunk: (_, fullText) => {
            outputRefs.current[slot.id] = fullText;
            setSlots((prev) =>
              prev.map((s) => (s.id === slot.id ? { ...s, output: fullText } : s))
            );
          },
          onComplete: (_, metrics) => {
            metricsRefs.current[slot.id] = metrics;
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id ? { ...s, metrics, loading: false, error: null } : s
              )
            );
            onSlotFinished(slot.id);
          },
          onError: (err) => {
            // Abort-triggered errors arrive after Stop already finished the slot.
            if (signal.aborted) {
              onSlotFinished(slot.id);
              return;
            }
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id
                  ? { ...s, output: `Error: ${err.message}`, loading: false, error: err.message }
                  : s
              )
            );
            outputRefs.current[slot.id] = `Error: ${err.message}`;
            onSlotFinished(slot.id);
          },
        },
        signal
      );
    },
    [provider, baseUrl, advancedConfig]
  );

  const handleRunComparison = useCallback(() => {
    if (!prompt.trim() || isLoading) return;

    const currentPrompt = prompt;
    outputRefs.current = {};
    metricsRefs.current = {};
    savedRunIdRef.current = null;
    setWinnerModel(null);
    setDiffPair(null);

    const runnable = slotsRef.current.filter((s) => s.model);
    if (runnable.length === 0) return;

    setSlots((prev) => {
      finishedRefs.current = Object.fromEntries(prev.map((s) => [s.id, !s.model]));
      return prev.map((s) => ({ ...s, output: '', metrics: null, loading: true, error: null }));
    });
    setIsLoading(true);

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const finalizeRun = (): void => {
      const snapshot = slotsRef.current;
      const results: BenchmarkResult[] = snapshot.map((s) => ({
        model: s.model,
        output: outputRefs.current[s.id] || s.output || '',
        tps: metricsRefs.current[s.id]?.tps || 0,
        ttft: metricsRefs.current[s.id]?.ttftMs || 0,
        tpsEstimated: metricsRefs.current[s.id]?.tpsEstimated,
        tokenSource: metricsRefs.current[s.id]?.tokenSource,
      }));
      void DbService.saveHistory(currentPrompt, results).then(async () => {
        // Remember the new run id so a later vote updates the same row.
        const history = await DbService.getHistory();
        savedRunIdRef.current = history[0]?.id ?? null;
      });
    };

    let finalized = false;
    const markFinished = (id: string) => {
      finishedRefs.current[id] = true;
      if (!Object.values(finishedRefs.current).every(Boolean) || finalized) return;
      finalized = true;
      // All slots finished (success, error or stop) — finalize once.
      setIsLoading(false);
      // Read synchronously from refs instead of setState-inside-setState.
      finalizeRun();
    };

    // Defer stream startup so the reset render commits first.
    setTimeout(() => {
      runnable.forEach((slot) => runSlot(slot, currentPrompt, signal, markFinished));
    }, 0);
  }, [prompt, isLoading, runSlot]);

  /** Re-runs a single failed/stopped slot without touching the others. */
  const handleRetrySlot = (id: string) => {
    const slot = slotsRef.current.find((s) => s.id === id);
    if (!slot || !slot.model || slot.loading) return;
    if (!prompt.trim()) return;

    outputRefs.current[id] = '';
    metricsRefs.current[id] = null;
    finishedRefs.current[id] = false;
    setIsLoading(true);
    setSlots((prev) =>
      prev.map((s) => (s.id === id ? { ...s, output: '', metrics: null, error: null, loading: true } : s))
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    const markFinished = (slotId: string) => {
      finishedRefs.current[slotId] = true;
      if (Object.values(finishedRefs.current).every(Boolean)) setIsLoading(false);
    };
    runSlot({ ...slot, output: '', metrics: null, error: null, loading: true }, prompt, signal, markFinished);
  };

  // Keep refs to the latest handlers so the global shortcut never goes stale.
  const runHandlerRef = useRef(handleRunComparison);
  const stopHandlerRef = useRef(handleStopGeneration);
  useEffect(() => {
    runHandlerRef.current = handleRunComparison;
    stopHandlerRef.current = handleStopGeneration;
  }, [handleRunComparison, handleStopGeneration]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
      if (modEnter) {
        e.preventDefault();
        runHandlerRef.current();
        return;
      }
      if (e.key === 'Escape') {
        if (abortControllerRef.current) stopHandlerRef.current();
        else {
          setIsSidebarOpen(false);
          setIsLeaderboardOpen(false);
          setDiffPair(null);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const comparableSlots = slots.filter((s) => s.output && !s.error);
  const diffSlots: Slot[] =
    diffPair !== null
      ? [slots.find((s) => s.id === diffPair[0]), slots.find((s) => s.id === diffPair[1])].filter(
          (s): s is Slot => s !== undefined
        )
      : [];

  const canShowDiff = comparableSlots.length >= 2;

  const gridColsClass =
    slots.length === 2 ? 'grid-cols-2' : slots.length === 3 ? 'grid-cols-3' : 'grid-cols-2 lg:grid-cols-4';

  const hasOutput = slots.some((s) => s.output);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased overflow-hidden">
      <AppSidebar activeView={activeView} onNavigate={handleSidebarNavigate} />

      <HistorySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectRecord={handleSelectHistoryRecord}
      />
      <Leaderboard isOpen={isLeaderboardOpen} onClose={() => setIsLeaderboardOpen(false)} />
      <SettingsPanel
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        advancedConfig={advancedConfig}
        onAdvancedChange={setAdvancedConfig}
      />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar
          modelsCount={models.length}
          loadingModels={loadingModels}
          onRefresh={loadModels}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {activePage === 'bench' && (
        <ResultToolbar
          hasOutput={hasOutput}
          canShowDiff={canShowDiff}
          diffActive={diffPair !== null}
          onToggleDiff={() => {
            setDiffPair(diffPair ? null : [comparableSlots[0].id, comparableSlots[1].id]);
          }}
          copied={copied}
          onCopyReport={handleCopyReport}
          pdfState={pdfState}
          onExportPdf={handleExportPdf}
          jsonCopied={jsonCopied}
          onCopyJson={handleCopyJson}
          csvState={csvState}
          onExportCsv={handleExportCsv}
          slotsLabel={`${slots.length}/${MAX_MODELS} models`}
        />
        )}

        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-xs text-rose-500 flex justify-between items-center shrink-0">
            <span>
              {error}
              {error === t('app.noModelsFound') && (
                <span className="ms-2 font-mono opacity-90">
                  ({provider === 'openai-compatible' ? t('app.noModelsHintLMStudio') : t('app.noModelsHintOllama')})
                </span>
              )}
            </span>
          </div>
        )}

        {activePage === 'tests' ? (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <TestSuiteView models={models} />
          </div>
        ) : (
        <>
        {/* Scrollable workspace — model outputs get max height now */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          <main className={`grid ${gridColsClass} gap-3 p-3 min-h-[320px]`}>
            {slots.map((slot, index) => (
              <ModelColumn
                key={slot.id}
                index={index}
                models={models}
                selectedModel={slot.model}
                output={slot.output}
                metrics={slot.metrics}
                error={slot.error}
                canRemove={slots.length > MIN_MODELS}
                isWinner={winnerModel !== null && winnerModel === slot.model && slot.model !== ''}
                onModelChange={(name) =>
                  setSlots((prev) => prev.map((s) => (s.id === slot.id ? { ...s, model: name } : s)))
                }
                onRemove={() => handleRemoveSlot(slot.id)}
                onRetry={() => handleRetrySlot(slot.id)}
                onVote={() => handleVote(slot.model)}
              />
            ))}
          </main>

          {diffPair && diffSlots.length === 2 && (
            <div className="px-3 pb-2">
              <DiffView
                leftName={diffSlots[0].model}
                rightName={diffSlots[1].model}
                leftText={diffSlots[0].output}
                rightText={diffSlots[1].output}
                onClose={() => setDiffPair(null)}
                onPairChange={(a, b) => {
                  const left = comparableSlots[a] ?? comparableSlots[0];
                  const right = comparableSlots[b] ?? comparableSlots[1];
                  if (left && right) setDiffPair([left.id, right.id]);
                }}
                pairIndex={[
                  comparableSlots.findIndex((s) => s.id === diffSlots[0].id),
                  comparableSlots.findIndex((s) => s.id === diffSlots[1].id),
                ]}
                pairCount={comparableSlots.length}
              />
            </div>
          )}

          {slots.every((s) => s.metrics) && slots[0]?.metrics && (
            <div className="px-3 pb-2">
              <BenchmarkChart
                entries={slots.map((s) => ({ name: s.model, metrics: s.metrics! }))}
              />
            </div>
          )}

          <div className="px-3 pb-3 flex justify-center">
            <button
              onClick={handleAddModel}
              disabled={slots.length >= MAX_MODELS || models.length === 0}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add model ({slots.length}/{MAX_MODELS})</span>
            </button>
          </div>
        </div>

        {/* Prompt dock */}
        <div className="shrink-0 px-3 pt-1">
          <PromptPresets currentPrompt={prompt} onSelect={(p) => setPrompt(p)} disabled={isLoading} />
        </div>

        <footer className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
          <div className="flex gap-2.5 max-w-5xl mx-auto items-stretch">
            <div className="flex-1 flex flex-col gap-1 min-w-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-400 transition px-3 py-2">
              <textarea
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={isLoading}
                rows={2}
                placeholder={t('app.promptPlaceholder')}
                className="w-full bg-transparent resize-none text-sm focus:outline-none placeholder:text-slate-400"
              />
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono">
                {t('app.runHint')}
              </span>
            </div>
            {isLoading ? (
              <button
                onClick={handleStopGeneration}
                className="px-5 rounded-xl bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-sm shrink-0"
              >
                <span className="w-2 h-2 rounded-full bg-white animate-ping" />
                {t('app.stop')}
              </button>
            ) : (
              <button
                onClick={handleRunComparison}
                disabled={slots.some((s) => s.loading) || !prompt.trim()}
                className="flex flex-col items-center justify-center gap-1 px-6 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl transition disabled:opacity-50 font-medium text-xs shrink-0 shadow-sm"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>{slots.some((s) => s.loading) ? t('app.running') : t('app.run')}</span>
              </button>
            )}
          </div>
        </footer>
        </>
        )}
      </div>

      {/* Hidden report source for PDF export (html2canvas captures this) */}
      <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }}>
        <ReportPrintView
          ref={printRef}
          prompt={prompt}
          results={slots.map((s) => ({
            model: s.model,
            output: s.output,
            tps: s.metrics?.tps || 0,
            ttft: s.metrics?.ttftMs || 0,
            tpsEstimated: s.metrics?.tpsEstimated,
            tokenSource: s.metrics?.tokenSource,
          }))}
        />
      </div>
    </div>
  );
}

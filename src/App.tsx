// src/App.tsx
import React, { Suspense, lazy, useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { LLMService } from './services/llmService';
import { OllamaModel, BenchmarkMetrics, GenerationOverrides, hasOverrides } from './types/ollama';
import { useSettingsStore } from './store/useSettingsStore';
import { useCloudStore } from './store/useCloudStore';
import { APP_VERSION } from './version';
import {
  ModelSource,
  buildCloudGroups,
  calcCost,
  formatCost,
  parseQualified,
  qualifiedName,
} from './services/modelTarget';
import { resolveRunEndpoint, runRepeatedStream } from './services/runTarget';
import { ModelColumn } from './components/ModelColumn';
import { generateMarkdownReport } from './utils/exportUtils';
import { safeHost } from './utils/httpError';
import { formatDurationMs } from './utils/timeUtils';
import { rafBatch } from './utils/rafBatch';
import { parseRunConfig } from './utils/runConfig';
import { PromptPresets } from './components/PromptPresets';
import { DbService, HistoryRecord, BenchmarkResult } from './services/dbService';
import { exportElementAsPdf, exportReportAsPdfText, needsImageFallback } from './utils/pdfExport';
import { exportElementAsPng } from './utils/shareCard';
import { playCue, type Cue } from './utils/sound';
import { notify, shouldNotify } from './utils/notify';
import { ReportPrintView } from './components/ReportPrintView';
import { AppSidebar, SidebarView } from './components/layout/AppSidebar';
import { TopBar } from './components/layout/TopBar';
import { UpdaterPrompt } from './components/UpdaterPrompt';
import { JudgePanel } from './components/JudgePanel';
import { ResultToolbar } from './components/layout/ResultToolbar';
// Eager on purpose: the share card is captured 50ms after it mounts, so a
// lazy chunk could still be loading when the ref is read. It carries no
// heavy dependencies (html2canvas loads on demand in utils/shareCard).
import { ShareCard } from './components/ShareCard';
import { Toaster } from './components/Toaster';
import { OnboardingCard } from './components/OnboardingCard';
import { toast } from './store/useToastStore';
import './i18n/config';
import { Play, Plus, Eye, EyeOff, Zap, Clock, DollarSign, Activity } from 'lucide-react';

// Heavy or rarely-opened views are code-split so the Bench path stays small.
const HistorySidebar = lazy(() =>
  import('./components/HistorySidebar').then((m) => ({ default: m.HistorySidebar }))
);
const Leaderboard = lazy(() =>
  import('./components/Leaderboard').then((m) => ({ default: m.Leaderboard }))
);
const ContextSweep = lazy(() =>
  import('./components/ContextSweep').then((m) => ({ default: m.ContextSweep }))
);
const SettingsPanel = lazy(() =>
  import('./components/layout/SettingsPanel').then((m) => ({ default: m.SettingsPanel }))
);
const DiffView = lazy(() => import('./components/DiffView').then((m) => ({ default: m.DiffView })));
const BenchmarkChart = lazy(() =>
  import('./components/BenchmarkChart').then((m) => ({ default: m.BenchmarkChart }))
);
const TestSuiteView = lazy(() =>
  import('./components/testsuite/TestSuiteView').then((m) => ({ default: m.TestSuiteView }))
);
const CloudProvidersView = lazy(() =>
  import('./components/cloud/CloudProvidersView').then((m) => ({ default: m.CloudProvidersView }))
);
const RaceView = lazy(() => import('./components/RaceView').then((m) => ({ default: m.RaceView })));
const SpendView = lazy(() =>
  import('./components/SpendView').then((m) => ({ default: m.SpendView }))
);
const TrendView = lazy(() =>
  import('./components/TrendView').then((m) => ({ default: m.TrendView }))
);

const MAX_MODELS = 4;
const MIN_MODELS = 2;

interface Slot {
  id: string;
  /** Raw model id (without cloud prefix). */
  model: string;
  source: ModelSource;
  output: string;
  /** Thinking trace (`reasoning_content`); shown collapsible, not scored. */
  reasoning: string;
  metrics: BenchmarkMetrics | null;
  loading: boolean;
  error: string | null;
  /** When this slot's stream began (ms epoch) — drives the cold-start timer. */
  startedAt?: number | null;
  /** When the first token arrived (ms epoch); null until then. */
  firstTokenAt?: number | null;
  /** Per-model generation overrides; unset fields fall back to Advanced settings. */
  params?: GenerationOverrides;
}

const createSlot = (model = '', source: ModelSource = { kind: 'local' }): Slot => ({
  id: Math.random().toString(36).slice(2),
  model,
  source,
  output: '',
  reasoning: '',
  metrics: null,
  loading: false,
  error: null,
  startedAt: null,
  firstTokenAt: null,
});

/** Storage/display name: `providerId/model` for cloud, plain id for local. */
const slotQualified = (s: Pick<Slot, 'source' | 'model'>): string =>
  qualifiedName(s.source, s.model);

/** The `run_config` JSON snapshot is parsed by `parseRunConfig` (utils/runConfig). */

/** Last path segment of a qualified name — display only. */
const shortModel = (name: string): string => {
  const parts = name.split('/');
  return parts[parts.length - 1];
};

/** Blind voting toggle: enabling hides identities AND shuffles columns, so no
 * positional knowledge survives; voting reveals again. Disabled mid-run. */
const BlindToggle: React.FC<{
  disabled: boolean;
  onEnable: () => void;
  onDisable: () => void;
}> = ({ disabled, onEnable, onDisable }) => {
  const { t } = useTranslation();
  const blindMode = useSettingsStore((s) => s.blindMode);
  return (
    <button
      onClick={() => (blindMode ? onDisable() : onEnable())}
      disabled={disabled}
      title={t('bench.blindTitle', 'Blind mode: identities hidden for unbiased voting')}
      className={`flex items-center gap-1 px-2 py-1 text-nano font-mono rounded-lg border transition shrink-0 disabled:opacity-50 ${
        blindMode
          ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-slate-800 dark:border-slate-100 font-bold'
          : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-transparent hover:text-slate-700 dark:hover:text-slate-200'
      }`}
    >
      {blindMode ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
      {t('bench.blind', 'Blind')}
    </button>
  );
};

/** Parallel streams everything at once; sequential runs one slot at a time
 * so local models don't fight over the same GPU/server (cleaner numbers). */
const RunModeToggle: React.FC = () => {
  const { t } = useTranslation();
  const runMode = useSettingsStore((s) => s.runMode);
  const setRunMode = useSettingsStore((s) => s.setRunMode);
  const base = 'px-2 py-0.5 text-nano font-mono rounded-md transition';
  return (
    <div
      className="flex items-center gap-0.5 p-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 shrink-0"
      title={t('app.runModeHint', 'Sequential runs one model at a time (cleaner local numbers)')}
    >
      <button
        onClick={() => setRunMode('parallel')}
        className={`${base} ${
          runMode === 'parallel'
            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
      >
        {t('app.runModeParallel', 'Parallel')}
      </button>
      <button
        onClick={() => setRunMode('sequential')}
        className={`${base} ${
          runMode === 'sequential'
            ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-300 shadow-sm font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
        }`}
      >
        {t('app.runModeSequential', 'Sequential')}
      </button>
    </div>
  );
};

export default function App() {
  const { t } = useTranslation();
  const { provider, baseUrl, advancedConfig, setAdvancedConfig, setProvider, setBaseUrl } =
    useSettingsStore();
  const blindMode = useSettingsStore((s) => s.blindMode);
  const setBlindMode = useSettingsStore((s) => s.setBlindMode);
  const blindLabelFor = (index: number): string =>
    t('bench.blindName', 'Model {{letter}}', { letter: String.fromCharCode(65 + index) });

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isSweepOpen, setIsSweepOpen] = useState(false);
  // Race view: the live timing board shown above the columns. A view toggle,
  // not a setting — it changes what you watch during a run, not what runs.
  const [raceMode, setRaceMode] = useState(false);

  // Dynamic list of model comparison slots (2 to MAX_MODELS)
  const [slots, setSlots] = useState<Slot[]>([createSlot(), createSlot()]);

  // Cloud models the user enabled on the Cloud page, grouped per provider.
  const cloudEnabledModels = useCloudStore((s) => s.enabledModels);
  const cloudCustom = useCloudStore((s) => s.customProviders);
  const cloudPricing = useCloudStore((s) => s.modelPricing);

  /** Raw run cost in USD for priced cloud slots, else null. */
  const costFor = (
    s: Pick<Slot, 'source' | 'model'>,
    m: BenchmarkMetrics | null
  ): number | null => {
    if (s.source.kind !== 'cloud' || !m || m.tokenSource !== 'server') return null;
    return calcCost(
      m.promptTokens,
      m.completionTokens,
      (cloudPricing[s.source.providerId] ?? {})[s.model]
    );
  };

  /** Formatted run cost for display, else null. */
  const slotCost = (
    s: Pick<Slot, 'source' | 'model'>,
    m: BenchmarkMetrics | null
  ): string | null => {
    const cost = costFor(s, m);
    return cost == null ? null : formatCost(cost);
  };
  const cloudGroups = useMemo(
    () => buildCloudGroups(cloudCustom, cloudEnabledModels),
    [cloudCustom, cloudEnabledModels]
  );
  const outputRefs = useRef<Record<string, string>>({});
  const reasoningRefs = useRef<Record<string, string>>({});
  const metricsRefs = useRef<Record<string, BenchmarkMetrics | null>>({});
  const finishedRefs = useRef<Record<string, boolean>>({});
  const slotsRef = useRef<Slot[]>([]);
  const promptRef = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    slotsRef.current = slots;
  }, [slots]);

  // Winner vote (model name) for the current comparison
  const [winnerModel, setWinnerModel] = useState<string | null>(null);
  // Diff view: pair of slot ids to compare, null = closed
  const [diffPair, setDiffPair] = useState<[string, string] | null>(null);

  // Current run's history id (set after the run is saved) so votes persist
  const savedRunIdRef = useRef<number | null>(null);

  const [isLoading, setIsLoading] = useState(false);
  const [onboardingDismissed, setOnboardingDismissed] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [pdfState, setPdfState] = useState<'idle' | 'exporting' | 'done'>('idle');
  const printRef = useRef<HTMLDivElement>(null);

  // Share card: same mount-on-demand trick as the PDF source, so the fixed
  // 540px card never participates in layout or re-renders during streaming.
  const [shareState, setShareState] = useState<'idle' | 'exporting'>('idle');
  const [shareMounted, setShareMounted] = useState(false);
  const shareRef = useRef<HTMLDivElement>(null);

  // App Shell navigation: 'bench'/'tests'/'cloud' are pages, the rest are overlay panels.
  const [activePage, setActivePage] = useState<'bench' | 'tests' | 'cloud' | 'spend' | 'trend'>(
    'bench'
  );
  const activeView: SidebarView = isSettingsOpen
    ? 'settings'
    : isLeaderboardOpen
      ? 'leaderboard'
      : isSidebarOpen
        ? 'history'
        : activePage;

  const handleSidebarNavigate = (view: SidebarView) => {
    if (
      view === 'bench' ||
      view === 'tests' ||
      view === 'cloud' ||
      view === 'spend' ||
      view === 'trend'
    ) {
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
          ? { ...s, loading: false, error: s.error ?? t('app.stoppedByUser', 'Stopped by user') }
          : s
      )
    );
    Object.keys(finishedRefs.current).forEach((id) => {
      finishedRefs.current[id] = true;
    });
  }, [t]);

  // --- Run announcements ---------------------------------------------------
  // Sound and desktop notifications. Both read the store at call time rather
  // than from the render closure: a run can finish long after the render that
  // started it, and the user may have toggled sound off in between.

  const announceCue = useCallback((cue: Cue) => {
    const { alerts } = useSettingsStore.getState();
    playCue(cue, alerts.volume, alerts.sound);
  }, []);

  /**
   * Called once per finished run. Picks the cue from how the run actually
   * went — an all-error run gets the falling tone, not the success one.
   */
  const announceFinished = useCallback(
    (modelCount: number) => {
      const { alerts } = useSettingsStore.getState();
      const finished = slotsRef.current.filter((s) => s.model);
      const ok = finished.filter((s) => s.metrics && !s.error);
      const failed = finished.length - ok.length;

      if (ok.length === 0) {
        playCue('error', alerts.volume, alerts.sound);
      } else {
        playCue('runFinish', alerts.volume, alerts.sound);
      }

      if (!alerts.notify || !shouldNotify()) return;

      // Name the winner when one is clearly fastest; otherwise just report
      // the shape of the run. Kept short — a notification is a headline.
      const fastest =
        ok.length > 1
          ? ok.reduce((a, b) => ((b.metrics?.tps ?? 0) > (a.metrics?.tps ?? 0) ? b : a))
          : ok[0];
      const winner = fastest?.metrics
        ? `${shortModel(slotQualified(fastest)).split(':')[0]} · ${fastest.metrics.tps} tok/s`
        : '';

      const body =
        failed > 0
          ? t(
              'notify.bodyPartial',
              '{{ok}} of {{total}} models finished, {{failed}} failed. {{winner}}',
              {
                ok: ok.length,
                total: modelCount,
                failed,
                winner,
              }
            )
          : t('notify.body', '{{count}} models finished. {{winner}}', {
              count: ok.length,
              winner,
            });

      void notify({
        title: t('notify.title', 'Benchmark finished'),
        body: body.trim(),
      });
    },
    [t]
  );

  // The hidden PDF source mounts only for the duration of an export — it
  // used to live mounted (re-rendering on every stream chunk for nothing).
  const [printMounted, setPrintMounted] = useState(false);

  const buildPdfResults = () => {
    const cloud = useCloudStore.getState();
    return slots.map((s) => ({
      model: slotQualified(s),
      output: s.output,
      tps: s.metrics?.tps || 0,
      ttft: s.metrics?.ttftMs || 0,
      tpsEstimated: s.metrics?.tpsEstimated,
      tokenSource: s.metrics?.tokenSource,
      promptTokens: s.metrics?.promptTokens ?? null,
      completionTokens: s.metrics?.completionTokens ?? null,
      reasoning: reasoningRefs.current[s.id]?.trim() ? reasoningRefs.current[s.id] : null,
      costUsd:
        s.source.kind === 'cloud' && s.metrics?.tokenSource === 'server'
          ? calcCost(
              s.metrics.promptTokens,
              s.metrics.completionTokens,
              (cloud.modelPricing[s.source.providerId] ?? {})[s.model]
            )
          : null,
    }));
  };

  const handleExportPdf = () => {
    if (pdfState === 'exporting') return;
    const results = buildPdfResults();
    // Selectable-text PDF for Latin content; image fallback preserves
    // Persian/CJK/Cyrillic/emoji rendering (jsPDF fonts lack those glyphs).
    if (!needsImageFallback(prompt, results)) {
      setPdfState('exporting');
      const reasoningByModel: Record<string, string> = {};
      for (const s of slots) {
        if (s.reasoning?.trim()) reasoningByModel[slotQualified(s)] = s.reasoning;
      }
      void exportReportAsPdfText(prompt, results, reasoningByModel).then(
        () => {
          setPdfState('done');
          setTimeout(() => setPdfState('idle'), 2500);
        },
        (err: unknown) => {
          console.error('PDF export failed:', err);
          setError(t('app.pdfError', 'Failed to build the PDF file. Please try again.'));
          setPdfState('idle');
        }
      );
      return;
    }
    setPdfState('exporting');
    setPrintMounted(true);
  };

  useEffect(() => {
    if (!printMounted || pdfState !== 'exporting') return;
    // Wait a tick so the freshly mounted source commits before capture.
    const timer = setTimeout(() => {
      const el = printRef.current;
      if (!el) {
        setPdfState('idle');
        setPrintMounted(false);
        return;
      }
      void exportElementAsPdf(el).then(
        () => {
          setPdfState('done');
          setTimeout(() => {
            setPdfState('idle');
            setPrintMounted(false);
          }, 2500);
        },
        (err: unknown) => {
          console.error('PDF export failed:', err);
          setError(t('app.pdfError', 'Failed to build the PDF file. Please try again.'));
          setPdfState('idle');
          setPrintMounted(false);
        }
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [printMounted, pdfState, t]);

  // Capture the share card once it has mounted and painted.
  useEffect(() => {
    if (!shareMounted || shareState !== 'exporting') return;
    const timer = setTimeout(() => {
      const el = shareRef.current;
      if (!el) {
        setShareState('idle');
        setShareMounted(false);
        return;
      }
      void exportElementAsPng(el).then(
        () => {
          toast(t('share.done', 'Share card saved as PNG'), 'success');
          setShareState('idle');
          setShareMounted(false);
        },
        (err: unknown) => {
          console.error('Share card export failed:', err);
          toast(t('share.failed', 'Could not build the share card.'), 'error');
          setShareState('idle');
          setShareMounted(false);
        }
      );
    }, 50);
    return () => clearTimeout(timer);
  }, [shareMounted, shareState, t]);

  const handleExportShareCard = () => {
    if (shareState === 'exporting' || !hasShareableRun) return;
    setShareState('exporting');
    setShareMounted(true);
  };

  const handleCopyReport = async () => {
    if (!slots.some((s) => s.output)) return;
    const cloud = useCloudStore.getState();
    const results: BenchmarkResult[] = slots.map((s) => ({
      model: slotQualified(s),
      output: s.output,
      source: s.source.kind,
      providerId: s.source.kind === 'cloud' ? s.source.providerId : null,
      tps: s.metrics?.tps || 0,
      ttft: s.metrics?.ttftMs || 0,
      tpsEstimated: s.metrics?.tpsEstimated,
      tokenSource: s.metrics?.tokenSource,
      promptTokens: s.metrics?.promptTokens ?? null,
      completionTokens: s.metrics?.completionTokens ?? null,
      reasoning: reasoningRefs.current[s.id]?.trim() ? reasoningRefs.current[s.id] : null,
      costUsd:
        s.source.kind === 'cloud' && s.metrics?.tokenSource === 'server'
          ? calcCost(
              s.metrics.promptTokens,
              s.metrics.completionTokens,
              (cloud.modelPricing[s.source.providerId] ?? {})[s.model]
            )
          : null,
    }));
    const report = generateMarkdownReport({ prompt, results });
    await navigator.clipboard.writeText(report);
    toast(t('app.copyReportDone'), 'success');
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const data = await LLMService.getInstalledModels({ provider, baseUrl });
      setModels(data);
      if (data.length > 0) {
        // Only local slots get (re)assigned — cloud slots keep the user's
        // explicit choice, which a provider refresh must never clobber.
        let localIdx = 0;
        setSlots((prev) =>
          prev.map((s) => {
            if (s.source.kind === 'cloud') return s;
            const name = data[localIdx % data.length].name;
            localIdx += 1;
            return { ...s, model: name };
          })
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

  const hasAnySource = models.length > 0 || cloudGroups.length > 0;

  const handleAddModel = () => {
    if (slotsRef.current.length >= MAX_MODELS) return;
    // Prefer local models; fall back to the first enabled cloud model so the
    // button also works when only cloud sources are selected.
    if (models.length > 0) {
      const count = slotsRef.current.length;
      const nextModel = models[count % models.length]?.name || models[0]?.name || '';
      setSlots((prev) => [...prev, createSlot(nextModel)]);
      return;
    }
    const group = cloudGroups[0];
    const cloudModel = group?.models[0] || '';
    if (!group || !cloudModel) return;
    setSlots((prev) => [
      ...prev,
      createSlot(cloudModel, { kind: 'cloud', providerId: group.providerId }),
    ]);
  };

  const handleRemoveSlot = (id: string) => {
    if (slotsRef.current.length <= MIN_MODELS) return;
    setSlots((prev) => prev.filter((s) => s.id !== id));
  };

  /** Fisher-Yates shuffle of column order (blind mode: positions carry no meaning). */
  const shuffleSlots = useCallback(() => {
    const next = [...slotsRef.current];
    for (let i = next.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [next[i], next[j]] = [next[j], next[i]];
    }
    slotsRef.current = next;
    setSlots(next);
  }, []);

  const handleVote = (model: string) => {
    const next = winnerModel === model ? null : model;
    setWinnerModel(next);
    // Voting ends the blind round: reveal identities.
    if (blindMode) setBlindMode(false);
    // Persist the vote onto the saved run row when we know it.
    // savedRunIdRef is set from the insert's lastInsertId, so a missing id
    // only means the run hasn't been saved yet (still running / failed save)
    // — in that case the vote simply stays local for this session.
    if (savedRunIdRef.current != null) {
      void DbService.setWinner(savedRunIdRef.current, next);
    }
  };

  /**
   * Rebuilds the columns for a saved run and restores the sampling settings
   * that produced it (global Advanced config + per-model overrides), so the
   * restored view — and a re-run — reproduces the original conditions.
   */
  const restoreHistoryRecord = (record: HistoryRecord): Slot[] => {
    const cfg = parseRunConfig(record.runConfig);
    const next = { ...advancedConfig };
    if (cfg.system !== undefined) next.system = cfg.system;
    if (cfg.temperature !== undefined) next.temperature = cfg.temperature;
    if (cfg.top_p !== undefined) next.top_p = cfg.top_p;
    if (cfg.num_ctx !== undefined) next.num_ctx = cfg.num_ctx;
    if (cfg.serverDefaults !== undefined) next.serverDefaults = cfg.serverDefaults;
    if (cfg.seed !== undefined) next.seed = cfg.seed;
    if (cfg.maxTokens !== undefined) next.maxTokens = cfg.maxTokens;
    if (cfg.repeats !== undefined) next.repeats = cfg.repeats;
    setAdvancedConfig(next);

    setPrompt(record.prompt);
    setWinnerModel(record.winnerModel ?? null);
    setDiffPair(null);
    savedRunIdRef.current = record.id ?? null;

    return record.results.map((r) => {
      // Explicit source wins (stored since the source/provider_id columns
      // landed); otherwise fall back to qualified-name parsing for legacy rows.
      let parsed: { source: ModelSource; model: string };
      if (r.source === 'cloud' && r.providerId) {
        const prefix = `cloud:${r.providerId}/`;
        parsed = {
          source: { kind: 'cloud', providerId: r.providerId },
          model: r.model.startsWith(prefix) ? r.model.slice(prefix.length) : r.model,
        };
      } else if (r.source === 'local') {
        parsed = { source: { kind: 'local' }, model: r.model };
      } else {
        parsed = parseQualified(r.model, cloudCustom);
      }
      const knownLocal =
        parsed.source.kind === 'local' && models.some((m) => m.name === parsed.model);
      const savedParams = cfg.slotParams?.[r.model];
      return {
        ...createSlot(
          knownLocal || parsed.source.kind === 'cloud' ? parsed.model : '',
          parsed.source
        ),
        output: r.output,
        reasoning: r.reasoning || '',
        params: savedParams && hasOverrides(savedParams) ? { ...savedParams } : undefined,
        metrics: {
          tps: r.tps,
          ttftMs: r.ttft,
          totalDurationMs: 0,
          totalTokens: (r.promptTokens ?? 0) + (r.completionTokens ?? 0),
          tpsEstimated: r.tpsEstimated ?? false,
          tokenSource: r.tokenSource === 'heuristic' ? 'heuristic' : 'server',
          promptTokens: r.promptTokens ?? undefined,
          completionTokens: r.completionTokens ?? undefined,
          // Restored as-null when the row predates ITL measurement.
          itlMs: r.itlMs ?? undefined,
          itlP95Ms: r.itlP95Ms ?? undefined,
          itlEstimated: r.itlEstimated,
        },
      };
    });
  };

  const handleSelectHistoryRecord = (record: HistoryRecord) => {
    const restored = restoreHistoryRecord(record);
    slotsRef.current = restored;
    setSlots(restored);
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

      // Read settings at call time (not from the render closure): History's
      // "Re-run" updates the store and starts a run in the same tick, so a
      // captured config would still be the previous one.
      const settings = useSettingsStore.getState();
      const adv = settings.advancedConfig;

      // Resolve the endpoint: local settings or a stored cloud API key.
      const resolved = resolveRunEndpoint(slot.source, slot.model, {
        provider: settings.provider,
        baseUrl: settings.baseUrl,
      });
      if ('error' in resolved) {
        const msg =
          resolved.error === 'noCloudKey'
            ? t(
                'bench.noCloudKey',
                'No enabled API key for this cloud provider — add one on the Cloud page.'
              )
            : resolved.error === 'missingUrlVar'
              ? t(
                  'bench.missingUrlVar',
                  'This provider needs extra connection details (e.g. Cloudflare Account ID) — set them when adding the key.'
                )
              : t('bench.unknownProvider', 'Unknown cloud provider.');
        setSlots((prev) =>
          prev.map((s) =>
            s.id === slot.id ? { ...s, output: `Error: ${msg}`, loading: false, error: msg } : s
          )
        );
        onSlotFinished(slot.id);
        return;
      }

      // Per-model overrides win over the global Advanced settings. A slot with
      // no override keeps the existing `serverDefaults` behaviour unchanged.
      const ov = slot.params;
      const overridden = hasOverrides(ov);
      const useServerDefaults = !!adv.serverDefaults && !overridden;
      const options = {
        model: resolved.run.model,
        prompt: currentPrompt,
        system: adv.system,
        temperature: useServerDefaults ? undefined : (ov?.temperature ?? adv.temperature),
        top_p: useServerDefaults ? undefined : (ov?.top_p ?? adv.top_p),
        num_ctx: useServerDefaults ? undefined : (ov?.num_ctx ?? adv.num_ctx),
        serverDefaults: useServerDefaults,
        seed: adv.seed,
        maxTokens: ov?.maxTokens ?? adv.maxTokens,
      };

      runRepeatedStream(resolved.run.config, options, signal, adv.repeats ?? 1, {
        onChunk: (fullText) => {
          outputRefs.current[slot.id] = fullText;
          // One render per frame max — refs stay exact, paint stays cheap.
          rafBatch(slot.id, () => {
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id ? { ...s, output: outputRefs.current[slot.id] } : s
              )
            );
          });
        },
        onReasoning: (fullReasoning) => {
          reasoningRefs.current[slot.id] = fullReasoning;
          rafBatch(`${slot.id}:reasoning`, () => {
            setSlots((prev) =>
              prev.map((s) => (s.id === slot.id ? { ...s, reasoning: fullReasoning } : s))
            );
          });
        },
        onFirstToken: () => {
          // First repeat only — later repeats must not reset the phase timer.
          setSlots((prev) =>
            prev.map((s) =>
              s.id === slot.id && s.firstTokenAt == null ? { ...s, firstTokenAt: Date.now() } : s
            )
          );
        },
        onDone: (_output, metrics, error, aborted) => {
          // Abort-triggered endings arrive after Stop already finished the slot.
          if (aborted) {
            onSlotFinished(slot.id);
            return;
          }
          if (error || !metrics) {
            const msg = error ?? 'Empty response.';
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id ? { ...s, output: `Error: ${msg}`, loading: false, error: msg } : s
              )
            );
            outputRefs.current[slot.id] = `Error: ${msg}`;
          } else {
            metricsRefs.current[slot.id] = metrics;
            setSlots((prev) =>
              prev.map((s) =>
                s.id === slot.id ? { ...s, metrics, loading: false, error: null } : s
              )
            );
          }
          onSlotFinished(slot.id);
        },
      });
    },
    [t]
  );

  /**
   * Starts a run. Called by the Run button (current prompt + columns) and by
   * History's "Re-run" (explicit prompt + restored columns), which is why the
   * inputs can be passed in instead of read from state.
   */
  const startRun = useCallback(
    (override?: { prompt: string; slots: Slot[] }) => {
      const promptText = (override?.prompt ?? prompt).trim();
      if (!promptText || isLoading) return;

      if (override) {
        // Restored columns are authoritative for this run — the state update
        // that renders them lands in the same batch, so write the ref now or
        // `runnable` below would still see the previous columns.
        slotsRef.current = override.slots;
        setSlots(override.slots);
      } else if (blindMode) {
        // Blind runs shuffle column order first, so positions carry no meaning.
        shuffleSlots();
      }

      const currentPrompt = promptText;
      outputRefs.current = {};
      reasoningRefs.current = {};
      metricsRefs.current = {};
      savedRunIdRef.current = null;
      setWinnerModel(null);
      setDiffPair(null);

      const runnable = slotsRef.current.filter((s) => s.model);
      if (runnable.length === 0) return;

      setSlots((prev) => {
        finishedRefs.current = Object.fromEntries(prev.map((s) => [s.id, !s.model]));
        return prev.map((s) => ({
          ...s,
          output: '',
          reasoning: '',
          metrics: null,
          loading: true,
          error: null,
          startedAt: Date.now(),
          firstTokenAt: null,
        }));
      });
      setIsLoading(true);
      announceCue('runStart');

      abortControllerRef.current = new AbortController();
      const signal = abortControllerRef.current.signal;

      const finalizeRun = (): void => {
        const snapshot = slotsRef.current;
        const cloud = useCloudStore.getState();
        const settings = useSettingsStore.getState();
        // Reproducibility snapshot: sampling params + endpoint host + app
        // version. Never includes secrets (no API keys).
        const host = safeHost(settings.baseUrl);
        // Per-model overrides, keyed by the same qualified name used in results.
        // Only columns that actually override something are recorded.
        const slotParams: Record<string, GenerationOverrides> = {};
        for (const s of snapshot) {
          if (hasOverrides(s.params))
            slotParams[slotQualified(s)] = s.params as GenerationOverrides;
        }
        const runConfig = JSON.stringify({
          provider: settings.provider,
          host,
          runMode: settings.runMode,
          system: settings.advancedConfig.system || undefined,
          temperature: settings.advancedConfig.serverDefaults
            ? undefined
            : settings.advancedConfig.temperature,
          top_p: settings.advancedConfig.serverDefaults ? undefined : settings.advancedConfig.top_p,
          num_ctx: settings.advancedConfig.serverDefaults
            ? undefined
            : settings.advancedConfig.num_ctx,
          serverDefaults: settings.advancedConfig.serverDefaults || undefined,
          seed: settings.advancedConfig.seed ?? undefined,
          maxTokens: settings.advancedConfig.maxTokens ?? undefined,
          repeats: settings.advancedConfig.repeats ?? 1,
          slotParams: Object.keys(slotParams).length > 0 ? slotParams : undefined,
          appVersion: APP_VERSION,
        });
        const results: BenchmarkResult[] = snapshot.map((s) => {
          const m = metricsRefs.current[s.id];
          // Freeze the run cost: exact server tokens × current pricing, else null.
          let costUsd: number | null = null;
          if (s.source.kind === 'cloud' && m?.tokenSource === 'server') {
            costUsd = calcCost(
              m.promptTokens,
              m.completionTokens,
              (cloud.modelPricing[s.source.providerId] ?? {})[s.model]
            );
          }
          return {
            model: slotQualified(s),
            output: outputRefs.current[s.id] || s.output || '',
            tps: m?.tps || 0,
            ttft: m?.ttftMs || 0,
            tpsEstimated: m?.tpsEstimated,
            tokenSource: m?.tokenSource,
            promptTokens: m?.promptTokens ?? null,
            completionTokens: m?.completionTokens ?? null,
            costUsd,
            source: s.source.kind,
            providerId: s.source.kind === 'cloud' ? s.source.providerId : null,
            reasoning: reasoningRefs.current[s.id]?.trim() ? reasoningRefs.current[s.id] : null,
            itlMs: m?.itlMs ?? null,
            itlP95Ms: m?.itlP95Ms ?? null,
            itlEstimated: m?.itlEstimated,
          };
        });
        void DbService.saveHistory(currentPrompt, results, null, runConfig).then((runId) => {
          // Remember the new run id so a later vote updates the same row.
          // The id comes straight from the insert — no history re-read, no race.
          savedRunIdRef.current = runId;
        });
      };

      let finalized = false;
      /** Every path that ends a run goes through here exactly once. */
      const finishRun = (): void => {
        setIsLoading(false);
        finalizeRun();
        announceFinished(runnable.length);
      };

      const markFinished = (id: string) => {
        finishedRefs.current[id] = true;
        if (!Object.values(finishedRefs.current).every(Boolean) || finalized) return;
        finalized = true;
        // All slots finished (success, error or stop) — finalize once.
        // Read synchronously from refs instead of setState-inside-setState.
        finishRun();
      };

      // Defer stream startup so the reset render commits first.
      setTimeout(() => {
        if (useSettingsStore.getState().runMode === 'sequential') {
          // One slot at a time: local models share one GPU/server, so parallel
          // runs contaminate each other's TPS. Partial results still save on Stop.
          void (async () => {
            for (const slot of runnable) {
              if (signal.aborted) break;

              await new Promise<void>((resolve) => {
                runSlot(slot, currentPrompt, signal, () => resolve());
              });
            }
            Object.keys(finishedRefs.current).forEach((id) => {
              finishedRefs.current[id] = true;
            });
            finishRun();
          })();
          return;
        }
        runnable.forEach((slot) => runSlot(slot, currentPrompt, signal, markFinished));
      }, 0);
    },
    [prompt, isLoading, runSlot, blindMode, shuffleSlots, announceCue, announceFinished]
  );

  /** Run button / Ctrl+Enter: current prompt and columns. */
  const handleRunComparison = useCallback(() => startRun(), [startRun]);

  /** History card "Re-run": restore the saved run, then start it immediately. */
  const handleRerunHistoryRecord = (record: HistoryRecord) => {
    const restored = restoreHistoryRecord(record);
    slotsRef.current = restored;
    setSlots(restored);
    startRun({ prompt: record.prompt, slots: restored });
  };

  /** Re-runs a single failed/stopped slot without touching the others. */
  const handleRetrySlot = (id: string) => {
    const slot = slotsRef.current.find((s) => s.id === id);
    if (!slot || !slot.model || slot.loading) return;
    if (!prompt.trim()) return;

    outputRefs.current[id] = '';
    reasoningRefs.current[id] = '';
    metricsRefs.current[id] = null;
    finishedRefs.current[id] = false;
    setIsLoading(true);
    setSlots((prev) =>
      prev.map((s) =>
        s.id === id
          ? {
              ...s,
              output: '',
              reasoning: '',
              metrics: null,
              error: null,
              loading: true,
              startedAt: Date.now(),
              firstTokenAt: null,
            }
          : s
      )
    );

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const signal = controller.signal;

    const markFinished = (slotId: string) => {
      finishedRefs.current[slotId] = true;
      if (Object.values(finishedRefs.current).every(Boolean)) setIsLoading(false);
      // Persist the retried column back into its saved history row (when the
      // run was saved and the retry actually completed — never on Stop, so a
      // half retry can't clobber good data).
      if (slotId === id && !signal.aborted && savedRunIdRef.current != null) {
        const m = metricsRefs.current[id];
        const output = outputRefs.current[id] || '';
        const reasoning = reasoningRefs.current[id]?.trim() ? reasoningRefs.current[id] : null;
        const retried = slotsRef.current.find((s) => s.id === id);
        if (retried) {
          const cloud = useCloudStore.getState();
          void DbService.updateBenchmarkResult(savedRunIdRef.current, slotQualified(retried), {
            output,
            tps: m?.tps || 0,
            ttft: m?.ttftMs || 0,
            tpsEstimated: m?.tpsEstimated,
            tokenSource: m?.tokenSource,
            promptTokens: m?.promptTokens ?? null,
            completionTokens: m?.completionTokens ?? null,
            reasoning,
            itlMs: m?.itlMs ?? null,
            itlP95Ms: m?.itlP95Ms ?? null,
            itlEstimated: m?.itlEstimated,
            costUsd:
              retried.source.kind === 'cloud' && m?.tokenSource === 'server'
                ? calcCost(
                    m.promptTokens,
                    m.completionTokens,
                    (cloud.modelPricing[retried.source.providerId] ?? {})[retried.model]
                  )
                : null,
          });
        }
      }
    };
    runSlot(
      { ...slot, output: '', reasoning: '', metrics: null, error: null, loading: true },
      prompt,
      signal,
      markFinished
    );
  };

  // Keep refs to the latest handlers so the global shortcut never goes stale.
  const runHandlerRef = useRef(handleRunComparison);
  const stopHandlerRef = useRef(handleStopGeneration);
  const activePageRef = useRef(activePage);
  useEffect(() => {
    runHandlerRef.current = handleRunComparison;
    stopHandlerRef.current = handleStopGeneration;
    activePageRef.current = activePage;
  }, [handleRunComparison, handleStopGeneration, activePage]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const modK = (e.ctrlKey || e.metaKey) && e.key === 'k';
      if (modK) {
        const tag = (e.target as HTMLElement).tagName;
        if (tag !== 'INPUT' && tag !== 'TEXTAREA' && tag !== 'SELECT') {
          e.preventDefault();
          promptRef.current?.focus();
        }
        return;
      }
      const modEnter = (e.ctrlKey || e.metaKey) && e.key === 'Enter';
      // Bench-only: never fire a background run from the Tests/Cloud pages.
      if (modEnter && activePageRef.current === 'bench') {
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
    slots.length === 2
      ? 'grid-cols-2'
      : slots.length === 3
        ? 'grid-cols-3'
        : 'grid-cols-2 lg:grid-cols-4';

  const hasOutput = slots.some((s) => s.output);

  // The card needs real metrics to draw bars and split times; a stopped or
  // errored run has nothing worth posting.
  const shareableModels = slots.flatMap((s) =>
    s.metrics && s.output && !s.error
      ? [
          {
            name: slotQualified(s),
            output: s.output,
            metrics: s.metrics,
            costUsd: costFor(s, s.metrics),
            isWinner: winnerModel !== null && winnerModel === slotQualified(s),
          },
        ]
      : []
  );
  const hasShareableRun = shareableModels.length > 0;

  // Post-run verdict: the headline winners so the user doesn't have to scan
  // every column. Only ranks slots that actually finished with metrics.
  const verdict = useMemo(() => {
    const done = slots.filter((s) => s.output && !s.error && s.metrics && (s.metrics.tps || 0) > 0);
    if (done.length === 0) return null;
    const fastest = done.reduce((a, b) => ((b.metrics!.tps || 0) > (a.metrics!.tps || 0) ? b : a));
    const slowest = done.reduce((a, b) => ((b.metrics!.tps || 0) < (a.metrics!.tps || 0) ? b : a));
    const withTtft = done.filter((s) => (s.metrics!.ttftMs || 0) > 0);
    const lowestTtft = withTtft.length
      ? withTtft.reduce((a, b) =>
          (b.metrics!.ttftMs || Infinity) < (a.metrics!.ttftMs || Infinity) ? b : a
        )
      : null;
    const priced = slots
      .map((s) => {
        if (s.source.kind !== 'cloud' || !s.metrics || s.metrics.tokenSource !== 'server') {
          return null;
        }
        const cost = calcCost(
          s.metrics.promptTokens,
          s.metrics.completionTokens,
          (cloudPricing[s.source.providerId] ?? {})[s.model]
        );
        return cost == null ? null : { slot: s, cost };
      })
      .filter((x): x is { slot: (typeof slots)[number]; cost: number } => x !== null);
    const cheapest = priced.length ? priced.reduce((a, b) => (b.cost < a.cost ? b : a)) : null;
    const spread =
      done.length > 1
        ? Math.round((1 - (slowest.metrics!.tps || 0) / (fastest.metrics!.tps || 1)) * 100)
        : 0;
    return { fastest, lowestTtft, cheapest, spread, count: done.length };
  }, [slots, cloudPricing]);

  return (
    <div className="flex h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased overflow-hidden">
      <AppSidebar activeView={activeView} onNavigate={handleSidebarNavigate} />

      <Suspense fallback={null}>
        <HistorySidebar
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
          onSelectRecord={handleSelectHistoryRecord}
          onRerun={handleRerunHistoryRecord}
        />
        <Leaderboard isOpen={isLeaderboardOpen} onClose={() => setIsLeaderboardOpen(false)} />
        <ContextSweep
          isOpen={isSweepOpen}
          onClose={() => setIsSweepOpen(false)}
          prompt={prompt}
          models={models}
          cloudGroups={cloudGroups}
        />
        <SettingsPanel
          isOpen={isSettingsOpen}
          onClose={() => setIsSettingsOpen(false)}
          advancedConfig={advancedConfig}
          onAdvancedChange={setAdvancedConfig}
        />
      </Suspense>
      <UpdaterPrompt />
      <Toaster />

      {/* Main column */}
      <div className="flex-1 flex flex-col min-w-0 min-h-0">
        <TopBar
          modelsCount={models.length}
          loadingModels={loadingModels}
          onRefresh={loadModels}
          onOpenSettings={() => setIsSettingsOpen(true)}
        />

        {activePage === 'bench' && (
          <>
            <ResultToolbar
              hasOutput={hasOutput}
              canShowDiff={canShowDiff}
              diffActive={diffPair !== null}
              onToggleDiff={() => {
                setDiffPair(diffPair ? null : [comparableSlots[0].id, comparableSlots[1].id]);
              }}
              onCopyReport={handleCopyReport}
              pdfState={pdfState}
              onExportPdf={handleExportPdf}
              slotsLabel={`${slots.length}/${MAX_MODELS} models`}
              raceActive={raceMode}
              onToggleRace={() => setRaceMode((v) => !v)}
              shareState={shareState}
              onExportShareCard={handleExportShareCard}
            />

            {verdict && !isLoading && (
              <div className="shrink-0 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-1.5 border-b border-slate-200/70 dark:border-slate-800/70 bg-white/70 dark:bg-slate-900/40 text-micro">
                <span className="flex items-center gap-1 text-emerald-700 dark:text-emerald-400">
                  <Zap className="w-3 h-3" />
                  {t('app.verdictFastest', 'Fastest')}:{' '}
                  <strong className="font-semibold">
                    {shortModel(slotQualified(verdict.fastest))}
                  </strong>
                  <span className="font-mono tabular-nums opacity-80">
                    {verdict.fastest.metrics?.tps} tok/s
                  </span>
                </span>
                {verdict.lowestTtft && (
                  <span className="flex items-center gap-1 text-cyan-700 dark:text-cyan-400">
                    <Clock className="w-3 h-3" />
                    {t('app.verdictLowestTtft', 'Lowest TTFT')}:{' '}
                    <strong className="font-semibold">
                      {shortModel(slotQualified(verdict.lowestTtft))}
                    </strong>
                    <span className="font-mono tabular-nums opacity-80">
                      {formatDurationMs(verdict.lowestTtft.metrics?.ttftMs ?? 0)}
                    </span>
                  </span>
                )}
                {verdict.cheapest && (
                  <span className="flex items-center gap-1 text-amber-700 dark:text-amber-400">
                    <DollarSign className="w-3 h-3" />
                    {t('app.verdictCheapest', 'Cheapest')}:{' '}
                    <strong className="font-semibold">
                      {shortModel(slotQualified(verdict.cheapest.slot))}
                    </strong>
                    <span className="font-mono tabular-nums opacity-80">
                      {formatCost(verdict.cheapest.cost)}
                    </span>
                  </span>
                )}
                {verdict.spread > 0 && (
                  <span className="text-slate-500 dark:text-slate-400">
                    {t('app.verdictSlower', 'slowest {{pct}}% slower than fastest', {
                      pct: verdict.spread,
                    })}
                  </span>
                )}
              </div>
            )}
          </>
        )}

        {error && (
          <div className="bg-rose-500/10 border-b border-rose-500/20 px-4 py-2 text-xs text-rose-700 dark:text-rose-400 flex justify-between items-center shrink-0">
            <span>
              {error}
              {error === t('app.noModelsFound') && (
                <span className="ms-2 font-mono opacity-90">
                  (
                  {provider === 'openai-compatible'
                    ? t('app.noModelsHintLMStudio')
                    : t('app.noModelsHintOllama')}
                  )
                </span>
              )}
            </span>
          </div>
        )}

        {activePage === 'bench' && !hasAnySource && !loadingModels && !onboardingDismissed && (
          <OnboardingCard
            onConnect={(nextProvider, nextBaseUrl) => {
              setProvider(nextProvider);
              setBaseUrl(nextBaseUrl);
            }}
            onDismiss={() => setOnboardingDismissed(true)}
          />
        )}

        {activePage === 'tests' ? (
          <Suspense
            fallback={
              <div className="flex-1 grid place-items-center text-xs text-slate-500 dark:text-slate-400">
                {t('app.loading', 'Loading…')}
              </div>
            }
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TestSuiteView models={models} />
            </div>
          </Suspense>
        ) : activePage === 'cloud' ? (
          <Suspense
            fallback={
              <div className="flex-1 grid place-items-center text-xs text-slate-500 dark:text-slate-400">
                {t('app.loading', 'Loading…')}
              </div>
            }
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <CloudProvidersView />
            </div>
          </Suspense>
        ) : activePage === 'spend' ? (
          <Suspense
            fallback={
              <div className="flex-1 grid place-items-center text-xs text-slate-500 dark:text-slate-400">
                {t('app.loading', 'Loading…')}
              </div>
            }
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <SpendView />
            </div>
          </Suspense>
        ) : activePage === 'trend' ? (
          <Suspense
            fallback={
              <div className="flex-1 grid place-items-center text-xs text-slate-500 dark:text-slate-400">
                {t('app.loading', 'Loading…')}
              </div>
            }
          >
            <div className="flex-1 min-h-0 overflow-y-auto">
              <TrendView />
            </div>
          </Suspense>
        ) : (
          <>
            {/* Scrollable workspace — model outputs get max height now */}
            <div className="flex-1 min-h-0 overflow-y-auto">
              {raceMode && (
                <div className="px-3 pt-3">
                  <Suspense fallback={null}>
                    <RaceView
                      running={isLoading}
                      lanes={slots.flatMap((s, i) => {
                        if (!s.model) return [];
                        // Blind: the anonymous label is both the name and
                        // the color key, so a lane can't fingerprint the
                        // model it is supposed to be hiding.
                        const identity = blindMode ? blindLabelFor(i) : slotQualified(s);
                        return [
                          {
                            id: s.id,
                            name: identity,
                            colorKey: identity,
                            output: s.output,
                            metrics: s.metrics,
                            loading: s.loading,
                            error: s.error,
                            startedAt: s.startedAt,
                            firstTokenAt: s.firstTokenAt,
                          },
                        ];
                      })}
                    />
                  </Suspense>
                </div>
              )}
              <main className={`grid ${gridColsClass} gap-3 p-3 min-h-[320px]`}>
                {/* `index` is still needed for blind labels (column position
                    is the anonymity), but not for color any more. */}
                {slots.map((slot, index) => (
                  <ModelColumn
                    key={slot.id}
                    models={models}
                    source={slot.source}
                    selectedModel={slot.model}
                    cloudGroups={cloudGroups}
                    output={slot.output}
                    reasoning={slot.reasoning}
                    metrics={slot.metrics}
                    error={slot.error}
                    loading={slot.loading}
                    streamStartedAt={slot.startedAt}
                    firstTokenAt={slot.firstTokenAt}
                    canRemove={slots.length > MIN_MODELS}
                    isWinner={
                      winnerModel !== null &&
                      winnerModel === slotQualified(slot) &&
                      slot.model !== ''
                    }
                    costLabel={slotCost(slot, slot.metrics)}
                    blindLabel={blindMode && slot.model ? blindLabelFor(index) : null}
                    params={slot.params}
                    defaults={{
                      temperature: advancedConfig.temperature ?? 0.7,
                      top_p: advancedConfig.top_p ?? 0.9,
                      maxTokens: advancedConfig.maxTokens ?? null,
                    }}
                    onParamsChange={(next) =>
                      setSlots((prev) =>
                        prev.map((s) =>
                          s.id === slot.id
                            ? { ...s, params: hasOverrides(next) ? next : undefined }
                            : s
                        )
                      )
                    }
                    onSourceChange={(source, name) =>
                      setSlots((prev) =>
                        prev.map((s) => (s.id === slot.id ? { ...s, source, model: name } : s))
                      )
                    }
                    onRemove={() => handleRemoveSlot(slot.id)}
                    onRetry={() => handleRetrySlot(slot.id)}
                    onVote={() => handleVote(slotQualified(slot))}
                  />
                ))}
              </main>

              {diffPair && diffSlots.length === 2 && (
                <div className="px-3 pb-2">
                  <Suspense fallback={null}>
                    <DiffView
                      leftName={
                        blindMode
                          ? blindLabelFor(slots.findIndex((s) => s.id === diffSlots[0].id))
                          : slotQualified(diffSlots[0])
                      }
                      rightName={
                        blindMode
                          ? blindLabelFor(slots.findIndex((s) => s.id === diffSlots[1].id))
                          : slotQualified(diffSlots[1])
                      }
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
                  </Suspense>
                </div>
              )}

              {slots.every((s) => s.metrics) && slots[0]?.metrics && (
                <div className="px-3 pb-2">
                  <Suspense fallback={null}>
                    <BenchmarkChart
                      entries={slots.map((s, i) => ({
                        name: blindMode && s.model ? blindLabelFor(i) : slotQualified(s),
                        // Blind: label doubles as the color key so the bar
                        // can't fingerprint the model it is hiding.
                        colorKey: blindMode && s.model ? blindLabelFor(i) : slotQualified(s),
                        metrics: s.metrics!,
                      }))}
                    />
                  </Suspense>
                </div>
              )}

              {slots.filter((s) => s.output && !s.output.startsWith('Error:')).length >= 2 && (
                <div className="px-3 pb-2">
                  <JudgePanel
                    prompt={prompt}
                    items={slots
                      .filter((s) => s.output && !s.output.startsWith('Error:'))
                      .map((s) => ({
                        slotId: s.id,
                        qualified: slotQualified(s),
                        output: s.output,
                      }))}
                    models={models}
                    cloudGroups={cloudGroups}
                  />
                </div>
              )}

              <div className="px-3 pb-3 flex justify-center">
                <button
                  onClick={handleAddModel}
                  disabled={slots.length >= MAX_MODELS || !hasAnySource}
                  className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>
                    {t('app.addModel', 'Add model')} ({slots.length}/{MAX_MODELS})
                  </span>
                </button>
              </div>
            </div>

            {/* Prompt dock */}
            <div className="shrink-0 px-3 pt-1">
              <PromptPresets
                currentPrompt={prompt}
                onSelect={(p) => setPrompt(p)}
                disabled={isLoading}
              />
            </div>

            <footer className="shrink-0 p-3 border-t border-slate-200 dark:border-slate-800 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
              <div className="flex gap-2.5 max-w-5xl mx-auto items-stretch">
                <div className="flex-1 flex flex-col gap-1 min-w-0 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus-within:ring-1 focus-within:ring-indigo-500 focus-within:border-indigo-400 transition px-3 py-2">
                  <textarea
                    ref={promptRef}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    disabled={isLoading}
                    rows={2}
                    placeholder={t('app.promptPlaceholder')}
                    className="w-full bg-transparent resize-none text-sm focus:outline-none placeholder:text-slate-400"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-nano text-slate-500 dark:text-slate-400 font-mono">
                      {t('app.runHint')}
                    </span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        onClick={() => setIsSweepOpen(true)}
                        disabled={isLoading || !prompt.trim() || !hasAnySource}
                        title={t('sweep.title', 'Context sweep')}
                        className="flex items-center gap-1 px-2 py-1 text-nano font-mono rounded-lg border border-transparent bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-indigo-500 disabled:opacity-50 transition shrink-0"
                      >
                        <Activity className="w-3 h-3" />
                        {t('sweep.short', 'Sweep')}
                      </button>
                      <RunModeToggle />
                      <BlindToggle
                        disabled={isLoading}
                        onEnable={() => {
                          setBlindMode(true);
                          // Invalidate any prior positional knowledge immediately.
                          shuffleSlots();
                        }}
                        onDisable={() => setBlindMode(false)}
                      />
                    </div>
                  </div>
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

      {/* Hidden report source for PDF export (html2canvas captures this).
          Mounted only while exporting so streams never pay for it. */}
      {printMounted && (
        <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }}>
          <ReportPrintView
            ref={printRef}
            prompt={prompt}
            results={slots.map((s) => ({
              model: slotQualified(s),
              output: s.output,
              tps: s.metrics?.tps || 0,
              ttft: s.metrics?.ttftMs || 0,
              tpsEstimated: s.metrics?.tpsEstimated,
              tokenSource: s.metrics?.tokenSource,
            }))}
          />
        </div>
      )}

      {/* Hidden share card, mounted only while exporting. Off-screen rather
          than display:none — html2canvas cannot measure a hidden subtree. */}
      {shareMounted && (
        <div style={{ position: 'fixed', top: 0, left: '-9999px', zIndex: -1 }}>
          <Suspense fallback={null}>
            <ShareCard
              ref={shareRef}
              prompt={prompt}
              models={shareableModels}
              host={safeHost(useSettingsStore.getState().baseUrl) || null}
            />
          </Suspense>
        </div>
      )}
    </div>
  );
}

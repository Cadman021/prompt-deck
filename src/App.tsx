// src/App.tsx
import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { OllamaService } from './services/ollamaService';
import { OllamaModel, BenchmarkMetrics } from './types/ollama';
import { DbService, HistoryRecord } from './services/dbService';
import { useSettingsStore } from './store/useSettingsStore';
import { HistorySidebar } from './components/HistorySidebar';
import { MarkdownRenderer } from './components/MarkdownRenderer';
import { generateMarkdownReport, copyHistoryAsJson } from './utils/exportUtils';
import { AdvancedSettings, AdvancedConfig } from './components/AdvancedSettings';
import { PromptPresets } from './components/PromptPresets';
import './i18n/config';
import {
  Play,
  RefreshCw,
  Cpu,
  Zap,
  Clock,
  Terminal,
  Sun,
  Moon,
  Languages,
  History
} from 'lucide-react';

export default function App() {
  const { t } = useTranslation();
  const { theme, setTheme, language, setLanguage } = useSettingsStore();

  const output1Ref = useRef('');
  const output2Ref = useRef('');

  const [models, setModels] = useState<OllamaModel[]>([]);
  const [prompt, setPrompt] = useState('');
  const [loadingModels, setLoadingModels] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Model 1 State
  const [model1, setModel1] = useState('');
  const [output1, setOutput1] = useState('');
  const [metrics1, setMetrics1] = useState<BenchmarkMetrics | null>(null);
  const [loading1, setLoading1] = useState(false);

  // Model 2 State
  const [model2, setModel2] = useState('');
  const [output2, setOutput2] = useState('');
  const [metrics2, setMetrics2] = useState<BenchmarkMetrics | null>(null);
  const [loading2, setLoading2] = useState(false);

  // Refs to track benchmark completion for DB saving
  const metrics1Ref = useRef<BenchmarkMetrics | null>(null);
  const metrics2Ref = useRef<BenchmarkMetrics | null>(null);

  const [copied, setCopied] = useState(false);

  const [jsonCopied, setJsonCopied] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  const handleStopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
      setIsLoading(false);
    }
  };

  const handleCopyJson = async () => {
    const success = await copyHistoryAsJson();
    if (success) {
      setJsonCopied(true);
      setTimeout(() => setJsonCopied(false), 2000);
    }
  };

  const [advancedConfig, setAdvancedConfig] = useState<AdvancedConfig>({
    system: '',
    temperature: 0.7,
    top_p: 0.9,
    num_ctx: 4096,
  });

  const handleCopyReport = async () => {
    if (!output1 && !output2) return;

    const report = generateMarkdownReport({
      prompt,
      model1,
      model2,
      output1,
      output2,
      tps1: metrics1?.tps || 0,
      tps2: metrics2?.tps || 0,
      ttft1: metrics1?.ttftMs || 0,
      ttft2: metrics2?.ttftMs || 0,
    });

    await navigator.clipboard.writeText(report);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const loadModels = async () => {
    setLoadingModels(true);
    setError(null);
    try {
      const data = await OllamaService.getInstalledModels();
      setModels(data);
      if (data.length > 0) {
        setModel1(data[0].name);
        setModel2(data[1]?.name || data[0].name);
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
  }, []);

  // Restore history item to current playground
  const handleSelectHistoryRecord = (record: HistoryRecord) => {
    setPrompt(record.prompt);

    if (models.some((m) => m.name === record.model1)) {
      setModel1(record.model1);
    }
    if (models.some((m) => m.name === record.model2)) {
      setModel2(record.model2);
    }

    const out1 = record.output1 || '';
    const out2 = record.output2 || '';
    setOutput1(out1);
    setOutput2(out2);
    if (output1Ref) output1Ref.current = out1;
    if (output2Ref) output2Ref.current = out2;

    setMetrics1({
      tps: record.tps1,
      ttftMs: record.ttft1,
      totalDurationMs: 0,
      totalTokens: 0,
    });

    setMetrics2({
      tps: record.tps2,
      ttftMs: record.ttft2,
      totalDurationMs: 0,
      totalTokens: 0,
    });
  };

  // Save to SQLite when both models complete benchmarking
  const handleRunComparison = () => {
    if (!prompt.trim() || isLoading) return;

    const currentPrompt = prompt;
    const currentModel1 = model1;
    const currentModel2 = model2;

    metrics1Ref.current = null;
    metrics2Ref.current = null;

    setIsLoading(true);
    setOutput1('');
    setOutput2('');

    abortControllerRef.current = new AbortController();
    const signal = abortControllerRef.current.signal;

    const options1 = {
      model: model1,
      prompt,
      system: advancedConfig.system,
      temperature: advancedConfig.temperature,
      top_p: advancedConfig.top_p,
      num_ctx: advancedConfig.num_ctx,
    };

    const checkAndSave = () => {
      if (metrics1Ref.current && metrics2Ref.current) {
        setIsLoading(false);
        DbService.saveHistory({
          prompt: currentPrompt,
          model1: currentModel1,
          model2: currentModel2,
          tps1: metrics1Ref.current.tps,
          tps2: metrics2Ref.current.tps,
          ttft1: metrics1Ref.current.ttftMs,
          ttft2: metrics2Ref.current.ttftMs,
          output1: output1Ref.current,
          output2: output2Ref.current,
        });
      }
    };

    if (currentModel1) {
      setLoading1(true);
      setOutput1('');
      setMetrics1(null);
      OllamaService.generateStream(
        options1,
        {
          onChunk: (_, fullText) => { setOutput1(fullText); output1Ref.current = fullText; },
          onComplete: (_, metrics) => {
            setMetrics1(metrics);
            metrics1Ref.current = metrics;
            setLoading1(false);
            checkAndSave();
          },
          onError: (err) => {
            setOutput1(`Error: ${err.message}`);
            setLoading1(false);
            if (!loading2) setIsLoading(false);
          },
        },
        signal
      );
    }

    if (currentModel2) {
      setLoading2(true);
      setOutput2('');
      setMetrics2(null);
      OllamaService.generateStream(
        { ...options1, model: model2 },
        {
          onChunk: (_, fullText) => { setOutput2(fullText); output2Ref.current = fullText; },
          onComplete: (_, metrics) => {
            setMetrics2(metrics);
            metrics2Ref.current = metrics;
            setLoading2(false);
            checkAndSave();
          },
          onError: (err) => {
            setOutput2(`Error: ${err.message}`);
            setLoading2(false);
            if (!loading1) setIsLoading(false);
          },
        },
        signal
      );
    }
  };

  return (
    <div className="flex flex-col h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 font-sans antialiased">
      {/* History Sidebar */}
      <HistorySidebar
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
        onSelectRecord={handleSelectHistoryRecord}
      />

      {/* Top Header */}
      <header className="flex items-center justify-between px-6 py-3 border-b border-slate-200 dark:border-slate-800 bg-white/50 dark:bg-slate-900/50 backdrop-blur">
        <div className="flex items-center gap-2">
          {/* History Button */}
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-1.5 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition mr-1"
            title={t("app.historyTitle")}
          >
            <History className="w-4 h-4" />
          </button>

          <Terminal className="w-6 h-6 text-indigo-500" />
          <h1 className="text-lg font-bold bg-gradient-to-r from-indigo-500 to-cyan-500 bg-clip-text text-transparent">
            {t('app.title')}
          </h1>
          <span className="text-xs px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 font-mono">
            {t('app.version')}
          </span>
        </div>

        {/* Controls: Language, Theme & Refresh */}
        <div className="flex items-center gap-2">
          {/* Language Switcher */}
          <button
            onClick={() => setLanguage(language === 'en' ? 'fa' : 'en')}
            className="flex items-center gap-1.5 text-xs px-2.5 py-1.5 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
            title={t("app.switchLanguage")}
          >
            <Languages className="w-3.5 h-3.5" />
            <span className="font-semibold uppercase">{language}</span>
          </button>

          {/* Theme Switcher */}
          <button
            onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            className="p-1.5 rounded-md bg-slate-200 dark:bg-slate-800 hover:bg-slate-300 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 transition"
            title={t("app.toggleTheme")}
          >
            {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>

          {/* Refresh Models Button */}
          <button
            onClick={loadModels}
            disabled={loadingModels}
            className="flex items-center gap-2 text-xs px-3 py-1.5 rounded-md bg-indigo-600 hover:bg-indigo-500 text-white transition disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loadingModels ? 'animate-spin' : ''}`} />
            <span>{t('app.refreshModels')}</span>
          </button>

          {/* Copy Report Button */}
          {(output1 || output2) && (
            <button
              onClick={handleCopyReport}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-indigo-50 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 dark:hover:bg-indigo-900/80 transition-all shadow-sm"
              title={t("app.copyReportTitle")}
            >
              {copied ? (
                <>
                  <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span className="text-emerald-600 dark:text-emerald-400">{t("app.copyReportDone")}</span>
                </>
              ) : (
                <>
                  <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                  </svg>
                  <span>{t("app.copyReport")}</span>
                </>
              )}
            </button>
          )}

          {/* Copy History JSON Button */}
          <button
            onClick={handleCopyJson}
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all shadow-sm"
            title={t("copyJsonTitle")}
          >
            {jsonCopied ? (
              <>
                <svg className="w-3.5 h-3.5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                <span className="text-emerald-600 dark:text-emerald-400">{t("app.copyJsonDone")}</span>
              </>
            ) : (
              <>
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 5H6a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2v-1M8 5a2 2 0 002 2h2a2 2 0 002-2M8 5a2 2 0 012-2h2a2 2 0 012 2m0 0h2a2 2 0 012 2v3m2 4H10m0 0l3-3m-3 3l3 3" />
                </svg>
                <span>{t("app.copyJson")}</span>
              </>
            )}
          </button>
        </div>
      </header>

      {/* Connection Error Banner */}
      {error && (
        <div className="bg-rose-500/10 border-b border-rose-500/20 px-6 py-2 text-xs text-rose-500 flex justify-between items-center">
          <span>{error}</span>
        </div>
      )}

      {/* Main Workspace: Side-by-Side Model Arena */}
      <main className="flex-1 grid grid-cols-2 gap-4 p-4 overflow-hidden">
        {/* Model Column 1 */}
        <div className="flex flex-col bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Cpu className="w-4 h-4 text-indigo-500 shrink-0" />
              <select
                value={model1}
                onChange={(e) => setModel1(e.target.value)}
                className="bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none w-full"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Benchmark Metrics Header */}
          {metrics1 && (
            <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono">
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Zap className="w-3 h-3" />
                <span>{metrics1.tps} {t('metrics.tps')}</span>
              </div>
              <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                <Clock className="w-3 h-3" />
                <span>{t('metrics.ttft')}: {metrics1.ttftMs}ms</span>
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-end">
                {(metrics1.totalDurationMs / 1000).toFixed(2)}s
              </div>
            </div>
          )}

          {/* Streaming Output Box */}
          <div className="flex-1 overflow-y-auto p-4">
            {output1 ? (
              <MarkdownRenderer content={output1} />
            ) : (
              <div className="text-slate-500 text-sm italic">{t('app.outputPlaceholder1')}</div>
            )}
          </div>
        </div>

        {/* Model Column 2 */}
        <div className="flex flex-col bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm">
          <div className="p-3 border-b border-slate-200 dark:border-slate-800 bg-slate-100/50 dark:bg-slate-900 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1">
              <Cpu className="w-4 h-4 text-cyan-500 shrink-0" />
              <select
                value={model2}
                onChange={(e) => setModel2(e.target.value)}
                className="bg-white dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200 border border-slate-300 dark:border-slate-700 rounded-lg px-2.5 py-1.5 focus:outline-none w-full"
              >
                {models.map((m) => (
                  <option key={m.name} value={m.name}>{m.name}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Benchmark Metrics Header */}
          {metrics2 && (
            <div className="grid grid-cols-3 gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-950/60 border-b border-slate-200 dark:border-slate-800 text-[11px] font-mono">
              <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                <Zap className="w-3 h-3" />
                <span>{metrics2.tps} {t('metrics.tps')}</span>
              </div>
              <div className="flex items-center gap-1 text-cyan-600 dark:text-cyan-400">
                <Clock className="w-3 h-3" />
                <span>{t('metrics.ttft')}: {metrics2.ttftMs}ms</span>
              </div>
              <div className="text-slate-500 dark:text-slate-400 text-end">
                {(metrics2.totalDurationMs / 1000).toFixed(2)}s
              </div>
            </div>
          )}

          {/* Streaming Output Box */}
          <div className="flex-1 overflow-y-auto p-4">
            {output2 ? (
              <MarkdownRenderer content={output2} />
            ) : (
              <div className="text-slate-500 text-sm italic">{t('app.outputPlaceholder2')}</div>
            )}
          </div>
        </div>
      </main>

      <AdvancedSettings config={advancedConfig} onChange={setAdvancedConfig} />

      {/* Prompt Presets */}
      <PromptPresets onSelect={(p) => setPrompt(p)} disabled={isLoading} />

      {/* Footer: Prompt Input Bar */}
      <footer className="p-4 border-t border-slate-200 dark:border-slate-800 bg-white/40 dark:bg-slate-900/40">
        <div className="flex gap-3 max-w-5xl mx-auto">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={isLoading}
            placeholder={t('app.promptPlaceholder')}
            className="flex-1 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-sm focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
          {isLoading ? (
            <button
              onClick={handleStopGeneration}
              className="px-5 py-3 rounded-lg bg-rose-600 text-white font-medium text-sm hover:bg-rose-700 transition-colors flex items-center gap-2 shadow-sm"
            >
              <span className="w-2 h-2 rounded-full bg-white animate-ping" />
              {t("app.stop")}
            </button>
          ) : (
            <button
              onClick={handleRunComparison}
              disabled={loading1 || loading2 || !prompt.trim()}
              className="flex flex-col items-center justify-center gap-1 px-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition disabled:opacity-50 font-medium text-xs shrink-0"
            >
              <Play className="w-4 h-4 fill-current" />
              <span>{loading1 || loading2 ? t('app.running') : t('app.run')}</span>
            </button>
          )}
        </div>
      </footer>
    </div>
  );
}
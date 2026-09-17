// src/components/testsuite/TestSuiteView.tsx
// Batch execution: run a list of test prompts across several models and
// compare them in a scoreboard matrix (TPS + duration + outputs).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import {
  Play,
  Square,
  Plus,
  Trash2,
  Download,
  Copy,
  Check,
  Crown,
  X,
  FlaskConical,
  Eraser,
} from 'lucide-react';
import { LLMService } from '../../services/llmService';
import { useSettingsStore } from '../../store/useSettingsStore';
import { OllamaModel, BenchmarkMetrics } from '../../types/ollama';
import { MarkdownRenderer } from '../MarkdownRenderer';

const MAX_TESTS = 10;
const STORAGE_KEY = 'promptdeck-test-suite';
const MODEL_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

type CellStatus = 'idle' | 'running' | 'done' | 'error';

interface CellResult {
  status: CellStatus;
  output: string;
  metrics: BenchmarkMetrics | null;
  error: string | null;
}

type ResultsMap = Record<number, Record<string, CellResult>>;

const emptyCell = (): CellResult => ({ status: 'idle', output: '', metrics: null, error: null });

function loadStoredTests(): string[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((x) => typeof x === 'string')) {
      return (parsed as string[]).slice(0, MAX_TESTS);
    }
    return null;
  } catch {
    return null;
  }
}

export const TestSuiteView: React.FC<{ models: OllamaModel[] }> = ({ models }) => {
  const { t } = useTranslation();
  const { provider, baseUrl, advancedConfig } = useSettingsStore();

  const [tests, setTests] = useState<string[]>(() => {
    const stored = loadStoredTests();
    if (stored && stored.length > 0) return stored;
    return [
      t('presets.codePrompt'),
      t('presets.logicPrompt'),
      t('presets.summaryPrompt'),
      '',
      '',
    ];
  });
  const [selectedModels, setSelectedModels] = useState<string[]>([]);
  const [results, setResults] = useState<ResultsMap>({});
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0, label: '' });
  const [detail, setDetail] = useState<{ ti: number; model: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  // Persist suite definition.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(tests));
    } catch {
      // storage full / unavailable — non-fatal
    }
  }, [tests]);

  // Default to the first two installed models.
  useEffect(() => {
    if (selectedModels.length === 0 && models.length > 0) {
      setSelectedModels(models.slice(0, 2).map((m) => m.name));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [models]);

  const activeTests = useMemo(
    () => tests.map((p, i) => ({ prompt: p, index: i })).filter((x) => x.prompt.trim()),
    [tests]
  );

  const toggleModel = (name: string) => {
    setSelectedModels((prev) =>
      prev.includes(name) ? prev.filter((m) => m !== name) : [...prev, name]
    );
  };

  const updateCell = (ti: number, model: string, patch: Partial<CellResult>) => {
    setResults((prev) => ({
      ...prev,
      [ti]: { ...(prev[ti] || {}), [model]: { ...(prev[ti]?.[model] || emptyCell()), ...patch } },
    }));
  };

  const runCell = (ti: number, model: string, promptText: string, signal: AbortSignal): Promise<void> => {
    return new Promise((resolve) => {
      LLMService.generateStream(
        { provider, baseUrl },
        {
          model,
          prompt: promptText,
          system: advancedConfig.system,
          temperature: advancedConfig.temperature,
          top_p: advancedConfig.top_p,
          num_ctx: advancedConfig.num_ctx,
        },
        {
          onChunk: (_, fullText) => {
            updateCell(ti, model, { status: 'running', output: fullText });
          },
          onComplete: (fullText, metrics) => {
            updateCell(ti, model, { status: 'done', output: fullText, metrics, error: null });
            resolve();
          },
          onError: (err) => {
            if (signal.aborted) {
              updateCell(ti, model, {
                status: 'error',
                error: t('testsuite.stopped', 'Stopped'),
              });
            } else {
              updateCell(ti, model, { status: 'error', error: err.message });
            }
            resolve();
          },
        },
        signal
      );
    });
  };

  const handleRunAll = async () => {
    if (running || activeTests.length === 0 || selectedModels.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    const signal = controller.signal;

    const queue: { ti: number; model: string; prompt: string }[] = [];
    for (const { prompt, index } of activeTests) {
      for (const model of selectedModels) {
        queue.push({ ti: index, model, prompt });
      }
    }

    setRunning(true);
    setProgress({ done: 0, total: queue.length, label: '' });
    // Reset queued cells, keep the rest.
    setResults((prev) => {
      const next: ResultsMap = { ...prev };
      for (const q of queue) {
        next[q.ti] = { ...(next[q.ti] || {}), [q.model]: emptyCell() };
      }
      return next;
    });

    let done = 0;
    for (const q of queue) {
      if (signal.aborted) break;
      updateCell(q.ti, q.model, { status: 'running', output: '', metrics: null, error: null });
      setProgress({
        done,
        total: queue.length,
        label: `${q.model} · ${t('testsuite.test', 'Test')} ${activeTests.findIndex((x) => x.index === q.ti) + 1}/${activeTests.length}`,
      });
      // eslint-disable-next-line no-await-in-loop
      await runCell(q.ti, q.model, q.prompt, signal);
      done += 1;
      setProgress((p) => ({ ...p, done }));
    }

    abortRef.current = null;
    setRunning(false);
    setProgress((p) => ({ ...p, label: '' }));
  };

  const handleStop = () => {
    abortRef.current?.abort();
  };

  const handleClearResults = () => {
    if (running) return;
    setResults({});
    setProgress({ done: 0, total: 0, label: '' });
  };

  // Winner (fastest TPS) per test row.
  const winners = useMemo(() => {
    const map: Record<number, string | null> = {};
    for (const { index } of activeTests) {
      let best: string | null = null;
      let bestTps = -1;
      for (const m of selectedModels) {
        const cell = results[index]?.[m];
        if (cell?.status === 'done' && cell.metrics && cell.metrics.tps > bestTps) {
          bestTps = cell.metrics.tps;
          best = m;
        }
      }
      map[index] = best;
    }
    return map;
  }, [activeTests, selectedModels, results]);

  const summary = useMemo(() => {
    return selectedModels.map((m) => {
      const cells = activeTests
        .map(({ index }) => results[index]?.[m])
        .filter((c) => c?.status === 'done' && c.metrics);
      const avgTps =
        cells.length > 0
          ? Number((cells.reduce((s, c) => s + (c!.metrics?.tps || 0), 0) / cells.length).toFixed(2))
          : 0;
      const wins = activeTests.filter(({ index }) => winners[index] === m).length;
      return { model: m, avgTps, wins, finished: cells.length };
    });
  }, [activeTests, selectedModels, results, winners]);

  const hasAnyResult = Object.keys(results).length > 0;
  const canRun = !running && activeTests.length > 0 && selectedModels.length > 0 && models.length > 0;

  const buildMarkdown = (): string => {
    const lines: string[] = [];
    lines.push(`# ${t('testsuite.reportTitle', 'Test Suite Report')}`);
    lines.push('');
    lines.push(`- ${t('testsuite.models', 'Models')}: ${selectedModels.join(', ')}`);
    lines.push(`- ${t('testsuite.tests', 'Tests')}: ${activeTests.length}`);
    lines.push('');
    lines.push(`| ${t('testsuite.test', 'Test')} | ${selectedModels.join(' (tok/s) | ')} (tok/s) |`);
    lines.push(`| --- | ${selectedModels.map(() => '---').join(' | ')} |`);
    activeTests.forEach(({ prompt, index }, i) => {
      const cells = selectedModels.map((m) => {
        const c = results[index]?.[m];
        if (!c || c.status === 'idle') return '—';
        if (c.status === 'running') return '…';
        if (c.status === 'error') return `ERR: ${c.error || ''}`;
        const v = c.metrics ? `${c.metrics.tpsEstimated ? '~' : ''}${c.metrics.tps}` : '?';
        return winners[index] === m ? `**${v} 👑**` : v;
      });
      const short = prompt.split('\n')[0].slice(0, 60);
      lines.push(`| #${i + 1} ${short.replace(/\|/g, '\\|')} | ${cells.join(' | ')} |`);
    });
    lines.push('');
    activeTests.forEach(({ prompt, index }, i) => {
      lines.push(`## ${t('testsuite.test', 'Test')} #${i + 1}`);
      lines.push('');
      lines.push(`> ${prompt.split('\n').join('\n> ')}`);
      lines.push('');
      for (const m of selectedModels) {
        const c = results[index]?.[m];
        lines.push(`### ${m}`);
        lines.push('');
        lines.push(c?.output || (c?.error ? `Error: ${c.error}` : '_no output_'));
        lines.push('');
      }
    });
    return lines.join('\n');
  };

  const handleCopyMarkdown = async () => {
    if (!hasAnyResult) return;
    await navigator.clipboard.writeText(buildMarkdown());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (!hasAnyResult) return;
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const rows: string[] = ['test_index,prompt,model,status,tps,ttft_ms,duration_ms,output'];
    activeTests.forEach(({ prompt, index }, i) => {
      for (const m of selectedModels) {
        const c = results[index]?.[m];
        rows.push(
          [
            i + 1,
            esc(prompt.replace(/\n/g, ' ')),
            esc(m),
            c?.status || 'idle',
            c?.metrics?.tps ?? '',
            c?.metrics?.ttftMs ?? '',
            c?.metrics?.totalDurationMs ?? '',
            esc((c?.output || c?.error || '').replace(/\n/g, ' ')),
          ].join(',')
        );
      }
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptdeck-test-suite.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const detailCell = detail ? results[detail.ti]?.[detail.model] : undefined;

  return (
    <div className="p-4 max-w-6xl mx-auto space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-cyan-500 flex items-center justify-center shadow-sm shrink-0">
            <FlaskConical className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-base font-bold">{t('testsuite.title', 'Test Suite')}</h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {t('testsuite.subtitle', 'Run a batch of prompts across models and compare the scoreboard.')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {hasAnyResult && !running && (
            <>
              <button
                onClick={handleCopyMarkdown}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? t('testsuite.copied', 'Copied!') : 'Markdown'}</span>
              </button>
              <button
                onClick={handleExportCsv}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <Download className="w-3.5 h-3.5" />
                <span>CSV</span>
              </button>
              <button
                onClick={handleClearResults}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg text-slate-500 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition"
                title={t('testsuite.clearResults', 'Clear results')}
              >
                <Eraser className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {running ? (
            <button
              onClick={handleStop}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-rose-600 text-white font-medium text-xs hover:bg-rose-700 transition"
            >
              <Square className="w-3.5 h-3.5 fill-current" />
              <span>{t('testsuite.stop', 'Stop')}</span>
            </button>
          ) : (
            <button
              onClick={handleRunAll}
              disabled={!canRun}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition disabled:opacity-50"
            >
              <Play className="w-3.5 h-3.5 fill-current" />
              <span>{t('testsuite.runAll', 'Run suite')}</span>
            </button>
          )}
        </div>
      </div>

      {/* Progress */}
      {running && (
        <div className="p-3 rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
          <div className="flex justify-between mb-1.5 font-mono text-slate-500 dark:text-slate-400">
            <span className="truncate">{progress.label}</span>
            <span>
              {progress.done}/{progress.total}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-slate-200 dark:bg-slate-800 overflow-hidden">
            <div
              className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-cyan-500 transition-all"
              style={{ width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%` }}
            />
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Test prompts editor */}
        <section className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold">
              {t('testsuite.prompts', 'Test prompts')} ({activeTests.length}/{MAX_TESTS})
            </h3>
            <button
              onClick={() => tests.length < MAX_TESTS && setTests((p) => [...p, ''])}
              disabled={tests.length >= MAX_TESTS}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
              {t('testsuite.addPrompt', 'Add')}
            </button>
          </div>
          <div className="p-3 space-y-2 max-h-[420px] overflow-y-auto">
            {tests.map((tp, i) => (
              <div key={i} className="flex gap-2 items-start">
                <span className="mt-2 text-[11px] font-mono text-slate-400 w-5 shrink-0">#{i + 1}</span>
                <textarea
                  value={tp}
                  onChange={(e) => setTests((p) => p.map((x, j) => (j === i ? e.target.value : x)))}
                  disabled={running}
                  rows={2}
                  placeholder={t('testsuite.promptPlaceholder', `Test prompt #${i + 1}…`)}
                  className="flex-1 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/60 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[56px]"
                  dir="auto"
                />
                <button
                  onClick={() => setTests((p) => (p.length <= 1 ? [''] : p.filter((_, j) => j !== i)))}
                  disabled={running}
                  className="mt-2 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition disabled:opacity-40"
                  title={t('testsuite.removePrompt', 'Remove')}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </section>

        {/* Model selection */}
        <section className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden h-fit">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold">
              {t('testsuite.models', 'Models')} ({selectedModels.length})
            </h3>
          </div>
          <div className="p-3 space-y-1.5 max-h-[420px] overflow-y-auto">
            {models.length === 0 && (
              <p className="text-xs text-slate-500 italic p-2">
                {t('testsuite.emptyModels', 'No models installed — pull a model first, then select it here.')}
              </p>
            )}
            {models.map((m, i) => {
              const checked = selectedModels.includes(m.name);
              return (
                <label
                  key={m.name}
                  className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition ${
                    checked
                      ? 'border-indigo-400 dark:border-indigo-500/60 bg-indigo-50/60 dark:bg-indigo-950/30'
                      : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  } ${running ? 'opacity-60 pointer-events-none' : ''}`}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleModel(m.name)}
                    className="w-3.5 h-3.5 accent-indigo-500"
                  />
                  <span
                    className="w-2 h-2 rounded-full shrink-0"
                    style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }}
                  />
                  <span className="font-mono font-medium truncate">{m.name}</span>
                </label>
              );
            })}
            {activeTests.length === 0 && (
              <p className="text-[11px] text-amber-600 dark:text-amber-300 p-1">
                {t('testsuite.needPrompt', 'Add at least one non-empty test prompt to run.')}
              </p>
            )}
          </div>
        </section>
      </div>

      {/* Scoreboard */}
      {hasAnyResult && activeTests.length > 0 && selectedModels.length > 0 && (
        <section className="rounded-xl bg-white dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 overflow-hidden">
          <div className="px-4 py-2.5 border-b border-slate-200 dark:border-slate-800">
            <h3 className="text-xs font-bold">{t('testsuite.scoreboard', 'Scoreboard')}</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-xs min-w-[560px]">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400">
                  <th className="text-start font-semibold px-3 py-2 max-w-[260px]">
                    {t('testsuite.test', 'Test')}
                  </th>
                  {selectedModels.map((m, i) => (
                    <th key={m} className="font-mono font-semibold px-3 py-2 text-center">
                      <span className="inline-flex items-center gap-1.5">
                        <span
                          className="w-2 h-2 rounded-full inline-block"
                          style={{ background: MODEL_COLORS[i % MODEL_COLORS.length] }}
                        />
                        <span className="truncate max-w-[140px]" title={m}>
                          {m.split(':')[0]}
                        </span>
                      </span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {activeTests.map(({ prompt, index }, row) => (
                  <tr
                    key={index}
                    className="border-b border-slate-100 dark:border-slate-800/60 last:border-0 hover:bg-slate-50 dark:hover:bg-slate-800/40"
                  >
                    <td className="px-3 py-2 text-slate-600 dark:text-slate-300 max-w-[260px]">
                      <div className="font-medium truncate" title={prompt} dir="auto">
                        <span className="font-mono text-slate-400 me-1">#{row + 1}</span>
                        {prompt.split('\n')[0].slice(0, 80)}
                      </div>
                    </td>
                    {selectedModels.map((m) => {
                      const c = results[index]?.[m];
                      const isWinner = winners[index] === m;
                      return (
                        <td key={m} className="px-2 py-1.5 text-center">
                          <button
                            onClick={() => c && c.status !== 'idle' && setDetail({ ti: index, model: m })}
                            disabled={!c || c.status === 'idle'}
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono transition ${
                              !c || c.status === 'idle'
                                ? 'text-slate-300 dark:text-slate-600'
                                : c.status === 'running'
                                  ? 'text-indigo-500 animate-pulse'
                                  : c.status === 'error'
                                    ? 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'
                                    : isWinner
                                      ? 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/40 hover:bg-emerald-500/20 font-bold'
                                      : 'text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                            title={c?.error || c?.output?.slice(0, 200) || ''}
                          >
                            {isWinner && c?.status === 'done' && <Crown className="w-3 h-3" />}
                            <span>
                              {!c || c.status === 'idle'
                                ? '—'
                                : c.status === 'running'
                                  ? '…'
                                  : c.status === 'error'
                                    ? 'ERR'
                                    : `${c.metrics?.tpsEstimated ? '~' : ''}${c.metrics?.tps}`}
                            </span>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
                {/* Summary: avg TPS + wins */}
                <tr className="bg-slate-50 dark:bg-slate-800/40 font-mono">
                  <td className="px-3 py-2 font-sans font-semibold text-slate-500 dark:text-slate-400">
                    {t('testsuite.average', 'Avg tok/s · wins')}
                  </td>
                  {summary.map((s) => (
                    <td key={s.model} className="px-3 py-2 text-center">
                      <div className="text-emerald-600 dark:text-emerald-300 font-bold">{s.avgTps || '—'}</div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-300">
                        {s.wins} 👑 / {s.finished}
                      </div>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            {t('testsuite.scoreHint', '👑 = fastest tok/s on that test · click any cell to read the full output.')}
          </p>
        </section>
      )}

      {/* Output detail modal */}
      {detail &&
        detailCell &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setDetail(null)} />
            <div className="relative w-[720px] max-w-full max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 dark:border-white/10">
                <div className="min-w-0">
                  <div className="text-sm font-bold font-mono truncate">{detail.model}</div>
                  <div className="text-[11px] text-slate-500 truncate" dir="auto">
                    {tests[detail.ti]?.split('\n')[0]}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {detailCell.metrics && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-300">
                      {detailCell.metrics.tpsEstimated ? '~' : ''}
                      {detailCell.metrics.tps} tok/s · {detailCell.metrics.ttftMs}ms TTFT
                    </span>
                  )}
                  <button
                    onClick={() => setDetail(null)}
                    className="p-1.5 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-white/10 transition"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto p-5">
                {detailCell.error && !detailCell.output ? (
                  <p className="text-xs text-rose-500" dir="auto">
                    {detailCell.error}
                  </p>
                ) : (
                  <MarkdownRenderer content={detailCell.output} />
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

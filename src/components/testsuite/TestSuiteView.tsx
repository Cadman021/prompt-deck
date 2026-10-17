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
  Upload,
  Share2,
  Copy,
  Crown,
  X,
  FlaskConical,
  Eraser,
  RotateCcw,
} from 'lucide-react';
import { useSettingsStore } from '../../store/useSettingsStore';
import { useCloudStore } from '../../store/useCloudStore';
import { useTestSuiteStore, type SuiteCell } from '../../store/useTestSuiteStore';
import { buildCloudGroups, calcCost, formatCost, parseQualified } from '../../services/modelTarget';
import { resolveRunEndpoint, runRepeatedStream } from '../../services/runTarget';
import { DbService, type BenchmarkResult } from '../../services/dbService';
import { safeHost } from '../../utils/httpError';
import { rafBatch, cancelRafBatch } from '../../utils/rafBatch';
import { NO_CHECK, evalCheck, isValidCheck, type CheckType } from '../../utils/checks';
import { buildSuiteFile, parseSuiteFile } from '../../utils/suiteFile';
import { formatDurationMs } from '../../utils/timeUtils';
import { toast } from '../../store/useToastStore';
import { APP_VERSION } from '../../version';
import { OllamaModel, BenchmarkMetrics } from '../../types/ollama';
import { MarkdownRenderer } from '../MarkdownRenderer';

const MAX_TESTS = 10;
const STORAGE_KEY = 'promptdeck-test-suite';
const MODEL_COLORS = ['#6366f1', '#06b6d4', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6'];

// Green→red ratio background for the scoreboard (relative to each row's best
// tps), so "who is fastest here" reads at a glance even without the crown.
const heatBackground = (ratio: number): string => {
  const clamped = Math.max(0, Math.min(1, ratio));
  const hue = 140 * clamped;
  return `hsla(${hue}, 70%, 45%, 0.18)`;
};

/** One-time import of the pre-store plain-array format. */
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
  const cloudEnabledModels = useCloudStore((s) => s.enabledModels);
  const cloudCustom = useCloudStore((s) => s.customProviders);
  const cloudPricing = useCloudStore((s) => s.modelPricing);

  /** USD cost of one finished suite cell, or null when unknown. */
  const cellCost = (qualified: string, metrics: BenchmarkMetrics | null): number | null => {
    if (!metrics || metrics.tokenSource !== 'server') return null;
    const parsed = parseQualified(qualified, cloudCustom);
    if (parsed.source.kind !== 'cloud') return null;
    return calcCost(
      metrics.promptTokens,
      metrics.completionTokens,
      (cloudPricing[parsed.source.providerId] ?? {})[parsed.model]
    );
  };
  const cloudGroups = useMemo(
    () => buildCloudGroups(cloudCustom, cloudEnabledModels),
    [cloudCustom, cloudEnabledModels]
  );

  // Display name: cloud targets drop the `providerId/` prefix.
  const displayName = (qualified: string): string => {
    const parsed = parseQualified(qualified, cloudCustom);
    return parsed.source.kind === 'cloud' ? parsed.model : qualified;
  };

  // Suite state lives in the store so page switches don't lose results,
  // progress, or the run's AbortController. Definition is persisted.
  const tests = useTestSuiteStore((s) => s.tests);
  const setTests = useTestSuiteStore((s) => s.setTests);
  const checks = useTestSuiteStore((s) => s.checks);
  const setCheck = useTestSuiteStore((s) => s.setCheck);
  const selectedModels = useTestSuiteStore((s) => s.selectedModels);
  const toggleModel = useTestSuiteStore((s) => s.toggleModel);
  const results = useTestSuiteStore((s) => s.results);
  const patchCell = useTestSuiteStore((s) => s.patchCell);
  const resetCells = useTestSuiteStore((s) => s.resetCells);
  const clearResults = useTestSuiteStore((s) => s.clearResults);
  const running = useTestSuiteStore((s) => s.running);
  const setRunning = useTestSuiteStore((s) => s.setRunning);
  const progress = useTestSuiteStore((s) => s.progress);
  const setProgress = useTestSuiteStore((s) => s.setProgress);
  const [detail, setDetail] = useState<{ ti: number; model: string } | null>(null);
  const suiteFileRef = useRef<HTMLInputElement>(null);

  // One-time seed: default prompts (+ legacy plain-array import), then the
  // first two installed models when nothing is selected yet.
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current) return;
    seededRef.current = true;
    const s = useTestSuiteStore.getState();
    if (s.tests.length === 0) {
      const legacy = loadStoredTests();
      s.setTests(
        legacy && legacy.length > 0
          ? legacy
          : [t('presets.codePrompt'), t('presets.logicPrompt'), t('presets.summaryPrompt'), '', '']
      );
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch {
        // ignore
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const s = useTestSuiteStore.getState();
    if (s.selectedModels.length === 0 && models.length > 0) {
      s.setSelectedModels(models.slice(0, 2).map((m) => m.name));
    }
  }, [models, t]);

  const activeTests = useMemo(
    () => tests.map((p, i) => ({ prompt: p, index: i })).filter((x) => x.prompt.trim()),
    [tests]
  );

  const updateCell = (ti: number, model: string, patch: Partial<SuiteCell>) => {
    patchCell(ti, model, patch);
  };

  const runCell = (
    ti: number,
    target: string,
    promptText: string,
    signal: AbortSignal
  ): Promise<void> => {
    const parsed = parseQualified(target, cloudCustom);
    // Resolve the endpoint: local settings or a stored cloud API key.
    const resolved = resolveRunEndpoint(parsed.source, parsed.model, { provider, baseUrl });
    if ('error' in resolved) {
      const msg =
        resolved.error === 'noCloudKey'
          ? t(
              'bench.noCloudKey',
              'No enabled API key for this cloud provider — add one on the Cloud page.'
            )
          : t('bench.unknownProvider', 'Unknown cloud provider.');
      updateCell(ti, target, { status: 'error', error: msg });
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      runRepeatedStream(
        resolved.run.config,
        {
          model: resolved.run.model,
          prompt: promptText,
          system: advancedConfig.system,
          temperature: advancedConfig.temperature,
          top_p: advancedConfig.top_p,
          num_ctx: advancedConfig.num_ctx,
          serverDefaults: advancedConfig.serverDefaults,
          seed: advancedConfig.seed,
          maxTokens: advancedConfig.maxTokens,
        },
        signal,
        advancedConfig.repeats ?? 1,
        {
          onChunk: (fullText) => {
            rafBatch(`${ti}:${target}`, () => {
              // A late frame must never resurrect a finished cell: if the run
              // already finalized (its frame can lag one tick behind onDone),
              // only mirror the text while the cell is still running.
              const cell = useTestSuiteStore.getState().results[ti]?.[target];
              if (cell && cell.status !== 'running') return;
              updateCell(ti, target, { status: 'running', output: fullText });
            });
          },
          onReasoning: (fullReasoning) => {
            rafBatch(`${ti}:${target}:reasoning`, () => {
              updateCell(ti, target, { reasoning: fullReasoning });
            });
          },
          onDone: (output, metrics, error, aborted) => {
            // Cancel any pending frame first, then write the terminal state.
            cancelRafBatch(`${ti}:${target}`);
            cancelRafBatch(`${ti}:${target}:reasoning`);
            if (aborted) {
              updateCell(ti, target, {
                status: 'error',
                error: t('testsuite.stopped', 'Stopped'),
              });
            } else if (error || !metrics) {
              updateCell(ti, target, { status: 'error', error: error ?? 'Empty response.' });
            } else {
              const check = useTestSuiteStore.getState().checks[ti] ?? NO_CHECK;
              updateCell(ti, target, {
                status: 'done',
                output,
                metrics,
                error: null,
                passed: evalCheck(output, check),
              });
            }
            resolve();
          },
        }
      );
    });
  };

  type QueueItem = { ti: number; model: string; prompt: string };

  // True when at least one visible (test, model) cell finished with an error.
  const hasErrorCells = activeTests.some(({ index }) =>
    selectedModels.some((m) => results[index]?.[m]?.status === 'error')
  );

  // Shared by "Run suite" and "Retry failed": resets the queued cells and runs
  // them sequentially with the same runCell + progress + abort plumbing.
  // Full runs (not retries, not stopped runs) are saved to SQLite afterwards —
  // one history row per test prompt, so suite runs show up in History and
  // feed the leaderboard. No winner vote is stored (speed ≠ quality).
  const runQueue = async (queue: QueueItem[], saveToHistory: boolean) => {
    if (running || queue.length === 0) return;
    const controller = new AbortController();
    useTestSuiteStore.getState().setAbortController(controller);
    const signal = controller.signal;

    setRunning(true);
    setProgress({ done: 0, total: queue.length, label: '' });
    // Reset queued cells, keep the rest.
    resetCells(queue);

    let done = 0;
    for (const q of queue) {
      if (signal.aborted) break;
      updateCell(q.ti, q.model, { status: 'running', output: '', metrics: null, error: null });
      setProgress({
        done,
        total: queue.length,
        label: `${q.model} · ${t('testsuite.test', 'Test')} ${activeTests.findIndex((x) => x.index === q.ti) + 1}/${activeTests.length}`,
      });

      await runCell(q.ti, q.model, q.prompt, signal);
      done += 1;
      setProgress({
        done,
        total: queue.length,
        label: `${q.model} · ${t('testsuite.test', 'Test')} ${activeTests.findIndex((x) => x.index === q.ti) + 1}/${activeTests.length}`,
      });
    }

    useTestSuiteStore.getState().setAbortController(null);
    setRunning(false);
    setProgress({ done, total: queue.length, label: '' });

    if (saveToHistory && !signal.aborted) {
      await saveSuiteToHistory(queue);
    }
  };

  /** Persist one history row per finished test prompt (done + error cells). */
  const saveSuiteToHistory = async (queue: QueueItem[]) => {
    const st = useTestSuiteStore.getState();
    const settings = useSettingsStore.getState();
    const cloud = useCloudStore.getState();
    const host = safeHost(settings.baseUrl);
    const runConfig = JSON.stringify({
      suite: true,
      provider: settings.provider,
      host,
      temperature: settings.advancedConfig.serverDefaults
        ? undefined
        : settings.advancedConfig.temperature,
      top_p: settings.advancedConfig.serverDefaults ? undefined : settings.advancedConfig.top_p,
      num_ctx: settings.advancedConfig.serverDefaults ? undefined : settings.advancedConfig.num_ctx,
      serverDefaults: settings.advancedConfig.serverDefaults || undefined,
      appVersion: APP_VERSION,
    });
    const byTest = new Map<number, QueueItem[]>();
    for (const q of queue) {
      const list = byTest.get(q.ti) ?? [];
      list.push(q);
      byTest.set(q.ti, list);
    }
    for (const [ti, items] of byTest) {
      const finished = items.filter((q) => {
        const c = st.results[ti]?.[q.model];
        return c && (c.status === 'done' || c.status === 'error');
      });
      if (finished.length === 0) continue;
      const results: BenchmarkResult[] = finished.map((q) => {
        const c = st.results[ti]?.[q.model];
        const m = c?.metrics ?? null;
        const parsed = parseQualified(q.model, cloud.customProviders);
        let costUsd: number | null = null;
        if (parsed.source.kind === 'cloud' && m?.tokenSource === 'server') {
          costUsd = calcCost(
            m.promptTokens,
            m.completionTokens,
            (cloud.modelPricing[parsed.source.providerId] ?? {})[parsed.model]
          );
        }
        return {
          model: q.model,
          output: c?.output || (c?.error ? `Error: ${c.error}` : ''),
          tps: m?.tps || 0,
          ttft: m?.ttftMs || 0,
          tpsEstimated: m?.tpsEstimated,
          tokenSource: m?.tokenSource,
          promptTokens: m?.promptTokens ?? null,
          completionTokens: m?.completionTokens ?? null,
          costUsd,
          source: parsed.source.kind,
          providerId: parsed.source.kind === 'cloud' ? parsed.source.providerId : null,
          reasoning: c?.reasoning?.trim() ? c.reasoning : null,
        };
      });

      await DbService.saveHistory(items[0].prompt, results, null, runConfig);
    }
  };

  const handleRunAll = async () => {
    if (running || activeTests.length === 0 || selectedModels.length === 0) return;
    const queue: QueueItem[] = [];
    for (const { prompt, index } of activeTests) {
      for (const model of selectedModels) {
        queue.push({ ti: index, model, prompt });
      }
    }
    await runQueue(queue, true);
  };

  // Re-run only the cells whose status is 'error'; successful cells are kept.
  const handleRetryFailed = async () => {
    if (running) return;
    const queue: QueueItem[] = [];
    for (const { prompt, index } of activeTests) {
      for (const model of selectedModels) {
        if (results[index]?.[model]?.status === 'error') {
          queue.push({ ti: index, model, prompt });
        }
      }
    }
    await runQueue(queue, false);
  };

  const handleStop = () => {
    useTestSuiteStore.getState().abortController?.abort();
  };

  const handleClearResults = () => {
    if (running) return;
    clearResults();
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

  // Best tps per test row — the heatmap denominator (green = row best).
  const rowBestTps = useMemo(() => {
    const map: Record<number, number> = {};
    for (const { index } of activeTests) {
      let best = 0;
      for (const m of selectedModels) {
        const cell = results[index]?.[m];
        if (cell?.status === 'done' && cell.metrics && cell.metrics.tps > best) {
          best = cell.metrics.tps;
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
          ? Number(
              (cells.reduce((s, c) => s + (c!.metrics?.tps || 0), 0) / cells.length).toFixed(2)
            )
          : 0;
      const wins = activeTests.filter(({ index }) => winners[index] === m).length;
      const totalCost = cells.reduce<number | null>((sum, c) => {
        const cost = cellCost(m, c!.metrics);
        if (cost == null) return sum;
        return (sum ?? 0) + cost;
      }, null);
      const checked = cells.filter((c) => c!.passed != null);
      const passed = checked.filter((c) => c!.passed).length;
      return {
        model: m,
        avgTps,
        wins,
        finished: cells.length,
        totalCost,
        passRate: checked.length > 0 ? { passed, total: checked.length } : null,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTests, selectedModels, results, winners, cloudPricing, cloudCustom]);

  const hasAnyResult = Object.keys(results).length > 0;
  const canRun = !running && activeTests.length > 0 && selectedModels.length > 0;

  const buildMarkdown = (): string => {
    const lines: string[] = [];
    lines.push(`# ${t('testsuite.reportTitle', 'Test Suite Report')}`);
    lines.push('');
    lines.push(`- ${t('testsuite.models', 'Models')}: ${selectedModels.join(', ')}`);
    lines.push(`- ${t('testsuite.tests', 'Tests')}: ${activeTests.length}`);
    const costParts = summary
      .filter((s) => s.totalCost != null)
      .map((s) => `${s.model}: ${formatCost(s.totalCost!)}`);
    if (costParts.length > 0) {
      lines.push(`- ${t('testsuite.totalCost', 'Total cost')}: ${costParts.join(' · ')}`);
    }
    lines.push('');
    lines.push(
      `| ${t('testsuite.test', 'Test')} | ${selectedModels.join(' (tok/s) | ')} (tok/s) |`
    );
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
    toast(t('testsuite.copied', 'Copied!'), 'success');
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

  // Shareable definition (prompts + checks + models) — no results. Lets users
  // hand a suite to a teammate as a small, versioned JSON file.
  const handleExportSuite = () => {
    const s = useTestSuiteStore.getState();
    const file = buildSuiteFile({
      tests: s.tests,
      checks: s.checks,
      selectedModels: s.selectedModels,
    });
    const blob = new Blob([JSON.stringify(file, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'promptdeck-test-suite.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleImportSuite = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const parsed = parseSuiteFile(await file.text());
      if (!parsed.ok) {
        toast(
          t('testsuite.importError', 'Import failed — not a PromptDeck test suite file.'),
          'error'
        );
        return;
      }
      const nextTests = parsed.def.tests.slice(0, MAX_TESTS);
      const s = useTestSuiteStore.getState();
      s.setTests(nextTests.length > 0 ? nextTests : ['']);
      s.setChecks(parsed.def.checks);
      if (parsed.def.selectedModels.length > 0) s.setSelectedModels(parsed.def.selectedModels);
      // Imported prompts don't match any previous output keys — start clean.
      s.clearResults();
      toast(
        t('testsuite.imported', 'Imported {{count}} tests.', { count: nextTests.length }),
        'success'
      );
    } catch (error) {
      console.error('Suite import failed:', error);
      toast(
        t('testsuite.importError', 'Import failed — not a PromptDeck test suite file.'),
        'error'
      );
    }
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
              {t(
                'testsuite.subtitle',
                'Run a batch of prompts across models and compare the scoreboard.'
              )}
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
                <Copy className="w-3.5 h-3.5" />
                <span>Markdown</span>
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
            <>
              <button
                onClick={() => suiteFileRef.current?.click()}
                title={t('testsuite.importTitle', 'Import a shared test suite (JSON)')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <Upload className="w-3.5 h-3.5" />
                <span>{t('testsuite.importSuite', 'Import')}</span>
              </button>
              <input
                ref={suiteFileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={handleImportSuite}
              />
              <button
                onClick={handleExportSuite}
                title={t('testsuite.exportTitle', 'Export this test suite as JSON')}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
              >
                <Share2 className="w-3.5 h-3.5" />
                <span>{t('testsuite.exportSuite', 'Export')}</span>
              </button>
              <button
                onClick={handleRetryFailed}
                disabled={!hasErrorCells}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 font-medium text-xs transition disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>{t('testsuite.retryFailed', 'Retry failed')}</span>
              </button>
              <button
                onClick={handleRunAll}
                disabled={!canRun}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white font-medium text-xs transition disabled:opacity-50"
              >
                <Play className="w-3.5 h-3.5 fill-current" />
                <span>{t('testsuite.runAll', 'Run suite')}</span>
              </button>
            </>
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
              style={{
                width: `${progress.total > 0 ? Math.round((progress.done / progress.total) * 100) : 0}%`,
              }}
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
              onClick={() => tests.length < MAX_TESTS && setTests([...tests, ''])}
              disabled={tests.length >= MAX_TESTS}
              className="flex items-center gap-1 text-[11px] px-2 py-1 rounded-lg border border-dashed border-slate-300 dark:border-slate-700 text-slate-500 hover:border-indigo-400 hover:text-indigo-500 transition disabled:opacity-40"
            >
              <Plus className="w-3 h-3" />
              {t('testsuite.addPrompt', 'Add')}
            </button>
          </div>
          <div className="p-3 space-y-3 max-h-[420px] overflow-y-auto">
            {tests.map((tp, i) => {
              const check = checks[i] ?? NO_CHECK;
              const valid = isValidCheck(check);
              const setType = (type: CheckType) =>
                setCheck(i, { type, pattern: type === 'json' ? '' : check.pattern });
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex gap-2 items-start">
                    <span className="mt-2 text-[11px] font-mono text-slate-400 w-5 shrink-0">
                      #{i + 1}
                    </span>
                    <textarea
                      value={tp}
                      onChange={(e) =>
                        setTests(tests.map((x, j) => (j === i ? e.target.value : x)))
                      }
                      disabled={running}
                      rows={2}
                      placeholder={t('testsuite.promptPlaceholder', `Test prompt #${i + 1}…`)}
                      className="flex-1 p-2.5 rounded-lg bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-700/60 text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y min-h-[56px]"
                      dir="auto"
                    />
                    <button
                      onClick={() =>
                        setTests(tests.length <= 1 ? [''] : tests.filter((_, j) => j !== i))
                      }
                      disabled={running}
                      className="mt-2 p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition disabled:opacity-40"
                      title={t('testsuite.removePrompt', 'Remove')}
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="flex gap-2 items-center ps-7">
                    <select
                      value={check.type}
                      onChange={(e) => setType(e.target.value as CheckType)}
                      disabled={running}
                      title={t('testsuite.checkTitle', 'Automatic output check')}
                      className={`text-[11px] font-mono rounded-lg px-2 py-1.5 border focus:outline-none focus:ring-1 focus:ring-indigo-500 bg-white dark:bg-slate-950 shrink-0 ${
                        valid
                          ? 'border-slate-200 dark:border-slate-700/60 text-slate-500 dark:text-slate-400'
                          : 'border-rose-400 text-rose-500'
                      }`}
                    >
                      <option value="none">{t('testsuite.checkNone', 'No check')}</option>
                      <option value="contains">{t('testsuite.checkContains', 'Contains')}</option>
                      <option value="regex">{t('testsuite.checkRegex', 'Regex')}</option>
                      <option value="exact">{t('testsuite.checkExact', 'Exact')}</option>
                      <option value="json">{t('testsuite.checkJson', 'Valid JSON')}</option>
                    </select>
                    {check.type !== 'none' && check.type !== 'json' && (
                      <input
                        value={check.pattern}
                        onChange={(e) => setCheck(i, { type: check.type, pattern: e.target.value })}
                        disabled={running}
                        placeholder={
                          check.type === 'regex'
                            ? t('testsuite.checkPatternPlaceholder', 'e.g. error \\d+')
                            : t('testsuite.checkTextPlaceholder', 'Expected text…')
                        }
                        dir="auto"
                        className={`flex-1 min-w-0 p-1.5 rounded-lg text-[11px] font-mono bg-white dark:bg-slate-950 border focus:outline-none focus:ring-1 focus:ring-indigo-500 ${
                          valid
                            ? 'border-slate-200 dark:border-slate-700/60'
                            : 'border-rose-400 text-rose-500'
                        }`}
                      />
                    )}
                    {check.type !== 'none' && !valid && (
                      <span className="text-[10px] text-rose-500 shrink-0">
                        {t('testsuite.checkInvalid', 'Invalid')}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
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
            {models.length === 0 && cloudGroups.length === 0 && (
              <p className="text-xs text-slate-500 italic p-2">
                {t(
                  'testsuite.emptyModels',
                  'No models installed — pull a model first, then select it here.'
                )}
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
            {cloudGroups.map((g) => (
              <div key={g.providerId}>
                <p className="px-1 pt-1.5 pb-1 text-[11px] font-bold text-cyan-600 dark:text-cyan-300">
                  ☁ {g.name}
                </p>
                {g.models.map((m) => {
                  const qualified = `cloud:${g.providerId}/${m}`;
                  const checked = selectedModels.includes(qualified);
                  return (
                    <label
                      key={qualified}
                      className={`flex items-center gap-2.5 p-2.5 rounded-lg border text-xs cursor-pointer transition mb-1.5 ${
                        checked
                          ? 'border-cyan-400 dark:border-cyan-500/60 bg-cyan-50/60 dark:bg-cyan-950/30'
                          : 'border-slate-200 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      } ${running ? 'opacity-60 pointer-events-none' : ''}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleModel(qualified)}
                        className="w-3.5 h-3.5 accent-cyan-500"
                      />
                      <span className="font-mono font-medium truncate" title={qualified}>
                        {m}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
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
                          {displayName(m).split(':')[0]}
                        </span>
                      </span>
                      <span className="block text-[9px] font-normal text-slate-400 dark:text-slate-500">
                        tok/s
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
                      const done = c?.status === 'done' && c.metrics;
                      const bestTps = rowBestTps[index] ?? 0;
                      const ratio = done && bestTps > 0 ? (c!.metrics!.tps || 0) / bestTps : 0;
                      return (
                        <td key={m} className="px-2 py-1.5 text-center">
                          <button
                            onClick={() =>
                              c && c.status !== 'idle' && setDetail({ ti: index, model: m })
                            }
                            disabled={!c || c.status === 'idle'}
                            style={
                              done && !isWinner
                                ? { backgroundColor: heatBackground(ratio) }
                                : undefined
                            }
                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg font-mono tabular-nums transition ${
                              !c || c.status === 'idle'
                                ? 'text-slate-300 dark:text-slate-600'
                                : c.status === 'running'
                                  ? 'text-indigo-500 animate-pulse'
                                  : c.status === 'error'
                                    ? 'text-rose-500 bg-rose-500/10 hover:bg-rose-500/20'
                                    : isWinner
                                      ? 'text-emerald-600 dark:text-emerald-300 bg-emerald-500/10 ring-1 ring-emerald-500/40 hover:bg-emerald-500/20 font-bold'
                                      : 'text-slate-700 dark:text-slate-200 hover:bg-slate-200/60 dark:hover:bg-slate-700/40'
                            }`}
                            title={[
                              c?.error || c?.output?.slice(0, 200) || '',
                              (() => {
                                const cost = c?.status === 'done' ? cellCost(m, c.metrics) : null;
                                return cost != null
                                  ? `${t('metrics.costTitle', 'Estimated run cost')}: ${formatCost(cost)}`
                                  : '';
                              })(),
                            ]
                              .filter(Boolean)
                              .join('\n')}
                          >
                            {isWinner && c?.status === 'done' && <Crown className="w-3 h-3" />}
                            {c?.status === 'done' && c.passed != null && (
                              <span
                                title={
                                  c.passed
                                    ? t('testsuite.checkPassed', 'Check passed')
                                    : t('testsuite.checkFailed', 'Check failed')
                                }
                                className={`w-1.5 h-1.5 rounded-full ${
                                  c.passed ? 'bg-emerald-500' : 'bg-rose-500'
                                }`}
                              />
                            )}
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
                <tr className="bg-slate-50 dark:bg-slate-800/40 font-mono tabular-nums">
                  <td className="px-3 py-2 font-sans font-semibold text-slate-500 dark:text-slate-400">
                    {t('testsuite.average', 'Avg tok/s · wins')}
                  </td>
                  {summary.map((s) => (
                    <td key={s.model} className="px-3 py-2 text-center">
                      <div className="text-emerald-600 dark:text-emerald-300 font-bold">
                        {s.avgTps || '—'}
                      </div>
                      <div className="text-[10px] text-amber-600 dark:text-amber-300">
                        {s.wins} 👑 / {s.finished}
                      </div>
                      {s.passRate && (
                        <div
                          className={`text-[10px] font-bold ${
                            s.passRate.passed === s.passRate.total
                              ? 'text-emerald-600 dark:text-emerald-300'
                              : 'text-rose-500'
                          }`}
                          title={t('testsuite.passRateTitle', 'Automatic checks passed')}
                        >
                          ✓ {s.passRate.passed}/{s.passRate.total}
                        </div>
                      )}
                      {s.totalCost != null && (
                        <div
                          className="text-[10px] text-slate-500 dark:text-slate-400"
                          title={t('testsuite.totalCostTitle', 'Total suite cost for this model')}
                        >
                          {formatCost(s.totalCost)}
                        </div>
                      )}
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>
          <p className="px-4 py-2 text-[10px] text-slate-400 dark:text-slate-500 font-mono">
            {t(
              'testsuite.scoreHint',
              '👑 = fastest tok/s on that test · click any cell to read the full output.'
            )}
          </p>
        </section>
      )}

      {/* Output detail modal */}
      {detail &&
        detailCell &&
        createPortal(
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div
              className="absolute inset-0 bg-black/60 backdrop-blur-sm"
              onClick={() => setDetail(null)}
            />
            <div className="relative w-[720px] max-w-full max-h-[80vh] flex flex-col rounded-2xl bg-white dark:bg-[#161616] border border-slate-200 dark:border-white/10 shadow-2xl overflow-hidden">
              <div className="flex items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 dark:border-white/10">
                <div className="min-w-0">
                  <div className="text-sm font-bold font-mono truncate" title={detail.model}>
                    {displayName(detail.model)}
                  </div>
                  <div className="text-[11px] text-slate-500 truncate" dir="auto">
                    {tests[detail.ti]?.split('\n')[0]}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {detailCell.passed != null && (
                    <span
                      className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${
                        detailCell.passed
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300'
                          : 'bg-rose-500/10 text-rose-500'
                      }`}
                    >
                      {detailCell.passed
                        ? t('testsuite.checkPassed', 'Check passed')
                        : t('testsuite.checkFailed', 'Check failed')}
                    </span>
                  )}
                  {detailCell.metrics && (
                    <span className="text-[11px] font-mono text-emerald-600 dark:text-emerald-300">
                      {detailCell.metrics.tpsEstimated ? '~' : ''}
                      {detailCell.metrics.tps} tok/s · {formatDurationMs(detailCell.metrics.ttftMs)}{' '}
                      TTFT
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
                  <>
                    {detailCell.reasoning?.trim() && (
                      <details className="mb-3 rounded-lg bg-violet-500/5 dark:bg-violet-400/5 border border-violet-500/20 px-3 py-2">
                        <summary className="text-[11px] font-semibold text-violet-600 dark:text-violet-300 cursor-pointer select-none">
                          {t('app.thinking', 'Thinking')}
                        </summary>
                        <div
                          className="mt-1.5 text-xs opacity-80 max-h-48 overflow-y-auto whitespace-pre-wrap font-mono"
                          dir="auto"
                        >
                          {detailCell.reasoning}
                        </div>
                      </details>
                    )}
                    <MarkdownRenderer content={detailCell.output} />
                  </>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};

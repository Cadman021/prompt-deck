// src/store/useTestSuiteStore.ts
// Test Suite state lives here (not in the view component) so switching pages
// doesn't unmount away results, progress, or the run's AbortController.
// Only the suite definition (tests + selection) is persisted; results are
// session state and rebuilt by re-running.
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { BenchmarkMetrics } from '../types/ollama';
import { NO_CHECK, type OutputCheck } from '../utils/checks';

export type SuiteCellStatus = 'idle' | 'running' | 'done' | 'error';

export interface SuiteCell {
  status: SuiteCellStatus;
  output: string;
  reasoning: string;
  metrics: BenchmarkMetrics | null;
  error: string | null;
  /** Auto-check verdict for finished cells (null = no rule). */
  passed: boolean | null;
}

export type SuiteResults = Record<number, Record<string, SuiteCell>>;

export interface SuiteProgress {
  done: number;
  total: number;
  label: string;
}

export const emptySuiteCell = (): SuiteCell => ({
  reasoning: '',
  status: 'idle',
  output: '',
  metrics: null,
  error: null,
  passed: null,
});

interface TestSuiteState {
  /** Test prompt texts (persisted). */
  tests: string[];
  /** Qualified model names, local or `cloud:provider/model` (persisted). */
  selectedModels: string[];
  /** Per-test output checks, keyed by test index (persisted). */
  checks: Record<number, OutputCheck>;
  results: SuiteResults;
  running: boolean;
  progress: SuiteProgress;
  abortController: AbortController | null;
  setTests: (tests: string[]) => void;
  setCheck: (ti: number, check: OutputCheck) => void;
  setSelectedModels: (models: string[]) => void;
  toggleModel: (name: string) => void;
  patchCell: (ti: number, model: string, patch: Partial<SuiteCell>) => void;
  resetCells: (cells: { ti: number; model: string }[]) => void;
  clearResults: () => void;
  setRunning: (running: boolean) => void;
  setProgress: (progress: SuiteProgress) => void;
  setAbortController: (c: AbortController | null) => void;
}

export const useTestSuiteStore = create<TestSuiteState>()(
  persist(
    (set) => ({
      tests: [],
      selectedModels: [],
      checks: {},
      results: {},
      running: false,
      progress: { done: 0, total: 0, label: '' },
      abortController: null,
      setTests: (tests) => set({ tests }),
      setCheck: (ti, check) =>
        set((s) => ({
          checks:
            check.type === 'none' ? { ...s.checks, [ti]: NO_CHECK } : { ...s.checks, [ti]: check },
        })),
      setSelectedModels: (selectedModels) => set({ selectedModels }),
      toggleModel: (name) =>
        set((s) => ({
          selectedModels: s.selectedModels.includes(name)
            ? s.selectedModels.filter((m) => m !== name)
            : [...s.selectedModels, name],
        })),
      patchCell: (ti, model, patch) =>
        set((s) => ({
          results: {
            ...s.results,
            [ti]: {
              ...(s.results[ti] || {}),
              [model]: { ...(s.results[ti]?.[model] || emptySuiteCell()), ...patch },
            },
          },
        })),
      resetCells: (cells) =>
        set((s) => {
          const next: SuiteResults = { ...s.results };
          for (const c of cells) {
            next[c.ti] = { ...(next[c.ti] || {}), [c.model]: emptySuiteCell() };
          }
          return { results: next };
        }),
      clearResults: () => set({ results: {}, progress: { done: 0, total: 0, label: '' } }),
      setRunning: (running) => set({ running }),
      setProgress: (progress) => set({ progress }),
      setAbortController: (abortController) => set({ abortController }),
    }),
    {
      // v2 key: v1 held a bare string[] under this name ('promptdeck-test-suite'),
      // which the component still imports once (see loadStoredTests) and then drops.
      name: 'promptdeck-test-suite-v2',
      version: 2,
      // v1 -> v2: per-test checks added; keep existing suites untouched.
      migrate: (persisted: unknown) => {
        const p = (persisted ?? {}) as { tests?: string[]; selectedModels?: string[] };
        return {
          tests: Array.isArray(p.tests) ? p.tests : [],
          selectedModels: Array.isArray(p.selectedModels) ? p.selectedModels : [],
          checks: {},
        };
      },
      partialize: (s) => ({ tests: s.tests, selectedModels: s.selectedModels, checks: s.checks }),
    }
  )
);

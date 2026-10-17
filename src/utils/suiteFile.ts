// src/utils/suiteFile.ts
// Portable Test Suite definition for sharing: prompts + per-test checks +
// selected models. Only the *definition* travels — results are session state
// and would bloat the file, so they are never exported.
//
// The file is versioned and validated on import; unknown fields are ignored
// and unusable ones are dropped rather than failing the whole import.

import { NO_CHECK, type CheckType, type OutputCheck } from './checks';

export const SUITE_FILE_APP = 'promptdeck';
export const SUITE_FILE_KIND = 'test-suite';
export const SUITE_FILE_VERSION = 1;

export interface SuiteDefinition {
  tests: string[];
  checks: Record<number, OutputCheck>;
  selectedModels: string[];
}

export interface SuiteFile extends SuiteDefinition {
  app: typeof SUITE_FILE_APP;
  kind: typeof SUITE_FILE_KIND;
  version: number;
  exportedAt: string;
}

const CHECK_TYPES: readonly CheckType[] = ['none', 'contains', 'regex', 'exact', 'json'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Builds the shareable, versioned snapshot of a suite definition. */
export function buildSuiteFile(def: SuiteDefinition, now: Date = new Date()): SuiteFile {
  return {
    app: SUITE_FILE_APP,
    kind: SUITE_FILE_KIND,
    version: SUITE_FILE_VERSION,
    exportedAt: now.toISOString(),
    tests: def.tests.slice(),
    checks: { ...def.checks },
    selectedModels: def.selectedModels.slice(),
  };
}

/** Keeps only well-formed checks; anything malformed is dropped. */
function normalizeChecks(raw: unknown): Record<number, OutputCheck> {
  const out: Record<number, OutputCheck> = {};
  if (!isRecord(raw)) return out;
  for (const [key, value] of Object.entries(raw)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || !isRecord(value)) continue;
    const { type, pattern } = value;
    if (typeof type !== 'string' || !CHECK_TYPES.includes(type as CheckType)) continue;
    if (type === 'none') {
      out[index] = NO_CHECK;
      continue;
    }
    if (typeof pattern !== 'string') continue;
    out[index] = { type: type as CheckType, pattern };
  }
  return out;
}

export type ParseSuiteResult =
  { ok: true; def: SuiteDefinition } | { ok: false; error: 'invalidJson' | 'unrecognized' };

/**
 * Parses an exported suite file. Lenient about optional parts (checks,
 * models) but requires a `tests` array of strings so random JSON is rejected.
 */
export function parseSuiteFile(raw: string): ParseSuiteResult {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalidJson' };
  }
  if (!isRecord(data)) return { ok: false, error: 'unrecognized' };

  const { tests, selectedModels } = data;
  if (!Array.isArray(tests) || !tests.every((x) => typeof x === 'string')) {
    return { ok: false, error: 'unrecognized' };
  }

  return {
    ok: true,
    def: {
      tests: tests.slice() as string[],
      checks: normalizeChecks(data.checks),
      selectedModels: Array.isArray(selectedModels)
        ? selectedModels.filter((x): x is string => typeof x === 'string')
        : [],
    },
  };
}

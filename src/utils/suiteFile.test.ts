// Round-trip + validation tests for the shareable Test Suite file format.
import { describe, expect, it } from 'vitest';
import {
  SUITE_FILE_KIND,
  SUITE_FILE_VERSION,
  buildSuiteFile,
  parseSuiteFile,
  type SuiteDefinition,
} from './suiteFile';

const def: SuiteDefinition = {
  tests: ['first prompt', 'second prompt'],
  checks: { 0: { type: 'contains', pattern: 'ok' }, 1: { type: 'regex', pattern: '\\d+' } },
  selectedModels: ['llama3:latest', 'cloud:openrouter/openai/gpt-4o-mini'],
};

describe('buildSuiteFile / parseSuiteFile', () => {
  it('round-trips a definition', () => {
    const file = buildSuiteFile(def, new Date('2026-10-17T00:00:00Z'));
    const parsed = parseSuiteFile(JSON.stringify(file));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.def).toEqual(def);
  });

  it('stamps app/kind/version and an ISO timestamp', () => {
    const file = buildSuiteFile(def, new Date('2026-10-17T12:34:56Z'));
    expect(file.app).toBe('promptdeck');
    expect(file.kind).toBe(SUITE_FILE_KIND);
    expect(file.version).toBe(SUITE_FILE_VERSION);
    expect(file.exportedAt).toBe('2026-10-17T12:34:56.000Z');
  });

  it('does not mutate the source definition', () => {
    const source: SuiteDefinition = { tests: ['a'], checks: {}, selectedModels: ['m'] };
    const file = buildSuiteFile(source);
    file.tests.push('b');
    file.selectedModels.push('n');
    expect(source.tests).toEqual(['a']);
    expect(source.selectedModels).toEqual(['m']);
  });

  it('rejects malformed JSON', () => {
    expect(parseSuiteFile('{not json')).toEqual({ ok: false, error: 'invalidJson' });
  });

  it('rejects payloads without a string[] tests array', () => {
    expect(parseSuiteFile('42')).toEqual({ ok: false, error: 'unrecognized' });
    expect(parseSuiteFile('{"checks":{}}')).toEqual({ ok: false, error: 'unrecognized' });
    expect(parseSuiteFile('{"tests":[1,2]}')).toEqual({ ok: false, error: 'unrecognized' });
  });

  it('tolerates missing checks/models and drops invalid checks', () => {
    const parsed = parseSuiteFile(
      JSON.stringify({
        tests: ['p'],
        checks: {
          '0': { type: 'contains', pattern: 'x' },
          '1': { type: 'bogus', pattern: 'x' },
          '2': { type: 'regex' },
          '3': { type: 'none', pattern: '' },
          bad: { type: 'contains', pattern: 'x' },
        },
      })
    );
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    expect(parsed.def.selectedModels).toEqual([]);
    expect(parsed.def.checks).toEqual({
      0: { type: 'contains', pattern: 'x' },
      3: { type: 'none', pattern: '' },
    });
  });
});

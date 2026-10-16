// Unit tests for suite output checks.
import { describe, expect, it } from 'vitest';
import { evalCheck, isValidCheck } from './checks';

describe('evalCheck', () => {
  it('returns null when there is no rule', () => {
    expect(evalCheck('anything', { type: 'none', pattern: '' })).toBeNull();
    expect(evalCheck('anything', { type: 'contains', pattern: '' })).toBeNull();
    expect(evalCheck('anything', { type: 'regex', pattern: '' })).toBeNull();
    expect(evalCheck('anything', { type: 'regex', pattern: '([' })).toBeNull();
  });

  it('evaluates contains / exact', () => {
    expect(evalCheck('hello world', { type: 'contains', pattern: 'world' })).toBe(true);
    expect(evalCheck('hello world', { type: 'contains', pattern: 'mars' })).toBe(false);
    expect(evalCheck('  padded  ', { type: 'exact', pattern: 'padded' })).toBe(true);
    expect(evalCheck('a', { type: 'exact', pattern: 'b' })).toBe(false);
  });

  it('evaluates regex and json', () => {
    expect(evalCheck('error 404', { type: 'regex', pattern: 'error \\d+' })).toBe(true);
    expect(evalCheck('ok', { type: 'regex', pattern: '^err' })).toBe(false);
    expect(evalCheck('{"a":1}', { type: 'json', pattern: '' })).toBe(true);
    expect(evalCheck('{oops', { type: 'json', pattern: '' })).toBe(false);
  });
});

describe('isValidCheck', () => {
  it('flags empty patterns and invalid regex', () => {
    expect(isValidCheck({ type: 'none', pattern: '' })).toBe(true);
    expect(isValidCheck({ type: 'json', pattern: '' })).toBe(true);
    expect(isValidCheck({ type: 'contains', pattern: '' })).toBe(false);
    expect(isValidCheck({ type: 'regex', pattern: '' })).toBe(false);
    expect(isValidCheck({ type: 'regex', pattern: '([' })).toBe(false);
    expect(isValidCheck({ type: 'regex', pattern: 'a+' })).toBe(true);
  });
});

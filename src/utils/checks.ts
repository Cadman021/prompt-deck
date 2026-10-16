// src/utils/checks.ts
// Automatic output checks for Test Suite cells. Returns true/false, or null
// when there is nothing to evaluate (no rule, empty pattern, invalid regex).

export type CheckType = 'none' | 'contains' | 'regex' | 'exact' | 'json';

export interface OutputCheck {
  type: CheckType;
  pattern: string;
}

export const NO_CHECK: OutputCheck = { type: 'none', pattern: '' };

export function evalCheck(output: string, check: OutputCheck): boolean | null {
  if (!check || check.type === 'none') return null;
  switch (check.type) {
    case 'contains':
      return check.pattern ? output.includes(check.pattern) : null;
    case 'exact':
      return output.trim() === check.pattern.trim();
    case 'json':
      try {
        JSON.parse(output);
        return true;
      } catch {
        return false;
      }
    case 'regex':
      if (!check.pattern) return null;
      try {
        return new RegExp(check.pattern).test(output);
      } catch {
        return null; // invalid pattern: unevaluated, flagged in the editor
      }
  }
}

export function isValidCheck(check: OutputCheck): boolean {
  if (check.type === 'none' || check.type === 'json') return true;
  if ((check.type === 'contains' || check.type === 'exact') && !check.pattern.trim()) return false;
  if (check.type === 'regex') {
    if (!check.pattern) return false;
    try {
      new RegExp(check.pattern);
      return true;
    } catch {
      return false;
    }
  }
  return true;
}

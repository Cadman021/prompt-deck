// src/utils/diffUtils.ts
// Minimal line-based diff (LCS over lines) — no new dependencies.

export type DiffKind = 'same' | 'added' | 'removed';

export interface DiffLine {
  kind: DiffKind;
  text: string;
  leftNo: number | null;
  rightNo: number | null;
}

/**
 * Computes a line-level diff between two texts.
 * Returns rows for side-by-side rendering. Identical texts take the
 * O(1) fast-path above without touching the LCS table.
 */
export function diffLines(left: string, right: string): DiffLine[] {
  const a = left.split('\n');
  const b = right.split('\n');

  // Fast paths
  if (left === right) {
    return a.map((text, i) => ({ kind: 'same' as DiffKind, text, leftNo: i + 1, rightNo: i + 1 }));
  }
  if (a.length === 1 && a[0] === '') {
    return b.map((text, i) => ({ kind: 'added' as DiffKind, text, leftNo: null, rightNo: i + 1 }));
  }
  if (b.length === 1 && b[0] === '') {
    return a.map((text, i) => ({ kind: 'removed' as DiffKind, text, leftNo: i + 1, rightNo: null }));
  }

  const n = a.length;
  const m = b.length;

  // Cap the LCS table to keep memory sane for huge outputs.
  const MAX_CELLS = 250_000;
  if (n * m > MAX_CELLS) {
    return fallbackDiff(a, b);
  }

  // LCS length table (Uint16 is enough given the cap above).
  const dp: Uint16Array[] = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const rows: DiffLine[] = [];
  let i = 0;
  let j = 0;
  let leftNo = 1;
  let rightNo = 1;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      rows.push({ kind: 'same', text: a[i], leftNo: leftNo++, rightNo: rightNo++ });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      rows.push({ kind: 'removed', text: a[i], leftNo: leftNo++, rightNo: null });
      i++;
    } else {
      rows.push({ kind: 'added', text: b[j], leftNo: null, rightNo: rightNo++ });
      j++;
    }
  }
  while (i < n) rows.push({ kind: 'removed', text: a[i++], leftNo: leftNo++, rightNo: null });
  while (j < m) rows.push({ kind: 'added', text: b[j++], leftNo: null, rightNo: rightNo++ });
  return rows;
}

/** O(n) fallback for very large outputs: common prefix/suffix + changed middle. */
function fallbackDiff(a: string[], b: string[]): DiffLine[] {
  let prefix = 0;
  while (prefix < a.length && prefix < b.length && a[prefix] === b[prefix]) prefix++;

  let suffix = 0;
  while (
    suffix < a.length - prefix &&
    suffix < b.length - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const rows: DiffLine[] = [];
  for (let k = 0; k < prefix; k++) {
    rows.push({ kind: 'same', text: a[k], leftNo: k + 1, rightNo: k + 1 });
  }
  for (let k = prefix; k < a.length - suffix; k++) {
    rows.push({ kind: 'removed', text: a[k], leftNo: k + 1, rightNo: null });
  }
  for (let k = prefix; k < b.length - suffix; k++) {
    rows.push({ kind: 'added', text: b[k], leftNo: null, rightNo: k + 1 });
  }
  for (let k = 0; k < suffix; k++) {
    const ai = a.length - suffix + k;
    const bi = b.length - suffix + k;
    rows.push({ kind: 'same', text: a[ai], leftNo: ai + 1, rightNo: bi + 1 });
  }
  return rows;
}

export interface DiffSummary {
  same: number;
  added: number;
  removed: number;
  similarity: number; // 0..1 fraction of unchanged lines
}

export function summarizeDiff(rows: DiffLine[]): DiffSummary {
  let same = 0;
  let added = 0;
  let removed = 0;
  for (const r of rows) {
    if (r.kind === 'same') same++;
    else if (r.kind === 'added') added++;
    else removed++;
  }
  const total = same + added + removed;
  return { same, added, removed, similarity: total > 0 ? same / total : 1 };
}

// src/utils/tokens.ts
// Script-aware token estimate for when the server reports no usage.
// Latin ≈ 4 chars/token, Arabic-script (fa/ar/ur) ≈ 2.5, CJK ≈ 1.5.
// Still a heuristic — always rendered with `~`.

const CJK_RE = /[㐀-䶿一-鿿豈-﫿぀-ヿ가-힯]/g;
const ARABIC_SCRIPT_RE = /[؀-ۿݐ-ݿﭐ-﷿ﹰ-﻿]/g;

export function estimateTokens(text: string): number {
  if (!text) return 1;
  const cjk = (text.match(CJK_RE) || []).length;
  const arabic = (text.match(ARABIC_SCRIPT_RE) || []).length;
  const rest = Math.max(0, text.length - cjk - arabic);
  return Math.max(1, Math.ceil(cjk / 1.5 + arabic / 2.5 + rest / 4));
}

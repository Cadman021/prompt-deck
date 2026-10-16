// src/utils/tokens.ts
// Script-aware token estimate for when the server reports no usage.
// Latin ≈ 4 chars/token, Arabic-script (fa/ar/ur) ≈ 2.5, CJK ≈ 1.5.
// Still a heuristic — always rendered with `~`.

// Escaped ranges (literal non-ASCII chars trip no-irregular-whitespace, and
// the old Arabic range accidentally included U+FEFF zero-width no-break space).
const CJK_RE = /[\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\u3040-\u30FF\uAC00-\uD7AF]/g;
const ARABIC_SCRIPT_RE = /[\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFC]/g;

export function estimateTokens(text: string): number {
  if (!text) return 1;
  const cjk = (text.match(CJK_RE) || []).length;
  const arabic = (text.match(ARABIC_SCRIPT_RE) || []).length;
  const rest = Math.max(0, text.length - cjk - arabic);
  return Math.max(1, Math.ceil(cjk / 1.5 + arabic / 2.5 + rest / 4));
}

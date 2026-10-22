// src/utils/sweep.ts
// Helpers for the context-length sweep (pure, so they stay unit-testable).
import { estimateTokens } from './tokens';

/** Neutral text repeated to fill the context window. */
const FILLER = 'The quick brown fox jumps over the lazy dog. ';

/** "8K" style label for a context size in tokens. */
export const labelForContext = (ctx: number): string => `${Math.round(ctx / 1024)}K`;

/**
 * Pads `prompt` with neutral filler until the whole prompt occupies roughly
 * `targetTokens` (estimated). The user's prompt goes last so the model answers
 * the real question instead of continuing the filler.
 */
export function buildSweepPrompt(prompt: string, targetTokens: number): string {
  const need = Math.max(0, targetTokens - estimateTokens(prompt));
  if (need === 0) return prompt;
  // The filler is plain ASCII, so it costs ~4 characters per token. Size it in
  // characters (not "sentences per token estimate", which rounds up per call
  // and would undershoot), then add one sentence if rounding left us short.
  const targetChars = need * 4;
  const repeats = Math.max(1, Math.ceil(targetChars / FILLER.length));
  let filler = FILLER.repeat(repeats);
  if (estimateTokens(`${filler}\n\n${prompt}`) < targetTokens) filler += FILLER;
  return `${filler}\n\n${prompt}`;
}

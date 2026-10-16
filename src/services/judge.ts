// src/services/judge.ts
// LLM-as-judge: one model scores all bench outputs against a fixed rubric.
// Outputs are presented BLIND (Response 1..N, no identities) and mapped back
// afterwards. The judge never votes — it only advises; the human still crowns.
import type { ModelSource } from './modelTarget';

/** Decode a JSON-encoded judge target; null when malformed or model-less. */
export function decodeJudgeTarget(value: string): { source: ModelSource; model: string } | null {
  try {
    const parsed = JSON.parse(value) as { kind?: string; providerId?: string; model?: string };
    if (!parsed.model) return null;
    return {
      source:
        parsed.kind === 'cloud' && parsed.providerId
          ? { kind: 'cloud', providerId: parsed.providerId }
          : { kind: 'local' },
      model: parsed.model,
    };
  } catch {
    return null;
  }
}

export interface JudgeScore {
  /** 1-based response index as presented to the judge. */
  index: number;
  score: number;
  reason: string;
}

export interface JudgeVerdict {
  scores: JudgeScore[];
  /** 1-based winning index. */
  winner: number;
}

export function buildJudgePrompt(userPrompt: string, outputs: string[]): string {
  const bodies = outputs
    .map((o, i) => `Response ${i + 1}:\n---\n${o.trim() || '(empty)'}\n---`)
    .join('\n\n');
  return `You are an impartial judge comparing ${outputs.length} responses to the same user prompt.
Score each response from 1 to 10 on: correctness (40%), completeness (30%), clarity (30%).
Be strict, use the full range, and do not favor verbosity or formatting over substance.
Respond with ONLY valid JSON — no markdown fences, no commentary:
{"scores": [{"index": 1, "score": 7, "reason": "..."}], "winner": 2}

User prompt:
---
${userPrompt.trim()}
---

${bodies}`;
}

function extractJson(text: string): string {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (fenced) return fenced[1].trim();
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start >= 0 && end > start) return text.slice(start, end + 1);
  return text.trim();
}

export type JudgeParseResult = { verdict: JudgeVerdict } | { error: string; raw: string };

/** Parse and validate a judge response. Never throws. */
export function parseJudgeResponse(text: string, count: number): JudgeParseResult {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(text));
  } catch {
    return { error: 'unparseable', raw: text };
  }
  if (!parsed || typeof parsed !== 'object') return { error: 'unparseable', raw: text };
  const obj = parsed as { scores?: unknown; winner?: unknown };
  if (!Array.isArray(obj.scores) || typeof obj.winner !== 'number') {
    return { error: 'shape', raw: text };
  }
  const scores: JudgeScore[] = [];
  for (const s of obj.scores) {
    if (!s || typeof s !== 'object') return { error: 'shape', raw: text };
    const entry = s as { index?: unknown; score?: unknown; reason?: unknown };
    if (
      typeof entry.index !== 'number' ||
      !Number.isInteger(entry.index) ||
      entry.index < 1 ||
      entry.index > count ||
      typeof entry.score !== 'number' ||
      !Number.isFinite(entry.score)
    ) {
      return { error: 'shape', raw: text };
    }
    scores.push({
      index: entry.index,
      score: Math.min(10, Math.max(1, Math.round(entry.score))),
      reason: typeof entry.reason === 'string' ? entry.reason : '',
    });
  }
  if (
    !Number.isInteger(obj.winner) ||
    (obj.winner as number) < 1 ||
    (obj.winner as number) > count ||
    !scores.some((s) => s.index === obj.winner)
  ) {
    return { error: 'winner', raw: text };
  }
  return { verdict: { scores, winner: obj.winner as number } };
}

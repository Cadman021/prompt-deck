// Unit tests for the judge prompt builder + response parser.
import { describe, expect, it } from 'vitest';
import { buildJudgePrompt, decodeJudgeTarget, parseJudgeResponse } from './judge';

describe('buildJudgePrompt', () => {
  it('numbers responses blindly without identities', () => {
    const p = buildJudgePrompt('2+2?', ['4', 'four']);
    expect(p).toContain('Response 1:');
    expect(p).toContain('Response 2:');
    expect(p).not.toContain('Model');
  });
});

describe('decodeJudgeTarget', () => {
  it('decodes local and cloud targets, rejects garbage', () => {
    expect(decodeJudgeTarget(JSON.stringify({ kind: 'local', model: 'llama3' }))).toEqual({
      source: { kind: 'local' },
      model: 'llama3',
    });
    expect(
      decodeJudgeTarget(JSON.stringify({ kind: 'cloud', providerId: 'groq', model: 'm' }))
    ).toEqual({ source: { kind: 'cloud', providerId: 'groq' }, model: 'm' });
    expect(decodeJudgeTarget('garbage')).toBeNull();
    expect(decodeJudgeTarget(JSON.stringify({ kind: 'local' }))).toBeNull();
  });
});

describe('parseJudgeResponse', () => {
  const good = JSON.stringify({
    scores: [
      { index: 1, score: 7.4, reason: 'correct but terse' },
      { index: 2, score: 9, reason: 'complete' },
    ],
    winner: 2,
  });

  it('parses valid verdicts and clamps/rounds scores', () => {
    const r = parseJudgeResponse(good, 2);
    expect('verdict' in r && r.verdict.winner).toBe(2);
    if ('verdict' in r) {
      expect(r.verdict.scores[0].score).toBe(7);
    }
  });

  it('unwraps markdown fences', () => {
    const r = parseJudgeResponse(`Here you go:\n\`\`\`json\n${good}\n\`\`\``, 2);
    expect('verdict' in r).toBe(true);
  });

  it('rejects garbage, wrong shapes, and out-of-range winners', () => {
    expect(parseJudgeResponse('no json here', 2)).toMatchObject({ error: 'unparseable' });
    expect(parseJudgeResponse('{"scores": [], "winner": 1}', 2)).toMatchObject({ error: 'winner' });
    expect(
      parseJudgeResponse(
        JSON.stringify({ scores: [{ index: 1, score: 5, reason: '' }], winner: 3 }),
        2
      )
    ).toMatchObject({ error: 'winner' });
    expect(
      parseJudgeResponse(
        JSON.stringify({ scores: [{ index: 0, score: 5, reason: '' }], winner: 1 }),
        2
      )
    ).toMatchObject({ error: 'shape' });
  });
});

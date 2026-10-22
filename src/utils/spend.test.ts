import { describe, expect, it } from 'vitest';
import { summarizeSpend, type SpendDay, type SpendRow } from './spend';

const row = (over: Partial<SpendRow> = {}): SpendRow => ({
  providerId: 'openai',
  model: 'gpt-4o-mini',
  cost: 1,
  runs: 1,
  promptTokens: 100,
  completionTokens: 50,
  ...over,
});

describe('summarizeSpend', () => {
  it('returns an empty summary with a zero-filled 30-day window', () => {
    const s = summarizeSpend([], [], '2026-10-22');
    expect(s.totalCost).toBe(0);
    expect(s.totalRuns).toBe(0);
    expect(s.providers).toEqual([]);
    expect(s.models).toEqual([]);
    expect(s.last30).toHaveLength(30);
    expect(s.last30[0].day).toBe('2026-09-23');
    expect(s.last30[29].day).toBe('2026-10-22');
    expect(s.last30.every((d) => d.cost === 0)).toBe(true);
  });

  it('totals cost, runs and tokens across models', () => {
    const s = summarizeSpend(
      [
        row({ cost: 0.5, runs: 2, promptTokens: 10, completionTokens: 5 }),
        row({ model: 'o3', cost: 0.25, runs: 1, promptTokens: 7, completionTokens: 3 }),
      ],
      [],
      '2026-10-22'
    );
    expect(s.totalCost).toBeCloseTo(0.75);
    expect(s.totalRuns).toBe(3);
    expect(s.totalPromptTokens).toBe(17);
    expect(s.totalCompletionTokens).toBe(8);
  });

  it('merges models into provider totals, sorted by cost', () => {
    const s = summarizeSpend(
      [
        row({ providerId: 'groq', model: 'llama', cost: 0.1, runs: 1 }),
        row({ providerId: 'openai', model: 'gpt-4o-mini', cost: 0.4, runs: 2 }),
        row({ providerId: 'openai', model: 'o3', cost: 0.2, runs: 1 }),
      ],
      [],
      '2026-10-22'
    );
    expect(s.providers.map((p) => p.providerId)).toEqual(['openai', 'groq']);
    expect(s.providers[0].cost).toBeCloseTo(0.6);
    expect(s.providers[0].runs).toBe(3);
    expect(s.providers[1].runs).toBe(1);
    expect(s.models.map((m) => m.model)).toEqual(['gpt-4o-mini', 'o3', 'llama']);
  });

  it('zero-fills the last 30 days and ignores older spend there', () => {
    const days: SpendDay[] = [
      { day: '2026-09-01', cost: 9 },
      { day: '2026-09-23', cost: 0.5 },
      { day: '2026-10-22', cost: 1.5 },
    ];
    const s = summarizeSpend([row()], days, '2026-10-22');
    expect(s.last30[0]).toEqual({ day: '2026-09-23', cost: 0.5 });
    expect(s.last30[29]).toEqual({ day: '2026-10-22', cost: 1.5 });
    expect(s.last30.reduce((n, d) => n + d.cost, 0)).toBe(2);
    expect(s.daily).toHaveLength(3);
  });

  it('rolls daily spend into sorted month totals', () => {
    const days: SpendDay[] = [
      { day: '2026-10-02', cost: 0.3 },
      { day: '2026-09-30', cost: 0.2 },
      { day: '2026-10-01', cost: 0.1 },
    ];
    expect(summarizeSpend([row()], days, '2026-10-22').monthly).toEqual([
      { month: '2026-09', cost: 0.2 },
      { month: '2026-10', cost: 0.4 },
    ]);
  });

  it('survives a day row with a full timestamp', () => {
    const s = summarizeSpend([row()], [{ day: '2026-10-21 08:30:00', cost: 2 }], '2026-10-22');
    expect(s.daily).toEqual([{ day: '2026-10-21', cost: 2 }]);
  });
});

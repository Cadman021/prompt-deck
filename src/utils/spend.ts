// src/utils/spend.ts
// Shaping/aggregation for the cloud-spend dashboard. Pure so it stays testable;
// the SQL that feeds it lives in DbService.getSpendStats.

export interface SpendRow {
  providerId: string;
  model: string;
  cost: number;
  runs: number;
  promptTokens: number;
  completionTokens: number;
}

export interface SpendDay {
  day: string;
  cost: number;
}

export interface SpendProviderTotal {
  providerId: string;
  cost: number;
  runs: number;
}

export interface SpendSummary {
  totalCost: number;
  totalRuns: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
  providers: SpendProviderTotal[];
  models: SpendRow[];
  /** Every day with spend, oldest first (for the full history). */
  daily: SpendDay[];
  /** Exactly 30 days ending at `todayIso`, zero-filled. */
  last30: SpendDay[];
  /** Calendar-month totals, oldest first. */
  monthly: { month: string; cost: number }[];
}

const dayOf = (iso: string): string => iso.slice(0, 10);
const DAY_MS = 86_400_000;

/** `todayIso` is a `YYYY-MM-DD` string so callers (and tests) stay in UTC. */
export function summarizeSpend(rows: SpendRow[], days: SpendDay[], todayIso: string): SpendSummary {
  const providerMap = new Map<string, SpendProviderTotal>();
  let totalCost = 0;
  let totalRuns = 0;
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const row of rows) {
    const cost = Number.isFinite(row.cost) ? row.cost : 0;
    const runs = Number.isFinite(row.runs) ? row.runs : 0;
    totalCost += cost;
    totalRuns += runs;
    totalPromptTokens += row.promptTokens || 0;
    totalCompletionTokens += row.completionTokens || 0;

    const provider = providerMap.get(row.providerId) ?? {
      providerId: row.providerId,
      cost: 0,
      runs: 0,
    };
    provider.cost += cost;
    provider.runs += runs;
    providerMap.set(row.providerId, provider);
  }

  const daily = days
    .map((d) => ({ day: dayOf(d.day), cost: Number.isFinite(d.cost) ? d.cost : 0 }))
    .sort((a, b) => a.day.localeCompare(b.day));

  const byDay = new Map<string, number>();
  for (const d of daily) byDay.set(d.day, (byDay.get(d.day) ?? 0) + d.cost);

  const last30: SpendDay[] = [];
  const end = Date.parse(`${todayIso}T00:00:00Z`);
  for (let i = 29; i >= 0; i -= 1) {
    const day = new Date(end - i * DAY_MS).toISOString().slice(0, 10);
    last30.push({ day, cost: byDay.get(day) ?? 0 });
  }

  const monthMap = new Map<string, number>();
  for (const d of daily) {
    const month = d.day.slice(0, 7);
    monthMap.set(month, (monthMap.get(month) ?? 0) + d.cost);
  }
  const monthly = [...monthMap.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([month, cost]) => ({ month, cost }));

  return {
    totalCost,
    totalRuns,
    totalPromptTokens,
    totalCompletionTokens,
    providers: [...providerMap.values()].sort((a, b) => b.cost - a.cost),
    models: [...rows].sort((a, b) => b.cost - a.cost),
    daily,
    last30,
    monthly,
  };
}

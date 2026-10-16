// src/services/dbService.ts
import Database from '@tauri-apps/plugin-sql';
import { computeElo, ELO_INITIAL, wilsonLowerBound } from '../utils/stats';

export interface BenchmarkResult {
  model: string;
  output: string;
  tps: number;
  ttft: number;
  tpsEstimated?: boolean;
  tokenSource?: string;
  /** Exact server-reported token counts (absent for heuristic/failed runs). */
  promptTokens?: number | null;
  completionTokens?: number | null;
  /** USD cost frozen at run time (needs exact tokens + pricing). */
  costUsd?: number | null;
  /** Thinking trace for reasoning models (live runs only; can be long). */
  reasoning?: string | null;
  /** Explicit run source ('local' | 'cloud'); null on pre-source rows. */
  source?: 'local' | 'cloud' | null;
  /** Cloud provider id when source === 'cloud'. */
  providerId?: string | null;
}

export interface HistoryRecord {
  id?: number;
  prompt: string;
  results: BenchmarkResult[];
  winnerModel?: string | null;
  created_at?: string;
  /** JSON snapshot of the run configuration (sampling params, provider host, app version). Never contains secrets. */
  runConfig?: string | null;
}

export interface UserPreset {
  id?: number;
  label: string;
  prompt: string;
  created_at?: string;
}

export interface ModelStat {
  model: string;
  runs: number;
  avgTps: number;
  wins: number;
  winRate: number; // 0..1
  /** Wilson lower bound of the win rate. */
  wilson: number; // 0..1
  /** Elo rating from pairwise vote outcomes (1200 start). */
  elo: number;
}

interface RawResultRow {
  model: string;
  tps: number;
  ttft: number;
  output: string;
  tps_estimated?: number | null;
  token_source?: string | null;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  cost_usd?: number | null;
  source?: string | null;
  provider_id?: string | null;
  reasoning?: string | null;
}

interface RawRunRow {
  id: number;
  prompt: string;
  created_at: string;
  winner_model?: string | null;
  run_config?: string | null;
}

/** Current schema version. Bump when appending to MIGRATIONS below. */
const SCHEMA_VERSION = 4;

// Retrospective versioning: v1 = winner votes + tps estimates, v2 = run
// config + tokens + cost, v3 = explicit run source. Fresh installs get all
// columns from CREATE TABLE, so these only ever fire on pre-existing DBs.
const MIGRATIONS: { version: number; sql: string }[] = [
  { version: 1, sql: `ALTER TABLE benchmark_runs ADD COLUMN winner_model TEXT` },
  { version: 1, sql: `ALTER TABLE benchmark_results ADD COLUMN tps_estimated INTEGER DEFAULT 0` },
  {
    version: 1,
    sql: `ALTER TABLE benchmark_results ADD COLUMN token_source TEXT DEFAULT 'server'`,
  },
  { version: 2, sql: `ALTER TABLE benchmark_runs ADD COLUMN run_config TEXT` },
  { version: 2, sql: `ALTER TABLE benchmark_results ADD COLUMN prompt_tokens INTEGER` },
  { version: 2, sql: `ALTER TABLE benchmark_results ADD COLUMN completion_tokens INTEGER` },
  { version: 2, sql: `ALTER TABLE benchmark_results ADD COLUMN cost_usd REAL` },
  { version: 3, sql: `ALTER TABLE benchmark_results ADD COLUMN source TEXT DEFAULT 'local'` },
  { version: 3, sql: `ALTER TABLE benchmark_results ADD COLUMN provider_id TEXT` },
  { version: 4, sql: `ALTER TABLE benchmark_results ADD COLUMN reasoning TEXT` },
];

export class DbService {
  private static db: Database | null = null;

  private static async readUserVersion(db: Database): Promise<number> {
    try {
      const rows = await db.select<{ user_version: number }[]>('PRAGMA user_version');
      return rows[0]?.user_version ?? 0;
    } catch {
      return 0;
    }
  }

  /** Applies pending migrations based on PRAGMA user_version. */
  private static async migrate(): Promise<void> {
    const db = this.db;
    if (!db) return;
    const current = await DbService.readUserVersion(db);
    for (const m of MIGRATIONS) {
      if (m.version <= current) continue;
      try {
        await db.execute(m.sql);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        if (!/duplicate column name/i.test(msg)) throw e;
      }
    }
    await db.execute(`PRAGMA user_version = ${SCHEMA_VERSION}`);
  }

  static async init(): Promise<Database> {
    if (this.db) return this.db;

    this.db = await Database.load('sqlite:promptdeck.db');

    // Enable foreign key constraints (needed for cascading deletes)
    await this.db.execute('PRAGMA foreign_keys = ON;');

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS benchmark_runs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        winner_model TEXT,
        run_config TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS benchmark_results (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        run_id INTEGER NOT NULL,
        model TEXT NOT NULL,
        tps REAL,
        ttft INTEGER,
        output TEXT,
        position INTEGER,
        tps_estimated INTEGER DEFAULT 0,
        token_source TEXT DEFAULT 'server',
        prompt_tokens INTEGER,
        completion_tokens INTEGER,
        cost_usd REAL,
        source TEXT DEFAULT 'local',
        provider_id TEXT,
        reasoning TEXT,
        FOREIGN KEY (run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE
      );
    `);

    await this.db.execute(`
      CREATE INDEX IF NOT EXISTS idx_benchmark_results_run_id
      ON benchmark_results (run_id);
    `);

    // --- Versioned schema migrations (PRAGMA user_version) ---
    // Fresh installs already get the full schema from CREATE TABLE above, so
    // these ALTERs no-op there. Only "duplicate column" is tolerated — any
    // other failure (e.g. a locked DB) propagates instead of being swallowed.
    await this.migrate();

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS user_presets (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        label TEXT NOT NULL,
        prompt TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    // --- One-time migration from the old fixed 2-column "history" table (pre-v0.2) ---
    try {
      interface LegacyHistoryRow {
        prompt: string;
        created_at: string;
        model1: string;
        tps1: number;
        ttft1: number;
        output1: string;
        model2: string;
        tps2: number;
        ttft2: number;
        output2: string;
      }
      const oldRows = await this.db.select<LegacyHistoryRow[]>(`SELECT * FROM history`);
      if (oldRows && oldRows.length > 0) {
        for (const row of oldRows) {
          const runResult = await this.db.execute(
            `INSERT INTO benchmark_runs (prompt, created_at) VALUES (?, ?)`,
            [row.prompt, row.created_at]
          );
          const runId = runResult.lastInsertId;
          await this.db.execute(
            `INSERT INTO benchmark_results (run_id, model, tps, ttft, output, position) VALUES (?, ?, ?, ?, ?, ?)`,
            [runId, row.model1, row.tps1, row.ttft1, row.output1 || '', 0]
          );
          await this.db.execute(
            `INSERT INTO benchmark_results (run_id, model, tps, ttft, output, position) VALUES (?, ?, ?, ?, ?, ?)`,
            [runId, row.model2, row.tps2, row.ttft2, row.output2 || '', 1]
          );
        }
        await this.db.execute(`DROP TABLE history`);
      }
    } catch (_) {
      // "history" table doesn't exist — nothing to migrate, this is a fresh install
    }

    return this.db;
  }

  /**
   * Save one benchmark run with an arbitrary number of model results (2+).
   * Partial runs (some slots failed) are saved as-is; failed slots carry
   * tps=0 and the error text as output. winnerModel is optional.
   * Returns the new run id (or null when the save failed) so callers can
   * attach votes without re-reading the history table (no race).
   */
  static async saveHistory(
    prompt: string,
    results: BenchmarkResult[],
    winnerModel?: string | null,
    runConfig?: string | null
  ): Promise<number | null> {
    try {
      const db = await this.init();
      // One transaction: a kill mid-save can no longer leave a half run
      // (run row without all of its result rows).
      await db.execute('BEGIN');
      const runInsert = await db.execute(
        `INSERT INTO benchmark_runs (prompt, winner_model, run_config) VALUES (?, ?, ?)`,
        [prompt, winnerModel ?? null, runConfig ?? null]
      );
      const runId = runInsert.lastInsertId;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        await db.execute(
          `INSERT INTO benchmark_results (run_id, model, tps, ttft, output, position, tps_estimated, token_source, prompt_tokens, completion_tokens, cost_usd, source, provider_id, reasoning) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            runId,
            r.model,
            r.tps,
            r.ttft,
            r.output || '',
            i,
            r.tpsEstimated ? 1 : 0,
            r.tokenSource || 'server',
            r.promptTokens ?? null,
            r.completionTokens ?? null,
            r.costUsd ?? null,
            r.source ?? 'local',
            r.providerId ?? null,
            r.reasoning || null,
          ]
        );
      }
      await db.execute('COMMIT');
      return runId ?? null;
    } catch (error) {
      console.error('Failed to save history:', error);
      try {
        await (await this.init()).execute('ROLLBACK');
      } catch {
        // Already rolled back / never began — nothing to undo.
      }
      return null;
    }
  }

  /** Escape LIKE wildcards so user search text matches literally. */
  private static likePattern(query: string): string {
    return `%${query.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
  }

  private static historyWhere(
    query: string,
    winnersOnly: boolean
  ): { clause: string; params: (string | number)[] } {
    const clauses: string[] = [];
    const params: (string | number)[] = [];
    const q = query.trim();
    if (q) {
      const pattern = this.likePattern(q);
      clauses.push(
        `(benchmark_runs.prompt LIKE ? ESCAPE '\\' OR benchmark_runs.id IN (SELECT run_id FROM benchmark_results WHERE model LIKE ? ESCAPE '\\'))`
      );
      params.push(pattern, pattern);
    }
    if (winnersOnly) {
      clauses.push(
        `(benchmark_runs.winner_model IS NOT NULL AND benchmark_runs.winner_model != '')`
      );
    }
    return { clause: clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '', params };
  }

  static async countHistory(query = '', winnersOnly = false): Promise<number> {
    try {
      const db = await this.init();
      const { clause, params } = this.historyWhere(query, winnersOnly);
      const rows = await db.select<{ n: number }[]>(
        `SELECT COUNT(*) as n FROM benchmark_runs ${clause}`,
        params
      );
      return rows[0]?.n ?? 0;
    } catch (error) {
      console.error('Failed to count history:', error);
      return 0;
    }
  }

  static async getHistory(
    limit = 50,
    offset = 0,
    query = '',
    winnersOnly = false
  ): Promise<HistoryRecord[]> {
    try {
      const db = await this.init();
      // Two queries total (runs + one JOIN) instead of N+1. Results arrive
      // ordered by run, then by column position.
      const { clause, params } = this.historyWhere(query, winnersOnly);
      const runRows = await db.select<RawRunRow[]>(
        limit > 0
          ? `SELECT id, prompt, created_at, winner_model, run_config FROM benchmark_runs ${clause} ORDER BY id DESC LIMIT ? OFFSET ?`
          : `SELECT id, prompt, created_at, winner_model, run_config FROM benchmark_runs ${clause} ORDER BY id DESC`,
        limit > 0 ? [...params, limit, offset] : params
      );
      if (runRows.length === 0) return [];
      const ids = runRows.map((r) => r.id);
      const placeholders = ids.map(() => '?').join(',');
      const resultRows = await db.select<(RawResultRow & { run_id: number })[]>(
        `SELECT run_id, model, tps, ttft, output, tps_estimated, token_source, prompt_tokens, completion_tokens, cost_usd, source, provider_id, reasoning FROM benchmark_results WHERE run_id IN (${placeholders}) ORDER BY run_id DESC, position ASC`,
        ids
      );
      const byRun = new Map<number, (RawResultRow & { run_id: number })[]>();
      for (const row of resultRows) {
        const list = byRun.get(row.run_id) ?? [];
        list.push(row);
        byRun.set(row.run_id, list);
      }
      return runRows.map((run) => ({
        id: run.id,
        prompt: run.prompt,
        created_at: run.created_at,
        winnerModel: run.winner_model ?? null,
        runConfig: run.run_config ?? null,
        results: (byRun.get(run.id) ?? []).map((r) => ({
          model: r.model,
          tps: r.tps,
          ttft: r.ttft,
          output: r.output,
          tpsEstimated: Boolean(r.tps_estimated),
          tokenSource: r.token_source || 'server',
          promptTokens: r.prompt_tokens ?? null,
          completionTokens: r.completion_tokens ?? null,
          costUsd: r.cost_usd ?? null,
          source: r.source === 'cloud' ? 'cloud' : r.source === 'local' ? 'local' : null,
          providerId: r.provider_id ?? null,
          reasoning: r.reasoning ?? null,
        })),
      }));
    } catch (error) {
      console.error('Failed to fetch history:', error);
      return [];
    }
  }

  /**
   * Aggregated per-model stats for the leaderboard.
   * `runs` counts successful runs only (failed/stopped rows with tps=0 are
   * excluded from both the denominator and the average), and ranking uses
   * the Wilson lower bound so small samples can't dominate.
   */
  static async getModelStats(): Promise<ModelStat[]> {
    try {
      const db = await this.init();
      const rows = await db.select<{ model: string; runs: number; avgTps: number | null }[]>(
        `SELECT model, SUM(CASE WHEN tps > 0 THEN 1 ELSE 0 END) as runs, AVG(NULLIF(tps, 0)) as avgTps
         FROM benchmark_results GROUP BY model ORDER BY runs DESC`
      );
      const winRows = await db.select<{ winner_model: string; wins: number }[]>(
        `SELECT winner_model, COUNT(*) as wins FROM benchmark_runs
         WHERE winner_model IS NOT NULL AND winner_model != ''
         GROUP BY winner_model`
      );
      const winMap = new Map(winRows.map((w) => [w.winner_model, w.wins]));
      // Pairwise vote outcomes in chronological order for Elo: each voted
      // run counts the winner as beating every other model in that run.
      const matchRows = await db.select<{ run_id: number; winner: string; model: string }[]>(
        `SELECT r.id as run_id, r.winner_model as winner, res.model as model
         FROM benchmark_runs r JOIN benchmark_results res ON res.run_id = r.id
         WHERE r.winner_model IS NOT NULL AND r.winner_model != ''
         ORDER BY r.id ASC`
      );
      const matchesByRun = new Map<number, { winner: string; opponents: string[] }>();
      for (const row of matchRows) {
        const entry = matchesByRun.get(row.run_id) ?? { winner: row.winner, opponents: [] };
        entry.opponents.push(row.model);
        matchesByRun.set(row.run_id, entry);
      }
      const elo = computeElo([...matchesByRun.values()]);
      return rows.map((r) => {
        const wins = winMap.get(r.model) ?? 0;
        return {
          model: r.model,
          runs: r.runs,
          avgTps: Number((r.avgTps ?? 0).toFixed(2)),
          wins,
          winRate: r.runs > 0 ? wins / r.runs : 0,
          wilson: wilsonLowerBound(wins, r.runs),
          elo: Math.round(elo.get(r.model) ?? ELO_INITIAL),
        };
      });
    } catch (error) {
      console.error('Failed to fetch model stats:', error);
      return [];
    }
  }

  /**
   * Overwrite one result row (used when a failed/stopped bench slot is
   * retried — the saved run keeps its id, only this column's data refreshes).
   */
  static async updateBenchmarkResult(
    runId: number,
    model: string,
    r: Pick<
      BenchmarkResult,
      | 'output'
      | 'tps'
      | 'ttft'
      | 'tpsEstimated'
      | 'tokenSource'
      | 'promptTokens'
      | 'completionTokens'
      | 'costUsd'
      | 'reasoning'
    >
  ): Promise<void> {
    try {
      const db = await this.init();
      await db.execute(
        `UPDATE benchmark_results SET output = ?, tps = ?, ttft = ?, tps_estimated = ?, token_source = ?, prompt_tokens = ?, completion_tokens = ?, cost_usd = ?, reasoning = ? WHERE run_id = ? AND model = ?`,
        [
          r.output || '',
          r.tps,
          r.ttft,
          r.tpsEstimated ? 1 : 0,
          r.tokenSource || 'server',
          r.promptTokens ?? null,
          r.completionTokens ?? null,
          r.costUsd ?? null,
          r.reasoning || null,
          runId,
          model,
        ]
      );
    } catch (error) {
      console.error('Failed to update benchmark result:', error);
    }
  }

  /**
   * Full-database backup as JSON (runs + presets). Importable via
   * importDatabase on any install. HistoryRecord objects already carry
   * every column, so getHistory(0) is the complete dump.
   */
  static async exportDatabase(): Promise<string> {
    const [history, presets] = await Promise.all([this.getHistory(0), this.getUserPresets()]);
    return JSON.stringify(
      { version: 1, exportedAt: new Date().toISOString(), history, presets },
      null,
      2
    );
  }

  /**
   * Restores a backup created by exportDatabase. Rows get fresh ids (merge,
   * never overwrite). Returns the imported run count, or throws on invalid
   * files so the UI can report the failure.
   */
  static async importDatabase(json: string): Promise<number> {
    const parsed: unknown = JSON.parse(json);
    if (!parsed || typeof parsed !== 'object') throw new Error('Invalid backup file.');
    const data = parsed as { history?: unknown; presets?: unknown };
    if (!Array.isArray(data.history)) throw new Error('Invalid backup file.');
    const db = await this.init();
    let runs = 0;
    await db.execute('BEGIN');
    try {
      for (const h of data.history) {
        const rec = h as HistoryRecord;
        if (typeof rec.prompt !== 'string' || !Array.isArray(rec.results)) continue;
        const createdAt = rec.created_at ?? new Date().toISOString().slice(0, 19).replace('T', ' ');
        const runInsert = await db.execute(
          `INSERT INTO benchmark_runs (prompt, winner_model, run_config, created_at) VALUES (?, ?, ?, ?)`,
          [rec.prompt, rec.winnerModel ?? null, rec.runConfig ?? null, createdAt]
        );
        const runId = runInsert.lastInsertId;
        if (runId == null) continue;
        const results = rec.results;
        for (let i = 0; i < results.length; i++) {
          const r = results[i];
          if (!r || typeof r.model !== 'string') continue;
          await db.execute(
            `INSERT INTO benchmark_results (run_id, model, tps, ttft, output, position, tps_estimated, token_source, prompt_tokens, completion_tokens, cost_usd, source, provider_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [
              runId,
              r.model,
              r.tps ?? 0,
              r.ttft ?? 0,
              r.output || '',
              i,
              r.tpsEstimated ? 1 : 0,
              r.tokenSource || 'server',
              r.promptTokens ?? null,
              r.completionTokens ?? null,
              r.costUsd ?? null,
              r.source ?? 'local',
              r.providerId ?? null,
            ]
          );
        }
        runs += 1;
      }
      if (Array.isArray(data.presets)) {
        for (const p of data.presets as UserPreset[]) {
          if (typeof p?.label !== 'string' || typeof p?.prompt !== 'string') continue;
          await db.execute('INSERT INTO user_presets (label, prompt) VALUES (?, ?)', [
            p.label,
            p.prompt,
          ]);
        }
      }
      await db.execute('COMMIT');
      return runs;
    } catch (error) {
      try {
        await db.execute('ROLLBACK');
      } catch {
        // ignore
      }
      throw error;
    }
  }

  static async setWinner(runId: number, winnerModel: string | null): Promise<void> {
    try {
      const db = await this.init();
      await db.execute('UPDATE benchmark_runs SET winner_model = ? WHERE id = ?', [
        winnerModel,
        runId,
      ]);
    } catch (error) {
      console.error('Failed to set winner:', error);
    }
  }

  static async deleteRecord(id: number): Promise<void> {
    try {
      const db = await this.init();
      // benchmark_results rows are removed automatically via ON DELETE CASCADE
      await db.execute('DELETE FROM benchmark_runs WHERE id = ?', [id]);
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  }

  static async clearHistory(): Promise<void> {
    try {
      const db = await this.init();
      await db.execute('DELETE FROM benchmark_runs');
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }

  // --- User-defined prompt presets ---

  static async getUserPresets(): Promise<UserPreset[]> {
    try {
      const db = await this.init();
      return await db.select<UserPreset[]>('SELECT * FROM user_presets ORDER BY id DESC');
    } catch (error) {
      console.error('Failed to fetch presets:', error);
      return [];
    }
  }

  static async savePreset(label: string, prompt: string): Promise<void> {
    try {
      const db = await this.init();
      await db.execute('INSERT INTO user_presets (label, prompt) VALUES (?, ?)', [label, prompt]);
    } catch (error) {
      console.error('Failed to save preset:', error);
    }
  }

  static async deletePreset(id: number): Promise<void> {
    try {
      const db = await this.init();
      await db.execute('DELETE FROM user_presets WHERE id = ?', [id]);
    } catch (error) {
      console.error('Failed to delete preset:', error);
    }
  }
}

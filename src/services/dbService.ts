// src/services/dbService.ts
import Database from '@tauri-apps/plugin-sql';

export interface BenchmarkResult {
  model: string;
  output: string;
  tps: number;
  ttft: number;
  tpsEstimated?: boolean;
  tokenSource?: string;
}

export interface HistoryRecord {
  id?: number;
  prompt: string;
  results: BenchmarkResult[];
  winnerModel?: string | null;
  created_at?: string;
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
}

interface RawResultRow {
  model: string;
  tps: number;
  ttft: number;
  output: string;
  tps_estimated?: number | null;
  token_source?: string | null;
}

interface RawRunRow {
  id: number;
  prompt: string;
  created_at: string;
  winner_model?: string | null;
}

export class DbService {
  private static db: Database | null = null;

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
        FOREIGN KEY (run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE
      );
    `);

    // --- Non-destructive migrations for databases created by older versions ---
    // Each ALTER runs in its own try/catch: failure means the column already exists.
    try {
      await this.db.execute(`ALTER TABLE benchmark_runs ADD COLUMN winner_model TEXT`);
    } catch (_) {
      // column already exists
    }
    try {
      await this.db.execute(`ALTER TABLE benchmark_results ADD COLUMN tps_estimated INTEGER DEFAULT 0`);
    } catch (_) {
      // column already exists
    }
    try {
      await this.db.execute(`ALTER TABLE benchmark_results ADD COLUMN token_source TEXT DEFAULT 'server'`);
    } catch (_) {
      // column already exists
    }

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
      const oldRows = await this.db.select<any[]>(
        `SELECT * FROM history`
      );
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
   */
  static async saveHistory(
    prompt: string,
    results: BenchmarkResult[],
    winnerModel?: string | null
  ): Promise<void> {
    try {
      const db = await this.init();
      const runInsert = await db.execute(
        `INSERT INTO benchmark_runs (prompt, winner_model) VALUES (?, ?)`,
        [prompt, winnerModel ?? null]
      );
      const runId = runInsert.lastInsertId;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        await db.execute(
          `INSERT INTO benchmark_results (run_id, model, tps, ttft, output, position, tps_estimated, token_source) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            runId,
            r.model,
            r.tps,
            r.ttft,
            r.output || '',
            i,
            r.tpsEstimated ? 1 : 0,
            r.tokenSource || 'server',
          ]
        );
      }
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  static async getHistory(): Promise<HistoryRecord[]> {
    try {
      const db = await this.init();
      const runs = await db.select<RawRunRow[]>(
        'SELECT id, prompt, created_at, winner_model FROM benchmark_runs ORDER BY id DESC LIMIT 50'
      );

      const records: HistoryRecord[] = [];
      for (const run of runs) {
        const rows = await db.select<RawResultRow[]>(
          'SELECT model, tps, ttft, output, tps_estimated, token_source FROM benchmark_results WHERE run_id = ? ORDER BY position ASC',
          [run.id]
        );
        records.push({
          id: run.id,
          prompt: run.prompt,
          created_at: run.created_at,
          winnerModel: run.winner_model ?? null,
          results: rows.map((r) => ({
            model: r.model,
            tps: r.tps,
            ttft: r.ttft,
            output: r.output,
            tpsEstimated: Boolean(r.tps_estimated),
            tokenSource: r.token_source || 'server',
          })),
        });
      }
      return records;
    } catch (error) {
      console.error('Failed to fetch history:', error);
      return [];
    }
  }

  /**
   * Aggregated per-model stats for the leaderboard:
   * run count, average TPS (ignoring failed 0-TPS rows), win count and win rate.
   */
  static async getModelStats(): Promise<ModelStat[]> {
    try {
      const db = await this.init();
      const rows = await db.select<{ model: string; runs: number; avgTps: number | null }[]>(
        `SELECT model, COUNT(*) as runs, AVG(NULLIF(tps, 0)) as avgTps
         FROM benchmark_results GROUP BY model ORDER BY runs DESC`
      );
      const winRows = await db.select<{ winner_model: string; wins: number }[]>(
        `SELECT winner_model, COUNT(*) as wins FROM benchmark_runs
         WHERE winner_model IS NOT NULL AND winner_model != ''
         GROUP BY winner_model`
      );
      const winMap = new Map(winRows.map((w) => [w.winner_model, w.wins]));
      return rows.map((r) => {
        const wins = winMap.get(r.model) ?? 0;
        return {
          model: r.model,
          runs: r.runs,
          avgTps: Number((r.avgTps ?? 0).toFixed(2)),
          wins,
          winRate: r.runs > 0 ? wins / r.runs : 0,
        };
      });
    } catch (error) {
      console.error('Failed to fetch model stats:', error);
      return [];
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
      return await db.select<UserPreset[]>(
        'SELECT * FROM user_presets ORDER BY id DESC'
      );
    } catch (error) {
      console.error('Failed to fetch presets:', error);
      return [];
    }
  }

  static async savePreset(label: string, prompt: string): Promise<void> {
    try {
      const db = await this.init();
      await db.execute(
        'INSERT INTO user_presets (label, prompt) VALUES (?, ?)',
        [label, prompt]
      );
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

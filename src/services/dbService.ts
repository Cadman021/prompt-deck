// src/services/dbService.ts
import Database from '@tauri-apps/plugin-sql';

export interface BenchmarkResult {
  model: string;
  output: string;
  tps: number;
  ttft: number;
}

export interface HistoryRecord {
  id?: number;
  prompt: string;
  results: BenchmarkResult[];
  created_at?: string;
}

export interface UserPreset {
  id?: number;
  label: string;
  prompt: string;
  created_at?: string;
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
        FOREIGN KEY (run_id) REFERENCES benchmark_runs(id) ON DELETE CASCADE
      );
    `);

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
   */
  static async saveHistory(prompt: string, results: BenchmarkResult[]): Promise<void> {
    try {
      const db = await this.init();
      const runInsert = await db.execute(
        `INSERT INTO benchmark_runs (prompt) VALUES (?)`,
        [prompt]
      );
      const runId = runInsert.lastInsertId;

      for (let i = 0; i < results.length; i++) {
        const r = results[i];
        await db.execute(
          `INSERT INTO benchmark_results (run_id, model, tps, ttft, output, position) VALUES (?, ?, ?, ?, ?, ?)`,
          [runId, r.model, r.tps, r.ttft, r.output || '', i]
        );
      }
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  static async getHistory(): Promise<HistoryRecord[]> {
    try {
      const db = await this.init();
      const runs = await db.select<
        { id: number; prompt: string; created_at: string }[]
      >('SELECT * FROM benchmark_runs ORDER BY id DESC LIMIT 50');

      const records: HistoryRecord[] = [];
      for (const run of runs) {
        const results = await db.select<BenchmarkResult[]>(
          'SELECT model, tps, ttft, output FROM benchmark_results WHERE run_id = ? ORDER BY position ASC',
          [run.id]
        );
        records.push({
          id: run.id,
          prompt: run.prompt,
          created_at: run.created_at,
          results,
        });
      }
      return records;
    } catch (error) {
      console.error('Failed to fetch history:', error);
      return [];
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
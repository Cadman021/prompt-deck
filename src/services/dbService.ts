// src/services/dbService.ts
import Database from '@tauri-apps/plugin-sql';

export interface HistoryRecord {
  id?: number;
  prompt: string;
  model1: string;
  model2: string;
  tps1: number;
  tps2: number;
  ttft1: number;
  ttft2: number;
  output1?: string;
  output2?: string;
  created_at?: string;
}

export class DbService {
  private static db: Database | null = null;

  static async init(): Promise<Database> {
    if (this.db) return this.db;

    this.db = await Database.load('sqlite:promptdeck.db');

    await this.db.execute(`
      CREATE TABLE IF NOT EXISTS history (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        prompt TEXT NOT NULL,
        model1 TEXT NOT NULL,
        model2 TEXT NOT NULL,
        tps1 REAL,
        tps2 REAL,
        ttft1 INTEGER,
        ttft2 INTEGER,
        output1 TEXT,
        output2 TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      );
    `);

    try {
      await this.db.execute('ALTER TABLE history ADD COLUMN output1 TEXT;');
    } catch (_) {}
    try {
      await this.db.execute('ALTER TABLE history ADD COLUMN output2 TEXT;');
    } catch (_) {}

    return this.db;
  }

  static async saveHistory(record: Omit<HistoryRecord, 'id' | 'created_at'>): Promise<void> {
    try {
      const db = await this.init();
      await db.execute(
        `INSERT INTO history (prompt, model1, model2, tps1, tps2, ttft1, ttft2, output1, output2)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          record.prompt,
          record.model1,
          record.model2,
          record.tps1,
          record.tps2,
          record.ttft1,
          record.ttft2,
          record.output1 || '',
          record.output2 || '',
        ]
      );
    } catch (error) {
      console.error('Failed to save history:', error);
    }
  }

  static async getHistory(): Promise<HistoryRecord[]> {
    try {
      const db = await this.init();
      return await db.select<HistoryRecord[]>(
        'SELECT * FROM history ORDER BY id DESC LIMIT 50'
      );
    } catch (error) {
      console.error('Failed to fetch history:', error);
      return [];
    }
  }

  static async deleteRecord(id: number): Promise<void> {
    try {
      const db = await this.init();
      await db.execute('DELETE FROM history WHERE id = ?', [id]);
    } catch (error) {
      console.error('Failed to delete record:', error);
    }
  }

  static async clearHistory(): Promise<void> {
    try {
      const db = await this.init();
      await db.execute('DELETE FROM history');
    } catch (error) {
      console.error('Failed to clear history:', error);
    }
  }
}
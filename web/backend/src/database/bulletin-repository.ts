/**
 * Bulletin Repository
 * Handles all bulletin-related database operations
 */

import type { Bulletin } from './types';

export class BulletinRepository {
  constructor(private db: any) {}

  async createBulletin(bulletin: { conferenceId: number; filename: string; title: string }): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare(`
      INSERT INTO bulletins (conferenceid, filename, title)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(bulletin.conferenceId, bulletin.filename, bulletin.title);
    return result.lastInsertRowid as number;
  }

  async getBulletins(conferenceId?: number): Promise<Bulletin[]> {
    if (!this.db) throw new Error('Database not initialized');

    let sql: string;
    let params: any[];

    if (conferenceId !== undefined) {
      sql = 'SELECT * FROM bulletins WHERE conferenceid = ? ORDER BY created DESC';
      params = [conferenceId];
    } else {
      sql = 'SELECT * FROM bulletins ORDER BY created DESC';
      params = [];
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      conferenceId: row.conferenceid,
      filename: row.filename,
      title: row.title,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getBulletinById(id: number): Promise<Bulletin | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM bulletins WHERE id = ?');
    const row = stmt.get(id) as any;

    if (!row) return null;

    return {
      id: row.id,
      conferenceId: row.conferenceid,
      filename: row.filename,
      title: row.title,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async deleteBulletin(id: number): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('DELETE FROM bulletins WHERE id = ?');
    stmt.run(id);
  }
}

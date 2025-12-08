/**
 * Bulletin Repository
 * Handles all bulletin-related database operations
 */

import type { Bulletin } from './types';
import { BaseRepository } from './BaseRepository';

export class BulletinRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  async createBulletin(bulletin: { conferenceId: number; filename: string; title: string }): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO bulletins (conferenceid, filename, title)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(bulletin.conferenceId, bulletin.filename, bulletin.title);
    return result.lastInsertRowid as number;
  }

  async getBulletins(conferenceId?: number): Promise<Bulletin[]> {

    let sql: string;
    let params: any[];

    if (conferenceId !== undefined) {
      sql = 'SELECT * FROM bulletins WHERE conferenceid = ? ORDER BY created DESC';
      params = [conferenceId];
    } else {
      sql = 'SELECT * FROM bulletins ORDER BY created DESC';
      params = [];
    }

    const stmt = this.prepare(sql);
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

    const stmt = this.prepare('SELECT * FROM bulletins WHERE id = ?');
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

    const stmt = this.prepare('DELETE FROM bulletins WHERE id = ?');
    stmt.run(id);
  }
}

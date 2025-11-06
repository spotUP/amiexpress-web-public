/**
 * Conference Repository
 * Handles all conference and message base related database operations
 */

import { conferenceFileManager } from '../services/ConferenceFileManager';
import { messageFileManager } from '../services/MessageFileManager';
import type { Conference, MessageBase } from './types';

export class ConferenceRepository {
  constructor(private db: any) {}

  async createConference(conf: Omit<Conference, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('INSERT INTO conferences (name, description) VALUES (?, ?)');
    const result = stmt.run(conf.name, conf.description);
    const confId = result.lastInsertRowid as number;

    // CRITICAL: Write to Conf.DB for Amiga door compatibility
    try {
      const allConfs = await this.getConferences();
      const slotNumber = allConfs.length - 1;  // 0-indexed
      const fullConf: Conference = {
        ...conf,
        id: confId,
        created: new Date(),
        updated: new Date()
      };
      conferenceFileManager.writeConferenceFile(fullConf, slotNumber);
      console.log(`[Database] Synced conference "${conf.name}" to Conf.DB (slot ${slotNumber})`);
    } catch (error) {
      console.error(`[Database] Failed to sync conference to disk:`, error);
      // Don't throw - DB insert succeeded
    }

    return confId;
  }

  async getConferences(): Promise<Conference[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM conferences ORDER BY id');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getConferenceById(id: number): Promise<Conference | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM conferences WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async updateConference(id: number, updates: Partial<Conference>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created' && key !== 'updated');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f as keyof Conference]);

    const sql = `UPDATE conferences SET ${setClause} WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);

    // CRITICAL: Sync to Conf.DB for Amiga door compatibility
    try {
      const selectStmt = this.db.prepare('SELECT * FROM conferences WHERE id = ?');
      const row = selectStmt.get(id) as any;

      if (row) {
        const fullConf: Conference = {
          id: row.id,
          name: row.name,
          description: row.description,
          created: new Date(row.created * 1000),
          updated: new Date(row.updated * 1000)
        };

        const allConfs = await this.getConferences();
        const slotNumber = allConfs.findIndex(c => c.id === id);

        if (slotNumber >= 0) {
          conferenceFileManager.updateConferenceFile(fullConf, slotNumber);
          console.log(`[Database] Synced updated conference "${row.name}" to Conf.DB (slot ${slotNumber})`);
        }
      }
    } catch (error) {
      console.error(`[Database] Failed to sync updated conference to disk:`, error);
    }
  }

  async createMessageBase(mb: Omit<MessageBase, 'id' | 'created' | 'updated'>): Promise<number> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('INSERT INTO message_bases (name, conferenceid) VALUES (?, ?)');
    const result = stmt.run(mb.name, mb.conferenceId);
    const mbId = result.lastInsertRowid as number;

    // CRITICAL: Ensure Messages directory exists for Amiga door compatibility
    try {
      messageFileManager.initializeMessageDirs();  // Creates Conf{n}/Messages/ if needed
      console.log(`[Database] Ensured Messages directory for conference ${mb.conferenceId}`);
    } catch (error) {
      console.error(`[Database] Failed to create Messages directory:`, error);
    }

    return mbId;
  }

  async getMessageBases(conferenceId: number): Promise<MessageBase[]> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM message_bases WHERE conferenceid = ? ORDER BY id');
    const rows = stmt.all(conferenceId) as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      conferenceId: row.conferenceid,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getMessageBaseById(id: number): Promise<MessageBase | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM message_bases WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      conferenceId: row.conferenceid,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }
}

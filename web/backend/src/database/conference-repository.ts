/**
 * Conference Repository
 * Handles all conference and message base related database operations
 */

import { conferenceFileManager } from '../services/ConferenceFileManager';
import { messageFileManager } from '../services/MessageFileManager';
import type { Conference, MessageBase } from './types';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { BaseRepository } from './BaseRepository';

export class ConferenceRepository extends BaseRepository<any> {
  constructor(db: any) {
    if (!db) {
      throw new Error('Database not initialized');
    }

    // Unwrap database object if needed
    let actualDb: any;
    if (db && db.db && typeof db.db.prepare === 'function') {
      actualDb = db.db;
    } else if (typeof db.prepare === 'function') {
      actualDb = db;
    } else if (db.getDatabase && typeof db.getDatabase === 'function') {
      const raw = db.getDatabase();
      if (raw && typeof raw.prepare === 'function') {
        actualDb = raw;
      } else {
        throw new Error('Invalid database object provided to ConferenceRepository');
      }
    } else {
      throw new Error('Invalid database object provided to ConferenceRepository');
    }

    super(actualDb);
  }

  async createConference(conf: Omit<Conference, 'id' | 'created' | 'updated'>): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO conferences (
        name, description, ratio, ratiotype, uploads, downloads, bytesupload, bytesdownload
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(
      conf.name,
      conf.description ?? null,
      conf.ratio ?? 0,
      conf.ratioType ?? 0,
      conf.uploads ?? 0,
      conf.downloads ?? 0,
      conf.bytesUpload ?? 0,
      conf.bytesDownload ?? 0
    );
    const confId = result.lastInsertRowid as number;

    // CRITICAL: Write to Conf.DB for Amiga door compatibility
    let slotNumber: number = -1;
    try {
      const allConfs = await this.getConferences();
      slotNumber = allConfs.length - 1;  // 0-indexed
      const fullConf: Conference = {
        ...conf,
        id: confId,
        ratio: conf.ratio ?? 0,
        ratioType: conf.ratioType ?? 0,
        uploads: conf.uploads ?? 0,
        downloads: conf.downloads ?? 0,
        bytesUpload: conf.bytesUpload ?? 0,
        bytesDownload: conf.bytesDownload ?? 0,
        created: new Date(),
        updated: new Date()
      };
      conferenceFileManager.writeConferenceFile(fullConf, slotNumber);
console.log(`[Database] Synced conference "${conf.name}" to Conf.DB (slot ${slotNumber})`);
    } catch (error) {
      if (process.env.NODE_ENV !== 'test' && process.env.SUPPRESS_CONF_DB_ERRORS !== '1') {
console.error(`[Database] Failed to sync conference to disk:`, error);
        SysopDebugUtil.debug(
          null,
          null,
          'Database',
          `Failed to sync conference "${conf.name}" to Conf.DB`,
          {
            error: error instanceof Error ? error.message : String(error),
            conferenceName: conf.name,
            slotNumber
          },
          DebugSeverity.WARNING
        );
      }
      // Don't throw - DB insert succeeded
    }

    return confId;
  }

  async getConferences(): Promise<Conference[]> {

console.log('[ConferenceRepository] getConferences this.db type:', !!this.db, typeof this.db, this.db && this.db.constructor && this.db.constructor.name);

    const stmt = this.prepare('SELECT * FROM conferences ORDER BY id');
    const rows = stmt.all() as any[];
    return rows.map(row => ({
      id: row.id,
      name: row.name,
      description: row.description,
      ratio: Number(row.ratio) || 0,
      ratioType: Number(row.ratiotype) || 0,
      uploads: Number(row.uploads) || 0,
      downloads: Number(row.downloads) || 0,
      bytesUpload: Number(row.bytesupload) || 0,
      bytesDownload: Number(row.bytesdownload) || 0,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async getConferenceById(id: number): Promise<Conference | null> {

    const stmt = this.prepare('SELECT * FROM conferences WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      ratio: Number(row.ratio) || 0,
      ratioType: Number(row.ratiotype) || 0,
      uploads: Number(row.uploads) || 0,
      downloads: Number(row.downloads) || 0,
      bytesUpload: Number(row.bytesupload) || 0,
      bytesDownload: Number(row.bytesdownload) || 0,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async updateConference(id: number, updates: Partial<Conference>): Promise<void> {

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created' && key !== 'updated');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => updates[f as keyof Conference]);

    const sql = `UPDATE conferences SET ${setClause} WHERE id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values, id);

    // CRITICAL: Sync to Conf.DB for Amiga door compatibility
    try {
      const selectStmt = this.prepare('SELECT * FROM conferences WHERE id = ?');
      const row = selectStmt.get(id) as any;

      if (row) {
        const fullConf: Conference = {
          id: row.id,
          name: row.name,
          description: row.description,
          ratio: Number(row.ratio) || 0,
          ratioType: Number(row.ratiotype) || 0,
          uploads: Number(row.uploads) || 0,
          downloads: Number(row.downloads) || 0,
          bytesUpload: Number(row.bytesupload) || 0,
          bytesDownload: Number(row.bytesdownload) || 0,
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
      if (process.env.NODE_ENV !== 'test' && process.env.SUPPRESS_CONF_DB_ERRORS !== '1') {
console.error(`[Database] Failed to sync updated conference to disk:`, error);
        SysopDebugUtil.debug(
          null,
          null,
          'Database',
          `Failed to sync updated conference to Conf.DB`,
          { error: error instanceof Error ? error.message : String(error), conferenceId: id },
          DebugSeverity.WARNING
        );
      }
    }
  }

  async createMessageBase(mb: Omit<MessageBase, 'id' | 'created' | 'updated'>): Promise<number> {

    const stmt = this.prepare('INSERT INTO message_bases (name, conferenceid) VALUES (?, ?)');
    const result = stmt.run(mb.name, mb.conferenceId);
    const mbId = result.lastInsertRowid as number;

    // CRITICAL: Ensure Messages directory exists for Amiga door compatibility
    try {
      messageFileManager.initializeMessageDirs();  // Creates Conf{n}/Messages/ if needed
console.log(`[Database] Ensured Messages directory for conference ${mb.conferenceId}`);
    } catch (error) {
console.error(`[Database] Failed to create Messages directory:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to create Messages directory for conference ${mb.conferenceId}`,
        {
          error: error instanceof Error ? error.message : String(error),
          conferenceId: mb.conferenceId,
          messageBaseName: mb.name
        },
        DebugSeverity.WARNING
      );
    }

    return mbId;
  }

  async getMessageBases(conferenceId: number): Promise<MessageBase[]> {

    const stmt = this.prepare('SELECT * FROM message_bases WHERE conferenceid = ? ORDER BY id');
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

    const stmt = this.prepare('SELECT * FROM message_bases WHERE id = ?');
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

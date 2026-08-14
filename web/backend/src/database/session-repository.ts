/**
 * Session Repository
 * Handles all session-related database operations (user sessions and node sessions)
 */

import type { Session } from './types';
import type { NodeSession } from '../types';
import { BaseRepository } from './BaseRepository';

export class SessionRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  async createSession(session: Omit<Session, 'created' | 'updated'>): Promise<void> {

    const stmt = this.prepare(`
      INSERT OR REPLACE INTO sessions (
        id, userid, socketid, state, substate, currentconf, currentmsgbase,
        timeremaining, lastactivity, confrjoin, msgbaserjoin, commandbuffer,
        menupause, inputbuffer, relconfnum, currentconfname, cmdshortcuts, tempdata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.userId, session.socketId, session.state, session.subState,
      session.currentConf, session.currentMsgBase, session.timeRemaining,
      Math.floor(session.lastActivity.getTime() / 1000),
      session.confRJoin, session.msgBaseRJoin, session.commandBuffer,
      session.menuPause ? 1 : 0, session.inputBuffer, session.relConfNum,
      session.currentConfName, session.cmdShortcuts ? 1 : 0,
      session.tempData ? JSON.stringify(session.tempData) : null
    );
  }

  async getSession(id: string): Promise<Session | null> {

    const stmt = this.prepare('SELECT * FROM sessions WHERE id = ?');
    const row = stmt.get(id) as any;
    if (!row) return null;

    return {
      id: row.id,
      userId: row.userid,
      socketId: row.socketid,
      state: row.state,
      subState: row.substate,
      currentConf: row.currentconf,
      currentMsgBase: row.currentmsgbase,
      timeRemaining: row.timeremaining,
      lastActivity: new Date(row.lastactivity * 1000),
      confRJoin: row.confrjoin,
      msgBaseRJoin: row.msgbaserjoin,
      commandBuffer: row.commandbuffer,
      menuPause: Boolean(row.menupause),
      inputBuffer: row.inputbuffer,
      relConfNum: row.relconfnum,
      currentConfName: row.currentconfname,
      cmdShortcuts: Boolean(row.cmdshortcuts),
      tempData: row.tempdata ? JSON.parse(row.tempdata) : undefined,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    };
  }

  async updateSession(id: string, updates: Partial<Session>): Promise<void> {

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'tempdata') return updates.tempData ? JSON.stringify(updates.tempData) : null;
      if (f === 'lastactivity') {
        const date = updates.lastActivity;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      const value = updates[f as keyof Session];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE sessions SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values, id);
  }

  async deleteSession(id: string): Promise<void> {

    const stmt = this.prepare('DELETE FROM sessions WHERE id = ?');
    stmt.run(id);
  }

  async getActiveSessions(): Promise<Session[]> {

    const thirtyMinutesAgo = Math.floor(Date.now() / 1000) - 1800;
    const stmt = this.prepare('SELECT * FROM sessions WHERE lastactivity > ?');
    const rows = stmt.all(thirtyMinutesAgo) as any[];

    return rows.map(row => ({
      id: row.id,
      userId: row.userid,
      socketId: row.socketid,
      state: row.state,
      subState: row.substate,
      currentConf: row.currentconf,
      currentMsgBase: row.currentmsgbase,
      timeRemaining: row.timeremaining,
      lastActivity: new Date(row.lastactivity * 1000),
      confRJoin: row.confrjoin,
      msgBaseRJoin: row.msgbaserjoin,
      commandBuffer: row.commandbuffer,
      menuPause: Boolean(row.menupause),
      inputBuffer: row.inputbuffer,
      relConfNum: row.relconfnum,
      currentConfName: row.currentconfname,
      cmdShortcuts: Boolean(row.cmdshortcuts),
      tempData: row.tempdata ? JSON.parse(row.tempdata) : undefined,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  async createNodeSession(session: Omit<NodeSession, 'created' | 'updated'>): Promise<void> {

    const stmt = this.prepare(`
      INSERT OR REPLACE INTO node_sessions (
        id, nodeid, userid, socketid, state, substate, currentconf, currentmsgbase,
        timeremaining, lastactivity, status, loadlevel, currentuser
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      session.id, session.nodeId, session.userId, session.socketId, session.state,
      session.subState, session.currentConf, session.currentMsgBase, session.timeRemaining,
      Math.floor(session.lastActivity.getTime() / 1000),
      session.status, session.loadLevel, session.currentUser
    );
  }

  async updateNodeSession(id: string, updates: Partial<NodeSession>): Promise<void> {

    const fields = Object.keys(updates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'lastActivity') {
        const date = updates.lastActivity;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      return updates[f as keyof NodeSession];
    });

    const sql = `UPDATE node_sessions SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values, id);
  }

  async getNodeSessions(nodeId?: number): Promise<NodeSession[]> {

    let sql = 'SELECT * FROM node_sessions';
    const params: any[] = [];

    if (nodeId !== undefined) {
      sql += ' WHERE nodeid = ?';
      params.push(nodeId);
    }

    sql += ' ORDER BY lastactivity DESC';
    const stmt = this.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      nodeId: row.nodeid,
      userId: row.userid,
      socketId: row.socketid,
      state: row.state,
      subState: row.substate,
      currentConf: row.currentconf,
      currentMsgBase: row.currentmsgbase,
      timeRemaining: row.timeremaining,
      lastActivity: new Date(row.lastactivity * 1000),
      status: row.status,
      loadLevel: row.loadlevel,
      currentUser: row.currentuser,
      created: new Date(row.created * 1000),
      updated: new Date(row.updated * 1000)
    }));
  }

  /**
   * Mark active node sessions idle past the cutoff as disconnected.
   * @param cutoff sessions whose lastactivity is older than this are affected
   * @returns number of rows updated
   */
  async markIdleSessionsDisconnected(cutoff: Date): Promise<number> {
    const cutoffSecs = Math.floor(cutoff.getTime() / 1000);
    const stmt = this.prepare(
      `UPDATE node_sessions SET status = 'disconnected', updated = strftime('%s','now')
       WHERE lastactivity < ? AND status = 'active'`
    );
    return stmt.run(cutoffSecs).changes;
  }

  /**
   * Delete node sessions whose lastactivity is older than the cutoff.
   * @returns number of rows deleted
   */
  async deleteOldNodeSessions(cutoff: Date): Promise<number> {
    const cutoffSecs = Math.floor(cutoff.getTime() / 1000);
    const stmt = this.prepare(`DELETE FROM node_sessions WHERE lastactivity < ?`);
    return stmt.run(cutoffSecs).changes;
  }
}

/**
 * Chat Repository
 * Handles all chat-related database operations (internode chat, chat rooms, OLM helpers)
 */

import * as crypto from 'crypto';
import type { InternodeChatSession, InternodeChatMessage } from '../types';
import { BaseRepository } from './BaseRepository';

export class ChatRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  // User lookup helpers for OLM/Chat
  async getUserByUsernameForOLM(username: string): Promise<{ id: string; username: string; availableForChat: boolean } | null> {

    const stmt = this.prepare('SELECT id, username, availableforchat FROM users WHERE LOWER(username) = LOWER(?)');
    const row = stmt.get(username) as any;
    if (!row) return null;

    return {
      id: row.id,
      username: row.username,
      availableForChat: Boolean(row.availableforchat)
    };
  }

  async getAvailableUsersForChat(): Promise<Array<{
    id: string;
    username: string;
    realname: string;
    secLevel: number;
    currentAction?: string;
  }>> {

    const stmt = this.prepare(`
      SELECT id, username, realname, seclevel
      FROM users
      WHERE availableforchat = 1
      ORDER BY username
    `);
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.id,
      username: row.username,
      realname: row.realname,
      secLevel: row.seclevel
    }));
  }

  // Internode Chat Session Methods
  async createChatSession(
    initiatorId: string,
    initiatorUsername: string,
    initiatorSocket: string,
    recipientId: string,
    recipientUsername: string,
    recipientSocket: string
  ): Promise<string> {

    const sessionId = crypto.randomUUID();
    const stmt = this.prepare(`
      INSERT INTO chat_sessions (
        session_id, initiator_id, initiator_username, initiator_socket,
        recipient_id, recipient_username, recipient_socket, status
      ) VALUES (?, ?, ?, ?, ?, ?, ?, 'requesting')
    `);
    stmt.run(sessionId, initiatorId, initiatorUsername, initiatorSocket, recipientId, recipientUsername, recipientSocket);
    return sessionId;
  }

  async getChatSession(sessionId: string): Promise<InternodeChatSession | null> {

    const stmt = this.prepare('SELECT * FROM chat_sessions WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    if (!row) return null;

    return {
      id: row.session_id,
      nodeId: row.initiator_id || 0,
      userId: row.initiator_username,
      targetNodeId: row.recipient_id || 0,
      targetUserId: row.recipient_username,
      status: row.status as 'inviting' | 'active' | 'ended' | 'declined',
      startTime: new Date(row.started_at * 1000),
      endTime: row.ended_at ? new Date(row.ended_at * 1000) : undefined,
      lastActivity: new Date(row.created_at * 1000)
    };
  }

  async getChatSessionBySocketId(socketId: string): Promise<InternodeChatSession | null> {

    const stmt = this.prepare(`
      SELECT * FROM chat_sessions
      WHERE (initiator_socket = ? OR recipient_socket = ?)
      AND status = 'active'
    `);
    const row = stmt.get(socketId, socketId) as any;
    if (!row) return null;

    return {
      id: row.session_id,
      nodeId: row.initiator_id || 0,
      userId: row.initiator_username,
      targetNodeId: row.recipient_id || 0,
      targetUserId: row.recipient_username,
      status: row.status as 'inviting' | 'active' | 'ended' | 'declined',
      startTime: new Date(row.started_at * 1000),
      endTime: row.ended_at ? new Date(row.ended_at * 1000) : undefined,
      lastActivity: new Date(row.created_at * 1000)
    };
  }

  async getPendingChatInvitationForUser(userId: string): Promise<{ sessionId: string } | null> {

    const stmt = this.prepare(`
      SELECT session_id
      FROM chat_sessions
      WHERE recipient_id = ?
      AND status = 'requesting'
      ORDER BY created_at DESC
      LIMIT 1
    `);
    const row = stmt.get(userId) as any;
    return row ? { sessionId: row.session_id } : null;
  }

  async updateChatSessionStatus(
    sessionId: string,
    status: 'requesting' | 'active' | 'ended' | 'declined'
  ): Promise<void> {

    const stmt = this.prepare(`
      UPDATE chat_sessions
      SET status = ?, updated_at = strftime('%s', 'now')
      WHERE session_id = ?
    `);
    stmt.run(status, sessionId);
  }

  async endChatSession(sessionId: string): Promise<void> {

    const stmt = this.prepare(`
      UPDATE chat_sessions
      SET status = 'ended', ended_at = strftime('%s', 'now'), updated_at = strftime('%s', 'now')
      WHERE session_id = ?
    `);
    stmt.run(sessionId);
  }

  async getActiveChatSessions(): Promise<InternodeChatSession[]> {

    const stmt = this.prepare('SELECT * FROM chat_sessions WHERE status = \'active\' ORDER BY started_at DESC');
    const rows = stmt.all() as any[];

    return rows.map(row => ({
      id: row.session_id,
      nodeId: row.initiator_id || 0,
      userId: row.initiator_username,
      targetNodeId: row.recipient_id || 0,
      targetUserId: row.recipient_username,
      status: row.status as 'inviting' | 'active' | 'ended' | 'declined',
      startTime: new Date(row.started_at * 1000),
      endTime: row.ended_at ? new Date(row.ended_at * 1000) : undefined,
      lastActivity: new Date(row.created_at * 1000)
    }));
  }

  async saveChatMessage(
    sessionId: string,
    senderId: string,
    senderUsername: string,
    message: string
  ): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO chat_messages (session_id, sender_id, sender_username, message)
      VALUES (?, ?, ?, ?)
    `);
    const result = stmt.run(sessionId, senderId, senderUsername, message);

    const updateStmt = this.prepare(`
      UPDATE chat_sessions
      SET message_count = message_count + 1, updated_at = strftime('%s', 'now')
      WHERE session_id = ?
    `);
    updateStmt.run(sessionId);

    return result.lastInsertRowid as number;
  }

  async getChatHistory(sessionId: string, limit: number = 50): Promise<InternodeChatMessage[]> {

    const stmt = this.prepare('SELECT * FROM chat_messages WHERE session_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(sessionId, limit) as any[];

    return rows.reverse().map(row => ({
      id: row.id,
      sessionId: row.session_id,
      fromNodeId: 0,  // Not stored in DB currently
      fromUserId: row.sender_id,
      toNodeId: 0,  // Not stored in DB currently
      toUserId: '',  // Not stored in DB currently
      content: row.message,
      timestamp: new Date(row.created_at * 1000)
    }));
  }

  async getChatMessageCount(sessionId: string): Promise<number> {

    const stmt = this.prepare('SELECT COUNT(*) as count FROM chat_messages WHERE session_id = ?');
    const row = stmt.get(sessionId) as any;
    return parseInt(row.count);
  }

  // Chat Room Methods
  async createChatRoom(room: any): Promise<void> {

    const stmt = this.prepare(`
      INSERT INTO chat_rooms (
        room_id, room_name, topic, created_by, created_by_username,
        is_public, max_users, is_persistent, password, motd
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      room.roomId, room.roomName, room.topic || null, room.createdBy, room.createdByUsername,
      room.isPublic !== false ? 1 : 0, room.maxUsers || 50, room.isPersistent !== false ? 1 : 0,
      room.password || null, room.motd || null,
    );
  }

  async getChatRoom(roomId: string): Promise<any> {

    const stmt = this.prepare('SELECT * FROM chat_rooms WHERE room_id = ?');
    return stmt.get(roomId);
  }

  async getChatRoomByName(roomName: string): Promise<any> {

    const stmt = this.prepare('SELECT * FROM chat_rooms WHERE room_name = ?');
    return stmt.get(roomName);
  }

  async listChatRooms(onlyPublic: boolean = true): Promise<any[]> {

    const sql = onlyPublic
      ? `SELECT r.*, (SELECT COUNT(*) FROM chat_room_members WHERE room_id = r.room_id) as member_count
         FROM chat_rooms r WHERE is_public = 1 ORDER BY created_at DESC`
      : `SELECT r.*, (SELECT COUNT(*) FROM chat_room_members WHERE room_id = r.room_id) as member_count
         FROM chat_rooms r ORDER BY created_at DESC`;
    const stmt = this.prepare(sql);
    return stmt.all();
  }

  async deleteChatRoom(roomId: string): Promise<void> {

    const stmt = this.prepare('DELETE FROM chat_rooms WHERE room_id = ?');
    stmt.run(roomId);
  }

  async joinChatRoom(roomId: string, userId: string, username: string, socketId: string, isModerator: boolean = false): Promise<void> {

    const stmt = this.prepare(`
      INSERT OR REPLACE INTO chat_room_members (room_id, user_id, username, socket_id, is_moderator)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(roomId, userId, username, socketId, isModerator ? 1 : 0);
  }

  async leaveChatRoom(roomId: string, userId: string): Promise<void> {

    const stmt = this.prepare('DELETE FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    stmt.run(roomId, userId);
  }

  async getRoomMembers(roomId: string): Promise<any[]> {

    const stmt = this.prepare('SELECT * FROM chat_room_members WHERE room_id = ? ORDER BY joined_at ASC');
    return stmt.all(roomId);
  }

  async getRoomMemberCount(roomId: string): Promise<number> {

    const stmt = this.prepare('SELECT COUNT(*) as count FROM chat_room_members WHERE room_id = ?');
    const row = stmt.get(roomId) as any;
    return parseInt(row.count);
  }

  async saveChatRoomMessage(message: any): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type, thread_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const result = stmt.run(message.roomId, message.senderId, message.senderUsername, message.message, message.messageType || 'message', message.threadId || null);
    const messageId = result.lastInsertRowid as number;

    // Update FTS index
    try {
      const ftsStmt = this.prepare(`
        INSERT INTO chat_messages_fts(rowid, message, sender_username, room_id)
        VALUES (?, ?, ?, ?)
      `);
      ftsStmt.run(messageId, message.message, message.senderUsername, message.roomId);
    } catch (e) {
console.error('[ChatRepository] FTS index update failed:', e);
    }

    return messageId;
  }

  async getChatRoomHistory(roomId: string, limit: number = 50): Promise<any[]> {

    const stmt = this.prepare('SELECT * FROM chat_room_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(roomId, limit);
    return (rows as any[]).reverse();
  }

  async getMessageById(messageId: number): Promise<any> {

    const stmt = this.prepare('SELECT * FROM chat_room_messages WHERE id = ?');
    return stmt.get(messageId);
  }

  async getThreadReplies(threadId: number): Promise<any[]> {

    const stmt = this.prepare('SELECT * FROM chat_room_messages WHERE thread_id = ? ORDER BY created_at');
    return stmt.all(threadId) as any[];
  }

  async updateThreadReplyCount(threadId: number): Promise<void> {

    const stmt = this.prepare(`
      UPDATE chat_room_messages
      SET reply_count = (SELECT COUNT(*) FROM chat_room_messages WHERE thread_id = ?)
      WHERE id = ?
    `);
    stmt.run(threadId, threadId);
  }

  async updateRoomMember(roomId: string, userId: string, updates: any): Promise<void> {

    const sets: string[] = [];
    const values: any[] = [];

    if (updates.isMuted !== undefined) {
      sets.push('is_muted = ?');
      values.push(updates.isMuted ? 1 : 0);
    }
    if (updates.isModerator !== undefined) {
      sets.push('is_moderator = ?');
      values.push(updates.isModerator ? 1 : 0);
    }

    if (sets.length === 0) return;

    values.push(roomId, userId);
    const sql = `UPDATE chat_room_members SET ${sets.join(', ')} WHERE room_id = ? AND user_id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values);
  }

  async getUserRooms(userId: string): Promise<any[]> {

    const stmt = this.prepare(`
      SELECT r.*, m.is_moderator, m.is_muted, m.joined_at
      FROM chat_rooms r
      INNER JOIN chat_room_members m ON r.room_id = m.room_id
      WHERE m.user_id = ?
      ORDER BY m.joined_at DESC
    `);
    return stmt.all(userId);
  }

  async isUserInRoom(roomId: string, userId: string): Promise<boolean> {

    const stmt = this.prepare('SELECT 1 FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    return stmt.get(roomId, userId) !== undefined;
  }

  async isUserModerator(roomId: string, userId: string): Promise<boolean> {

    const stmt = this.prepare('SELECT is_moderator FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    const row = stmt.get(roomId, userId) as any;
    return row ? Boolean(row.is_moderator) : false;
  }

  async isUserMuted(roomId: string, userId: string): Promise<boolean> {

    const stmt = this.prepare('SELECT is_muted FROM chat_room_members WHERE room_id = ? AND user_id = ?');
    const row = stmt.get(roomId, userId) as any;
    return row ? Boolean(row.is_muted) : false;
  }

  async updateChatRoom(roomId: string, updates: any): Promise<void> {

    const fields: string[] = [];
    const values: any[] = [];

    if (updates.topic !== undefined) {
      fields.push('topic = ?');
      values.push(updates.topic);
    }
    if (updates.isPublic !== undefined) {
      fields.push('is_public = ?');
      values.push(updates.isPublic ? 1 : 0);
    }
    if (updates.maxUsers !== undefined) {
      fields.push('max_users = ?');
      values.push(updates.maxUsers);
    }
    if (updates.password !== undefined) {
      fields.push('password = ?');
      values.push(updates.password);
    }
    if (updates.motd !== undefined) {
      fields.push('motd = ?');
      values.push(updates.motd || null);
    }

    if (fields.length === 0) return;

    fields.push('updated_at = strftime(\'%s\', \'now\')');
    values.push(roomId);

    const sql = `UPDATE chat_rooms SET ${fields.join(', ')} WHERE room_id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values);
  }

  async setMotd(roomId: string, motd: string | null): Promise<void> {
    this.prepare(`UPDATE chat_rooms SET motd = ?, updated_at = strftime('%s', 'now') WHERE room_id = ?`).run(motd, roomId);
  }

  // DM thread methods
  private dmParticipantsHash(userIds: string[]): string {
    return [...userIds].map(String).sort().join('|');
  }

  async getOrCreateDmThread(userIds: string[]): Promise<string> {
    if (userIds.length < 2) throw new Error('DM thread needs >=2 participants');
    const hash = this.dmParticipantsHash(userIds);
    const existing = this.prepare('SELECT thread_id FROM chat_dm_threads WHERE participants_hash = ?').get(hash) as { thread_id: string } | undefined;
    if (existing) return existing.thread_id;

    const threadId = `dm-${crypto.randomUUID()}`;
    const isGroup = userIds.length > 2 ? 1 : 0;
    const insertThread = this.prepare('INSERT INTO chat_dm_threads (thread_id, participants_hash, is_group) VALUES (?, ?, ?)');
    const insertParticipant = this.prepare('INSERT INTO chat_dm_participants (thread_id, user_id, username) SELECT ?, id, username FROM users WHERE id = ?');

    this.transaction(() => {
      insertThread.run(threadId, hash, isGroup);
      for (const uid of userIds) {
        const info = insertParticipant.run(threadId, uid);
        if (info.changes !== 1) throw new Error(`User not found: ${uid}`);
      }
    });
    return threadId;
  }

  async saveDmMessage(threadId: string, senderId: string, senderUsername: string, message: string): Promise<number> {
    const insert = this.prepare('INSERT INTO chat_dm_messages (thread_id, sender_id, sender_username, message) VALUES (?, ?, ?, ?)');
    const bump = this.prepare(`UPDATE chat_dm_threads SET last_activity_at = strftime('%s', 'now') WHERE thread_id = ?`);
    return this.transaction(() => {
      const res = insert.run(threadId, senderId, senderUsername, message);
      bump.run(threadId);
      return res.lastInsertRowid as number;
    });
  }

  async getDmHistory(threadId: string, limit = 50): Promise<any[]> {
    const rows = this.prepare('SELECT * FROM chat_dm_messages WHERE thread_id = ? ORDER BY created_at ASC, id ASC LIMIT ?').all(threadId, limit) as any[];
    return rows;
  }

  async listUserDmThreads(userId: string): Promise<any[]> {
    return this.prepare(`
      SELECT t.*, (SELECT COUNT(*) FROM chat_dm_participants p WHERE p.thread_id = t.thread_id) AS participant_count
      FROM chat_dm_threads t
      INNER JOIN chat_dm_participants p ON p.thread_id = t.thread_id
      WHERE p.user_id = ?
      ORDER BY t.last_activity_at DESC
    `).all(userId) as any[];
  }

  async getDmParticipants(threadId: string): Promise<any[]> {
    return this.prepare('SELECT user_id, username FROM chat_dm_participants WHERE thread_id = ?').all(threadId) as any[];
  }
}

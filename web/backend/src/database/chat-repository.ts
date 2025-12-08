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
        is_public, max_users, is_persistent, password
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    stmt.run(
      room.roomId, room.roomName, room.topic || null, room.createdBy, room.createdByUsername,
      room.isPublic !== false ? 1 : 0, room.maxUsers || 50, room.isPersistent !== false ? 1 : 0, room.password || null
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

  async saveChatRoomMessage(message: any): Promise<void> {

    const stmt = this.prepare(`
      INSERT INTO chat_room_messages (room_id, sender_id, sender_username, message, message_type)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(message.roomId, message.senderId, message.senderUsername, message.message, message.messageType || 'message');
  }

  async getChatRoomHistory(roomId: string, limit: number = 50): Promise<any[]> {

    const stmt = this.prepare('SELECT * FROM chat_room_messages WHERE room_id = ? ORDER BY created_at DESC LIMIT ?');
    const rows = stmt.all(roomId, limit);
    return (rows as any[]).reverse();
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

    if (fields.length === 0) return;

    fields.push('updated_at = strftime(\'%s\', \'now\')');
    values.push(roomId);

    const sql = `UPDATE chat_rooms SET ${fields.join(', ')} WHERE room_id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values);
  }
}

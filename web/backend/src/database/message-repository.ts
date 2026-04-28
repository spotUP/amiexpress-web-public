/**
 * Message Repository
 * Handles all message-related database operations (both conference messages and online messages)
 */

import { messageFileManager } from '../services/MessageFileManager';
import { messageIndexManager, MsgStatus } from '../services/MessageIndexManager';
import type { Message } from './types';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { BaseRepository } from './BaseRepository';

export class MessageRepository extends BaseRepository<any> {
  constructor(db: any) { super(db); }

  async createMessage(message: Omit<Message, 'id'>): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO messages (
        subject, body, author, timestamp, conferenceid, messagebaseid,
        isprivate, touser, parentid, attachments, edited, editedby, editedat
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      message.subject, message.body, message.author,
      Math.floor(message.timestamp.getTime() / 1000),
      message.conferenceId, message.messageBaseId,
      message.isPrivate ? 1 : 0, message.toUser, message.parentId,
      JSON.stringify(message.attachments || []),
      message.edited ? 1 : 0, message.editedBy,
      message.editedAt ? Math.floor(message.editedAt.getTime() / 1000) : null
    );

    const messageId = result.lastInsertRowid as number;

    // CRITICAL: Write to disk files for Amiga door compatibility
    try {
      // Get next message number from message index manager
      const msgNumber = messageIndexManager.getNextMessageNumber(message.conferenceId);

      const fullMessage: Message = {
        ...message,
        id: messageId
      };

      // Write .msg file (message text)
      messageFileManager.writeMessageFile(fullMessage, message.conferenceId, msgNumber);
console.log(`[Database] Synced message ${messageId} to ${msgNumber}.msg (conf ${message.conferenceId})`);

      // Write to HeaderFile (message index) and update MailStats
      const timestamp = Math.floor(message.timestamp.getTime() / 1000);
      messageIndexManager.appendMessageHeader(message.conferenceId, {
        status: message.isPrivate ? MsgStatus.PRIVATE : MsgStatus.NORMAL,
        msgNumb: msgNumber,
        toName: message.toUser || 'ALL',
        fromName: message.author,
        subject: message.subject,
        msgDate: timestamp,
        recv: 0,  // Not received yet
        extMsgNum: msgNumber
      });
console.log(`[Database] Synced message ${messageId} to HeaderFile and MailStats (conf ${message.conferenceId})`);
    } catch (error) {
console.error(`[Database] Failed to sync message to disk:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to sync new message to disk files (.msg and HeaderFile)`,
        {
          error: error instanceof Error ? error.message : String(error),
          messageId,
          conferenceId: message.conferenceId,
          subject: message.subject
        },
        DebugSeverity.WARNING
      );
      // Don't throw - DB insert succeeded, file write is best-effort
    }

    return messageId;
  }

  async getMessages(conferenceId: number, messageBaseId: number, options?: {
    limit?: number;
    offset?: number;
    privateOnly?: boolean;
    userId?: string;
    search?: string;
  }): Promise<Message[]> {

    let sql = `
      SELECT m.*, mb.name as messageBaseName, c.name as conferenceName
      FROM messages m
      JOIN message_bases mb ON m.messagebaseid = mb.id
      JOIN conferences c ON m.conferenceid = c.id
      WHERE m.conferenceid = ? AND m.messagebaseid = ?
    `;
    const params: any[] = [conferenceId, messageBaseId];

    if (options?.privateOnly && options?.userId) {
      sql += ' AND (m.isprivate = 0 OR (m.isprivate = 1 AND (m.author = ? OR m.touser = ?)))';
      params.push(options.userId, options.userId);
    }

    if (options?.search) {
      sql += ' AND (m.subject LIKE ? OR m.body LIKE ? OR m.author LIKE ?)';
      const searchTerm = `%${options.search}%`;
      params.push(searchTerm, searchTerm, searchTerm);
    }

    sql += ' ORDER BY m.timestamp DESC';

    if (options?.limit) {
      sql += ' LIMIT ?';
      params.push(options.limit);
    }

    if (options?.offset) {
      sql += ' OFFSET ?';
      params.push(options.offset);
    }

    const stmt = this.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => ({
      id: row.id,
      subject: row.subject,
      body: row.body,
      author: row.author,
      timestamp: new Date(row.timestamp * 1000),
      conferenceId: row.conferenceid,
      messageBaseId: row.messagebaseid,
      isPrivate: Boolean(row.isprivate),
      toUser: row.touser,
      parentId: row.parentid,
      attachments: row.attachments ? JSON.parse(row.attachments) : [],
      edited: Boolean(row.edited),
      editedBy: row.editedby,
      editedAt: row.editedat ? new Date(row.editedat * 1000) : undefined
    }));
  }

  async updateMessage(id: number, updates: Partial<Message>): Promise<void> {

    const fields = Object.keys(updates).filter(key => key !== 'id');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${f} = ?`).join(', ');
    const values = fields.map(f => {
      if (f === 'attachments') return JSON.stringify(updates.attachments || []);
      if (f === 'timestamp' || f === 'editedAt') {
        const date = updates[f as keyof Message] as Date;
        return date ? Math.floor(date.getTime() / 1000) : null;
      }
      const value = updates[f as keyof Message];
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE messages SET ${setClause} WHERE id = ?`;
    const stmt = this.prepare(sql);
    stmt.run(...values, id);

    // CRITICAL: Sync to disk file for Amiga door compatibility
    try {
      const selectStmt = this.prepare('SELECT * FROM messages WHERE id = ?');
      const row = selectStmt.get(id) as any;

      if (row) {
        const fullMessage: Message = {
          id: row.id,
          subject: row.subject,
          body: row.body,
          author: row.author,
          timestamp: new Date(row.timestamp * 1000),
          conferenceId: row.conferenceid,
          messageBaseId: row.messagebaseid,
          isPrivate: row.isprivate === 1,
          toUser: row.touser,
          parentId: row.parentid,
          attachments: JSON.parse(row.attachments || '[]'),
          edited: row.edited === 1,
          editedBy: row.editedby,
          editedAt: row.editedat ? new Date(row.editedat * 1000) : undefined
        };

        const msgNumber = row.id;

        // Update .msg file
        messageFileManager.updateMessageFile(fullMessage, fullMessage.conferenceId, msgNumber);

        // Update HeaderFile entry
        const timestamp = Math.floor(fullMessage.timestamp.getTime() / 1000);
        messageIndexManager.updateMessageHeader(fullMessage.conferenceId, msgNumber, {
          status: fullMessage.isPrivate ? MsgStatus.PRIVATE : MsgStatus.NORMAL,
          toName: fullMessage.toUser || 'ALL',
          fromName: fullMessage.author,
          subject: fullMessage.subject,
          msgDate: timestamp
        });

console.log(`[Database] Synced updated message ${id} to .msg and HeaderFile`);
      }
    } catch (error) {
console.error(`[Database] Failed to sync updated message to disk:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to sync updated message to disk files (.msg and HeaderFile)`,
        { error: error instanceof Error ? error.message : String(error), messageId: id },
        DebugSeverity.WARNING
      );
    }
  }

  async deleteMessage(id: number): Promise<void> {

    // Get message info before deleting for file cleanup
    const selectStmt = this.prepare('SELECT conferenceid, id FROM messages WHERE id = ?');
    const row = selectStmt.get(id) as any;

    const stmt = this.prepare('DELETE FROM messages WHERE id = ?');
    stmt.run(id);

    // CRITICAL: Delete from disk files for Amiga door compatibility
    if (row) {
      try {
        const msgNumber = row.id;

        // Delete .msg file
        messageFileManager.deleteMessageFile(row.conferenceid, msgNumber);

        // Mark as deleted in HeaderFile (don't remove, just mark status)
        messageIndexManager.deleteMessageHeader(row.conferenceid, msgNumber);

console.log(`[Database] Deleted message ${id} from .msg and marked in HeaderFile`);
      } catch (error) {
console.error(`[Database] Failed to delete message file from disk:`, error);
        SysopDebugUtil.debug(
          null,
          null,
          'Database',
          `Failed to delete message from disk files (.msg and HeaderFile)`,
          {
            error: error instanceof Error ? error.message : String(error),
            messageId: id,
            conferenceId: row.conferenceid
          },
          DebugSeverity.WARNING
        );
      }
    }
  }

  /**
   * Move message to different conference/msgbase
   * From express.e:11827-11911 (moveMSG)
   */
  async moveMessage(id: number, destConferenceId: number, destMessageBaseId: number): Promise<void> {
    // Get current message
    const selectStmt = this.prepare('SELECT * FROM messages WHERE id = ?');
    const row = selectStmt.get(id) as any;

    if (!row) {
      throw new Error(`Message ${id} not found`);
    }

    const srcConferenceId = row.conferenceid;
    const srcMsgNumber = row.id;

    // Update database record with new conference/msgbase
    const updateStmt = this.prepare(`
      UPDATE messages SET conferenceid = ?, messagebaseid = ?
      WHERE id = ?
    `);
    updateStmt.run(destConferenceId, destMessageBaseId, id);

    // CRITICAL: Move files for Amiga door compatibility
    try {
      const fullMessage: Message = {
        id: row.id,
        subject: row.subject,
        body: row.body,
        author: row.author,
        timestamp: new Date(row.timestamp * 1000),
        conferenceId: destConferenceId, // NEW conference
        messageBaseId: destMessageBaseId, // NEW msgbase
        isPrivate: row.isprivate === 1,
        toUser: row.touser,
        parentId: row.parentid,
        attachments: JSON.parse(row.attachments || '[]'),
        edited: row.edited === 1,
        editedBy: row.editedby,
        editedAt: row.editedat ? new Date(row.editedat * 1000) : undefined
      };

      // Get next message number in destination conference
      // For simplicity, use current id as msgNumber (web version doesn't use sequential numbering)
      const destMsgNumber = srcMsgNumber;

      // Create new .msg file in destination
      messageFileManager.updateMessageFile(fullMessage, destConferenceId, destMsgNumber);

      // Create HeaderFile entry in destination
      const timestamp = Math.floor(fullMessage.timestamp.getTime() / 1000);
      messageIndexManager.updateMessageHeader(destConferenceId, destMsgNumber, {
        status: fullMessage.isPrivate ? MsgStatus.PRIVATE : MsgStatus.NORMAL,
        toName: fullMessage.toUser || 'ALL',
        fromName: fullMessage.author,
        subject: fullMessage.subject,
        msgDate: timestamp
      });

      // Delete old .msg file and mark as deleted in old HeaderFile
      messageFileManager.deleteMessageFile(srcConferenceId, srcMsgNumber);
      messageIndexManager.deleteMessageHeader(srcConferenceId, srcMsgNumber);

      console.log(`[Database] Moved message ${id} from conf ${srcConferenceId} to conf ${destConferenceId}`);
    } catch (error) {
      console.error(`[Database] Failed to move message files on disk:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to move message files on disk`,
        {
          error: error instanceof Error ? error.message : String(error),
          messageId: id,
          srcConferenceId,
          destConferenceId
        },
        DebugSeverity.WARNING
      );
    }
  }

  async updateReadPointer(userId: number, conferenceId: number, messageBaseId: number, lastRead: number): Promise<void> {

    // Use INSERT ... ON CONFLICT DO UPDATE to preserve existing scan_flags and other fields.
    // INSERT OR REPLACE deletes then re-inserts, resetting scan_flags to the SQL DEFAULT,
    // which caused AquaScan to run on every login after any message was read.
    const stmt = this.prepare(`
      INSERT INTO conf_base (user_id, conference_id, message_base_id, last_msg_read_conf, scan_flags)
      VALUES (?, ?, ?, ?, 0)
      ON CONFLICT(user_id, conference_id, message_base_id)
      DO UPDATE SET last_msg_read_conf = MAX(last_msg_read_conf, excluded.last_msg_read_conf)
    `);
    stmt.run(userId.toString(), conferenceId, messageBaseId, lastRead);
  }

  // Online Line Messages (OLM) methods
  async sendOnlineMessage(fromUserId: string, fromUsername: string, toUserId: string, toUsername: string, message: string): Promise<number> {

    const stmt = this.prepare(`
      INSERT INTO online_messages (from_user_id, from_username, to_user_id, to_username, message)
      VALUES (?, ?, ?, ?, ?)
    `);
    const result = stmt.run(fromUserId, fromUsername, toUserId, toUsername, message);
    return result.lastInsertRowid as number;
  }

  async getUnreadMessages(userId: string): Promise<any[]> {

    const stmt = this.prepare(`
      SELECT id, from_user_id, from_username, message, created_at
      FROM online_messages
      WHERE to_user_id = ? AND delivered = 0
      ORDER BY created_at ASC
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(row => ({
      ...row,
      created_at: new Date(row.created_at * 1000)
    }));
  }

  async getAllMessages(userId: string): Promise<any[]> {

    const stmt = this.prepare(`
      SELECT id, from_user_id, from_username, message, created_at, delivered, read, delivered_at, read_at
      FROM online_messages
      WHERE to_user_id = ?
      ORDER BY created_at DESC
      LIMIT 50
    `);
    const rows = stmt.all(userId) as any[];
    return rows.map(row => ({
      ...row,
      created_at: new Date(row.created_at * 1000),
      delivered: Boolean(row.delivered),
      read: Boolean(row.read),
      delivered_at: row.delivered_at ? new Date(row.delivered_at * 1000) : null,
      read_at: row.read_at ? new Date(row.read_at * 1000) : null
    }));
  }

  async markMessageDelivered(messageId: number): Promise<void> {

    const stmt = this.prepare(`
      UPDATE online_messages
      SET delivered = 1, delivered_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(messageId);
  }

  async markMessageRead(messageId: number): Promise<void> {

    const stmt = this.prepare(`
      UPDATE online_messages
      SET read = 1, read_at = strftime('%s', 'now')
      WHERE id = ?
    `);
    stmt.run(messageId);
  }

  async getUnreadMessageCount(userId: string): Promise<number> {

    const stmt = this.prepare(`
      SELECT COUNT(*) as count
      FROM online_messages
      WHERE to_user_id = ? AND delivered = 0
    `);
    const row = stmt.get(userId) as any;
    return parseInt(row.count);
  }

  async deleteOLMMessage(messageId: number, userId: string): Promise<boolean> {

    const stmt = this.prepare(`
      DELETE FROM online_messages
      WHERE id = ? AND to_user_id = ?
    `);
    const result = stmt.run(messageId, userId);
    return result.changes > 0;
  }
}

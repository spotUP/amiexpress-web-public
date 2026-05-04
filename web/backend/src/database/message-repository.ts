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

  /**
   * Persist a message.
   *
   * @param message — message data
   * @param opts.skipDiskWrite — true if the caller already wrote the body file
   *   and HeaderFile entry (e.g. message-entry.handler.saveMessage went
   *   through `writeMessageFile` from utils/message-file.util.ts before
   *   reaching here). Avoids the dual-allocation that produced two
   *   physical .msg files per posted message.
   */
  async createMessage(
    message: Omit<Message, 'id'>,
    opts?: { skipDiskWrite?: boolean }
  ): Promise<number> {

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

    // Skip disk write when the caller already handled it (express.e flow:
    // message-entry.handler.saveMessage allocates msgNum and writes file +
    // HeaderFile up-front via writeMessageFile, then calls this for SQL only).
    if (opts?.skipDiskWrite) {
      return messageId;
    }

    // Disk write path — used by importers, AREXX, BBSApi, web-admin compose.
    try {
      const msgNumber = messageIndexManager.getNextMessageNumber(message.conferenceId);
      const fullMessage: Message = { ...message, id: messageId };

      // writeMessageFile writes raw body to <conf>/MsgBase/<msgNum> AND
      // appends a HeaderFile entry (no double-append: it checks for an
      // existing header for the same msgNum before appending).
      messageFileManager.writeMessageFile(fullMessage, message.conferenceId, msgNumber);
console.log(`[Database] Synced message ${messageId} as msg #${msgNumber} (conf ${message.conferenceId})`);
    } catch (error) {
console.error(`[Database] Failed to sync message to disk:`, error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        `Failed to sync new message to disk (body + HeaderFile)`,
        {
          error: error instanceof Error ? error.message : String(error),
          messageId,
          conferenceId: message.conferenceId,
          subject: message.subject
        },
        DebugSeverity.WARNING
      );
      // Don't throw — DB insert succeeded
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

        // Update HeaderFile entry. express.e:11643 — editHeader resets recv:=0,
        // and we mirror that by passing the row's receivedat (which the EH save
        // path nulls explicitly so the recipient sees the message as fresh again).
        const timestamp = Math.floor(fullMessage.timestamp.getTime() / 1000);
        const recvSecs = (row as any).receivedat ?? 0;
        messageIndexManager.updateMessageHeader(fullMessage.conferenceId, msgNumber, {
          status: fullMessage.isPrivate ? MsgStatus.PRIVATE : MsgStatus.NORMAL,
          toName: fullMessage.toUser || 'ALL',
          fromName: fullMessage.author,
          subject: fullMessage.subject,
          msgDate: timestamp,
          recv: recvSecs
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

    // CRITICAL: Delete from disk files for Amiga door compatibility.
    // express.e deleteMSG (11913-11942) wraps the on-disk operations in
    // lockMsgBase() so concurrent deletes/saves can't race on MailStats
    // and HeaderFile. Match that pattern via acquireMailLock.
    if (row) {
      const conferenceId: number = row.conferenceid;
      const msgNumber: number = row.id;

      // Lazy-require to dodge circular imports.
      const { readAttachList, getAttachListPath } = require('../utils/message-file.util');
      const fs = require('fs').promises;
      const { config } = require('../config');
      const bbsDataPath = config.get('dataDir');

      // Snapshot attachment list BEFORE we try to acquire the lock —
      // readAttachList only reads, so it's safe outside.
      let attachList: { deleteOnMessageDelete: boolean; filenames: string[] } | null = null;
      try {
        attachList = await readAttachList(conferenceId, msgNumber, bbsDataPath);
      } catch { /* no A<N> file is normal for unattached messages */ }

      // Best-effort lock; matches express.e:11925 — if we can't acquire,
      // log + still proceed (DB delete already happened, leaving disk in
      // sync is best-effort). The 200ms × 25-attempt budget mirrors the
      // writeMessageFile path.
      const LOCK_RETRY_MS = 200;
      const LOCK_MAX_ATTEMPTS = 25;
      let acquired = false;
      for (let attempt = 0; attempt < LOCK_MAX_ATTEMPTS; attempt++) {
        if (messageIndexManager.acquireMailLock(conferenceId, 0)) {
          acquired = true;
          break;
        }
        await new Promise(r => setTimeout(r, LOCK_RETRY_MS));
      }
      if (!acquired) {
        console.warn(
          `[Database] deleteMessage: could not acquire MailLock for Conf${conferenceId} — proceeding without lock (DB row already removed)`,
        );
      }

      try {
        // express.e:11931 checkAttachedFile(delMsgNum, 0) — if A<N> exists
        // and the delete-on-msg-delete flag (Y) is set, delete each
        // attachment file from disk. Then always remove A<N> itself
        // (express.e:11900 DeleteFile path on the move-attached case
        // serves the same role on the source side).
        if (attachList) {
          if (attachList.deleteOnMessageDelete) {
            for (const fname of attachList.filenames) {
              try {
                await fs.unlink(fname);
              } catch { /* attachment may already be missing — best-effort */ }
            }
          }
          try {
            await fs.unlink(getAttachListPath(conferenceId, msgNumber, bbsDataPath));
          } catch { /* A<N> already gone — best-effort */ }
        }

        // Delete .msg body file (express.e:11933-11934 SetProtection +
        // DeleteFile)
        messageFileManager.deleteMessageFile(conferenceId, msgNumber);

        // Mark as deleted in HeaderFile (express.e:11930 status:='D' +
        // 11935 saveOverHeader). deleteMessageHeader also updates
        // mailStat.lowestNotDel via updateMailStatsAfterDelete.
        messageIndexManager.deleteMessageHeader(conferenceId, msgNumber);

console.log(`[Database] Deleted message ${id} from .msg, A<N>, and marked status='D' in HeaderFile`);
      } catch (error) {
console.error(`[Database] Failed to delete message file from disk:`, error);
        SysopDebugUtil.debug(
          null,
          null,
          'Database',
          `Failed to delete message from disk files (.msg, A<N>, HeaderFile)`,
          {
            error: error instanceof Error ? error.message : String(error),
            messageId: id,
            conferenceId,
          },
          DebugSeverity.WARNING
        );
      } finally {
        if (acquired) {
          messageIndexManager.releaseMailLock(conferenceId, 0);
        }
      }
    }
  }

  /**
   * Move message to different conference/msgbase — express.e:11827-11910 moveMSG.
   *
   * Acquires the dest msgbase lock, allocates a fresh msgNum from dest's
   * mailStat.highMsgNum, writes body + appends header to dest (which bumps
   * stats), copies the A&lt;src&gt; attachment list to A&lt;dest&gt;, then locks
   * src and tombstones the source body+header. Avoids the pre-fix bug
   * where destMsgNumber=srcMsgNumber silently overwrote any existing dest
   * message with the same id, and where updateMessageHeader silently failed
   * because the dest entry didn't exist yet.
   */
  async moveMessage(id: number, destConferenceId: number, destMessageBaseId: number): Promise<void> {
    const selectStmt = this.prepare('SELECT * FROM messages WHERE id = ?');
    const row = selectStmt.get(id) as any;

    if (!row) {
      throw new Error(`Message ${id} not found`);
    }

    const srcConferenceId = row.conferenceid;
    const srcMsgNumber = row.id;

    // Lazy-require the canonical write/read primitives so we avoid a
    // circular import at module load.
    const {
      writeMessageFile,
      readAttachList,
      formatMessageDate,
      getAttachListPath,
    } = require('../utils/message-file.util');
    const fs = require('fs').promises;
    const { config } = require('../config');
    const bbsDataPath = config.get('dataDir');

    // express.e:9846-9851 status preservation — keep censored 'p' across move.
    let status: number;
    if (row.isprivate === 1) {
      status = MsgStatus.PRIVATE;
    } else if (row.censored === 1) {
      status = MsgStatus.CENSORED;
    } else {
      status = MsgStatus.NORMAL;
    }

    // Read src attachment list before we tombstone the source so we can copy it.
    let attachList: { deleteOnMessageDelete: boolean; filenames: string[] } | null = null;
    try {
      attachList = await readAttachList(srcConferenceId, srcMsgNumber, bbsDataPath);
    } catch { /* missing A<N> is normal for messages with no attachments */ }

    // express.e:11879 calls saveNewMSG(gfh, mh, FALSE) — update=FALSE preserves
    // mh.recv (read state), mh.msgDate, mh.fromName from the source mailHeader.
    // writeMessageFile (which mirrors saveNewMSG with update=TRUE) zeroes recv,
    // so capture the source recv here and re-stamp the destination header
    // after the write so a moved-but-already-read message stays read.
    const srcHeaders = messageIndexManager.readHeaderFile(srcConferenceId);
    const srcHeader = srcHeaders.find(h => h.msgNumb === srcMsgNumber);
    const srcRecv = srcHeader?.recv || 0;

    // STEP 1: Write to destination through the canonical path. writeMessageFile
    // acquires the dest mailLock, picks the next free msgNum, writes the body
    // file, appends to HeaderFile (bumping highMsgNum), and writes A<destNum>
    // if attachments are supplied. Returns the assigned dest msgNum.
    const messageDate = new Date(row.timestamp * 1000);
    const destMsgNumber = await writeMessageFile(
      destConferenceId,
      destMessageBaseId,
      {
        from: row.author,
        to: row.touser || 'ALL',
        subject: row.subject,
        date: formatMessageDate(messageDate),
        body: row.body || '',
        status,
        attachments: attachList && attachList.filenames.length > 0
          ? { filenames: attachList.filenames, deleteOnMessageDelete: attachList.deleteOnMessageDelete }
          : undefined,
      },
      bbsDataPath,
      0, // nodeId — server-side move, no specific node holds the lock
    );

    // express.e:11879 update=FALSE — preserve source recv (read state) on dest.
    // writeMessageFile zeroed recv; restore it now so a previously-read
    // message stays marked read after the move.
    if (srcRecv !== 0) {
      messageIndexManager.updateMessageHeader(destConferenceId, destMsgNumber, { recv: srcRecv });
    }

    // STEP 2: Update DB to point at dest. The DB id stays the same — we only
    // re-locate which canonical conf/msgbase it lives in. (Web search/UI
    // continues to find the row by its DB id; the on-disk msgNum is now
    // tracked by the new HeaderFile entry just appended.)
    const updateStmt = this.prepare(`
      UPDATE messages SET conferenceid = ?, messagebaseid = ?
      WHERE id = ?
    `);
    updateStmt.run(destConferenceId, destMessageBaseId, id);

    // STEP 3: Tombstone the source. Marks src HeaderFile entry status='D'
    // (express.e:11930), updates lowestNotDel via deleteMessageHeader's
    // updateMailStatsAfterDelete, then removes the canonical body file.
    // express.e:11900 also DeleteFile's the old A<N> after the copy succeeds.
    try {
      messageIndexManager.deleteMessageHeader(srcConferenceId, srcMsgNumber);
      messageFileManager.deleteMessageFile(srcConferenceId, srcMsgNumber);
      // Remove src A<N> attachment list — it's been copied to A<destNum>.
      if (attachList) {
        try {
          await fs.unlink(getAttachListPath(srcConferenceId, srcMsgNumber, bbsDataPath));
        } catch { /* best-effort */ }
      }
      console.log(`[Database] Moved message ${id} src=conf${srcConferenceId}/${srcMsgNumber} → dest=conf${destConferenceId}/${destMsgNumber}`);
    } catch (error) {
      console.error('[Database] Move: src tombstone failed:', error);
      SysopDebugUtil.debug(
        null,
        null,
        'Database',
        'Move: failed to tombstone source message',
        {
          error: error instanceof Error ? error.message : String(error),
          messageId: id,
          srcConferenceId,
          destConferenceId,
          destMsgNumber,
        },
        DebugSeverity.WARNING,
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

/**
 * Pin repository for managing pinned messages
 */
import type Database from 'better-sqlite3';

export class PinRepository {
  constructor(private db: Database.Database) {}

  private prepare(sql: string) {
    return this.db.prepare(sql);
  }

  /** Pin a message */
  async pinMessage(roomId: string, messageId: number, pinnedBy: string): Promise<number> {
    const stmt = this.prepare(`
      INSERT INTO pinned_messages (room_id, message_id, pinned_by)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(roomId, messageId, pinnedBy);
    return result.lastInsertRowid as number;
  }

  /** Unpin a message */
  async unpinMessage(roomId: string, messageId: number): Promise<void> {
    const stmt = this.prepare(`
      DELETE FROM pinned_messages
      WHERE room_id = ? AND message_id = ?
    `);
    stmt.run(roomId, messageId);
  }

  /** Get all pinned messages for a room */
  async getPinnedMessages(roomId: string): Promise<any[]> {
    const stmt = this.prepare(`
      SELECT
        pm.*,
        m.sender_username,
        m.message,
        m.created_at as message_created_at
      FROM pinned_messages pm
      JOIN chat_room_messages m ON pm.message_id = m.id
      WHERE pm.room_id = ?
      ORDER BY pm.pinned_at DESC
    `);
    return stmt.all(roomId);
  }

  /** Check if a message is pinned */
  async isPinned(roomId: string, messageId: number): Promise<boolean> {
    const stmt = this.prepare(`
      SELECT COUNT(*) as count
      FROM pinned_messages
      WHERE room_id = ? AND message_id = ?
    `);
    const result = stmt.get(roomId, messageId) as { count: number };
    return result.count > 0;
  }

  /** Get pin count for a room */
  async getPinCount(roomId: string): Promise<number> {
    const stmt = this.prepare(`
      SELECT COUNT(*) as count
      FROM pinned_messages
      WHERE room_id = ?
    `);
    const result = stmt.get(roomId) as { count: number };
    return result.count;
  }
}

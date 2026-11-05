import type { Reaction } from '../types';

/** Reactions repository */
export class ReactionRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async add(messageId: string, userId: number, emoji: string): Promise<void> {
    await this.db.run(
      `INSERT OR IGNORE INTO chat_reactions (message_id, user_id, emoji)
       VALUES (?, ?, ?)`,
      [messageId, userId, emoji]
    );
  }

  async remove(messageId: string, userId: number, emoji: string): Promise<void> {
    await this.db.run(
      `DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
      [messageId, userId, emoji]
    );
  }

  async getByMessage(messageId: string): Promise<Reaction[]> {
    return this.db.all(
      `SELECT * FROM chat_reactions WHERE message_id = ?`,
      [messageId]
    );
  }

  async getGrouped(messageId: string): Promise<{ emoji: string; count: number }[]> {
    return this.db.all(
      `SELECT emoji, COUNT(*) as count FROM chat_reactions
       WHERE message_id = ? GROUP BY emoji`,
      [messageId]
    );
  }

  async hasReacted(messageId: string, userId: number, emoji: string): Promise<boolean> {
    const row = await this.db.get(
      `SELECT 1 FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`,
      [messageId, userId, emoji]
    );
    return !!row;
  }

  async toggle(messageId: string, userId: number, emoji: string): Promise<boolean> {
    const exists = await this.hasReacted(messageId, userId, emoji);
    if (exists) {
      await this.remove(messageId, userId, emoji);
      return false;
    }
    await this.add(messageId, userId, emoji);
    return true;
  }
}

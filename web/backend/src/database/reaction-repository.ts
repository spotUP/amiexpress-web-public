/**
 * Reaction repository: emoji reactions stored with a chat room message.
 * One row per (message, username, emoji); a repeat reaction is ignored.
 */

export type ReactionCounts = Record<string, number>;

export class ReactionRepository {
  constructor(private db: any) {}

  private prepare(sql: string) {
    return this.db.prepare(sql);
  }

  /** Add a reaction. Returns false when the user already had it. */
  async addReaction(messageId: number, username: string, emoji: string): Promise<boolean> {
    const result = this.prepare(
      'INSERT OR IGNORE INTO chat_message_reactions (message_id, username, emoji) VALUES (?, ?, ?)'
    ).run(messageId, username, emoji);
    return Number(result.changes) > 0;
  }

  /** Remove a reaction. Returns false when the user did not have it. */
  async removeReaction(messageId: number, username: string, emoji: string): Promise<boolean> {
    const result = this.prepare(
      'DELETE FROM chat_message_reactions WHERE message_id = ? AND username = ? AND emoji = ?'
    ).run(messageId, username, emoji);
    return Number(result.changes) > 0;
  }

  /** Per-emoji counts for one message. */
  async getCounts(messageId: number): Promise<ReactionCounts> {
    return (await this.getCountsFor([messageId]))[messageId] ?? {};
  }

  /** Per-emoji counts for many messages (history replay); messages without reactions are absent. */
  async getCountsFor(messageIds: number[]): Promise<Record<number, ReactionCounts>> {
    const out: Record<number, ReactionCounts> = {};
    if (messageIds.length === 0) return out;
    const marks = messageIds.map(() => '?').join(',');
    const rows = this.prepare(
      `SELECT message_id, emoji, COUNT(*) AS n FROM chat_message_reactions
       WHERE message_id IN (${marks}) GROUP BY message_id, emoji ORDER BY MIN(id)`
    ).all(...messageIds) as Array<{ message_id: number; emoji: string; n: number }>;
    for (const r of rows) {
      (out[r.message_id] ??= {})[r.emoji] = Number(r.n);
    }
    return out;
  }
}

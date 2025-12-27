/** Pinned messages repository */
export class PinnedRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async pin(channelId: string, messageId: string, pinnedBy: number): Promise<void> {
    await this.db.run(
      `INSERT OR IGNORE INTO chat_pinned_messages
       (channel_id, message_id, pinned_by) VALUES (?, ?, ?)`,
      [channelId, messageId, pinnedBy]
    );
  }

  async unpin(channelId: string, messageId: string): Promise<void> {
    await this.db.run(
      `DELETE FROM chat_pinned_messages WHERE channel_id = ? AND message_id = ?`,
      [channelId, messageId]
    );
  }

  async getByChannel(channelId: string): Promise<string[]> {
    const rows = await this.db.all(
      `SELECT message_id FROM chat_pinned_messages WHERE channel_id = ?
       ORDER BY pinned_at DESC`,
      [channelId]
    );
    return rows.map((r: any) => r.message_id);
  }

  async isPinned(channelId: string, messageId: string): Promise<boolean> {
    const row = await this.db.get(
      `SELECT 1 FROM chat_pinned_messages WHERE channel_id = ? AND message_id = ?`,
      [channelId, messageId]
    );
    return !!row;
  }

  async count(channelId: string): Promise<number> {
    const row = await this.db.get(
      `SELECT COUNT(*) as count FROM chat_pinned_messages WHERE channel_id = ?`,
      [channelId]
    );
    return row?.count || 0;
  }
}

import type { Message } from '../types';

/** Message query operations */
export class MessageQueries {
  protected db: any;

  constructor(db: any) {
    this.db = db;
  }

  async getById(id: string): Promise<Message | null> {
    return this.db.get('SELECT * FROM chat_messages WHERE id = ?', [id]);
  }

  async getByChannel(channelId: string, limit = 50): Promise<Message[]> {
    return this.db.all(
      `SELECT * FROM chat_messages WHERE channel_id = ? AND deleted = 0
       ORDER BY created_at DESC LIMIT ?`,
      [channelId, limit]
    );
  }

  async getThread(threadId: string): Promise<Message[]> {
    return this.db.all(
      `SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at`,
      [threadId]
    );
  }

  async search(query: string, channelId?: string): Promise<Message[]> {
    const sql = channelId
      ? `SELECT * FROM chat_messages WHERE channel_id = ? AND message LIKE ?`
      : `SELECT * FROM chat_messages WHERE message LIKE ?`;
    const params = channelId ? [channelId, `%${query}%`] : [`%${query}%`];
    return this.db.all(sql, params);
  }
}

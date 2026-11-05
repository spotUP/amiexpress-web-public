import type { Message } from '../types';
import { MessageQueries } from './messages-query';

/** Message repository */
export class MessageRepository extends MessageQueries {
  async create(msg: Partial<Message>): Promise<Message> {
    const sql = `INSERT INTO chat_messages
      (id, channel_id, user_id, username, message, type, thread_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
    await this.db.run(sql, [
      msg.id, msg.channelId, msg.userId, msg.username,
      msg.content, msg.type, msg.threadId, JSON.stringify(msg.metadata || {})
    ]);
    const created = await this.getById(msg.id!);
    if (!created) throw new Error('Failed to create message');
    return created;
  }

  async delete(id: string, deletedBy: number): Promise<void> {
    await this.db.run(
      `UPDATE chat_messages SET deleted = 1, deleted_by = ? WHERE id = ?`,
      [deletedBy, id]
    );
  }

  async updateReplyCount(threadId: string): Promise<void> {
    await this.db.run(
      `UPDATE chat_messages SET reply_count = (
        SELECT COUNT(*) FROM chat_messages WHERE thread_id = ?
      ) WHERE id = ?`,
      [threadId, threadId]
    );
  }
}

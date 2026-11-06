/**
 * Message edit and delete state for chat_room_messages.
 * `edited` marks a line whose text was changed by its author; `deleted` hides
 * it from history (the row stays, so reactions and threads keep their key).
 */

interface SqliteLike {
  prepare(sql: string): { run(...args: unknown[]): { changes: number | bigint } };
}

export class MessageEditRepository {
  constructor(private db: SqliteLike) {}

  async editMessage(messageId: number, content: string): Promise<boolean> {
    const result = this.db
      .prepare('UPDATE chat_room_messages SET message = ?, edited = 1 WHERE id = ? AND COALESCE(deleted, 0) = 0')
      .run(content, messageId);
    return Number(result.changes) > 0;
  }

  async deleteMessage(messageId: number): Promise<boolean> {
    const result = this.db
      .prepare('UPDATE chat_room_messages SET deleted = 1 WHERE id = ? AND COALESCE(deleted, 0) = 0')
      .run(messageId);
    return Number(result.changes) > 0;
  }
}

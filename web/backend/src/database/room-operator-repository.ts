/**
 * Room operators: who may moderate a chat room's messages.
 *
 * A room's creator is always an operator (chat_rooms.created_by); anyone else
 * is one only through a row in chat_room_ops. The creator needs no row, so
 * there is one answer to "is this user an op here" and nothing to keep in
 * step. /op (a later task) writes rows through addOperator.
 */

interface SqliteLike {
  prepare(sql: string): {
    run(...args: unknown[]): { changes: number | bigint };
    get(...args: unknown[]): unknown;
    all(...args: unknown[]): unknown[];
  };
}

export class RoomOperatorRepository {
  constructor(private db: SqliteLike) {}

  /** True for the room's creator or a user with a chat_room_ops row. */
  async isRoomOperator(roomId: string, userId: string | number): Promise<boolean> {
    const id = String(userId);
    const creator = this.db
      .prepare('SELECT 1 AS ok FROM chat_rooms WHERE room_id = ? AND created_by = ?')
      .get(roomId, id);
    if (creator) return true;
    const row = this.db
      .prepare('SELECT 1 AS ok FROM chat_room_ops WHERE room_id = ? AND user_id = ?')
      .get(roomId, id);
    return Boolean(row);
  }

  /** Make a user an operator. Returns false when they already were (by row). */
  async addOperator(roomId: string, userId: string | number): Promise<boolean> {
    const result = this.db
      .prepare('INSERT OR IGNORE INTO chat_room_ops (room_id, user_id) VALUES (?, ?)')
      .run(roomId, String(userId));
    return Number(result.changes) > 0;
  }

  /** Remove an operator row. The creator stays an operator. */
  async removeOperator(roomId: string, userId: string | number): Promise<boolean> {
    const result = this.db
      .prepare('DELETE FROM chat_room_ops WHERE room_id = ? AND user_id = ?')
      .run(roomId, String(userId));
    return Number(result.changes) > 0;
  }
}

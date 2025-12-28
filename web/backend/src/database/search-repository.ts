/**
 * Search repository for full-text search on chat messages
 */
import type Database from 'better-sqlite3';

export interface SearchFilters {
  query: string;
  roomId?: string;
  username?: string;
  startDate?: number;
  endDate?: number;
  limit?: number;
}

export class SearchRepository {
  constructor(private db: Database.Database) {}

  private prepare(sql: string) {
    return this.db.prepare(sql);
  }

  /** Full-text search with filters */
  async searchMessages(filters: SearchFilters): Promise<any[]> {
    const { query, roomId, username, startDate, endDate, limit = 100 } = filters;

    // Build FTS query
    let sql = `
      SELECT m.*, highlight(chat_messages_fts, 0, '{', '}') as highlighted
      FROM chat_messages_fts fts
      JOIN chat_room_messages m ON fts.rowid = m.id
      WHERE chat_messages_fts MATCH ?
    `;

    const params: any[] = [query];

    // Apply filters
    if (roomId) {
      sql += ` AND m.room_id = ?`;
      params.push(roomId);
    }

    if (username) {
      sql += ` AND m.sender_username = ?`;
      params.push(username);
    }

    if (startDate) {
      sql += ` AND m.created_at >= ?`;
      params.push(startDate);
    }

    if (endDate) {
      sql += ` AND m.created_at <= ?`;
      params.push(endDate);
    }

    sql += ` ORDER BY m.created_at DESC LIMIT ?`;
    params.push(limit);

    const stmt = this.prepare(sql);
    return stmt.all(...params);
  }

  /** Get recent searches by user */
  async getRecentSearches(userId: string, limit: number = 10): Promise<string[]> {
    // This could be extended to track search history
    return [];
  }
}

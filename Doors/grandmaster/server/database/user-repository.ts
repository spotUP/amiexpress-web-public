/**
 * User Repository
 *
 * Database operations for user data in GRANDMASTER
 */

import type { Database } from 'better-sqlite3';

export interface GrandmasterUser {
  userId: string;
  username: string;
  createdAt: number;
  lastPlayed: number | null;
  gamesPlayed: number;
  totalLines: number;
  totalScore: number;
  totalPlaytime: number;
  bestGrade: string;
  bestLevel: number;
  bestScore: number;
  bestMode: string | null;
}

export class UserRepository {
  constructor(private db: Database) {}

  /**
   * Ensure user exists in database (upsert)
   * Creates user if not exists, updates last_played if exists
   */
  ensureUser(userId: string, username: string): void {
    const stmt = this.db.prepare(`
      INSERT INTO gm_users (user_id, username, created_at, last_played)
      VALUES (?, ?, strftime('%s', 'now'), strftime('%s', 'now'))
      ON CONFLICT(user_id) DO UPDATE SET
        last_played = strftime('%s', 'now'),
        username = excluded.username
    `);
    stmt.run(userId, username);
  }

  /**
   * Get user by ID
   */
  get(userId: string): GrandmasterUser | null {
    const stmt = this.db.prepare('SELECT * FROM gm_users WHERE user_id = ?');
    const row = stmt.get(userId) as any;
    if (!row) return null;
    return this.rowToUser(row);
  }

  /**
   * Get user by username
   */
  getByUsername(username: string): GrandmasterUser | null {
    const stmt = this.db.prepare('SELECT * FROM gm_users WHERE username = ?');
    const row = stmt.get(username) as any;
    if (!row) return null;
    return this.rowToUser(row);
  }

  /**
   * Update user stats after a game
   */
  updateStats(
    userId: string,
    score: number,
    lines: number,
    level: number,
    grade: string,
    mode: string,
    playtime: number
  ): void {
    const stmt = this.db.prepare(`
      UPDATE gm_users SET
        games_played = games_played + 1,
        total_score = total_score + ?,
        total_lines = total_lines + ?,
        total_playtime = total_playtime + ?,
        last_played = strftime('%s', 'now'),
        best_score = MAX(best_score, ?),
        best_level = MAX(best_level, ?),
        best_grade = CASE
          WHEN ? < best_grade THEN ?
          ELSE best_grade
        END,
        best_mode = CASE
          WHEN ? > best_score THEN ?
          ELSE best_mode
        END
      WHERE user_id = ?
    `);
    stmt.run(score, lines, playtime, score, level, grade, grade, score, mode, userId);
  }

  /**
   * Get top users by total score
   */
  getTopByScore(limit: number = 20): GrandmasterUser[] {
    const stmt = this.db.prepare(`
      SELECT * FROM gm_users
      ORDER BY total_score DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.rowToUser(row));
  }

  /**
   * Get top users by best grade
   */
  getTopByGrade(limit: number = 20): GrandmasterUser[] {
    const stmt = this.db.prepare(`
      SELECT * FROM gm_users
      ORDER BY best_grade ASC, best_score DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map(row => this.rowToUser(row));
  }

  private rowToUser(row: any): GrandmasterUser {
    return {
      userId: row.user_id,
      username: row.username,
      createdAt: row.created_at * 1000,
      lastPlayed: row.last_played ? row.last_played * 1000 : null,
      gamesPlayed: row.games_played,
      totalLines: row.total_lines,
      totalScore: row.total_score,
      totalPlaytime: row.total_playtime,
      bestGrade: row.best_grade,
      bestLevel: row.best_level,
      bestScore: row.best_score,
      bestMode: row.best_mode,
    };
  }
}

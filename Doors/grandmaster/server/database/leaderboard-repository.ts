/**
 * Leaderboard Repository
 *
 * Database operations for leaderboard entries
 */

import type { Database } from 'better-sqlite3';
import type { LeaderboardEntry, LeaderboardQuery } from '../leaderboard-manager';
import type { GameMode } from '../../core/types';

export class LeaderboardRepository {
  constructor(private db: Database) {}

  /**
   * Insert leaderboard entry
   */
  insert(entry: LeaderboardEntry): void {
    const stmt = this.db.prepare(`
      INSERT INTO gm_leaderboards (
        entry_id, user_id, username, mode, score, level, grade, lines, time,
        finesse_rate, finesse_errors, validation_score, validation_flags, replay_id
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      entry.id,
      entry.userId,
      entry.username,
      entry.mode,
      entry.score,
      entry.level,
      entry.grade,
      entry.lines,
      entry.time,
      entry.finesseRate || null,
      entry.finesseErrors || null,
      entry.validationScore,
      JSON.stringify(entry.flags),
      entry.replayId || null
    );
  }

  /**
   * Get leaderboard entries
   */
  query(query: LeaderboardQuery): LeaderboardEntry[] {
    let sql = 'SELECT * FROM gm_leaderboards WHERE 1=1';
    const params: any[] = [];

    if (query.mode) {
      sql += ' AND mode = ?';
      params.push(query.mode);
    }

    if (query.userId) {
      sql += ' AND user_id = ?';
      params.push(query.userId);
    }

    if (query.minValidationScore !== undefined) {
      sql += ' AND validation_score >= ?';
      params.push(query.minValidationScore);
    }

    if (query.startDate) {
      sql += ' AND submitted_at >= ?';
      params.push(Math.floor(query.startDate / 1000));
    }

    if (query.endDate) {
      sql += ' AND submitted_at <= ?';
      params.push(Math.floor(query.endDate / 1000));
    }

    sql += ' ORDER BY score DESC';

    if (query.limit) {
      sql += ' LIMIT ?';
      params.push(query.limit);
    }

    if (query.offset) {
      sql += ' OFFSET ?';
      params.push(query.offset);
    }

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];

    return rows.map(row => this.rowToEntry(row));
  }

  /**
   * Get user's best score for a mode
   */
  getUserBest(userId: string, mode: GameMode): LeaderboardEntry | null {
    const stmt = this.db.prepare(`
      SELECT * FROM gm_leaderboards
      WHERE user_id = ? AND mode = ?
      ORDER BY score DESC
      LIMIT 1
    `);

    const row = stmt.get(userId, mode) as any;
    return row ? this.rowToEntry(row) : null;
  }

  /**
   * Get user's rank in a mode
   */
  getUserRank(userId: string, mode: GameMode): number | null {
    const stmt = this.db.prepare(`
      SELECT COUNT(*) + 1 as rank
      FROM gm_leaderboards
      WHERE mode = ? AND score > (
        SELECT MAX(score) FROM gm_leaderboards
        WHERE user_id = ? AND mode = ?
      )
    `);

    const result = stmt.get(mode, userId, mode) as any;
    return result?.rank || null;
  }

  /**
   * Get entry count
   */
  count(query: LeaderboardQuery = {}): number {
    let sql = 'SELECT COUNT(*) as count FROM gm_leaderboards WHERE 1=1';
    const params: any[] = [];

    if (query.mode) {
      sql += ' AND mode = ?';
      params.push(query.mode);
    }

    const stmt = this.db.prepare(sql);
    const result = stmt.get(...params) as any;
    return result.count;
  }

  /**
   * Delete all entries for a user
   */
  deleteByUser(userId: string): number {
    const stmt = this.db.prepare('DELETE FROM gm_leaderboards WHERE user_id = ?');
    const result = stmt.run(userId);
    return result.changes;
  }

  /**
   * Clear all entries
   */
  deleteAll(): void {
    this.db.exec('DELETE FROM gm_leaderboards');
  }

  /**
   * Convert database row to LeaderboardEntry
   */
  private rowToEntry(row: any): LeaderboardEntry {
    return {
      id: row.entry_id,
      userId: row.user_id,
      username: row.username,
      mode: row.mode,
      score: row.score,
      level: row.level,
      grade: row.grade,
      lines: row.lines,
      time: row.time,
      finesseRate: row.finesse_rate,
      finesseErrors: row.finesse_errors,
      timestamp: row.submitted_at * 1000, // Convert to milliseconds
      validationScore: row.validation_score,
      flags: JSON.parse(row.validation_flags || '[]'),
      replayId: row.replay_id,
    };
  }
}

"use strict";
/**
 * User Repository
 *
 * Database operations for user data in GRANDMASTER
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.UserRepository = void 0;
class UserRepository {
    constructor(db) {
        this.db = db;
    }
    /**
     * Ensure user exists in database (upsert)
     * Creates user if not exists, updates last_played if exists
     */
    ensureUser(userId, username) {
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
    get(userId) {
        const stmt = this.db.prepare('SELECT * FROM gm_users WHERE user_id = ?');
        const row = stmt.get(userId);
        if (!row)
            return null;
        return this.rowToUser(row);
    }
    /**
     * Get user by username
     */
    getByUsername(username) {
        const stmt = this.db.prepare('SELECT * FROM gm_users WHERE username = ?');
        const row = stmt.get(username);
        if (!row)
            return null;
        return this.rowToUser(row);
    }
    /**
     * Update user stats after a game
     */
    updateStats(userId, score, lines, level, grade, mode, playtime) {
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
    getTopByScore(limit = 20) {
        const stmt = this.db.prepare(`
      SELECT * FROM gm_users
      ORDER BY total_score DESC
      LIMIT ?
    `);
        const rows = stmt.all(limit);
        return rows.map(row => this.rowToUser(row));
    }
    /**
     * Get top users by best grade
     */
    getTopByGrade(limit = 20) {
        const stmt = this.db.prepare(`
      SELECT * FROM gm_users
      ORDER BY best_grade ASC, best_score DESC
      LIMIT ?
    `);
        const rows = stmt.all(limit);
        return rows.map(row => this.rowToUser(row));
    }
    rowToUser(row) {
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
exports.UserRepository = UserRepository;
//# sourceMappingURL=user-repository.js.map
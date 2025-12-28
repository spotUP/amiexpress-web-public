/**
 * Moderation repository for managing room bans and mutes
 */
import type Database from 'better-sqlite3';

export class ModerationRepository {
  constructor(private db: Database.Database) {}

  private prepare(sql: string) {
    return this.db.prepare(sql);
  }

  /** Ban a user from a room */
  async banUser(roomId: string, userId: string, bannedBy: string, reason?: string, expiresAt?: number): Promise<void> {
    const stmt = this.prepare(`
      INSERT OR REPLACE INTO room_bans (room_id, user_id, banned_by, reason, expires_at)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(roomId, userId, bannedBy, reason || null, expiresAt || null);
  }

  /** Unban a user from a room */
  async unbanUser(roomId: string, userId: string): Promise<void> {
    const stmt = this.prepare(`
      DELETE FROM room_bans WHERE room_id = ? AND user_id = ?
    `);
    stmt.run(roomId, userId);
  }

  /** Check if user is banned */
  async isBanned(roomId: string, userId: string): Promise<boolean> {
    const stmt = this.prepare(`
      SELECT COUNT(*) as count FROM room_bans
      WHERE room_id = ? AND user_id = ?
      AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
    `);
    const result = stmt.get(roomId, userId) as { count: number };
    return result.count > 0;
  }

  /** Mute a user in a room */
  async muteUser(roomId: string, userId: string, mutedBy: string, duration?: number): Promise<void> {
    const stmt = this.prepare(`
      INSERT OR REPLACE INTO room_mutes (room_id, user_id, muted_by, duration)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(roomId, userId, mutedBy, duration || null);
  }

  /** Unmute a user in a room */
  async unmuteUser(roomId: string, userId: string): Promise<void> {
    const stmt = this.prepare(`
      DELETE FROM room_mutes WHERE room_id = ? AND user_id = ?
    `);
    stmt.run(roomId, userId);
  }

  /** Check if user is muted */
  async isMuted(roomId: string, userId: string): Promise<boolean> {
    const stmt = this.prepare(`
      SELECT muted_at, duration FROM room_mutes
      WHERE room_id = ? AND user_id = ?
    `);
    const result = stmt.get(roomId, userId) as { muted_at: number; duration: number | null } | undefined;

    if (!result) return false;

    // Check if mute has expired
    if (result.duration) {
      const now = Math.floor(Date.now() / 1000);
      if (now > result.muted_at + result.duration) {
        // Mute expired, clean up
        await this.unmuteUser(roomId, userId);
        return false;
      }
    }

    return true;
  }

  /** Get all bans for a room */
  async getRoomBans(roomId: string): Promise<any[]> {
    const stmt = this.prepare(`
      SELECT * FROM room_bans
      WHERE room_id = ?
      AND (expires_at IS NULL OR expires_at > strftime('%s', 'now'))
      ORDER BY banned_at DESC
    `);
    return stmt.all(roomId);
  }

  /** Get all mutes for a room */
  async getRoomMutes(roomId: string): Promise<any[]> {
    const stmt = this.prepare(`
      SELECT * FROM room_mutes
      WHERE room_id = ?
      ORDER BY muted_at DESC
    `);
    return stmt.all(roomId);
  }
}

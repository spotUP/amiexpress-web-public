import type { UserPresence } from '../types';

/** User presence repository */
export class PresenceRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async get(userId: number): Promise<UserPresence | null> {
    return this.db.get(
      `SELECT * FROM chat_user_presence WHERE user_id = ?`,
      [userId]
    );
  }

  async set(userId: number, status: string, customStatus?: string): Promise<void> {
    await this.db.run(
      `INSERT OR REPLACE INTO chat_user_presence
       (user_id, status, custom_status, last_active)
       VALUES (?, ?, ?, datetime('now'))`,
      [userId, status, customStatus]
    );
  }

  async setActivity(userId: number, activity: string): Promise<void> {
    await this.db.run(
      `UPDATE chat_user_presence SET activity = ?, last_active = datetime('now')
       WHERE user_id = ?`,
      [activity, userId]
    );
  }

  async updateLastActive(userId: number): Promise<void> {
    await this.db.run(
      `UPDATE chat_user_presence SET last_active = datetime('now') WHERE user_id = ?`,
      [userId]
    );
  }

  async getOnline(): Promise<UserPresence[]> {
    return this.db.all(
      `SELECT * FROM chat_user_presence WHERE status != 'offline'
       AND last_active > datetime('now', '-5 minutes')`
    );
  }

  async setOffline(userId: number): Promise<void> {
    await this.db.run(
      `UPDATE chat_user_presence SET status = 'offline' WHERE user_id = ?`,
      [userId]
    );
  }

  async getByStatus(status: string): Promise<UserPresence[]> {
    return this.db.all(
      `SELECT * FROM chat_user_presence WHERE status = ?`,
      [status]
    );
  }
}

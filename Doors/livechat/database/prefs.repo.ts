import type { EventPrefs } from '../types';
import { getDefaultPrefs, rowToPrefs } from './prefs-defaults';

/** User preferences repository */
export class PrefsRepository {
  private db: any;

  constructor(db: any) {
    this.db = db;
  }

  async get(userId: number): Promise<EventPrefs> {
    const row = await this.db.get(
      `SELECT * FROM chat_user_preferences WHERE user_id = ?`,
      [userId]
    );
    return rowToPrefs(row);
  }

  getDefaults(): EventPrefs {
    return getDefaultPrefs();
  }

  async set(userId: number, prefs: Partial<EventPrefs>): Promise<void> {
    const current = await this.get(userId);
    const m = { ...current, ...prefs };
    await this.db.run(
      `INSERT OR REPLACE INTO chat_user_preferences
       (user_id, show_logins, show_file_activity, show_door_activity,
        show_messages, show_system, mute_all, compact_mode, show_timestamps,
        notification_sound, mention_sound)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [userId, m.showLogins ? 1 : 0, m.showFileActivity ? 1 : 0,
       m.showDoorActivity ? 1 : 0, m.showMessages ? 1 : 0,
       m.showSystemAnnouncements ? 1 : 0, m.muteAllEvents ? 1 : 0,
       m.compactMode ? 1 : 0, m.showTimestamps ? 1 : 0,
       m.notificationSound ? 1 : 0, m.mentionSound ? 1 : 0]
    );
  }
}

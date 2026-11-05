"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PrefsRepository = void 0;
const prefs_defaults_1 = require("./prefs-defaults");
/** User preferences repository */
class PrefsRepository {
    constructor(db) {
        this.db = db;
    }
    async get(userId) {
        const row = await this.db.get(`SELECT * FROM chat_user_preferences WHERE user_id = ?`, [userId]);
        return (0, prefs_defaults_1.rowToPrefs)(row);
    }
    getDefaults() {
        return (0, prefs_defaults_1.getDefaultPrefs)();
    }
    async set(userId, prefs) {
        const current = await this.get(userId);
        const m = { ...current, ...prefs };
        await this.db.run(`INSERT OR REPLACE INTO chat_user_preferences
       (user_id, show_logins, show_file_activity, show_door_activity,
        show_messages, show_system, mute_all, compact_mode, show_timestamps,
        notification_sound, mention_sound)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [userId, m.showLogins ? 1 : 0, m.showFileActivity ? 1 : 0,
            m.showDoorActivity ? 1 : 0, m.showMessages ? 1 : 0,
            m.showSystemAnnouncements ? 1 : 0, m.muteAllEvents ? 1 : 0,
            m.compactMode ? 1 : 0, m.showTimestamps ? 1 : 0,
            m.notificationSound ? 1 : 0, m.mentionSound ? 1 : 0]);
    }
}
exports.PrefsRepository = PrefsRepository;

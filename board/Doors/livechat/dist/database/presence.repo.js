"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PresenceRepository = void 0;
/** User presence repository */
class PresenceRepository {
    constructor(db) {
        this.db = db;
    }
    async get(userId) {
        return this.db.get(`SELECT * FROM chat_user_presence WHERE user_id = ?`, [userId]);
    }
    async set(userId, status, customStatus) {
        await this.db.run(`INSERT OR REPLACE INTO chat_user_presence
       (user_id, status, custom_status, last_active)
       VALUES (?, ?, ?, datetime('now'))`, [userId, status, customStatus]);
    }
    async setActivity(userId, activity) {
        await this.db.run(`UPDATE chat_user_presence SET activity = ?, last_active = datetime('now')
       WHERE user_id = ?`, [activity, userId]);
    }
    async updateLastActive(userId) {
        await this.db.run(`UPDATE chat_user_presence SET last_active = datetime('now') WHERE user_id = ?`, [userId]);
    }
    async getOnline() {
        return this.db.all(`SELECT * FROM chat_user_presence WHERE status != 'offline'
       AND last_active > datetime('now', '-5 minutes')`);
    }
    async setOffline(userId) {
        await this.db.run(`UPDATE chat_user_presence SET status = 'offline' WHERE user_id = ?`, [userId]);
    }
    async getByStatus(status) {
        return this.db.all(`SELECT * FROM chat_user_presence WHERE status = ?`, [status]);
    }
}
exports.PresenceRepository = PresenceRepository;

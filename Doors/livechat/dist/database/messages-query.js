"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageQueries = void 0;
/** Message query operations */
class MessageQueries {
    constructor(db) {
        this.db = db;
    }
    async getById(id) {
        return this.db.get('SELECT * FROM chat_messages WHERE id = ?', [id]);
    }
    async getByChannel(channelId, limit = 50) {
        return this.db.all(`SELECT * FROM chat_messages WHERE channel_id = ? AND deleted = 0
       ORDER BY created_at DESC LIMIT ?`, [channelId, limit]);
    }
    async getThread(threadId) {
        return this.db.all(`SELECT * FROM chat_messages WHERE thread_id = ? ORDER BY created_at`, [threadId]);
    }
    async search(query, channelId) {
        const sql = channelId
            ? `SELECT * FROM chat_messages WHERE channel_id = ? AND message LIKE ?`
            : `SELECT * FROM chat_messages WHERE message LIKE ?`;
        const params = channelId ? [channelId, `%${query}%`] : [`%${query}%`];
        return this.db.all(sql, params);
    }
}
exports.MessageQueries = MessageQueries;

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemberQueries = void 0;
/** Member query operations */
class MemberQueries {
    constructor(db) {
        this.db = db;
    }
    async get(channelId, userId) {
        return this.db.get(`SELECT * FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`, [channelId, userId]);
    }
    async getByChannel(channelId) {
        return this.db.all(`SELECT * FROM chat_channel_members WHERE channel_id = ? AND banned = 0`, [channelId]);
    }
    async getByUser(userId) {
        return this.db.all(`SELECT * FROM chat_channel_members WHERE user_id = ?`, [userId]);
    }
}
exports.MemberQueries = MemberQueries;

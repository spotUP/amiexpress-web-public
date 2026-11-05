"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemberRepository = void 0;
const members_query_1 = require("./members-query");
/** Channel members repository */
class MemberRepository extends members_query_1.MemberQueries {
    async add(channelId, userId, role = 'member') {
        await this.db.run(`INSERT OR REPLACE INTO chat_channel_members
       (channel_id, user_id, role, joined_at) VALUES (?, ?, ?, datetime('now'))`, [channelId, userId, role]);
    }
    async remove(channelId, userId) {
        await this.db.run(`DELETE FROM chat_channel_members WHERE channel_id = ? AND user_id = ?`, [channelId, userId]);
    }
    async setRole(channelId, userId, role) {
        await this.db.run(`UPDATE chat_channel_members SET role = ? WHERE channel_id = ? AND user_id = ?`, [role, channelId, userId]);
    }
    async ban(channelId, userId, reason) {
        await this.db.run(`UPDATE chat_channel_members SET banned = 1, ban_reason = ?
       WHERE channel_id = ? AND user_id = ?`, [reason, channelId, userId]);
    }
    async unban(channelId, userId) {
        await this.db.run(`UPDATE chat_channel_members SET banned = 0, ban_reason = NULL
       WHERE channel_id = ? AND user_id = ?`, [channelId, userId]);
    }
}
exports.MemberRepository = MemberRepository;

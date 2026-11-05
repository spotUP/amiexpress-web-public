"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PinnedRepository = void 0;
/** Pinned messages repository */
class PinnedRepository {
    constructor(db) {
        this.db = db;
    }
    async pin(channelId, messageId, pinnedBy) {
        await this.db.run(`INSERT OR IGNORE INTO chat_pinned_messages
       (channel_id, message_id, pinned_by) VALUES (?, ?, ?)`, [channelId, messageId, pinnedBy]);
    }
    async unpin(channelId, messageId) {
        await this.db.run(`DELETE FROM chat_pinned_messages WHERE channel_id = ? AND message_id = ?`, [channelId, messageId]);
    }
    async getByChannel(channelId) {
        const rows = await this.db.all(`SELECT message_id FROM chat_pinned_messages WHERE channel_id = ?
       ORDER BY pinned_at DESC`, [channelId]);
        return rows.map((r) => r.message_id);
    }
    async isPinned(channelId, messageId) {
        const row = await this.db.get(`SELECT 1 FROM chat_pinned_messages WHERE channel_id = ? AND message_id = ?`, [channelId, messageId]);
        return !!row;
    }
    async count(channelId) {
        const row = await this.db.get(`SELECT COUNT(*) as count FROM chat_pinned_messages WHERE channel_id = ?`, [channelId]);
        return row?.count || 0;
    }
}
exports.PinnedRepository = PinnedRepository;

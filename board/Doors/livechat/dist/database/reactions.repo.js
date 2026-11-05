"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionRepository = void 0;
/** Reactions repository */
class ReactionRepository {
    constructor(db) {
        this.db = db;
    }
    async add(messageId, userId, emoji) {
        await this.db.run(`INSERT OR IGNORE INTO chat_reactions (message_id, user_id, emoji)
       VALUES (?, ?, ?)`, [messageId, userId, emoji]);
    }
    async remove(messageId, userId, emoji) {
        await this.db.run(`DELETE FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`, [messageId, userId, emoji]);
    }
    async getByMessage(messageId) {
        return this.db.all(`SELECT * FROM chat_reactions WHERE message_id = ?`, [messageId]);
    }
    async getGrouped(messageId) {
        return this.db.all(`SELECT emoji, COUNT(*) as count FROM chat_reactions
       WHERE message_id = ? GROUP BY emoji`, [messageId]);
    }
    async hasReacted(messageId, userId, emoji) {
        const row = await this.db.get(`SELECT 1 FROM chat_reactions WHERE message_id = ? AND user_id = ? AND emoji = ?`, [messageId, userId, emoji]);
        return !!row;
    }
    async toggle(messageId, userId, emoji) {
        const exists = await this.hasReacted(messageId, userId, emoji);
        if (exists) {
            await this.remove(messageId, userId, emoji);
            return false;
        }
        await this.add(messageId, userId, emoji);
        return true;
    }
}
exports.ReactionRepository = ReactionRepository;

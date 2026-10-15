"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageRepository = void 0;
const messages_query_1 = require("./messages-query");
/** Message repository */
class MessageRepository extends messages_query_1.MessageQueries {
    async create(msg) {
        const sql = `INSERT INTO chat_messages
      (id, channel_id, user_id, username, message, type, thread_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
        await this.db.run(sql, [
            msg.id, msg.channelId, msg.userId, msg.username,
            msg.content, msg.type, msg.threadId, JSON.stringify(msg.metadata || {})
        ]);
        const created = await this.getById(msg.id);
        if (!created)
            throw new Error('Failed to create message');
        return created;
    }
    async delete(id, deletedBy) {
        await this.db.run(`UPDATE chat_messages SET deleted = 1, deleted_by = ? WHERE id = ?`, [deletedBy, id]);
    }
    async updateReplyCount(threadId) {
        await this.db.run(`UPDATE chat_messages SET reply_count = (
        SELECT COUNT(*) FROM chat_messages WHERE thread_id = ?
      ) WHERE id = ?`, [threadId, threadId]);
    }
}
exports.MessageRepository = MessageRepository;

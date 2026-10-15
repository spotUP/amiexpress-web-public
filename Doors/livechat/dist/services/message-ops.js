"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MessageOps = void 0;
/** Message operations */
class MessageOps {
    constructor(repo, socket, userId, name) {
        this.repo = repo;
        this.socket = socket;
        this.userId = userId;
        this.name = name;
    }
    /** Load messages */
    async load(chId, limit = 50) {
        return this.repo.getByChannel(chId, limit);
    }
    /** Send */
    async send(chId, content, type = 'message') {
        const msg = await this.repo.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId: chId, userId: String(this.userId), username: this.name,
            content, type, createdAt: new Date(), replyCount: 0
        });
        this.socket?.emit?.('chat:message', msg);
        return msg;
    }
    /** Reply */
    async reply(chId, tid, content) {
        const msg = await this.repo.create({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            channelId: chId, threadId: tid, userId: String(this.userId), username: this.name,
            content, type: 'message', createdAt: new Date(), replyCount: 0
        });
        await this.repo.updateReplyCount(tid);
        this.socket?.emit?.('chat:thread-reply', msg);
        return msg;
    }
    /** Edit */
    async edit(id, content) {
        const m = await this.repo.getById(id);
        if (!m || m.userId !== String(this.userId))
            return;
        this.socket?.emit?.('chat:message-edit', { messageId: id, content });
    }
    /** Delete */
    async delete(id) {
        await this.repo.delete(id, this.userId);
        this.socket?.emit?.('chat:message-delete', { messageId: id });
    }
}
exports.MessageOps = MessageOps;

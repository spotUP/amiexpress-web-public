"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReactionOps = void 0;
/** Reaction operations with DB */
class ReactionOps {
    constructor(repo, socket, userId) {
        this.repo = repo;
        this.socket = socket;
        this.userId = userId;
    }
    /** Add reaction to message */
    async add(messageId, emoji) {
        await this.repo.add(messageId, this.userId, emoji);
        this.socket?.emit?.('chat:reaction-added', {
            messageId, userId: this.userId, emoji
        });
    }
    /** Remove reaction from message */
    async remove(messageId, emoji) {
        await this.repo.remove(messageId, this.userId, emoji);
        this.socket?.emit?.('chat:reaction-removed', {
            messageId, userId: this.userId, emoji
        });
    }
    /** Toggle reaction (add if not exists, remove if exists) */
    async toggle(messageId, emoji) {
        const toggled = await this.repo.toggle(messageId, this.userId, emoji);
        const event = toggled ? 'chat:reaction-added' : 'chat:reaction-removed';
        this.socket?.emit?.(event, { messageId, userId: this.userId, emoji });
        return toggled;
    }
    /** Get reactions for message */
    async getForMessage(messageId) {
        return this.repo.getByMessage(messageId);
    }
}
exports.ReactionOps = ReactionOps;

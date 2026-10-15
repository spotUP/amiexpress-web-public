"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ChannelOps = void 0;
/** Channel operations with DB */
class ChannelOps {
    constructor(repo, socket, userId) {
        this.repo = repo;
        this.socket = socket;
        this.userId = userId;
    }
    /** Load all accessible channels */
    async loadAll() {
        return this.repo.getAll();
    }
    /** Join a channel */
    async join(channelId) {
        this.socket?.join?.(`channel:${channelId}`);
        this.socket?.emit?.('chat:user-joined', { channelId, userId: this.userId });
    }
    /** Leave a channel */
    async leave(channelId) {
        this.socket?.leave?.(`channel:${channelId}`);
        this.socket?.emit?.('chat:user-left', { channelId, userId: this.userId });
    }
    /** Create a new channel */
    async create(name, topic) {
        const id = name.toLowerCase().replace(/[^a-z0-9-]/g, '-');
        return this.repo.create({
            id, name, displayName: name, topic, type: 'public',
            createdBy: String(this.userId), createdAt: new Date(), memberCount: 1
        });
    }
    /** Update channel topic */
    async updateTopic(channelId, topic) {
        await this.repo.update(channelId, { topic });
        this.socket?.emit?.('chat:channel-updated', { channelId, topic });
    }
    /** Delete (archive) a channel */
    async delete(channelId) {
        await this.repo.archive(channelId);
        this.socket?.emit?.('chat:channel-deleted', { channelId });
    }
}
exports.ChannelOps = ChannelOps;

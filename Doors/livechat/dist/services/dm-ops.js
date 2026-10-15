"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DMOps = void 0;
/** DM operations */
class DMOps {
    constructor(channelRepo, memberRepo, userId) {
        this.channelRepo = channelRepo;
        this.memberRepo = memberRepo;
        this.userId = userId;
    }
    /** Get or create DM channel with another user */
    async getOrCreate(otherUserId, otherUsername) {
        const dmId = this.getDMId(otherUserId);
        let channel = await this.channelRepo.getById(dmId);
        if (!channel) {
            channel = await this.channelRepo.create({
                id: dmId,
                name: `dm-${this.userId}-${otherUserId}`,
                displayName: otherUsername,
                topic: 'Direct Message',
                type: 'dm',
                createdBy: String(this.userId),
                createdAt: new Date(),
                memberCount: 2
            });
            await this.memberRepo.add(dmId, this.userId, 'owner');
            await this.memberRepo.add(dmId, otherUserId, 'member');
        }
        return channel;
    }
    /** Get all DM channels for user */
    async getAllDMs() {
        const memberships = await this.memberRepo.getByUser(this.userId);
        const dms = [];
        for (const m of memberships) {
            const ch = await this.channelRepo.getById(m.channel_id);
            if (ch?.type === 'dm')
                dms.push(ch);
        }
        return dms;
    }
    /** Generate DM channel ID */
    getDMId(otherUserId) {
        const ids = [this.userId, otherUserId].sort((a, b) => a - b);
        return `dm-${ids[0]}-${ids[1]}`;
    }
}
exports.DMOps = DMOps;

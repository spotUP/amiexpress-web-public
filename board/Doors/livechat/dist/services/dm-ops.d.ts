import type { Channel } from '../types';
import { ChannelRepository, MemberRepository } from '../database';
/** DM operations */
export declare class DMOps {
    private channelRepo;
    private memberRepo;
    private userId;
    constructor(channelRepo: ChannelRepository, memberRepo: MemberRepository, userId: number);
    /** Get or create DM channel with another user */
    getOrCreate(otherUserId: number, otherUsername: string): Promise<Channel>;
    /** Get all DM channels for user */
    getAllDMs(): Promise<Channel[]>;
    /** Generate DM channel ID */
    private getDMId;
}

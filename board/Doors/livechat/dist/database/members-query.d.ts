import type { ChannelMember } from '../types';
/** Member query operations */
export declare class MemberQueries {
    protected db: any;
    constructor(db: any);
    get(channelId: string, userId: number): Promise<ChannelMember | null>;
    getByChannel(channelId: string): Promise<ChannelMember[]>;
    getByUser(userId: number): Promise<ChannelMember[]>;
}

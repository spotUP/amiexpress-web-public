import type { Channel } from '../types';
import { ChannelRepository } from '../database';
/** Channel operations with DB */
export declare class ChannelOps {
    private repo;
    private socket;
    private userId;
    constructor(repo: ChannelRepository, socket: any, userId: number);
    /** Load all accessible channels */
    loadAll(): Promise<Channel[]>;
    /** Join a channel */
    join(channelId: string): Promise<void>;
    /** Leave a channel */
    leave(channelId: string): Promise<void>;
    /** Create a new channel */
    create(name: string, topic: string): Promise<Channel>;
    /** Update channel topic */
    updateTopic(channelId: string, topic: string): Promise<void>;
    /** Delete (archive) a channel */
    delete(channelId: string): Promise<void>;
}

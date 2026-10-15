import type { Channel } from '../types';
/** Channel repository */
export declare class ChannelRepository {
    private db;
    constructor(db: any);
    create(channel: Partial<Channel>): Promise<Channel>;
    getById(id: string): Promise<Channel | null>;
    getByName(name: string): Promise<Channel | null>;
    getAll(): Promise<Channel[]>;
    getPublic(): Promise<Channel[]>;
    update(id: string, data: Partial<Channel>): Promise<void>;
    archive(id: string): Promise<void>;
}

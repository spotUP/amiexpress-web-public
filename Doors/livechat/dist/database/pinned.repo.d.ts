/** Pinned messages repository */
export declare class PinnedRepository {
    private db;
    constructor(db: any);
    pin(channelId: string, messageId: string, pinnedBy: number): Promise<void>;
    unpin(channelId: string, messageId: string): Promise<void>;
    getByChannel(channelId: string): Promise<string[]>;
    isPinned(channelId: string, messageId: string): Promise<boolean>;
    count(channelId: string): Promise<number>;
}

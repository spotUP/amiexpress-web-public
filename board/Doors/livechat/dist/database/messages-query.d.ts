import type { Message } from '../types';
/** Message query operations */
export declare class MessageQueries {
    protected db: any;
    constructor(db: any);
    getById(id: string): Promise<Message | null>;
    getByChannel(channelId: string, limit?: number): Promise<Message[]>;
    getThread(threadId: string): Promise<Message[]>;
    search(query: string, channelId?: string): Promise<Message[]>;
}

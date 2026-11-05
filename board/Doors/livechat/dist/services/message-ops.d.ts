import type { Message } from '../types';
import { MessageRepository } from '../database';
/** Message operations */
export declare class MessageOps {
    private repo;
    private socket;
    private userId;
    private name;
    constructor(repo: MessageRepository, socket: any, userId: number, name: string);
    /** Load messages */
    load(chId: string, limit?: number): Promise<Message[]>;
    /** Send */
    send(chId: string, content: string, type?: Message['type']): Promise<Message>;
    /** Reply */
    reply(chId: string, tid: string, content: string): Promise<Message>;
    /** Edit */
    edit(id: string, content: string): Promise<void>;
    /** Delete */
    delete(id: string): Promise<void>;
}

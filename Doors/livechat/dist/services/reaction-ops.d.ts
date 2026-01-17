import type { Reaction } from '../types';
import { ReactionRepository } from '../database';
/** Reaction operations with DB */
export declare class ReactionOps {
    private repo;
    private socket;
    private userId;
    constructor(repo: ReactionRepository, socket: any, userId: number);
    /** Add reaction to message */
    add(messageId: string, emoji: string): Promise<void>;
    /** Remove reaction from message */
    remove(messageId: string, emoji: string): Promise<void>;
    /** Toggle reaction (add if not exists, remove if exists) */
    toggle(messageId: string, emoji: string): Promise<boolean>;
    /** Get reactions for message */
    getForMessage(messageId: string): Promise<Reaction[]>;
}

import type { Reaction } from '../types';
/** Reactions repository */
export declare class ReactionRepository {
    private db;
    constructor(db: any);
    add(messageId: string, userId: number, emoji: string): Promise<void>;
    remove(messageId: string, userId: number, emoji: string): Promise<void>;
    getByMessage(messageId: string): Promise<Reaction[]>;
    getGrouped(messageId: string): Promise<{
        emoji: string;
        count: number;
    }[]>;
    hasReacted(messageId: string, userId: number, emoji: string): Promise<boolean>;
    toggle(messageId: string, userId: number, emoji: string): Promise<boolean>;
}

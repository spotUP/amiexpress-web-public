import type { PresenceStatus } from '../types';
import { PresenceRepository } from '../database';
/** Presence operations with DB persistence */
export declare class PresenceOps {
    private repo;
    private socket;
    private userId;
    constructor(repo: PresenceRepository, socket: any, userId: number);
    /** Set user online */
    setOnline(): Promise<void>;
    /** Set user away */
    setAway(message?: string): Promise<void>;
    /** Set user status */
    setStatus(status: PresenceStatus, custom?: string): Promise<void>;
    /** Set activity (playing game, etc) */
    setActivity(activity: string): Promise<void>;
    /** Set user offline */
    setOffline(): Promise<void>;
}

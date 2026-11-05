import type { UserPresence, PresenceStatus } from '../types';
/** User presence service */
export declare class PresenceService {
    private presence;
    /** Set user status */
    setStatus(userId: number, status: PresenceStatus, custom?: string): void;
    /** Set user activity */
    setActivity(userId: number, activity: string): void;
    /** Get user presence */
    get(userId: number): UserPresence | undefined;
    /** Get all online users */
    getOnline(): UserPresence[];
    /** Update last active timestamp */
    touch(userId: number): void;
    /** Set user offline */
    setOffline(userId: number): void;
    /** Count by status */
    countByStatus(): Record<PresenceStatus, number>;
}

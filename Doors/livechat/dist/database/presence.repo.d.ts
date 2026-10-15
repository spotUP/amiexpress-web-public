import type { UserPresence } from '../types';
/** User presence repository */
export declare class PresenceRepository {
    private db;
    constructor(db: any);
    get(userId: number): Promise<UserPresence | null>;
    set(userId: number, status: string, customStatus?: string): Promise<void>;
    setActivity(userId: number, activity: string): Promise<void>;
    updateLastActive(userId: number): Promise<void>;
    getOnline(): Promise<UserPresence[]>;
    setOffline(userId: number): Promise<void>;
    getByStatus(status: string): Promise<UserPresence[]>;
}

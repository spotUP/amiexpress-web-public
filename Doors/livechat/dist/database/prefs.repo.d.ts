import type { EventPrefs } from '../types';
/** User preferences repository */
export declare class PrefsRepository {
    private db;
    constructor(db: any);
    get(userId: number): Promise<EventPrefs>;
    getDefaults(): EventPrefs;
    set(userId: number, prefs: Partial<EventPrefs>): Promise<void>;
}

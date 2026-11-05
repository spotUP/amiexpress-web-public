/** User presence status */
export type PresenceStatus = 'online' | 'away' | 'dnd' | 'invisible' | 'offline';
/** User presence info */
export interface UserPresence {
    userId: number;
    status: PresenceStatus;
    customStatus?: string;
    activity?: string;
    lastActive: Date;
}
/** Presence indicator display */
export declare const PRESENCE_INDICATORS: Record<PresenceStatus, string>;
/** Presence colors */
export declare const PRESENCE_COLORS: Record<PresenceStatus, string>;

import type { CompactProfile } from '@amiexpress/bbs-door-sdk/engines/ui/blessed';
export interface UnlockOut {
    id: string;
    name: string;
    tier: string;
    points: number;
    hidden: boolean;
    rarityPctTenths: number;
    at: string;
}
export interface ProgressOut {
    id: string;
    have: number;
    need: number;
}
export interface PlayerProfile {
    handle: string;
    verified: boolean;
    private: boolean;
    points: number;
    linkedBoards: string[];
    unlocks: UnlockOut[];
    progress: ProgressOut[];
    linkCode?: string;
    linkCodeExpiresAt?: string;
}
export interface CatalogAchievement {
    id: string;
    name: string;
    description: string;
    family: string;
    tier: string;
    points: number;
    hidden: boolean;
    rarityPctTenths: number;
    rarityBucket: string;
}
export interface CatalogResponse {
    revision: string;
    achievements: CatalogAchievement[];
}
export interface LeaderboardRow {
    rank: number;
    handle: string;
    points: number;
    unlocks: number;
}
export interface LeaderboardResponse {
    scope: string;
    period: string;
    season: string | null;
    rows: LeaderboardRow[];
}
export interface ApiResult<T> {
    status: number;
    body: T | null;
    error?: string;
    detail?: string;
    /** Seconds from the server's Retry-After, when it sent one. */
    retryAfter?: number;
}
interface DoorSession {
    bbs: any;
    user?: {
        username?: string;
        email?: string;
    };
}
export type AccountState = {
    kind: 'unknown';
} | {
    kind: 'off';
} | {
    kind: 'no-email';
} | {
    kind: 'not-linked';
    email: string;
} | {
    kind: 'linked';
    email: string;
    profile: PlayerProfile;
};
/** Clip to the panel, never fold: a folded row eats the row underneath it. */
export declare function clip(text: string, width: number): string;
/** The menu, as the state allows. */
export declare function menuItems(state: AccountState, compact: CompactProfile): Array<{
    id: string;
    label: string;
}>;
/** The caller's own page: points, every unlock, and what is close. */
export declare function profileLines(p: PlayerProfile, width: number): string[];
/** The families in the catalog, in first-seen order. */
export declare function familiesOf(catalog: CatalogResponse): string[];
/** The whole catalog grouped by family; a withheld hidden one shows as the server sent it (???). */
export declare function catalogLines(catalog: CatalogResponse, width: number, unlocked?: Set<string>): string[];
export declare function leaderboardLines(lb: LeaderboardResponse, width: number): string[];
/**
 * How long the caller actually has to wait.
 *
 * This said "try again in a minute" whatever the server answered, and the
 * limits it reports are per HOUR: registration is 3 an hour and verification
 * 10. A sysop who registered three times while his mail was being fixed was
 * told to wait a minute, waited many, and was refused every time - reported
 * as "it says too many requests try again in a minute but it was many minutes
 * ago". The server sends Retry-After; this says what it says.
 */
export declare function rateLimitWords(retryAfter?: number): string;
/**
 * What opening the account screen should DO.
 *
 * It used to register unconditionally - every visit mailed a code and spent
 * one of the caller's three registrations an hour. A sysop whose paste was
 * not working opened the screen three times, entered nothing, and was locked
 * out for an hour without ever having asked for a second code: "rate limited
 * again try again in 31 minutes".
 *
 * Sending mail is not something a screen does on the way in. The caller types
 * the code they already have, or leaves it blank to ask for one.
 */
export type AccountAction = {
    do: 'cancel';
} | {
    do: 'send-code';
} | {
    do: 'verify';
    code: string;
};
export declare function accountAction(typed: string | null): AccountAction;
/** A refusal or a fault, in the caller's words. */
export declare function explain(result: ApiResult<unknown>): string;
export declare function footerHints(compact: CompactProfile, inView: boolean): Array<{
    key: string;
    does: string;
}>;
export declare function createApp(session: DoorSession): Promise<void>;
export declare function runDoor(bbs: any, session?: DoorSession): Promise<void>;
export default runDoor;
//# sourceMappingURL=app.d.ts.map
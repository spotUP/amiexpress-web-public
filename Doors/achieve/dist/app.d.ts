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
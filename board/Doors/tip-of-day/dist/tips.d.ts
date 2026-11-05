/**
 * Tip pickers: pure choice over injected data, no screen, no storage.
 *
 * One tip per login, unseen-first within its kind, kinds weighted by the
 * sysop's door.settings.json. Every source degrades to fewer tips, never
 * a throw: a door that cannot read the board still shows a how-to, and a
 * door with nothing at all shows the fallback instead of an empty screen.
 */
import type { DoorEntry } from './catalog';
export type TipKind = 'door' | 'fact' | 'howto' | 'event';
export interface Tip {
    /** Stable across logins: `door:WHIP`, `howto:howto-bulls`, ... */
    id: string;
    kind: TipKind;
    title: string;
    body: string;
    /** The command to run, when the tip names one. */
    command?: string;
}
export interface BoardFacts {
    conferences: Array<{
        name: string;
    }>;
    doorsInstalled: number;
    newestFile?: string;
    openTasks?: number;
    boardName?: string;
}
export interface HowTo {
    id: string;
    title: string;
    body: string;
    command?: string;
}
export interface TipWeights {
    door: number;
    fact: number;
    howto: number;
    event: number;
}
export declare const FALLBACK_TIP: Tip;
/**
 * Weighted pick, unseen-first per kind. `rand` injects for tests; seen is
 * the caller's stored id set (rotation state lives in door storage, not
 * here). Returns FALLBACK_TIP when every source is empty.
 */
export declare function pickTip(catalog: DoorEntry[], facts: BoardFacts, howtos: HowTo[], seen: Set<string>, weights: TipWeights, rand?: () => number): Tip;
//# sourceMappingURL=tips.d.ts.map
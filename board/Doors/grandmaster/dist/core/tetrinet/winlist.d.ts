/**
 * TetriNET winlist
 *
 * TetriNET does not rank players by score - it ranks them by wins, and the
 * points are fixed by the reference server (TetriNET2.Server/Game.cs, end of
 * game): the winner takes 3, the player who died LAST before them takes 2,
 * the one before that takes 1, and nobody else scores. Entries accumulate
 * across games and are keyed by player and team, so the same nick on two
 * teams keeps two records.
 *
 * The lobby's Winlist tab used to be filled from the door's own high score
 * table, which is a different thing entirely - a big solo score outranked
 * somebody who actually won matches.
 */
export interface WinListEntry {
    name: string;
    team: string;
    points: number;
    /** Games this player finished in a scoring place. */
    games: number;
}
/** Points the reference server awards, best placement first. */
export declare const WIN_POINTS: number[];
/**
 * Award points for one finished game.
 *
 * @param finishers players in FINISHING order - the winner first, then the
 *   others by how long they survived (last death first), which is the order
 *   the reference server walks when handing out 2 and 1.
 */
export declare function awardPoints(entries: WinListEntry[], finishers: Array<{
    name: string;
    team?: string;
}>): WinListEntry[];
export declare class WinList {
    private filePath;
    private data;
    constructor(filePath?: string);
    private load;
    private save;
    /** Standings, highest first. */
    getEntries(limit?: number): WinListEntry[];
    /** Record one finished game and persist the new standings. */
    recordGame(finishers: Array<{
        name: string;
        team?: string;
    }>): WinListEntry[];
    /** Replace the standings wholesale - used by the external server's winlist. */
    setEntries(entries: WinListEntry[]): void;
}
//# sourceMappingURL=winlist.d.ts.map
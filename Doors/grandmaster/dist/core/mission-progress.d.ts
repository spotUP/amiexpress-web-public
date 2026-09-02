/**
 * MISSION mode - who has cleared what.
 *
 * Free selection was the call: every mission in a pack is playable from the
 * start, and this file is the record of which ones a player has beaten and
 * how quickly. That makes the select screen a progress board rather than a
 * lock screen.
 *
 * Stored as JSON beside the door's other data, resolved through
 * resolveDoorRoot() - never `process.cwd()` or a bare `__dirname`, which two
 * repo tests fail on.
 */
export interface MissionClear {
    /** Seconds the winning run took. */
    seconds: number;
    /** ISO 8601. */
    date: string;
}
export declare class MissionProgress {
    private readonly filePath;
    private data;
    constructor(filePath?: string, startDir?: string);
    private load;
    private save;
    /** Every clear this player has in this pack. */
    getClears(player: string, pack: string): Record<string, MissionClear>;
    getClear(player: string, pack: string, missionId: string): MissionClear | null;
    /**
     * Record a clear. A slower repeat is kept out: the record is the best time,
     * so beating a mission again never makes the board look worse.
     */
    recordClear(player: string, pack: string, missionId: string, seconds: number): MissionClear;
    /** How many of `total` this player has cleared, for the pack's header line. */
    countClears(player: string, pack: string): number;
}
//# sourceMappingURL=mission-progress.d.ts.map
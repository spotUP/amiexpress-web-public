/**
 * Where TETRIS ATTACK replays live.
 *
 * One JSON file per game, in panel-attack's ReplayV3 format, under the door's
 * data directory beside high-scores.json - the pattern this door already uses
 * for anything it must keep.
 *
 * DELIBERATELY NOT the gm_replays table. That table's columns are Tetris
 * shaped - final_grade, snapshots_data - and its rows hang off a foreign key
 * into gm_users that a door session need not have. More to the point, a file
 * IS the deliverable here: the thing on disk is exactly the file Panel Attack
 * opens, so a caller who wants their game can be handed it as it sits.
 */
import type { ReplayV3Json } from '../core/panels/replay-recorder';
export interface StoredReplay {
    /** File name without the extension; also the id. */
    id: string;
    playerName: string;
    mode: string;
    /** Seconds since the epoch, as the file records it. */
    timestamp: number;
    /** Frames of play. */
    duration: number;
    completed: boolean;
}
export declare class PanelReplayStore {
    private readonly directory;
    constructor(directory?: string);
    /** Write a replay. Returns its id, or null if it could not be written. */
    save(fileName: string, replay: ReplayV3Json): string | null;
    /** What is on disk, newest first. */
    list(limit?: number): StoredReplay[];
    /** The listing entry for one replay, or null if it will not parse. */
    read(id: string): StoredReplay | null;
    /** The file itself, for playback. */
    load(id: string): string | null;
    delete(id: string): boolean;
}
//# sourceMappingURL=panel-replay-store.d.ts.map
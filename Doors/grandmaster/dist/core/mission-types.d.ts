/**
 * MISSION mode - the data model.
 *
 * HeborisCE's mission mode is not a hardcoded list of levels: it loads PACKS
 * (`loadMissionData(mission_file)`, src/script/mission.c:47-171), each holding
 * thirty entries, and each entry is a row of fields the mission editor writes -
 * `mission_type` (which of its 42 objectives), `mission_norm` (how many),
 * `mission_time` (the clock), `mission_lv` (starting speed), `mission_end`
 * (which ending plays) and `mission_erase` (rows of garbage to start with, or
 * a rise rate when negative), plus up to three per-type options
 * (mission.c:182-265).
 *
 * This door keeps that shape - a pack of missions, each a row of fields - and
 * ships one pack as JSON so a sysop can write another without touching code.
 * What it does NOT keep is the 42-type list: an objective is only offered
 * here if this engine can actually judge it (see MISSION_OBJECTIVES), and the
 * loader rejects the rest by name instead of accepting a mission that can
 * never be completed.
 */
import type { HiddenMode, PieceType } from './types';
/**
 * The objectives this engine can judge, each with the reference type it comes
 * from (mission_info.c's `mission_name_editor` list).
 */
export declare const MISSION_OBJECTIVES: readonly ["lines", "single", "double", "triple", "tetris", "cycle", "tspin", "tspinDouble", "combo", "allClear", "pieces", "level", "b2bTetris", "survive", "blockOrder", "singleOrder", "doubleOrder", "tripleOrder", "reTripleOrder", "splitDouble", "splitTriple", "splitDouble2"];
/**
 * A piece an ORDER mission asks for - the reference's `mission_opt_3`, where
 * 0..6 name one piece, 7 is "L or J" and 8 is "S or Z" (mission.c:354-362).
 */
export type RequiredPiece = PieceType | 'LJ' | 'SZ';
export type MissionObjective = typeof MISSION_OBJECTIVES[number];
/** Rules a mission can switch on for its run. */
export interface MissionModifiers {
    /** Every piece is BIG (the reference's own BIG mission type). */
    big?: boolean;
    /** Locked blocks vanish - see core/hidden.ts. */
    hidden?: HiddenMode;
    /** The NEXT preview is not drawn (the HIDE NEXT mission type). */
    hideNext?: boolean;
    /** The piece rotates by itself (the ROLL ROLL mission type). */
    rollRoll?: boolean;
}
export interface Mission {
    /** Stable id, used for the cleared-missions record. */
    id: string;
    name: string;
    objective: MissionObjective;
    /** How many (mission_norm). Ignored by 'survive'. */
    norm: number;
    /**
     * How strictly an "erase exactly N lines" objective is counted
     * (the reference's `mission_opt_1`, labelled GRADE in its editor,
     * `mission.c:841-866`):
     *
     *   'exact'         N lines and nothing else counts. The default, and what
     *                   every pack written before this field meant.
     *   'atLeast'       N lines or more counts.
     *   'exactOrReset'  N lines counts, and ANY other clear puts the count
     *                   back to zero. This is the shape BTOB 4L has always
     *                   had, which is why it is expressed through this now
     *                   rather than as a branch of its own.
     *
     * Read by 'single', 'double', 'triple' and 'tetris'; ignored by the rest.
     */
    strictness?: 'exact' | 'atLeast' | 'exactOrReset';
    /**
     * COMBO only (the reference's `mission_opt_3`, NOT1LINE,
     * `mission.c:344-353`): count the combo that SINGLES do not advance
     * (`combo2`, `gamestart.c:10256`). A single neither advances nor breaks it;
     * a lock that clears nothing still breaks both (`gamestart.c:10159`).
     */
    ignoreSingles?: boolean;
    /**
     * ORDER family only: which piece the clear has to be made by
     * (`mission_opt_3`). 'LJ' and 'SZ' are the reference's two pairs.
     */
    requiredPiece?: RequiredPiece;
    /**
     * ORDER family only (`mission_opt_2`, HOLD USE): the piece must have come
     * out of hold.
     */
    requireHold?: boolean;
    /** The clock (mission_time). 0 = no limit; 'survive' needs one. */
    timeLimitSeconds: number;
    /** Starting speed (mission_lv). */
    startLevel: number;
    /** Rows of garbage the field starts with (mission_erase, positive side). */
    garbageRows: number;
    modifiers: MissionModifiers;
    /** One line shown under the objective on the select screen. */
    hint?: string;
}
export interface MissionPack {
    name: string;
    missions: Mission[];
}
//# sourceMappingURL=mission-types.d.ts.map
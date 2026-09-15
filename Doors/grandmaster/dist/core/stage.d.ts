/**
 * TARGET's stages: a field laid out in advance, with blocks you must clear.
 *
 * Reference type 6 (`mission.c:882-902`, loader at `tomoyo.c:1403-1440`). A
 * stage is a fixed field of ordinary blocks and PLATINUM ones; the stage is
 * cleared when no platinum block is left (`tomoyo.c:334-352` counts them),
 * and the mission then wipes the field and loads the next stage.
 *
 * The 173 shipped stages are the reference's own, converted by
 * `dev/scripts/convert-heboris-stages.py` into `assets/stages/stages.json`.
 * Cells are characters there: '.' empty, '2'..'9' an ordinary block in the
 * reference's numbering, 'A' upwards platinum.
 */
import type { Board, Cell } from './types';
/** One stage, as it is stored. */
export interface Stage {
    /** Three digits, the reference's own stage number. */
    id: string;
    /** 21 rows of 10 characters. */
    rows: string[];
    /** The rising field, when the stage has one: 20 rows of 10. */
    rise?: string[];
    /** Rules the stage itself switches on (MIRROR, X-RAY, BLIND and friends). */
    rules?: {
        mirror?: boolean;
        rollRoll?: boolean;
        big?: boolean;
        xray?: boolean;
        color?: boolean;
        blind?: boolean;
    };
}
/** A whole pack of stages, as the JSON holds it. */
export interface StageSet {
    source: string;
    stages: Stage[];
}
/** Is this cell character a platinum block - the thing TARGET is about? */
export declare function isPlatinum(char: string): boolean;
/** Turn one stage character into a cell. */
export declare function stageCell(char: string): Cell;
/**
 * Lay a stage out on the board.
 *
 * The stage's 21 rows sit at the BOTTOM of the field: the reference writes
 * them from index 10 of a 220-cell field (`tomoyo.c:1412`), which is one row
 * of spawn space above them, and this board is taller still.
 */
export declare function applyStage(board: Board, stage: Stage): void;
/** How many platinum blocks are left - zero means the stage is cleared. */
export declare function platinumLeft(board: Board): number;
/**
 * Which stages a mission plays, in order.
 *
 * The reference takes a MINSTAGE and a MAXSTAGE and, with RANDTGT set, picks
 * at random inside that band (`mission.c:244-330`); with it off the stages
 * run in order from the minimum.
 */
export declare function stageOrder(stages: Stage[], min: number, max: number, count: number, random?: (() => number) | null): Stage[];
/**
 * Read the shipped stages.
 *
 * `assets/`, not `data/`: stages are CONTENT that ships with the door, the
 * way the mission packs are. A board with no stage file simply has no TARGET
 * missions - the loader refuses them by name - rather than a door that will
 * not start.
 */
export declare function loadStages(file: string): Stage[];
//# sourceMappingURL=stage.d.ts.map
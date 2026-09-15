/**
 * What a MISSION does to the board after a piece locks.
 *
 * Four of the reference's mission types change the board itself once the
 * clears are settled, and they all happen in the same breath: ERASER claims
 * the marked rows the piece sat in, TARGET notices an emptied stage and lays
 * out the next, MIRROR flips the stack, and DEVIL 800's floor comes up. Kept
 * together here, out of `core/game.ts`, because each is a RULE rather than
 * engine machinery - and because the order they run in matters and is easier
 * to see in one place than spread through a 2000-line lock.
 */
import { type EraserPattern } from './eraser';
import { type SquareResult } from './square';
import { type Stage } from './stage';
import type { Board } from './types';
import type { MissionModifiers } from './mission-types';
/** Everything the hooks need from the run they belong to. */
export interface MissionHookContext {
    board: Board;
    modifiers: MissionModifiers | undefined;
    /** The rows the piece that just locked sat in. */
    occupiedRows: number[];
    /** The rows this lock cleared. */
    clearedRows: number[];
    /** How many pieces have been locked, for the rising floor. */
    piecesPlaced: number;
    /** ERASER's marks, its pattern, and how many rows the mission still needs. */
    markedRows: number[];
    eraserPattern: EraserPattern | null;
    eraserRemaining: number;
    /** TARGET's stages, which one is up, and how far its floor has risen. */
    stages: Stage[];
    stageIndex: number;
    riseIndex: number;
    /** SQUARE scans only when the mission is judged on it. */
    squareMode: boolean;
}
/** What the lock event carries, and what the engine has to keep. */
export interface MissionHookResult {
    markedRowsCleared: number;
    markedRows: number[];
    eraserRemaining: number;
    stageCleared: boolean;
    stageIndex: number;
    /** How many rows of the stage's rising field have been spent. */
    riseIndex: number;
    square: SquareResult;
}
export declare function afterLock(ctx: MissionHookContext): MissionHookResult;
//# sourceMappingURL=mission-hooks.d.ts.map
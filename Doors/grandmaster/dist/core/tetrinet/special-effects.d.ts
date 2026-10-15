/**
 * TetriNET Special Effects
 *
 * Implements all 16 special block effects that can be used on boards.
 * Effects are applied to TetriNET boards and modify their state.
 */
import type { TetriNetBoard } from './tetrinet-board';
import type { SpecialType } from './specials';
/**
 * Result of applying a special effect
 */
export interface EffectResult {
    success: boolean;
    message: string;
    linesAffected?: number;
    cellsAffected?: number;
}
/**
 * Apply Add Line effect - adds a garbage line to the board
 */
export declare function applyAddLine(board: TetriNetBoard, holeColumn?: number): EffectResult;
/**
 * Apply Clear Line effect - removes the bottom line
 */
export declare function applyClearLine(board: TetriNetBoard): EffectResult;
/**
 * Apply Nuke effect - clears the entire board
 */
export declare function applyNuke(board: TetriNetBoard): EffectResult;
/**
 * Apply Random Clear effect - removes 10-25% of random blocks
 */
export declare function applyRandomClear(board: TetriNetBoard): EffectResult;
/**
 * Apply Switch Fields effect - swaps two boards
 * Returns the boards with swapped contents
 */
export declare function applySwitchFields(board1: TetriNetBoard, board2: TetriNetBoard): {
    board1: TetriNetBoard;
    board2: TetriNetBoard;
    result: EffectResult;
};
/**
 * Apply Clear Specials effect - removes all special blocks from board
 */
export declare function applyClearSpecials(board: TetriNetBoard): EffectResult;
/**
 * Apply Gravity effect - blocks fall to fill holes
 */
export declare function applyGravity(board: TetriNetBoard): EffectResult;
/**
 * Apply Quake effect - shift rows randomly left/right
 */
export declare function applyQuake(board: TetriNetBoard): EffectResult;
/**
 * Apply Block Bomb effect - detonate cells marked as bombs
 * In TetriNET, bomb blocks explode in a cross pattern
 */
export declare function applyBlockBomb(board: TetriNetBoard): EffectResult;
/**
 * Apply Clear Column effect - removes a random column
 */
export declare function applyClearColumn(board: TetriNetBoard): EffectResult;
/**
 * Apply Zebra Field effect - fill board with alternating pattern
 */
export declare function applyZebraField(board: TetriNetBoard): EffectResult;
/**
 * Apply Left Gravity effect - blocks shift left instead of down
 */
export declare function applyLeftGravity(board: TetriNetBoard): EffectResult;
/**
 * Apply a special effect by type
 */
export declare function applySpecialEffect(type: SpecialType, targetBoard: TetriNetBoard, sourceBoard?: TetriNetBoard): EffectResult;
//# sourceMappingURL=special-effects.d.ts.map
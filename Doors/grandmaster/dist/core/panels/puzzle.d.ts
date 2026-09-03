/**
 * Puzzle mode: a board somebody arranged, and one right answer.
 * Ports common/engine/Puzzle.lua and the rules half of its toGameMode.
 *
 * Every other mode here is a game of survival - the board rises, you keep it
 * down. A puzzle is the opposite: the board is frozen, there is no rise at all,
 * and you are given a fixed number of moves to leave it empty. That inversion
 * is expressed entirely in behaviours and end conditions; the engine
 * underneath is the same one, unmodified, which is the point.
 *
 * THREE TYPES, each with its own pair of conditions:
 *
 *   moves   clear every panel within N swaps. Lost when the swaps run out with
 *           panels still standing.
 *   chain   clear every panel, and it must be done as one chain. Lost the
 *           moment the chain drops.
 *   clear   clear all the garbage before the stack buries you. This one DOES
 *           rise, and is the only puzzle type that can be lost on health.
 *
 * A losing condition is only ever tested on a SETTLED board - nothing active,
 * no swap queued - because a puzzle mid-chain has not failed yet even when the
 * board momentarily looks unwinnable.
 */
import { Stack, type StackOptions } from './stack';
/**
 * The level a puzzle is played at.
 *
 * Not a taste decision: the recorded solutions only work at the frame
 * constants they were recorded with. At modern 10 all 71 move puzzles and 83
 * of the 84 chain puzzles solve; one level either side and dozens fail.
 */
export declare const PUZZLE_LEVEL = 10;
export type PuzzleType = 'moves' | 'chain' | 'clear';
export type StartTiming = 'immediately' | 'countdown' | 'firstInput' | 'firstSwap';
export interface Puzzle {
    type: PuzzleType;
    /** The authored board, top row first. */
    stack: string;
    /** Swaps allowed; 0 means unlimited. */
    moves: number;
    startTiming: StartTiming;
    /** Stop time the board is handed at the start, in frames. */
    stopTime: number;
    shakeTime: number;
    /** Colours the player raises into view, for clear puzzles. */
    panelBuffer: string;
    /** Colours cleared garbage becomes. */
    garbageBuffer: string;
    /** Where the left half of the cursor starts, if the puzzle says. */
    cursorStartLeft?: {
        row: number;
        column: number;
    };
    /** A recorded input string that solves it. The strongest test we have. */
    solution?: string;
    helpDescription?: string;
}
export interface PuzzleSet {
    name: string;
    description?: string;
    puzzles: Puzzle[];
}
/**
 * The start timing a puzzle gets when it does not say.
 *
 * Straight from the documented defaults: a clear or chain puzzle waits for the
 * player, and which wait depends on whether the cursor was placed for them - if
 * it was, moving it must not start the clock. A move puzzle starts at once,
 * because with no rise there is nothing for it to wait for.
 */
export declare function defaultStartTiming(type: PuzzleType, hasCursorStart: boolean): StartTiming;
/**
 * Pad an authored board out to a full playfield.
 *
 * A clear puzzle fills only the row it left half-written, because its board is
 * meant to be TALLER than the screen - the garbage above the top is the point
 * of the mode. Every other type is right-aligned into a full 6x12.
 */
export declare function fillPuzzleString(puzzleString: string, type: PuzzleType, width?: number, height?: number): string;
/**
 * Read a puzzle file.
 *
 * Sets nest - version 3 of the format allows a set to contain sets - so this
 * flattens the tree into the list of leaf sets, which is what a menu wants.
 */
export declare function loadPuzzleFile(filePath: string): PuzzleSet[];
/** The puzzles the door ships with. */
export declare function loadShippedPuzzles(directory?: string): PuzzleSet[];
/**
 * Build the stack a puzzle is played on.
 *
 * Only a clear puzzle keeps the rise: the other two are still pictures, and a
 * board that crept upward while the player thought would make a one-move
 * puzzle unsolvable by hesitation.
 */
export declare function puzzleStackOptions(puzzle: Puzzle): StackOptions;
export type PuzzleOutcome = 'playing' | 'won' | 'lost';
/**
 * A puzzle in progress: the stack, plus the rules that decide when it is over.
 *
 * Kept beside the stack rather than inside it because these conditions belong
 * to the MODE, not to the engine - the same Stack class runs Endless with none
 * of them.
 */
export declare class PuzzleGame {
    readonly stack: Stack;
    readonly puzzle: Puzzle;
    private outcome;
    constructor(puzzle: Puzzle);
    /** Moves left, or null when the puzzle does not limit them. */
    movesLeft(): number | null;
    /**
     * Has the player finished it?
     *
     * A move or chain puzzle is won when no matchable panel is left; a clear
     * puzzle when no garbage is.
     */
    hasWon(): boolean;
    /**
     * Has it been failed?
     *
     * Only ever asked of a SETTLED board. Mid-chain, a puzzle that looks lost is
     * often one link away from being won, and testing it there would fail every
     * chain puzzle in the set on its own solution.
     */
    hasLost(): boolean;
    /** One frame, and then the verdict. */
    run(): PuzzleOutcome;
    result(): PuzzleOutcome;
}
//# sourceMappingURL=puzzle.d.ts.map
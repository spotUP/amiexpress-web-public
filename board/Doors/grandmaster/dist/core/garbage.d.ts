/**
 * Garbage rows - the two ways this door puts blocks on the field that the
 * player did not place.
 *
 * Both are board transforms with nothing else behind them, which is why they
 * live here rather than in the engine: a rise is testable without a game, and
 * a mission's seeded stack is the same operation without the shift.
 */
import type { Board, Cell } from './types';
/**
 * Shirase's piece-spawn rise (HeborisCE's DEVIL garbage, gamestart.c's
 * devil_rise tables): the whole stack moves up one row and a new garbage row
 * arrives at the bottom.
 */
/**
 * Push one GIVEN row onto the floor, everything else up.
 *
 * The same lift `riseGarbageRow` does, with the row supplied instead of
 * invented: a TARGET stage carries the rows its floor rises with
 * (`gamestart.c:8348-8360` copies them from `tomoyo_rise_fld`), and a random
 * garbage row would be a different mode.
 */
export declare function riseRowOnto(board: Board, cells: Cell[]): void;
export declare function riseGarbageRow(board: Board, rng?: () => number): void;
/**
 * The most rows a GARBAGE mission raises at its start: mission.c:1415-1416
 * clamps `upLines` to 18 whatever the pack asks for.
 */
export declare const MAX_SEEDED_GARBAGE_ROWS = 18;
/**
 * Raise the stack by one DS-RANDOM row (upLineT 2, gamestart.c:8464-8502):
 * a solid row with a hole at `hole.column`, after which the hole moves to a
 * DIFFERENT column 8 times in 10 and stays put otherwise.
 *
 * The hole is state that outlives the row - the reference keeps it in
 * `hole[player]`, set once when the game starts (gamestart.c:4909) - which is
 * what makes this a type of its own: two rows in three share nothing, but one
 * in five lines up under the last and the stack grows wells.
 */
export declare function riseDsRandomRow(board: Board, hole: {
    column: number;
}, rng: () => number): void;
/**
 * A GARBAGE mission's starting stack (type 21, mission.c:1407-1418): up to
 * 18 rows raised through the DS-RANDOM rise, which the reference pins for the
 * run (`upLineT[0] = 2`). Raised, not painted, so whatever the field already
 * holds goes up with them.
 */
export declare function seedGarbageRows(board: Board, rows: number, rng?: () => number): void;
//# sourceMappingURL=garbage.d.ts.map
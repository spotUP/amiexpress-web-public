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
 * Fill the bottom `rows` rows before a run starts (HeborisCE's mission_erase,
 * mission.c:226-236). Each row gets its own hole, so the result is a stack to
 * dig through rather than a solid wall.
 */
export declare function seedGarbageRows(board: Board, rows: number, rng?: () => number): void;
//# sourceMappingURL=garbage.d.ts.map
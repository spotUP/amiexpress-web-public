/**
 * The shine that sweeps across the wall between balls.
 *
 * It used to walk the brick ARRAY, handing out a two-frame delay per
 * surviving brick. Two things came out of that. Within a row every brick lit
 * at a different moment, so the highlight crawled brick by brick rather than
 * sweeping; and because destroyed bricks were skipped, the delays collapsed
 * as the wall was cleared and the shine slowly went diagonal, then ragged.
 * Asked for: row by row, top to bottom.
 *
 * The delay belongs to the brick's POSITION, not to its index, which is what
 * this computes. Every brick on a row gets the same delay, so the row lights
 * as one band, and clearing bricks cannot shift the timing of the rest.
 *
 * Pure, so the sweep can be tested without a game running.
 */
/**
 * Frames the highlight stays on one row.
 *
 * The renderer shows a brick while its counter is in 1..4 (below
 * SHINE_VISIBLE), so a row is lit for four frames and this is the step
 * between one row and the next.
 */
export declare const SHINE_ROW_STEP = 4;
/** A counter at or above this is still waiting; below it the brick is lit. */
export declare const SHINE_VISIBLE = 5;
/**
 * How long a whole sweep takes, in frames, for a wall of `rows` rows.
 *
 * The caller uses it to keep the gap between sweeps steady no matter how
 * tall the wall is.
 */
export declare function shineDuration(rows: number): number;
/**
 * The counter a brick at `y` starts a sweep with.
 *
 * It counts DOWN, and the brick is lit as it passes through 1..4 - so a
 * larger start means a later row. Row 0 still gets a non-zero start, or the
 * top row would begin already expired and never light at all.
 */
export declare function shineDelayFor(y: number, topY: number, rowHeight: number): number;
/** Is a brick lit at this point in its countdown? */
export declare function isShining(shineFrame: number): boolean;
//# sourceMappingURL=brick-shine.d.ts.map
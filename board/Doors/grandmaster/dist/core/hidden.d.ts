/**
 * HIDDEN - a locked block stays solid but stops being drawn.
 *
 * HeborisCE gives every cell a shadow timer, fldt. It is set on lock to
 * p_shadow_timer (gamestart.c:16224-16225; init.c:732 = 300 frames) and
 * counted down once per frame, at a rate the hidden level picks:
 *
 *   normal      fldt -= 1   (gamestart.c:4801)  300 frames visible
 *   UNDER M2    fldt -= 2   (gamestart.c:4799)  150
 *   UNDER M3    fldt -= 3   (gamestart.c:4797)  100
 *
 * When it reaches zero the block is invisible - it is still there, still
 * collides, still clears lines. Rows carry their timers when the stack
 * shifts (gamestart.c:8341 copies fldt with fld), which falls out of this
 * door's model for free: the timer lives on the cell object the row holds.
 */
import type { HiddenMode } from './types';
/** init.c:732 `p_shadow_timer = 300`. */
export declare const SHADOW_TIMER_FRAMES = 300;
/** Frames subtracted per tick, by mode. 0 = HIDDEN is off. */
export declare function shadowDecayRate(mode: HiddenMode | undefined): number;
/**
 * How many locked cells have gone invisible.
 *
 * The board only repaints when something the renderer hashes has changed
 * (ui/game-screen.ts getBoardHash), and a block going dark changes nothing
 * else about the board - so without this in the hash the stack keeps its
 * blocks on screen until the next piece moves.
 */
export declare function countHiddenCells(board: {
    grid: {
        shadowFrames?: number;
    }[][];
}): number;
/** True when the cell has a shadow timer that has run out. */
export declare function isCellHidden(cell: {
    shadowFrames?: number;
}): boolean;
//# sourceMappingURL=hidden.d.ts.map
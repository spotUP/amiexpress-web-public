/**
 * The panel board as cells: pure in (stack, sheet, tick).
 *
 * The same shape Pengo's and Frogger's renderers take, for the same reason:
 * what a thing looks like is decided by which sprite was blitted, so the class
 * of bug where a panel is coloured by whatever glyph happened to match cannot
 * happen here.
 *
 * TWO COORDINATE SYSTEMS MEET IN THIS FILE, and getting them confused is the
 * one real hazard. The engine numbers rows from the BOTTOM - row 1 is the
 * lowest row in play, row 0 is the dimmed row still below the floor. A cell
 * buffer numbers rows from the TOP, because that is the order they are painted
 * in. `bufferRowFor` is the only place that conversion is allowed to happen.
 *
 * The dimmed row is drawn, one row below the playfield, because it is a real
 * part of the game: it is what you are reading when you decide whether to raise.
 */
import { CellBuffer, Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import type { Panel } from '../../core/panels/panel';
import type { Stack } from '../../core/panels/stack';
/** Characters per panel. Fixed by the sprite sheets. */
export declare const PANEL_COLS = 2;
/** Which sheet to draw from. */
export type BoardVariant = 'wide' | 'c64';
export interface BoardViewOptions {
    variant?: BoardVariant;
    /** Draw the cursor over the board. Off for an opponent's board. */
    showCursor?: boolean;
    /** Draw the dimmed incoming row beneath the playfield. */
    showIncomingRow?: boolean;
}
/** Buffer row for an engine row. Engine counts up from the floor; buffers down. */
export declare function bufferRowFor(stack: Stack, row: number): number;
/**
 * The engine row a buffer row shows: the inverse of bufferRowFor.
 *
 * It lives here, beside the mapping it inverts, because a caller that works it
 * out again gets it backwards - which is exactly what the mouse click handler
 * did, reading a click as `y + 1` and asking to swap the empty rows above the
 * stack instead of the ones under the pointer.
 */
export declare function engineRowFor(stack: Stack, bufferRow: number): number;
/** Board size in characters, including the dimmed row when it is shown. */
export declare function boardSize(stack: Stack, options?: BoardViewOptions): {
    cols: number;
    rows: number;
};
/**
 * Which animation a panel should be drawn in.
 *
 * Mostly the panel's own state name, because the sheets are keyed by it. The
 * two that need deciding:
 *
 *  - `matched` covers both the flash and the face that follows it. The timer
 *    counts down through FLASH then FACE, so which half we are in is a
 *    comparison against FACE rather than a separate state.
 *  - a settled panel near the top draws itself as `danger`, which is a display
 *    concern the engine has no opinion about.
 */
export declare function animationFor(panel: Panel, stack: Stack): string | null;
/**
 * The board, drawn.
 *
 * `tick` is the game's own frame counter, never wall clock - frameAt is a pure
 * function of it, so the same frame always draws the same thing and a test can
 * assert on it.
 */
export declare function buildBoard(stack: Stack, sheet: Record<string, Sprite>, tick: number, options?: BoardViewOptions): CellBuffer;
/**
 * The cursor, drawn over the two panels it holds.
 *
 * Brackets on the outer edges rather than a filled box: the panels underneath
 * have to stay readable, since choosing a swap means reading what is under the
 * cursor. Each cell keeps its own colours; only the glyph changes.
 */
export declare function drawCursor(board: CellBuffer, stack: Stack): void;
//# sourceMappingURL=board-view.d.ts.map
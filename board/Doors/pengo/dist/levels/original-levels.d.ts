/**
 * The sixteen original Pengo maze layouts.
 *
 * Transcribed 2026-09-01 from github.com/Akadeax/cpp-pengo (Unlicense,
 * public domain), `Game/Data/Levels/1.json` .. `16.json`, fetched directly
 * from raw.githubusercontent.com. That project's loader (`GridManager.cpp`)
 * confirms the source format: a flat row-major index into a 13-wide,
 * 15-tall grid, `index = y*13+x`; `"blocks"` is every ice-block cell,
 * `"diamond"` and `"unhatched"` are SUBSETS of `"blocks"` whose type gets
 * overridden - an index in `"diamond"` is a diamond block, not a diamond
 * plus a separate ice block at that cell.
 *
 * There is no wall, player-spawn, or enemy-spawn data in the source at
 * all - the source project draws a fixed outer-border wall OUTSIDE this
 * 13x15 addressable space and hard-codes player/enemy spawns in engine
 * code, not the level file. Our door does the same as of 2026-09-01: the
 * world grid is 15x17 (`ARCADE_COLS + 2` by `ARCADE_ROWS + 2`, see
 * `game/constants.ts`), the wall ring occupies the outermost cells, and
 * this 13x15 transcription fills the interior exactly - source (x, y)
 * loads at grid (x+1, y+1).
 *
 * It did NOT always: the first transcription mapped source (x, y) straight
 * onto grid (x, y) of a 13x15 TOTAL, so our ring overwrote every source
 * cell that sat on it - 3 to 15 ice blocks per level, and one egg (one
 * fewer Sno-Bee) on seven of the sixteen. Diamonds were never affected;
 * `levels.test.ts` now asserts exact equality with the source counts
 * below rather than the tolerances that concession needed.
 *
 * Levels 7-16 are not new content - this is the source's OWN data, not a
 * transcription mistake: 7-12 repeat 1-6 exactly, and 13-16 repeat 3-6
 * again (verified by set-equality of blocks/diamond/unhatched across all
 * three arrays, per level, against the fetched JSON). Stored here exactly
 * as fetched - sixteen entries - so level N always resolves to whatever
 * the source calls level N.
 *
 * LEGEND (one character per cell, row-major, 13 columns x 15 rows):
 *   .  empty floor
 *   #  ice block (pushable; breaks if shoved into an obstruction)
 *   D  diamond block (pushable; align three for the alignment bonus)
 *   e  egg spawn point (a Sno-Bee's egg appears here at level start)
 *
 * These 13x15 characters are the PLAYABLE maze only. The loader
 * (`levels/index.ts`) draws the wall ring in the cells around them, so
 * every character here reaches the board - see the note above.
 */
export declare const ORIGINAL_LEVEL_LEGEND: {
    readonly empty: ".";
    readonly ice: "#";
    readonly diamond: "D";
    readonly egg: "e";
};
export declare const ORIGINAL_LEVELS: readonly string[][];
//# sourceMappingURL=original-levels.d.ts.map
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
 * code, not the level file. Our door's world grid (`GRID_WIDTH x
 * GRID_HEIGHT` = 13x15, see `game/constants.ts`) uses the OPPOSITE
 * convention it has always used: the border ring (row 0, row 14, column 0,
 * column 12) IS part of the 13x15 total and is always wall, with an 11x13
 * interior inside it. Rather than re-deriving a 15x17 total grid to give
 * the source's 13x15 addressable space room to be a pure interior, this
 * transcription maps each source index directly onto our own 13x15 grid
 * at the same (x, y) - the literal reading of "render the world at 13x15
 * cells" - and lets our wall ring simply win wherever the two conventions
 * collide.
 *
 * That collision is small and checked: across all 16 levels, 0 diamonds
 * and at most 1 egg spawn per level ever land on our border (verified
 * against the fetched source below); a handful of ice blocks per level
 * (3-16) do, and those cells were already going to render as our wall -
 * they simply become a one-cell-thicker stretch of border instead of an
 * ice block one cell further in. No level loses a diamond, and no level
 * loses enough eggs to change its egg count by more than one. See
 * `pengo-finish-report.md` for the exact per-level counts.
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
 * The outer ring of every row/column (index 0 and 12 for x, 0 and 14 for
 * y) is always drawn as wall by the loader (`levels/index.ts`) regardless
 * of what character sits there in this transcription - see the note above.
 */
export declare const ORIGINAL_LEVEL_LEGEND: {
    readonly empty: ".";
    readonly ice: "#";
    readonly diamond: "D";
    readonly egg: "e";
};
export declare const ORIGINAL_LEVELS: readonly string[][];
//# sourceMappingURL=original-levels.d.ts.map
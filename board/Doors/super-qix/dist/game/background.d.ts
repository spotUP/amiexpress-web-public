/**
 * Super Qix - Background art
 *
 * The arcade original hides a picture behind the playfield and reveals it as
 * you claim area. This does the same with the ANSI art in backgrounds/.
 *
 * The art is 80 columns wide and the grid is 40 logical cells at CELL_WIDTH
 * characters each, so one logical cell covers exactly two adjacent art
 * columns. Each of those columns keeps its own glyph and colours - a cell is
 * revealed as the two characters that were always there, not as an average
 * of them.
 */
/** One character of the art: what to draw and how to colour it. */
export interface ArtCell {
    char: string;
    /** Colour indices 0-15, as the ANSI art itself defines them. */
    fg: number;
    bg: number;
}
/** A loaded picture, already cropped to the playfield. */
export interface Background {
    name: string;
    /** [row][column], ART_HEIGHT rows of ART_WIDTH columns. */
    cells: ArtCell[][];
}
/**
 * Every usable art file, in a stable order.
 *
 * Sorted by filename so a given level always shows the same picture: the
 * board is shared, and a scoreboard is easier to compare when everyone met
 * the same level. Only .ans and .asc - the .xb pieces carry their own font,
 * which a terminal cannot load, so they would render as the wrong glyphs.
 */
export declare function listBackgrounds(): string[];
/**
 * Load the art for a level. Level 1 gets the first file, and the list wraps
 * once there are more levels than pictures.
 *
 * Returns null when there is no art to show; the caller then draws the plain
 * playfield, so a board with an empty backgrounds/ directory still works.
 */
export declare function loadBackgroundForLevel(level: number): Promise<Background | null>;
/**
 * The CELL_WIDTH art characters that sit behind one logical cell.
 *
 * Always returns CELL_WIDTH entries so the renderer can paint a cell without
 * checking for gaps, whatever the art's real extent was.
 */
export declare function artForCell(background: Background | null, cellX: number, cellY: number): ArtCell[];
//# sourceMappingURL=background.d.ts.map
/**
 * How many characters wide one board block is, and how to fit a block into it.
 *
 * A block is meant to look SQUARE, and how many characters that takes depends
 * on the shape of a character. An xterm cell is about half as wide as it is
 * tall, so two of them make a square - which is why every board in this door
 * draws blocks as two glyphs. A PETSCII cell is square already (a real C64
 * stretches it slightly taller than wide, which is nearer square still), so
 * two of them make a 2:1 rectangle: "its just the tetris games that have
 * stretched blocks" (2026-09-06).
 *
 * The width is applied at the SINK - where a row is assembled - rather than in
 * the eight things that produce a block (the piece, the ghost, the bone block,
 * the credit-roll fade, the shine, the glow, the line-clear fade, the
 * placement and back-to-back effects). They all agree on one canonical form:
 * two identical glyphs inside blessed colour tags. Projecting that form once,
 * where characters first become a row, is one rule in one place instead of
 * eight copies of it that can drift.
 */
/** The tier test the rest of this door uses, and no second one. */
export declare function blockCols(screenWidth: number): 1 | 2;
/**
 * A block cell, in `cols` characters.
 *
 * Tags are kept exactly as they are - they carry no width - and the visible
 * run is halved, so `{red-fg}██{/red-fg}` becomes `{red-fg}█{/red-fg}` and the
 * two blanks of an empty cell become one. A run whose glyphs DIFFER keeps its
 * first half, which is what the bone block (`[]`) and any future two-glyph
 * pattern needs: half of it, not a mangled pair.
 */
export declare function fitCell(cell: string, cols: number): string;
/**
 * The seven pieces, as CELLS - one character per cell, `X` where a block is.
 *
 * There were three copies of this art: one in the game screen and two in the
 * versus screen (next and hold), each written as literal `██` pairs, which is
 * both a duplicate and a 2-character assumption baked into a string. One
 * table, drawn at whatever width the screen's block is.
 */
export declare const PIECE_CELLS: Record<string, readonly string[]>;
/**
 * A piece preview, `cols` characters per cell, in one colour.
 *
 * The glyph is the same solid block the boards use; a gap is spaces, so the
 * rows stay aligned with each other whatever the width.
 */
export declare function pieceArt(type: string, cols: number, colour: string): string[];
//# sourceMappingURL=block-width.d.ts.map
/**
 * What one cell of a versus board is made of.
 *
 * Pulled out of versus-screen.ts, which crossed the 2000-line ceiling: these
 * are pure glyph decisions with one input the screen owns - whether a cell can
 * carry a BACKGROUND colour. PETSCII cannot, so anything that put its ink in
 * `{black-fg}` and its colour behind it rendered black on black.
 */
/** Preview colours, one table for the next queue and the hold box alike. */
export declare const PREVIEW_COLORS: Record<string, string>;
/** A locked or falling block, in its piece's colour. */
export declare function blockChar(type: string): string;
/**
 * A TGM item cell (see core/items.ts) - inverse-video diamonds, so a piece
 * carrying an item is distinct from a normal locked one. A hard block (item
 * 25's target cell) gets its own grey marker: it can never be collected.
 *
 * On a screen with no per-cell background the colour goes in the INK instead,
 * or every item cell is black on black and reads as a hole in the stack.
 */
export declare function itemCellChar(item: number, color: string | null, screen: unknown): string;
//# sourceMappingURL=versus-cells.d.ts.map
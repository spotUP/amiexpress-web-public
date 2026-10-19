/** The widest a column of reading text is allowed to be. */
export declare const MAX_MEASURE = 38;
export declare function columnCount(width: number): 1 | 2 | 3;
export interface ColumnGeometry {
    cols: 1 | 2 | 3;
    /** Characters in one column. */
    colWidth: number;
    /** Characters between two columns (0 with one column). */
    gutter: number;
    /** Blank columns left of the first column: the set text is centred. */
    margin: number;
    /** Columns the whole set text occupies, margins excluded. */
    contentWidth: number;
}
/**
 * Where the columns sit on a screen this wide.
 *
 * The gutter is one rule character flanked by the profile's gap on each side,
 * so the column rule between two columns is always a character and never the
 * boundary of the text.
 */
export declare function columnGeometry(width: number): ColumnGeometry;
/** One page of set text: `cols` columns, each a list of rows. */
export interface Spread<T = string> {
    columns: T[][];
}
/**
 * Paragraphs to rows at one measure, a blank row between paragraphs.
 *
 * Wrapping is the SDK's own word wrap (petscii/wrap), which breaks at word
 * boundaries and cuts a word longer than the column rather than overflow it.
 */
export declare function setParagraphs(paragraphs: readonly string[], measure: number): string[];
export interface SpreadHeights {
    /** Rows available in each column of the FIRST spread (the headline eats the rest). */
    first: number;
    /** Rows available in each column of every later spread. */
    rest: number;
}
/**
 * Newspaper flow: fill column 1 top to bottom, then column 2, then the next
 * spread. Rows are never reordered or dropped; a blank row that would land at
 * the top of a column is dropped, since the paragraph gap has done its job.
 *
 * A block (consecutive rows sharing one `blockOf` key, a picture) is never
 * split: when it does not fit what is left of a column it starts the next
 * one. A block taller than a whole column keeps its top rows and loses the
 * rest; callers cap a picture's rows below the column height so this is a
 * guard, not a layout.
 */
export declare function flowColumns<T = string>(rows: readonly T[], cols: number, heights: SpreadHeights, options?: {
    /** A row that adds nothing at the top of a column (a paragraph gap). */
    isBlank?: (row: T) => boolean;
    /** A row that must not end a column: a heading stays with what it heads. */
    keepWithNext?: (row: T) => boolean;
    /** Rows with the same non-undefined key, in a run, flow as one unsplittable block. */
    blockOf?: (row: T) => unknown;
}): Spread<T>[];
//# sourceMappingURL=columns.d.ts.map
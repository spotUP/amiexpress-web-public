export { MAX_MEASURE, columnCount, columnGeometry, type ColumnGeometry } from '@amiexpress/bbs-door-sdk/formats/magazine';
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
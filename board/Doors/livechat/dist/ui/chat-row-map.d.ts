/**
 * Which message is on a given row of the chat log.
 *
 * The context menu offered Pin, Delete and React on a message and could not
 * act on any of them, because the right-click handler passed no target at
 * all: `showContextMenu(x, y, 'chat')`. The menu knew a click had happened
 * and nothing about what was under it, so the entries could only ever print
 * "requires message ID".
 *
 * Rows do not map to messages one to one. A long message wraps to several
 * rows, the log scrolls, and the typing previews sit below everything - so
 * this walks the same lines the log is showing and counts the rows each one
 * takes at the log's own width.
 *
 * Pure, so the arithmetic can be tested without a terminal or a mouse.
 */
/** Visible width of a line, ignoring blessed colour tags. */
export declare function visibleLength(line: string): number;
/**
 * How many rows a line occupies once the log has wrapped it.
 *
 * An empty line still takes one row; a line exactly as wide as the log takes
 * one, not two.
 */
export declare function wrappedHeight(line: string, width: number): number;
/**
 * The index in `lines` of the message drawn on `row`, or null.
 *
 * `row` is counted from the top of the log's visible area, and `scrollRow`
 * is the first WRAPPED row on screen - which is what a scrolled log gives
 * you, not a message index.
 */
export declare function messageIndexAtRow(lines: string[], width: number, scrollRow: number, row: number): number | null;
/** Total rows the given lines occupy - what the log can scroll through. */
export declare function totalRows(lines: string[], width: number): number;

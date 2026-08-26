"use strict";
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
Object.defineProperty(exports, "__esModule", { value: true });
exports.visibleLength = visibleLength;
exports.wrappedHeight = wrappedHeight;
exports.messageIndexAtRow = messageIndexAtRow;
exports.totalRows = totalRows;
/** Visible width of a line, ignoring blessed colour tags. */
function visibleLength(line) {
    return line.replace(/\{[^}]*\}/g, '').length;
}
/**
 * How many rows a line occupies once the log has wrapped it.
 *
 * An empty line still takes one row; a line exactly as wide as the log takes
 * one, not two.
 */
function wrappedHeight(line, width) {
    if (width <= 0)
        return 1;
    const length = visibleLength(line);
    if (length === 0)
        return 1;
    return Math.ceil(length / width);
}
/**
 * The index in `lines` of the message drawn on `row`, or null.
 *
 * `row` is counted from the top of the log's visible area, and `scrollRow`
 * is the first WRAPPED row on screen - which is what a scrolled log gives
 * you, not a message index.
 */
function messageIndexAtRow(lines, width, scrollRow, row) {
    if (row < 0)
        return null;
    const target = scrollRow + row;
    if (target < 0)
        return null;
    let cursor = 0;
    for (let i = 0; i < lines.length; i++) {
        const height = wrappedHeight(lines[i], width);
        if (target < cursor + height)
            return i;
        cursor += height;
    }
    // Below the last message: the typing previews live down here, and they are
    // not messages anybody can pin.
    return null;
}
/** Total rows the given lines occupy - what the log can scroll through. */
function totalRows(lines, width) {
    return lines.reduce((sum, line) => sum + wrappedHeight(line, width), 0);
}

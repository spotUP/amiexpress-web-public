"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_MEASURE = void 0;
exports.columnCount = columnCount;
exports.columnGeometry = columnGeometry;
exports.setParagraphs = setParagraphs;
exports.flowColumns = flowColumns;
/**
 * Newspaper columns, pure.
 *
 * The reader is not one 80-character measure: article text is set in columns
 * whose COUNT comes from the screen width and whose WIDTH stays a readable
 * measure (about 34-38 characters) however wide the screen grows. A wide
 * screen gets more columns and wider margins, never longer lines.
 *
 *   under 80 columns  -> 1 column   (the 40-column C64 tier included)
 *   80 .. 119         -> 2 columns
 *   120 and wider     -> 3 columns
 *
 * No width literal lives here: the thresholds are the SDK's own breakpoints
 * and the gutter comes from `getCompactProfile(width).gap`.
 */
const blessed_1 = require("@amiexpress/bbs-door-sdk/engines/ui/blessed");
const petscii_1 = require("@amiexpress/bbs-door-sdk/petscii");
/** The widest a column of reading text is allowed to be. */
exports.MAX_MEASURE = 38;
function columnCount(width) {
    if (width >= blessed_1.BREAKPOINT_MD)
        return 3;
    if (width >= blessed_1.BREAKPOINT_SM)
        return 2;
    return 1;
}
/**
 * Where the columns sit on a screen this wide.
 *
 * The gutter is one rule character flanked by the profile's gap on each side,
 * so the column rule between two columns is always a character and never the
 * boundary of the text.
 */
function columnGeometry(width) {
    const profile = (0, blessed_1.getCompactProfile)(width);
    const cols = columnCount(width);
    const gutter = cols > 1 ? profile.gap * 2 + 1 : 0;
    const usable = Math.max(1, width - profile.padding * 2);
    const fitted = Math.floor((usable - gutter * (cols - 1)) / cols);
    const colWidth = Math.max(1, Math.min(exports.MAX_MEASURE, fitted));
    const contentWidth = colWidth * cols + gutter * (cols - 1);
    const margin = Math.max(0, Math.floor((width - contentWidth) / 2));
    return { cols, colWidth, gutter, margin, contentWidth };
}
/**
 * Paragraphs to rows at one measure, a blank row between paragraphs.
 *
 * Wrapping is the SDK's own word wrap (petscii/wrap), which breaks at word
 * boundaries and cuts a word longer than the column rather than overflow it.
 */
function setParagraphs(paragraphs, measure) {
    const rows = [];
    for (const paragraph of paragraphs) {
        const text = paragraph.replace(/\s+/g, ' ').trim();
        if (!text)
            continue;
        if (rows.length > 0)
            rows.push('');
        rows.push(...(0, petscii_1.wrapLineToWidth)(text, measure));
    }
    return rows;
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
function flowColumns(rows, cols, heights, options = {}) {
    const isBlank = options.isBlank ?? ((row) => row === '');
    const keepWithNext = options.keepWithNext ?? (() => false);
    const blockOf = options.blockOf ?? (() => undefined);
    /** One past the last row of the block starting at `i`, or i + 1 for a plain row. */
    const runEnd = (i) => {
        const key = blockOf(rows[i]);
        if (key === undefined)
            return i + 1;
        let j = i + 1;
        while (j < rows.length && blockOf(rows[j]) === key)
            j++;
        return j;
    };
    const spreads = [];
    let at = 0;
    let spreadNo = 0;
    do {
        const room = Math.max(1, spreadNo === 0 ? heights.first : heights.rest);
        // Blank rows inside the text take room too; only the ones at the top of
        // a column are free.
        const columns = [];
        for (let c = 0; c < cols; c++) {
            while (at < rows.length && isBlank(rows[at]))
                at++;
            let take = [];
            let next = at;
            while (next < rows.length && take.length < room) {
                const end = runEnd(next);
                const run = rows.slice(next, end);
                if (take.length + run.length <= room) {
                    take.push(...run);
                    next = end;
                }
                else if (take.length === 0) {
                    // Taller than a whole column: clip, never split across columns.
                    take = run.slice(0, room);
                    next = end;
                }
                else {
                    break;
                }
            }
            // Only when something follows: a heading that is the very last row has
            // nothing to be kept with, and dropping it would lose it.
            while (take.length > 1 && next < rows.length && blockOf(take[take.length - 1]) === undefined && keepWithNext(take[take.length - 1])) {
                take = take.slice(0, -1);
                next--;
            }
            columns.push(take);
            at = next;
        }
        spreads.push({ columns });
        spreadNo++;
    } while (at < rows.length);
    return spreads;
}
//# sourceMappingURL=columns.js.map
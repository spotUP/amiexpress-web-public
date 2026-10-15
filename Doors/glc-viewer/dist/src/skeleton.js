"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CLEAR_ROW = exports.CURSOR_UP = void 0;
exports.skeletonRow = skeletonRow;
exports.skeletonRows = skeletonRows;
exports.rewind = rewind;
exports.overwrite = overwrite;
exports.skeletonFooter = skeletonFooter;
exports.skeletonBody = skeletonBody;
exports.awaitsData = awaitsData;
/**
 * What a caller looks at while the scenewall is thinking.
 *
 * The sysop, 2026-09-16: "could we make global last callers draws skeleton
 * loaders while waiting for the network?" - after a login where the 68K door
 * held the line for 58 seconds with nothing on screen at all.
 *
 * The answer is not a spinner. The screen's whole top half - logo, title bar,
 * column rule - depends on no data, so it is drawn at once; these rows fill
 * the space the calls will occupy, in the calls' own column widths, so the
 * table does not jump when the real ones arrive. Then the door walks the
 * cursor back up and overwrites them in place.
 *
 * Built from the SAME row template as a real call (`ROW_TEMPLATE`), which is
 * why they line up: change the template and these follow.
 */
const art_generated_1 = require("./art.generated");
const estringf_1 = require("./estringf");
const render_1 = require("./render");
/** Cursor up one row, and clear it before drawing over it. */
exports.CURSOR_UP = '\x1b[A';
exports.CLEAR_ROW = '\x1b[K';
/**
 * A row of placeholder rules, in the real row's colours and widths.
 *
 * Dots rather than blanks: a blank row reads as "there are no callers", and
 * this is "there are callers and they have not arrived yet". The dimmest pen
 * on the row, so it recedes against the real thing.
 */
function skeletonRow() {
    const dots = (width) => '.'.repeat(width);
    return (0, estringf_1.formatE)(art_generated_1.ROW_TEMPLATE, [
        dots(8), dots(10), dots(5), dots(5), dots(5), dots(4), dots(4), dots(4),
    ]);
}
/** `count` placeholder rows - one per call the door is about to ask for. */
function skeletonRows(count) {
    const row = skeletonRow();
    return Array.from({ length: Math.max(0, count) }, () => row);
}
/**
 * Walk back over `count` rows so the next writes land on top of them.
 *
 * One `ESC[A` per row rather than `ESC[<n>A`: the C64 adapter reconstructs a
 * frame from what it is sent, and a PETSCII caller's cursor-up is a single
 * byte with no parameter - the repeated form is what both transports already
 * agree on.
 */
function rewind(count) {
    return exports.CURSOR_UP.repeat(Math.max(0, count));
}
/** Draw `line` over whatever is on the current row. */
function overwrite(line) {
    return exports.CLEAR_ROW + line;
}
/**
 * THE FOOTER IS ON SCREEN BEFORE THE DATA TOO.
 *
 * The first cut held only the call rows while the network was asked and
 * wrote the footer - a rule, three legend rows, a rule, three day-total rows,
 * a rule - after the answer landed. Nine rows arriving at once pushed the
 * page down by nine, and on a twenty-five row terminal that scrolled the
 * logo off the top. The sysop read it right: "this doesnt draw until the
 * scramble anim finishes" (2026-09-16). So the page has its final SHAPE
 * from the first paint: the footer goes out with the placeholders, its
 * totals as dots, and the real totals settle over them like the calls do.
 */
const dots = (width) => '.'.repeat(width);
const SKELETON_DAY = {
    statdate: dots(8), calls: dots(3), topcps: dots(5), uploads: dots(7), downloads: dots(7),
};
const SKELETON_RECORDS = {
    allcalls: dots(3), recordcalls: dots(3), calls: dots(3), mostcalled: dots(14),
    calls2: dots(3), secondmostcalled: dots(14), calls3: dots(3), thirdmostcalled: dots(14),
};
/** The footer with every total still to come, in the style's own layout. */
function skeletonFooter(style) {
    return (0, render_1.renderGlcFooter)({
        style,
        logo: [],
        columns: 80,
        showLocation: false,
        screenClear: false,
        calls: [],
        yesterday: SKELETON_DAY,
        previousDay: SKELETON_DAY,
        records: SKELETON_RECORDS,
    });
}
/** Everything under the header, waiting: `count` call rows, then the footer. */
function skeletonBody(count, style) {
    return [...skeletonRows(count), ...skeletonFooter(style)];
}
/**
 * Whether a placeholder row is waiting for data, or is already what it will
 * be. The rules and the legend are the same before and after the answer;
 * only a row of dots has something coming. The waiting noise and the
 * settling leave the still rows alone, so the page's frame holds while the
 * values inside it resolve.
 */
function awaitsData(placeholder) {
    return /\.{3,}/.test(placeholder.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''));
}
//# sourceMappingURL=skeleton.js.map
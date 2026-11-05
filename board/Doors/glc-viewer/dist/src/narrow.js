"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NARROW_RULE = exports.NARROW_BANNER = exports.BOARD_PAUSE_ROWS = exports.NARROW_CHROME_ROWS = exports.C64_ROWS = exports.NARROW_WIDTH = void 0;
exports.narrowListRows = narrowListRows;
exports.compactActions = compactActions;
exports.narrowColumns = narrowColumns;
exports.ellipsis = ellipsis;
exports.narrowRow = narrowRow;
exports.narrowFooter = narrowFooter;
exports.renderNarrowScreen = renderNarrowScreen;
exports.printableWidth = printableWidth;
exports.narrowHeader = narrowHeader;
exports.narrowSkeletonRow = narrowSkeletonRow;
exports.narrowSkeletonBody = narrowSkeletonBody;
exports.narrowBody = narrowBody;
/**
 * The last-callers list on forty columns.
 *
 * WHY THE DOOR DOES THIS ITSELF. The board has a frame adapter that narrows a
 * wide door's output, and this door cannot use it: `ADAPTED_DOOR_TYPES` is
 * `XIM, DD, SIM, FIM` - the 68K wire - and a TypeScript door's output never
 * crosses that seam (`door-min-columns.util.ts:233`). So a C64 caller reading
 * GLC has exactly two honest options: be refused, or be drawn for.
 *
 * The sysop asked for the second: "using our typescript port of global last
 * callers also lets us really finetune the rest of the ui for petscii"
 * (2026-09-16).
 *
 * WHAT IS DROPPED, and why it is a choice rather than a truncation. Eighty
 * columns carry username, BBS, date, time on, time off, action letters and
 * two transfer totals. Forty carry what a caller reads the list FOR - who
 * called, from where, and when - and the rest is left out rather than
 * squeezed into two characters each. The action letters keep their column
 * because they are the list's own shorthand and cost four.
 */
const estringf_1 = require("./estringf");
/** A C64's screen, and the width every line here is built to. */
exports.NARROW_WIDTH = 40;
/*
 * The pens, kept as the wide screen's are so the two read as one door:
 * cyan names, green systems, white times, blue rules.
 */
const NAME_PEN = '\x1b[36m';
const SYSTEM_PEN = '\x1b[32m';
const TIME_PEN = '\x1b[37m';
const RULE_PEN = '\x1b[34m';
const TITLE_PEN = '\x1b[1;44;33m';
const STAT_PEN = '\x1b[35m';
const RESET = '\x1b[0m';
/** `NAME(14) SYSTEM(14) ACTS(3) TIME(5)` - 14+1+14+1+3+1+5 = 39, one short of
 *  the edge on purpose: a character written into column forty wraps on a C64. */
const NAME_COLUMNS = 14;
const SYSTEM_COLUMNS = 14;
const ACTION_COLUMNS = 3;
const TIME_COLUMNS = 5;
/**
 * A C64 screen, and what this door may use of it.
 *
 * The chrome is fixed: title bar, column header, rule, rule, two footer lines
 * and the closing rule. The board then adds a blank line and its own
 * `(Pause)...Space To Resume:`. What is left is shared between the logo and
 * the list, which is why the list SIZES ITSELF - a caller who asked for
 * twenty callers on a forty-column screen scrolled the header away before he
 * could read it.
 */
exports.C64_ROWS = 25;
exports.NARROW_CHROME_ROWS = 7;
exports.BOARD_PAUSE_ROWS = 2;
/** How many callers fit under a logo of `logoRows`, on a C64's screen. */
function narrowListRows(logoRows) {
    const spare = exports.C64_ROWS - exports.NARROW_CHROME_ROWS - exports.BOARD_PAUSE_ROWS - Math.max(0, logoRows);
    return Math.max(1, spare);
}
/**
 * The action letters, without the places where nothing happened.
 *
 * The server sends a POSITIONAL field - `-U--------`, ten characters where
 * each slot is one action and a dash means it did not occur. Eighty columns
 * can afford to print the shape; forty cannot, and the sysop's screenshot
 * showed four columns spent on `--D-` (2026-09-16). What a caller reads is
 * WHICH actions happened, so that is what is drawn.
 */
function compactActions(actions) {
    return actions.replace(/[^A-Za-z*]/g, '').slice(0, ACTION_COLUMNS);
}
/** The title bar, in forty columns rather than seventy-nine. */
exports.NARROW_BANNER = `${TITLE_PEN}    GLOBAL LASTCALLERS - REBEL/QTX   ${RESET}`;
/** The rule that opens and closes the table. */
exports.NARROW_RULE = `${RULE_PEN}${'-'.repeat(exports.NARROW_WIDTH)}`;
/** Which columns the rows below are. */
function narrowColumns(showLocation) {
    return NAME_PEN + (0, estringf_1.leftField)('HANDLE', NAME_COLUMNS)
        + ' ' + (0, estringf_1.leftField)(showLocation ? 'FROM' : 'BBS', SYSTEM_COLUMNS)
        + ' ' + (0, estringf_1.leftField)('ACTS', ACTION_COLUMNS)
        + ' ' + (0, estringf_1.rightField)('ON', TIME_COLUMNS);
}
/**
 * A value cut to `width`, saying so when it was cut.
 *
 * The sysop, on the second C64 screenshot: "the long bbs names needs to be
 * truncated with ...". A silent cut is a lie at this width - `The Northern`
 * is a real BBS name and so is `The Northern Palace`, and a caller reading the
 * first cannot tell which he is looking at. Three dots cost three of fourteen
 * columns and buy that back.
 *
 * ASCII dots rather than an ellipsis character: these files and this wire are
 * latin-1, and U+2026 is neither latin-1 nor PETSCII.
 */
function ellipsis(value, width) {
    const trimmed = value.trim();
    if (trimmed.length <= width)
        return (0, estringf_1.leftField)(trimmed, width);
    // A field too narrow to hold even the dots keeps as much of the name as it
    // can - three dots alone say nothing at all.
    if (width <= 3)
        return trimmed.slice(0, width);
    return trimmed.slice(0, width - 3) + '...';
}
/** One caller, cut to the columns a C64 has. */
function narrowRow(call, showLocation) {
    const system = showLocation ? call.Location : call.Bbsname;
    return NAME_PEN + ellipsis(call.Username, NAME_COLUMNS)
        + ' ' + SYSTEM_PEN + ellipsis(system, SYSTEM_COLUMNS)
        + ' ' + TIME_PEN + (0, estringf_1.leftField)(compactActions(call.Actions), ACTION_COLUMNS)
        + ' ' + (0, estringf_1.rightField)(call.Timeon.trim(), TIME_COLUMNS);
}
/**
 * The day totals, two lines instead of three.
 *
 * The all-time record row is dropped at this width: the two days are what
 * changes, and a C64 screen is twenty-five rows with a list already on it.
 */
function narrowFooter(yesterday, records) {
    return [
        `${STAT_PEN}YESTERDAY ${TIME_PEN}${(0, estringf_1.rightField)(yesterday.calls.trim(), 4)}${STAT_PEN} CALLS`
            + `  TOP CPS ${TIME_PEN}${(0, estringf_1.rightField)(yesterday.topcps.trim(), 6)}`,
        `${STAT_PEN}MOST CALLED ${SYSTEM_PEN}${ellipsis(records.mostcalled, 16)}`
            + `${STAT_PEN} ${TIME_PEN}${(0, estringf_1.rightField)(records.calls.trim(), 4)}${RESET}`,
    ];
}
/** The whole screen, forty columns wide, in the order it goes out. */
function renderNarrowScreen(screen) {
    return [
        ...narrowHeader(screen.logo, screen.showLocation, screen.screenClear),
        ...narrowBody(screen),
    ];
}
/** Printable columns of a line - CSI sequences take no space on screen. */
function printableWidth(line) {
    return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x0c/g, '').length;
}
/**
 * The top of the narrow screen: everything that needs no data.
 *
 * Split out so a C64 caller sees the logo and the column header while the
 * scenewall is still deciding, exactly as an 80-column caller does. It was
 * drawn all at once at first, on the argument that twenty-five rows cannot
 * afford to scroll - but the list SIZES ITSELF now, so it cannot scroll, and
 * a caller looking at a blank screen for five seconds was the thing worth
 * fixing (the sysop, 2026-09-16: "no logo no skeleton loaders").
 */
function narrowHeader(logo, showLocation, screenClear) {
    const lines = [];
    const head = [...logo];
    if (head.length > 0) {
        head[0] = (screenClear ? '\x0c' : '') + head[0];
        for (const line of head)
            lines.push(line);
    }
    else if (screenClear) {
        lines.push('\x0c');
    }
    lines.push(exports.NARROW_BANNER);
    lines.push(narrowColumns(showLocation));
    lines.push(exports.NARROW_RULE);
    return lines;
}
/** One placeholder row, in the narrow table's own columns. */
function narrowSkeletonRow() {
    const dots = (width) => '.'.repeat(width);
    return NAME_PEN + dots(NAME_COLUMNS)
        + ' ' + SYSTEM_PEN + dots(SYSTEM_COLUMNS)
        + ' ' + TIME_PEN + dots(ACTION_COLUMNS)
        + ' ' + dots(TIME_COLUMNS);
}
/**
 * The bottom while the scenewall is asked: `count` rows of dots, then the
 * rule, the two totals with their numbers as dots, and the closing rule -
 * the same rows `narrowBody` will settle over them, so the C64 screen has
 * its final height before the answer and nothing scrolls when it lands.
 */
function narrowSkeletonBody(count) {
    const dots = (width) => '.'.repeat(width);
    const lines = [];
    for (let i = 0; i < Math.max(0, count); i++)
        lines.push(narrowSkeletonRow());
    lines.push(exports.NARROW_RULE);
    for (const line of narrowFooter({ statdate: dots(8), calls: dots(4), topcps: dots(6), uploads: dots(7), downloads: dots(7) }, {
        allcalls: dots(4), recordcalls: dots(4), calls: dots(4), mostcalled: dots(16),
        calls2: dots(4), secondmostcalled: dots(16), calls3: dots(4), thirdmostcalled: dots(16),
    }))
        lines.push(line);
    lines.push(`${exports.NARROW_RULE}${RESET}`);
    return lines;
}
/** The bottom: the rows, the rule under them, the totals. */
function narrowBody(screen) {
    const lines = [];
    for (const call of screen.calls)
        lines.push(narrowRow(call, screen.showLocation));
    lines.push(exports.NARROW_RULE);
    for (const line of narrowFooter(screen.yesterday, screen.records))
        lines.push(line);
    lines.push(`${exports.NARROW_RULE}${RESET}`);
    return lines;
}
//# sourceMappingURL=narrow.js.map
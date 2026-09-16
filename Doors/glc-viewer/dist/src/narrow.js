"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.NARROW_RULE = exports.NARROW_BANNER = exports.NARROW_WIDTH = void 0;
exports.narrowColumns = narrowColumns;
exports.narrowRow = narrowRow;
exports.narrowFooter = narrowFooter;
exports.renderNarrowScreen = renderNarrowScreen;
exports.printableWidth = printableWidth;
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
/** `NAME(13) SYSTEM(13) ACTS(4) TIME(5)` - 13+1+13+1+4+1+5 = 38, and two spare. */
const NAME_COLUMNS = 13;
const SYSTEM_COLUMNS = 13;
const ACTION_COLUMNS = 4;
const TIME_COLUMNS = 5;
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
/** One caller, cut to the columns a C64 has. */
function narrowRow(call, showLocation) {
    const system = showLocation ? call.Location : call.Bbsname;
    return NAME_PEN + (0, estringf_1.leftField)(call.Username.trim(), NAME_COLUMNS)
        + ' ' + SYSTEM_PEN + (0, estringf_1.leftField)(system.trim(), SYSTEM_COLUMNS)
        + ' ' + TIME_PEN + (0, estringf_1.leftField)(call.Actions.trim(), ACTION_COLUMNS)
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
        `${STAT_PEN}MOST CALLED ${SYSTEM_PEN}${(0, estringf_1.leftField)(records.mostcalled.trim(), 16)}`
            + `${STAT_PEN} ${TIME_PEN}${(0, estringf_1.rightField)(records.calls.trim(), 4)}${RESET}`,
    ];
}
/** The whole screen, forty columns wide, in the order it goes out. */
function renderNarrowScreen(screen) {
    const lines = [];
    // The clear rides on the first drawn line, as the wide screen sends it.
    const head = screen.logo.length > 0 ? [...screen.logo] : [];
    if (head.length > 0) {
        head[0] = (screen.screenClear ? '\x0c' : '') + head[0];
        for (const line of head)
            lines.push(line);
    }
    else if (screen.screenClear) {
        lines.push('\x0c');
    }
    lines.push(exports.NARROW_BANNER);
    lines.push(narrowColumns(screen.showLocation));
    lines.push(exports.NARROW_RULE);
    for (const call of screen.calls)
        lines.push(narrowRow(call, screen.showLocation));
    lines.push(exports.NARROW_RULE);
    for (const line of narrowFooter(screen.yesterday, screen.records))
        lines.push(line);
    lines.push(`${exports.NARROW_RULE}${RESET}`);
    return lines;
}
/** Printable columns of a line - CSI sequences take no space on screen. */
function printableWidth(line) {
    return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x0c/g, '').length;
}
//# sourceMappingURL=narrow.js.map
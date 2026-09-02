"use strict";
/**
 * Does this terminal have room for the whole lobby at once?
 *
 * The door has two views and swaps between them: the lobby (table list, chat
 * log) or a table (board, hand, players, activity). That swap exists because
 * 80x25 cannot hold both. A terminal that CAN hold both should not be made to
 * choose - "in responsive mode we have room for all views on screen i think,
 * lobby chat etc that would be nice" (sysop, 2026-09-02).
 *
 * The thresholds are what the panels actually need, not round numbers:
 *
 *   width  - the table is an 80-column design in its own right: four panels,
 *            a hand of seven cards, a players list. Give it less and it is
 *            the cramped table the sysop already reported. The lobby list
 *            floors at 25 (computeLayout). 80 + 25 + the shared border is
 *            106, and 120 leaves both a little air rather than sitting on
 *            the exact minimum.
 *
 *            This was 104 for one draft, and the door's own tests said no:
 *            at 106 the hand panel could no longer fit the hand it was given,
 *            which is the bug this door was fixed for last week. A threshold
 *            that squeezes both views is worse than swapping between them.
 *   height - the table view borrows the log's four rows when it is alone. To
 *            keep the log AND the table panels, the screen needs those rows
 *            back on top of the 24 the table view is built around, plus the
 *            top bar and the status bar.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.WIDE_DESKTOP_ROWS = exports.WIDE_DESKTOP_COLUMNS = void 0;
exports.hasRoomForEverything = hasRoomForEverything;
exports.WIDE_DESKTOP_COLUMNS = 120;
exports.WIDE_DESKTOP_ROWS = 30;
function hasRoomForEverything(width, height) {
    return width >= exports.WIDE_DESKTOP_COLUMNS && height >= exports.WIDE_DESKTOP_ROWS;
}

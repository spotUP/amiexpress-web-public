"use strict";
/**
 * How many opponents can be shown as FULL boards, given the width.
 *
 * The versus screen has always decided this by counting opponents: one
 * opponent gets a full board, more than one gets a grid of miniatures. That
 * was right when every caller had exactly 80 columns. Now a door can ask the
 * terminal to widen, and the sysop's point stands - "it can have MANY
 * playfields that are forced to miniature maps today" - so the question is
 * how many boards FIT, not how many exist.
 *
 * Kept as a pure function because the versus screen is two thousand lines of
 * widgets and timers, and the interesting decision here is arithmetic.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.VS_INFO_COLS = exports.OPPONENT_BOARD_COLS = exports.LEFT_PANEL_COLS = void 0;
exports.versusLayout = versusLayout;
exports.boardLeft = boardLeft;
exports.widthForFullBoards = widthForFullBoards;
/** Player board (22) + NEXT/HOLD column (12) + garbage strip (3). */
exports.LEFT_PANEL_COLS = 37;
/** One opponent board, borders included - the geometry the screen already uses. */
exports.OPPONENT_BOARD_COLS = 22;
/** The 1v1 VS/attack panel beside a single opponent. */
exports.VS_INFO_COLS = 21;
/**
 * All-or-nothing, deliberately.
 *
 * Showing two of five opponents full-size and the other three as miniatures
 * would say something false about the match: the player would read the two
 * as the threats. Either every opponent gets a board or none does, which
 * also means an 80-column caller sees exactly what they see today - one
 * opponent full with the VS panel, more than one as the minimap grid.
 */
function versusLayout(screenWidth, opponentCount) {
    const base = {
        fullBoards: 0,
        showInfo: false,
        left: exports.LEFT_PANEL_COLS,
        boardWidth: exports.OPPONENT_BOARD_COLS,
    };
    if (opponentCount <= 0)
        return base;
    const available = Math.max(0, screenWidth - exports.LEFT_PANEL_COLS);
    // One opponent: the classic 1v1, with the VS panel if there is room for it.
    if (opponentCount === 1) {
        if (available >= exports.OPPONENT_BOARD_COLS + exports.VS_INFO_COLS) {
            return { ...base, fullBoards: 1, showInfo: true };
        }
        if (available >= exports.OPPONENT_BOARD_COLS) {
            return { ...base, fullBoards: 1, showInfo: false };
        }
        return base;
    }
    // Several: only if they ALL fit.
    const fit = Math.floor(available / exports.OPPONENT_BOARD_COLS);
    if (fit >= opponentCount) {
        return { ...base, fullBoards: opponentCount, showInfo: false };
    }
    return base;
}
/** Where the Nth full opponent board starts. */
function boardLeft(index) {
    return exports.LEFT_PANEL_COLS + index * exports.OPPONENT_BOARD_COLS;
}
/** The narrowest terminal that shows `count` opponents as full boards. */
function widthForFullBoards(count) {
    if (count <= 0)
        return exports.LEFT_PANEL_COLS;
    if (count === 1)
        return exports.LEFT_PANEL_COLS + exports.OPPONENT_BOARD_COLS + exports.VS_INFO_COLS;
    return exports.LEFT_PANEL_COLS + count * exports.OPPONENT_BOARD_COLS;
}
//# sourceMappingURL=versus-layout.js.map
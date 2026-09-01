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
 * Humans get the boards; bots get miniatures if that is what it takes.
 *
 * "the normal case is probably that we have enough room for all human
 * players" - which is the observation the whole rule turns on. A match can
 * carry many CPU opponents, and forcing everyone to miniatures because eight
 * bots will not fit wastes a wide terminal on the two people actually
 * playing. So: fit everyone if everyone fits, otherwise fit the humans, and
 * only fall back to an all-miniature grid when even they do not.
 *
 * Within a group it stays all-or-nothing. Showing two humans full and a
 * third as a miniature would say something false about the match - the
 * player would read the two as the threats.
 */
function versusLayout(screenWidth, humanCount, botCount = 0) {
    const total = Math.max(0, humanCount) + Math.max(0, botCount);
    const base = {
        fullBoards: 0,
        minimaps: total,
        showInfo: false,
        left: exports.LEFT_PANEL_COLS,
        boardWidth: exports.OPPONENT_BOARD_COLS,
    };
    if (total <= 0)
        return { ...base, minimaps: 0 };
    const available = Math.max(0, screenWidth - exports.LEFT_PANEL_COLS);
    const fits = (n) => {
        if (n <= 0)
            return false;
        // A lone opponent is the classic 1v1 and wants the VS panel beside it,
        // but the board matters more than the numbers: below that, board only.
        if (n === 1)
            return available >= exports.OPPONENT_BOARD_COLS;
        return Math.floor(available / exports.OPPONENT_BOARD_COLS) >= n;
    };
    if (fits(total)) {
        return {
            ...base,
            fullBoards: total,
            minimaps: 0,
            showInfo: total === 1 && available >= exports.OPPONENT_BOARD_COLS + exports.VS_INFO_COLS,
        };
    }
    if (humanCount > 0 && fits(humanCount)) {
        return {
            ...base,
            fullBoards: humanCount,
            minimaps: total - humanCount,
            showInfo: humanCount === 1 && total === 1
                && available >= exports.OPPONENT_BOARD_COLS + exports.VS_INFO_COLS,
        };
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
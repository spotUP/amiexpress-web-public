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
exports.CASCADE_MIN_OPPONENTS = exports.MIN_LIST_ROWS = exports.MAX_BUCKETS = exports.MIN_LIST_COLS = exports.LIST_COLUMN_COLS = exports.MIN_BUCKETS_COLS = exports.BUCKET_SLOT_COLS = exports.STATS_ROWS = exports.BOARD_TOP = exports.OPPONENT_BOARD_ROWS = exports.CASCADE_MAX_BOARDS = exports.VS_INFO_COLS = exports.OPPONENT_BOARD_COLS = exports.LEFT_PANEL_COLS = void 0;
exports.versusLayout = versusLayout;
exports.boardLeft = boardLeft;
exports.boardPosition = boardPosition;
exports.widthForFullBoards = widthForFullBoards;
/** Player board (22) + NEXT/HOLD column (12) + garbage strip (3). */
exports.LEFT_PANEL_COLS = 37;
/** One opponent board, borders included - the geometry the screen already uses. */
exports.OPPONENT_BOARD_COLS = 22;
/** The 1v1 VS/attack panel beside a single opponent. */
exports.VS_INFO_COLS = 21;
/**
 * The cascade: boards, then bars, then a leaderboard.
 *
 * A 99-player battle royale can never be all boards - 98 of them is 2,156
 * columns - and a leaderboard alone throws away a wide terminal. "top few
 * as boards, some minimaps and the rest as list" (2026-09-01), which is
 * also how the field reads: the two closest to killing you get playfields,
 * the next handful get danger bars, and the rest are a ranked list.
 *
 * It is a WIDE-terminal shape by arithmetic rather than by rule: all three
 * sections need 37 + 22 + 14 + 22 columns before the first board is worth
 * drawing, which no 80-column caller has. At 80 the screen behaves exactly
 * as it did.
 */
exports.CASCADE_MAX_BOARDS = 3;
/** An opponent board with its border, in rows - the geometry the screen uses. */
exports.OPPONENT_BOARD_ROWS = 22;
/** Row 0 is the door's own top margin; the last row is the stats line. */
exports.BOARD_TOP = 1;
exports.STATS_ROWS = 1;
/** A bucket bar and its separator - the minimap grid's own geometry. */
exports.BUCKET_SLOT_COLS = 4;
/** Bars are not worth a section below three of them, borders included. */
exports.MIN_BUCKETS_COLS = 3 * exports.BUCKET_SLOT_COLS + 2;
/** One leaderboard column: rank, name, level, height, plus borders. */
exports.LIST_COLUMN_COLS = 19;
/**
 * The narrowest standings strip, which is the same 21 columns the 1v1 VS
 * panel gets - and for the same reason: 37 + 22 + 21 is exactly 80.
 *
 * It was 22, one column more than an 80-column terminal can spare beside a
 * board, so at 80x25 the cascade gave up the board and drew a list on its
 * own: "when gmaster is in 80x25 mode i only see myself but there is room
 * for 1 fullsize board and the list" (2026-09-02).
 */
exports.MIN_LIST_COLS = exports.LIST_COLUMN_COLS + 2;
/** Bars stop being readable past this many, however wide the panel is. */
exports.MAX_BUCKETS = 10;
/** Fewer rows than this under the player's board is not a standings list. */
exports.MIN_LIST_ROWS = 6;
/**
 * A field this size cannot be shown in full at any width, so the cascade
 * is honest about ranking it rather than pretending to be the whole field.
 */
exports.CASCADE_MIN_OPPONENTS = 6;
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
function versusLayout(screenWidth, humanCount, botCount = 0, screenHeight = 25) {
    const total = Math.max(0, humanCount) + Math.max(0, botCount);
    const available = Math.max(0, screenWidth - exports.LEFT_PANEL_COLS);
    /** Everything that is not on a board fills one grid panel, as it always did. */
    const grid = (fullBoards, showInfo = false) => {
        const left = exports.LEFT_PANEL_COLS + fullBoards * exports.OPPONENT_BOARD_COLS;
        const rest = total - fullBoards;
        return {
            fullBoards,
            boardRows: 1,
            minimaps: rest,
            listed: 0,
            showInfo,
            left: exports.LEFT_PANEL_COLS,
            boardWidth: exports.OPPONENT_BOARD_COLS,
            minimapLeft: rest > 0 ? left : 0,
            minimapWidth: rest > 0 ? Math.max(0, screenWidth - left - (showInfo ? exports.VS_INFO_COLS : 0)) : 0,
            listLeft: 0,
            listTop: exports.BOARD_TOP,
            listWidth: 0,
            listHeight: 0,
            panelHeight: exports.OPPONENT_BOARD_ROWS,
        };
    };
    if (total <= 0)
        return { ...grid(0), minimaps: 0, minimapWidth: 0, minimapLeft: 0 };
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
        return grid(total, total === 1 && available >= exports.OPPONENT_BOARD_COLS + exports.VS_INFO_COLS);
    }
    // Humans before bots, but only while the field is small enough for the
    // rest to be miniatures. With one human and a lobby of bots this branch
    // used to fire every time -  is true on any terminal - so a
    // battle royale showed one board and a wall of minimaps, and a WIDER
    // terminal changed nothing at all. Past the cascade's threshold the
    // cascade decides, which is what puts boards and a standings list on
    // screen instead ("the minimaps made no sense in gmaster battle royal").
    if (humanCount > 0 && fits(humanCount) && total < exports.CASCADE_MIN_OPPONENTS) {
        return grid(humanCount, humanCount === 1 && total === 1
            && available >= exports.OPPONENT_BOARD_COLS + exports.VS_INFO_COLS);
    }
    const cascaded = cascade(screenWidth, total, screenHeight);
    if (cascaded)
        return cascaded;
    return grid(0);
}
/**
 * Boards, then bars, then the leaderboard - or null if it does not fit.
 *
 * Only for a field too large to show any other way, and only where all
 * three sections have room. Sections are filled in priority order: a board
 * is the most information about one opponent, a bar is the next most, and
 * the list is what a hundred players look like. Anything that cannot be
 * given a section is simply not drawn, which is why each has a minimum.
 */
function cascade(screenWidth, total, screenHeight) {
    if (total < exports.CASCADE_MIN_OPPONENTS)
        return null;
    const available = Math.max(0, screenWidth - exports.LEFT_PANEL_COLS);
    const rows = Math.max(1, Math.floor((screenHeight - exports.BOARD_TOP - exports.STATS_ROWS) / exports.OPPONENT_BOARD_ROWS));
    const maxColumns = Math.floor(available / exports.OPPONENT_BOARD_COLS);
    if (maxColumns < 1)
        return null;
    // Room under the player's own board, once the stats line has its row.
    const belowTop = exports.BOARD_TOP + exports.OPPONENT_BOARD_ROWS + exports.STATS_ROWS;
    const belowRows = screenHeight - belowTop;
    const belowFits = belowRows >= exports.MIN_LIST_ROWS;
    // As many playfields as the window holds, and the standings wherever
    // they still fit. Boards first and boards always: "the minimaps made no
    // sense in gmaster battle royal, replace them with full players and the
    // list can be moved under the players playfield" (2026-09-02).
    for (let columns = maxColumns; columns >= 0; columns--) {
        const boards = Math.min(columns * rows, total);
        const leftover = total - boards;
        const boardsEnd = exports.LEFT_PANEL_COLS + columns * exports.OPPONENT_BOARD_COLS;
        const base = {
            fullBoards: boards,
            boardRows: rows,
            minimaps: 0,
            listed: leftover,
            showInfo: false,
            left: exports.LEFT_PANEL_COLS,
            boardWidth: exports.OPPONENT_BOARD_COLS,
            minimapLeft: 0,
            minimapWidth: 0,
            listLeft: 0,
            listTop: exports.BOARD_TOP,
            listWidth: 0,
            listHeight: 0,
            panelHeight: rows * exports.OPPONENT_BOARD_ROWS,
        };
        if (boards <= 0 && leftover > 0 && columns > 0)
            continue;
        if (leftover === 0) {
            if (boards <= 0)
                continue;
            return base;
        }
        // Under the player's board is the calm place for it: the field stays
        // one uninterrupted grid of playfields.
        if (belowFits) {
            return {
                ...base,
                listLeft: 0,
                listTop: belowTop,
                listWidth: exports.LEFT_PANEL_COLS,
                listHeight: belowRows,
            };
        }
        // No room below - the standings take whatever width the boards left.
        const rightWidth = available - columns * exports.OPPONENT_BOARD_COLS;
        if (rightWidth >= exports.MIN_LIST_COLS) {
            return {
                ...base,
                listLeft: boardsEnd,
                listTop: exports.BOARD_TOP,
                listWidth: rightWidth,
                listHeight: rows * exports.OPPONENT_BOARD_ROWS,
            };
        }
    }
    return null;
}
/** Where the Nth full opponent board starts. */
function boardLeft(index) {
    return exports.LEFT_PANEL_COLS + index * exports.OPPONENT_BOARD_COLS;
}
/**
 * Where the Nth board goes when the boards form a grid.
 *
 * Down each column, then across, so the first boards - the opponents
 * closest to killing you - are the leftmost ones, next to your own board.
 */
function boardPosition(index, rows) {
    const column = Math.floor(index / Math.max(1, rows));
    const row = index % Math.max(1, rows);
    return {
        left: exports.LEFT_PANEL_COLS + column * exports.OPPONENT_BOARD_COLS,
        top: exports.BOARD_TOP + row * exports.OPPONENT_BOARD_ROWS,
    };
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
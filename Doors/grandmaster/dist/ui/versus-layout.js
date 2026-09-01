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
exports.CASCADE_MIN_OPPONENTS = exports.MAX_BUCKETS = exports.MIN_LIST_COLS = exports.LIST_COLUMN_COLS = exports.MIN_BUCKETS_COLS = exports.BUCKET_SLOT_COLS = exports.STATS_ROWS = exports.BOARD_TOP = exports.OPPONENT_BOARD_ROWS = exports.CASCADE_MAX_BOARDS = exports.VS_INFO_COLS = exports.OPPONENT_BOARD_COLS = exports.LEFT_PANEL_COLS = void 0;
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
exports.LIST_COLUMN_COLS = 20;
exports.MIN_LIST_COLS = exports.LIST_COLUMN_COLS + 2;
/** Bars stop being readable past this many, however wide the panel is. */
exports.MAX_BUCKETS = 10;
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
            listWidth: 0,
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
    if (humanCount > 0 && fits(humanCount)) {
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
    const reserved = exports.MIN_BUCKETS_COLS + exports.MIN_LIST_COLS;
    if (available < exports.OPPONENT_BOARD_COLS + reserved)
        return null;
    // Boards fill a GRID, not a row. "we have shitloads of space left for
    // full playfields in gmaster battle royale" - with a 55-row window the
    // old single row used 22 of them and left the rest black, while three
    // boards was a cap rather than a measurement.
    const rows = Math.max(1, Math.floor((screenHeight - exports.BOARD_TOP - exports.STATS_ROWS) / exports.OPPONENT_BOARD_ROWS));
    let columns = 0;
    while ((columns + 1) * exports.OPPONENT_BOARD_COLS + reserved <= available
        && columns * rows < total - 1) {
        columns++;
    }
    const boards = Math.min(columns * rows, Math.max(0, total - 1));
    if (boards <= 0)
        return null;
    // A part-filled last column would leave a ragged hole in the middle of
    // the field; the columns that are drawn are drawn full.
    const usedColumns = Math.ceil(boards / rows);
    const afterBoards = available - usedColumns * exports.OPPONENT_BOARD_COLS;
    // The bars take what they can hold, up to the point where a bar stops
    // saying anything; whatever remains is the leaderboard's.
    const barsFor = Math.min(exports.MAX_BUCKETS, total - boards, Math.floor((afterBoards - exports.MIN_LIST_COLS - 2) / exports.BUCKET_SLOT_COLS));
    const buckets = Math.max(0, barsFor);
    const bucketWidth = buckets > 0 ? buckets * exports.BUCKET_SLOT_COLS + 2 : 0;
    const listWidth = afterBoards - bucketWidth;
    const listed = total - boards - buckets;
    if (buckets <= 0 || listed <= 0 || listWidth < exports.MIN_LIST_COLS)
        return null;
    const boardsEnd = exports.LEFT_PANEL_COLS + usedColumns * exports.OPPONENT_BOARD_COLS;
    return {
        fullBoards: boards,
        boardRows: rows,
        minimaps: buckets,
        listed,
        showInfo: false,
        left: exports.LEFT_PANEL_COLS,
        boardWidth: exports.OPPONENT_BOARD_COLS,
        minimapLeft: boardsEnd,
        minimapWidth: bucketWidth,
        listLeft: boardsEnd + bucketWidth,
        listWidth,
        panelHeight: rows * exports.OPPONENT_BOARD_ROWS,
    };
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
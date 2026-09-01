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
/** Player board (22) + NEXT/HOLD column (12) + garbage strip (3). */
export declare const LEFT_PANEL_COLS = 37;
/** One opponent board, borders included - the geometry the screen already uses. */
export declare const OPPONENT_BOARD_COLS = 22;
/** The 1v1 VS/attack panel beside a single opponent. */
export declare const VS_INFO_COLS = 21;
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
export declare const CASCADE_MAX_BOARDS = 3;
/** An opponent board with its border, in rows - the geometry the screen uses. */
export declare const OPPONENT_BOARD_ROWS = 22;
/** Row 0 is the door's own top margin; the last row is the stats line. */
export declare const BOARD_TOP = 1;
export declare const STATS_ROWS = 1;
/** A bucket bar and its separator - the minimap grid's own geometry. */
export declare const BUCKET_SLOT_COLS = 4;
/** Bars are not worth a section below three of them, borders included. */
export declare const MIN_BUCKETS_COLS: number;
/** One leaderboard column: rank, name, level, height, plus borders. */
export declare const LIST_COLUMN_COLS = 20;
export declare const MIN_LIST_COLS: number;
/** Bars stop being readable past this many, however wide the panel is. */
export declare const MAX_BUCKETS = 10;
/** Fewer rows than this under the player's board is not a standings list. */
export declare const MIN_LIST_ROWS = 6;
/**
 * A field this size cannot be shown in full at any width, so the cascade
 * is honest about ranking it rather than pretending to be the whole field.
 */
export declare const CASCADE_MIN_OPPONENTS = 6;
export interface VersusLayout {
    /** How many opponents to draw as full boards. Zero means the minimap grid. */
    fullBoards: number;
    /** How many board ROWS the window holds - boards fill a grid, not a row. */
    boardRows: number;
    /** How many go to the minimap grid instead. */
    minimaps: number;
    /** How many go to the leaderboard, after the boards and the bars. */
    listed: number;
    /** Whether the 1v1 VS/attack panel fits beside them. */
    showInfo: boolean;
    /** Where the opponent boards start, in columns. */
    left: number;
    /** Columns each full board occupies. */
    boardWidth: number;
    /** Where the bucket-bar panel goes, and how wide. Zero width means none. */
    minimapLeft: number;
    minimapWidth: number;
    /** Where the leaderboard goes. Zero width means none. */
    listLeft: number;
    listTop: number;
    listWidth: number;
    listHeight: number;
    /** How tall the right-hand panels may be, in rows. */
    panelHeight: number;
}
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
export declare function versusLayout(screenWidth: number, humanCount: number, botCount?: number, screenHeight?: number): VersusLayout;
/** Where the Nth full opponent board starts. */
export declare function boardLeft(index: number): number;
/**
 * Where the Nth board goes when the boards form a grid.
 *
 * Down each column, then across, so the first boards - the opponents
 * closest to killing you - are the leftmost ones, next to your own board.
 */
export declare function boardPosition(index: number, rows: number): {
    left: number;
    top: number;
};
/** The narrowest terminal that shows `count` opponents as full boards. */
export declare function widthForFullBoards(count: number): number;
//# sourceMappingURL=versus-layout.d.ts.map
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
export interface VersusLayout {
    /** How many opponents to draw as full boards. Zero means the minimap grid. */
    fullBoards: number;
    /** How many go to the minimap grid instead. */
    minimaps: number;
    /** Whether the 1v1 VS/attack panel fits beside them. */
    showInfo: boolean;
    /** Where the opponent boards start, in columns. */
    left: number;
    /** Columns each full board occupies. */
    boardWidth: number;
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
export declare function versusLayout(screenWidth: number, humanCount: number, botCount?: number): VersusLayout;
/** Where the Nth full opponent board starts. */
export declare function boardLeft(index: number): number;
/** The narrowest terminal that shows `count` opponents as full boards. */
export declare function widthForFullBoards(count: number): number;
//# sourceMappingURL=versus-layout.d.ts.map
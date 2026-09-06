/**
 * Where the board and the HUD go, at whatever width the caller has.
 *
 * Exported and I/O-free on purpose, the shape Doors/bug-tracker/layout.ts and
 * Doors/ami-stripper/layout.ts take: every width rule lives in one testable
 * function rather than scattered through a screen that needs a terminal to run.
 *
 * THE BOARD IS THE SAME SIZE ON EVERY SCREEN. Six panels at two characters is
 * twelve columns, and twelve rows plus the incoming one is thirteen - which
 * fits inside forty columns and twenty-five rows with room left over. So unlike
 * every other door adapted for the C64, nothing here has to be folded, stacked
 * or dropped. What changes is the CHROME around it: at forty columns the HUD
 * loses its labels and sits in whatever space is left.
 *
 * Read the tier, never compare widths by hand - the SDK owns the breakpoints
 * and a second ladder here would eventually disagree with it.
 */
/**
 * How many characters one panel takes, and how many rows.
 *
 * A panel is 2x1 characters at its smallest, which reads square on a terminal
 * whose cells are about twice as tall as they are wide. That is the whole
 * board on an 80x25 screen and it leaves most of a phone empty: the playfield
 * is twelve columns of a forty-column screen, and the rest is black.
 *
 * So the tile GROWS to fit. The rule is the largest whole multiple that still
 * leaves room for the board and its HUD, which is a different answer on every
 * screen and the reason this is computed rather than written down:
 *
 *   80x25 terminal   1x  - the classic board, unchanged
 *   40x25 C64        3x1 - fills the width; a C64 cell is square, so the tile
 *                          stays 2:1 there, which is the trade the sysop chose
 *   phone, 40x50     3x2 - a small font gives rows to spend, so the tile grows
 *                          both ways and the board fills the screen
 */
export interface PanelScale {
    /** Characters per panel, horizontally. Always even: a panel is 2 wide. */
    x: number;
    /** Rows per panel. */
    y: number;
}
/**
 * The biggest tile this screen can hold.
 *
 * Never smaller than 1x, because the 2x1 panel is the floor the sprites are
 * drawn at; and capped, because a board that fills a 200-column terminal in
 * six enormous tiles is not more readable, it is just bigger.
 */
export declare function panelScale(screenWidth: number, screenHeight: number, boardCols: number, boardRows: number, stacked: boolean): PanelScale;
export interface PanelsLayout {
    /** True at 40 columns: no labels, no chrome, no effects. */
    compact: boolean;
    /** May decorative chrome animate? Never at 40 columns. */
    effects: boolean;
    /** The width tier, for anything that wants to branch further. */
    tier: string;
    board: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    hud: {
        top: number;
        left: number;
        width: number;
        height: number;
    };
    /** Draw a border around the board? Not when there is no room for one. */
    border: boolean;
    /** Characters and rows per panel; the renderer scales the board by this. */
    scale: PanelScale;
    /** Is the HUD under the board rather than beside it? */
    stacked: boolean;
}
/**
 * Place a board of `boardCols` x `boardRows` characters on a screen.
 *
 * At 80 columns and wider the pair is centred, biased left so the HUD beside it
 * does not push the board off-centre visually. At 40 the board goes hard left
 * with a single column of margin, because centring a 12-wide board on a 40-wide
 * screen wastes the space the HUD needs.
 */
export declare function panelsLayout(screenWidth: number, screenHeight: number, boardCols: number, boardRows: number): PanelsLayout;
/**
 * The HUD's lines.
 *
 * At forty columns the labels go and the numbers stay, because the numbers are
 * what a player reads mid-game and the labels are what they can afford to lose.
 * Every line is clipped to the width it was given: a HUD line that overruns on
 * a C64 wraps and pushes the board off the screen.
 */
export declare function hudLines(layout: PanelsLayout, values: {
    score: number;
    speed: number;
    timeText: string;
    chain: number;
    stopped: boolean;
    /** Swaps left in a move puzzle; absent in every other mode. */
    movesLeft?: number | null;
    /** Is there a move to take back? */
    canUndo?: boolean;
}): string[];
//# sourceMappingURL=layout.d.ts.map
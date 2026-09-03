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
}): string[];
//# sourceMappingURL=layout.d.ts.map
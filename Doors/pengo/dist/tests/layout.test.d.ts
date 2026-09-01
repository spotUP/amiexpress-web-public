/**
 * The board fits the terminal, and the world it scrolls through is
 * exactly the arcade's 13x15.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. That fix (a 16x11 world sized to fill 80x22 exactly)
 * was superseded 2026-09-01 when the grid became the arcade's real 13x15
 * - taller than the terminal can show at once, so a camera scrolls it
 * instead of the world being sized to fit. These are the two different
 * invariants that replaces: the WORLD is the arcade's real size, and the
 * VIEW (what buildBoard actually returns, and what index.ts draws) is a
 * cropped window that fits the screen - a drive-by constant change to
 * either fails here first.
 */
/** The world is the arcade's real 13x15, not a shape picked to fit the screen. */
export declare function theWorldIsTheArcadesRealSize(): Promise<void>;
/** The world fits the screen horizontally - no camera needed on that axis. */
export declare function theWorldFitsTheScreenWidthWithNoScrolling(): Promise<void>;
/**
 * The world does NOT fit the screen vertically - proof a camera is
 * actually earning its place here, not decoration over a board that
 * would have fit anyway.
 */
export declare function theWorldOutgrowsTheScreenVertically(): Promise<void>;
/** The ON-SCREEN board - the camera's view, not the scrollable world - fits the row budget. */
export declare function theViewFitsTheRowBudget(): Promise<void>;
export declare function theLevelStillFitsItsBoard(): Promise<void>;
//# sourceMappingURL=layout.test.d.ts.map
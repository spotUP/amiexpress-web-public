/**
 * The board fills the terminal.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. The whole point of the sprite work is a 75x20 board;
 * these are the numbers that hold it, measured from the door's constants
 * so a drive-by constant change fails here first.
 *
 * The row budget: HUD 1 (row 0) + board 20 (rows 1-20) + hint 1 (row 23).
 * Anything taller than 20 board rows overflows the way Frogger's menu box
 * climbed onto its HUD.
 */
export declare function theBoardFillsTheScreenWidth(): Promise<void>;
export declare function theBoardFitsTheRowBudget(): Promise<void>;
export declare function theLevelStillFitsItsBoard(): Promise<void>;
//# sourceMappingURL=layout.test.d.ts.map
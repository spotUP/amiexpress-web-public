/**
 * Screen layout.
 *
 * Reported live 2026-08-31 with a screenshot: every second row of the board
 * was black, and the bottom edge of a panel border showed across the top of
 * the screen.
 *
 * One cause behind both. `blessed.box()` in this SDK returns a Panel, and
 * Panel injects `{type:'line', fg:'blue'}` whenever `border` is absent from
 * the options - unlike real blessed, where a box has no border. So:
 *
 *   - the game area lost two columns to a border nobody asked for, leaving
 *     78 for an 80-column board. Every row then wrapped, inserting a blank
 *     line after each real one: the "every second line is black";
 *   - the HUD is one row tall, so its injected border WAS the whole box, and
 *     what showed at the top of the screen was that border's bottom edge.
 *
 * Super Qix hit this exact fault first; this is the same fix and the same
 * check, for the same reason.
 */
/**
 * The defect itself, pinned: a box built the way the door used to build one
 * comes out with a border and too little room for the board. If this stops
 * being true, Panel's default has changed and the workaround can go.
 */
export declare function aDefaultBoxStillComesWithAnUnwantedBorder(): Promise<void>;
/** The game area as the door builds it holds a board row exactly. */
export declare function theGameAreaFitsTheBoardExactly(): Promise<void>;
/** The board fills the screen width, so nothing is left to wrap. */
export declare function theBoardFillsTheScreenWidth(): Promise<void>;
/** A one-row HUD keeps its row. */
export declare function theHudKeepsItsSingleRow(): Promise<void>;
/** The panes tile the screen: HUD, board, footer, with nothing overlapping. */
export declare function theThreePanesTileTheScreen(): Promise<void>;
/**
 * The menu box has to be wide enough for the block title.
 *
 * Reported live 2026-08-31 with a screenshot: "menu broken every second line
 * black". The title is 61 columns; the box was sized to 54 by eye, so every
 * title row wrapped and each letter came apart across two rows with a black
 * line through it. Same fault as the board's, in a second place.
 */
export declare function theMenuBoxFitsTheTitle(): Promise<void>;
/** Every line of the title fits the width it is centred into. */
export declare function theTitleFitsTheWidthItIsGiven(): Promise<void>;
//# sourceMappingURL=layout.test.d.ts.map
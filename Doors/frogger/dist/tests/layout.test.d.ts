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
/**
 * The screen is logo, status line, board - and nothing else.
 *
 * Reported live 2026-08-31: the clock had a row of its own under the board,
 * there were blank rows after it, and a footer spelled out what the arrow
 * keys do. The clock is a number in the status line now, the board ends
 * where the board ends, and the title fills the space at the top.
 */
export declare function theScreenIsLogoStatusAndBoard(): Promise<void>;
/** The logo fits the screen it is drawn across. */
export declare function theLogoFitsTheScreen(): Promise<void>;
/**
 * The score line is centred under the logo, with a blank row between.
 *
 * Reported 2026-08-31 with a screenshot: the score line sat directly against
 * the bottom of the block logo and ran hard against the left edge, while
 * everything else on the screen is centred.
 */
export declare function theScoreLineIsCentredUnderTheLogo(): Promise<void>;
/**
 * The menu carries no strip of coloured blocks.
 *
 * Reported 2026-08-31: "remove these color things from the frogger menu, they
 * are a leftover from arkanoid."
 */
export declare function theMenuHasNoColourBlockStrip(): Promise<void>;
//# sourceMappingURL=layout.test.d.ts.map
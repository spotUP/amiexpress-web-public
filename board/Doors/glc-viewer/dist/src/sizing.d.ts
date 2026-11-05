/**
 * How long the list may be, on the screen the caller actually has.
 *
 * Kept apart from the door itself so it can be tested without the SDK - and
 * because it is the one piece of arithmetic that decides whether a caller sees
 * the logo or only the bottom of it.
 */
/**
 * `GLCViewer.e:829` - everything on the wide screen that is not a caller:
 * the logo, the title bar, the column header, the two rules, the three lines
 * of action legend and the three totals.
 */
export declare const WIDE_CHROME_ROWS = 18;
/**
 * `LINES=AUTO`: the caller's display lines, less the chrome.
 *
 * The original's own sum - `count := getAEIntValue(DT_LINELENGTH) - 18`, and
 * `IF count<0 THEN count:=5` (`GLCViewer.e:828-831`). The floor matters: a
 * caller with a very short window still gets a list rather than nothing, and
 * the board's pause carries the rest.
 *
 * The sysop hit the reason it exists: "the ansi version grows when the chrome
 * fills so all is not visible" (2026-09-16). Twenty callers and eighteen rows
 * of chrome is twenty-eight rows on a twenty-four row screen.
 */
export declare function autoLines(callerRows: number): number;
//# sourceMappingURL=sizing.d.ts.map
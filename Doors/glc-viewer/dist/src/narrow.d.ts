import type { GlcCall, GlcDayStats, GlcRecords } from './render';
/** A C64's screen, and the width every line here is built to. */
export declare const NARROW_WIDTH = 40;
/**
 * A C64 screen, and what this door may use of it.
 *
 * The chrome is fixed: title bar, column header, rule, rule, two footer lines
 * and the closing rule. The board then adds a blank line and its own
 * `(Pause)...Space To Resume:`. What is left is shared between the logo and
 * the list, which is why the list SIZES ITSELF - a caller who asked for
 * twenty callers on a forty-column screen scrolled the header away before he
 * could read it.
 */
export declare const C64_ROWS = 25;
export declare const NARROW_CHROME_ROWS = 7;
export declare const BOARD_PAUSE_ROWS = 2;
/** How many callers fit under a logo of `logoRows`, on a C64's screen. */
export declare function narrowListRows(logoRows: number): number;
/**
 * The action letters, without the places where nothing happened.
 *
 * The server sends a POSITIONAL field - `-U--------`, ten characters where
 * each slot is one action and a dash means it did not occur. Eighty columns
 * can afford to print the shape; forty cannot, and the sysop's screenshot
 * showed four columns spent on `--D-` (2026-09-16). What a caller reads is
 * WHICH actions happened, so that is what is drawn.
 */
export declare function compactActions(actions: string): string;
/** The title bar, in forty columns rather than seventy-nine. */
export declare const NARROW_BANNER = "\u001B[1;44;33m    GLOBAL LASTCALLERS - REBEL/QTX   \u001B[0m";
/** The rule that opens and closes the table. */
export declare const NARROW_RULE: string;
/** Which columns the rows below are. */
export declare function narrowColumns(showLocation: boolean): string;
/**
 * A value cut to `width`, saying so when it was cut.
 *
 * The sysop, on the second C64 screenshot: "the long bbs names needs to be
 * truncated with ...". A silent cut is a lie at this width - `The Northern`
 * is a real BBS name and so is `The Northern Palace`, and a caller reading the
 * first cannot tell which he is looking at. Three dots cost three of fourteen
 * columns and buy that back.
 *
 * ASCII dots rather than an ellipsis character: these files and this wire are
 * latin-1, and U+2026 is neither latin-1 nor PETSCII.
 */
export declare function ellipsis(value: string, width: number): string;
/** One caller, cut to the columns a C64 has. */
export declare function narrowRow(call: GlcCall, showLocation: boolean): string;
/**
 * The day totals, two lines instead of three.
 *
 * The all-time record row is dropped at this width: the two days are what
 * changes, and a C64 screen is twenty-five rows with a list already on it.
 */
export declare function narrowFooter(yesterday: GlcDayStats, records: GlcRecords): string[];
export interface NarrowScreen {
    logo: readonly string[];
    showLocation: boolean;
    screenClear: boolean;
    calls: readonly GlcCall[];
    yesterday: GlcDayStats;
    records: GlcRecords;
}
/** The whole screen, forty columns wide, in the order it goes out. */
export declare function renderNarrowScreen(screen: NarrowScreen): string[];
/** Printable columns of a line - CSI sequences take no space on screen. */
export declare function printableWidth(line: string): number;
/**
 * The top of the narrow screen: everything that needs no data.
 *
 * Split out so a C64 caller sees the logo and the column header while the
 * scenewall is still deciding, exactly as an 80-column caller does. It was
 * drawn all at once at first, on the argument that twenty-five rows cannot
 * afford to scroll - but the list SIZES ITSELF now, so it cannot scroll, and
 * a caller looking at a blank screen for five seconds was the thing worth
 * fixing (the sysop, 2026-09-16: "no logo no skeleton loaders").
 */
export declare function narrowHeader(logo: readonly string[], showLocation: boolean, screenClear: boolean): string[];
/** One placeholder row, in the narrow table's own columns. */
export declare function narrowSkeletonRow(): string;
/**
 * The bottom while the scenewall is asked: `count` rows of dots, then the
 * rule, the two totals with their numbers as dots, and the closing rule -
 * the same rows `narrowBody` will settle over them, so the C64 screen has
 * its final height before the answer and nothing scrolls when it lands.
 */
export declare function narrowSkeletonBody(count: number): string[];
/** The bottom: the rows, the rule under them, the totals. */
export declare function narrowBody(screen: NarrowScreen): string[];
//# sourceMappingURL=narrow.d.ts.map
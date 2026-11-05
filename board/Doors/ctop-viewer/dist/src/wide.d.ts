/**
 * The eighty-column screen, as the Amiga door paints it.
 *
 * NOT a redesign. This board has run Conftop-II since it opened and the table
 * is what a caller expects to see, down to the column the byte counts end in,
 * so the templates below are the `StringF` strings out of `ctop.e` copied
 * character for character (writeFile, ctop.e:930-999) and filled the way E
 * fills them. The test beside this door checks the rendered screen against a
 * capture taken off the real 68K binary rather than against my reading of the
 * source.
 *
 * TWO THINGS THE WIRE DOES that the templates do not show:
 *
 *   Every line the door transmits ends with a reset. `transmit` is
 *   `WriteStr(diface, text, LF)` and the board's JH_SM writes `ESC[0m` after
 *   the text, which is why the capture has two of them on the banner rows -
 *   one from the template, one from the wire. A line that does not close its
 *   pen paints the next caller's rows (the FR listing did exactly that on
 *   2026-09-22), so this door writes the reset itself.
 *
 *   The second banner clears the screen. `header()` is called twice, once
 *   when the door starts and once from `writeOutput`, and only the second
 *   carries `ESC[2J ESC[H`.
 */
import { type CtopPeriod } from '@amiexpress/bbs-door-sdk/formats/ctop-data';
/** The width of the table, and of the rules above and below it. */
export declare const WIDE_COLUMNS = 77;
export interface TableWidths {
    rank: number;
    name: number;
    location: number;
    files: number;
    bytes: number;
    /** The whole table, separators included. */
    total: number;
}
/**
 * The table at a caller's width.
 *
 * Eighty columns and anything narrower keep the Amiga's own widths - the
 * screen is frozen and the sysop's `Conftop.header` art is drawn to it.
 * Wider callers get the surplus split between the two fields the door
 * truncates: the handle and the location, location first because it is the
 * one that loses a group name.
 */
export declare function tableWidths(columns?: number): TableWidths;
/** `===-====...` - one run of `=` per column, joined by the separator. */
export declare function ruleFor(widths: TableWidths): string;
/** `No# Username (Handle) ... Uploaded Bytes`, trailing blanks trimmed. */
export declare function columnHeadsFor(widths: TableWidths): string;
/** What the caller's screen needs that the data file does not hold. */
export interface CtopScreen {
    period: CtopPeriod;
    /** The conference's name, as the board knows it. */
    conferenceName: string;
    /** Today, as an Amiga day number. */
    today: number;
    /** How many table rows the sysop asked for (`ROWS=`). */
    rows: number;
    /** `SKIP_EMPTY_LINES` - draw the table short rather than padding it. */
    skipEmpty: boolean;
    /** `MIN_LIMIT` - an uploader under this many bytes is not listed. */
    minLimit: bigint;
    /** `SHOW_RESETDATE` - name the day the period ends instead of counting. */
    showResetDate: boolean;
}
/**
 * The two banner rows, as wide as the table under them. The second one
 * clears the screen first.
 */
export declare function banner(clear: boolean, width?: number): string[];
/**
 * `Mon Sep 21` - the day, the month and the date, which is all `formatDate`
 * keeps of a DOS date string (ctop.e:307-329).
 */
export declare function shortDate(amigaDay: number): string;
/**
 * The line that says which conference this is and where the period stands.
 *
 * `finalResult` is the bulletin written at the reset, where there are no days
 * left to count because the period has just ended.
 */
export declare function conferenceLine(screen: CtopScreen, finalResult?: boolean): string;
/**
 * The table's rows.
 *
 * An uploader under `MIN_LIMIT` is not drawn, and his SLOT is not drawn
 * either - ctop.e tests the limit inside the row loop and falls through to
 * the empty-slot branch, so a conference full of small uploads shows a short
 * table rather than a list of blank numbers. `SKIP_EMPTY_LINES` then decides
 * whether the unused slots are printed at all.
 */
export declare function tableRows(screen: CtopScreen, widths?: TableWidths): string[];
/** The totals, and under them the two record holders. */
export declare function tableFooter(screen: CtopScreen, finalResult?: boolean, widths?: TableWidths): string[];
/** The table alone - what the bulletin file holds, and what the screen shows. */
export declare function renderWideTable(screen: CtopScreen, finalResult?: boolean, columns?: number): string[];
/**
 * Every line the caller gets, in order, each one closing its own pen.
 *
 * THE BANNER IS DRAWN TWICE, and that is parity rather than a slip: `main`
 * draws it when the door starts (ctop.e:1109) and `writeOutput` draws it
 * again under the sysop's `Conftop.header` drawing (ctop.e:1011-1014). Only
 * the second one clears the screen, and only when there is no drawing - which
 * is why a caller on this board sees the masthead, then a cleared screen with
 * the masthead again. The capture this door is tested against has exactly
 * that, so it is kept; changing it is the sysop's call, not the port's.
 */
export declare function renderWideScreen(screen: CtopScreen, art: {
    header: string[];
    tailer: string[];
}, columns?: number): string[];
//# sourceMappingURL=wide.d.ts.map
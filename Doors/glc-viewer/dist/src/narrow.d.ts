import type { GlcCall, GlcDayStats, GlcRecords } from './render';
/** A C64's screen, and the width every line here is built to. */
export declare const NARROW_WIDTH = 40;
/** The title bar, in forty columns rather than seventy-nine. */
export declare const NARROW_BANNER = "\u001B[1;44;33m    GLOBAL LASTCALLERS - REBEL/QTX   \u001B[0m";
/** The rule that opens and closes the table. */
export declare const NARROW_RULE: string;
/** Which columns the rows below are. */
export declare function narrowColumns(showLocation: boolean): string;
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
//# sourceMappingURL=narrow.d.ts.map
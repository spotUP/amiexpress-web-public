/**
 * The conference's top uploaders on forty columns.
 *
 * WHY THE DOOR DRAWS THIS ITSELF. The 68K `ctop` was served to a C64 through
 * the board's frame adapter (`C64_ADAPT=40`, `C64_DROP_LAST=1`), which takes
 * an eighty-column screen apart row by row and does what it can. It cannot do
 * much with this one: the table IS its columns, and a rule of seventy-seven
 * equals signs has no forty-column meaning. The sysop asked for the same
 * treatment GL got when it was ported - "add a proper c64 view to conftop"
 * (2026-09-22) - and a TypeScript door's output never crosses the adapter's
 * seam anyway (`ADAPTED_DOOR_TYPES` is the 68K wire).
 *
 * WHAT IS DROPPED, and why it is a choice rather than a truncation. Eighty
 * columns carry rank, handle, location, files and bytes. Forty carry rank,
 * handle, files and bytes: the LOCATION goes, because it is the widest field
 * on the wide screen (twenty-four columns) and the one a caller reads last -
 * he is here to see who is at the top and by how much. Nothing is squeezed
 * into three characters to keep it.
 *
 * WIDTH. Every row is built to at most thirty-nine columns. Forty would be
 * legal - the PETSCII transducer holds a pending wrap - but the board writes
 * its own prompt after the door, and a row that fills the last cell puts that
 * prompt on a line of its own.
 */
import { type CtopUploader } from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import { type CtopScreen } from './wide';
/** A C64's screen. */
export declare const NARROW_WIDTH = 40;
export declare const C64_ROWS = 25;
/**
 * The chrome above and below the list: title, conference, rule, column
 * heads, rule, totals, last period, record. Eight rows, and the board adds
 * a blank line and its own `(Pause)` prompt under them.
 */
export declare const NARROW_CHROME_ROWS = 8;
export declare const BOARD_PAUSE_ROWS = 2;
/**
 * How many uploaders fit under the chrome on a C64's screen.
 *
 * The sysop's `ROWS=` is one number for both widths and twelve of them do not
 * fit beside forty-column chrome and the board's own pause - the title
 * scrolls away before the caller reads it. So the narrow list sizes itself
 * and takes the sysop's number only when it is smaller.
 */
export declare function narrowListRows(rows: number, screenRows?: number): number;
/**
 * A value cut to `width`, saying so when it was cut.
 *
 * Three ASCII dots, not an ellipsis: this wire is latin-1 and U+2026 is
 * neither latin-1 nor PETSCII. A silent cut is a lie at this width - `EALL`
 * and `EALL/HT` are two different uploaders.
 */
export declare function ellipsis(value: string, width: number): string;
/** The title bar, in forty columns rather than seventy-seven. */
export declare const NARROW_BANNER: string;
/** The rule that opens and closes the table. */
export declare const NARROW_RULE: string;
/**
 * Which conference this is, and where its period stands.
 *
 * The wide screen spends forty columns on the name and then counts the days
 * in a sentence. Forty columns have room for the name and a count, so the
 * sentence goes: `DAY 7/7` and `0 LEFT` say the same thing in ten.
 */
export declare function narrowConferenceLine(screen: CtopScreen): string;
/** Which columns the rows below are. */
export declare function narrowColumns(): string;
/** One uploader, in the columns a C64 has. */
export declare function narrowRow(rank: number, uploader: CtopUploader): string;
/** The line that says nobody has uploaded here. */
export declare const NARROW_NO_UPLOADERS = "\u001B[32m   NO UPLOADS IN THIS CONFERENCE";
/**
 * The totals and the two record holders, three lines instead of three wide
 * ones. `LAST` is the winner of the period that ended; `REC` is the board's
 * all-time record for this conference.
 */
export declare function narrowFooter(screen: CtopScreen): string[];
/**
 * The whole forty-column screen, in the order it goes out.
 *
 * `art` is the sysop's `Conftop.header_C64`/`Conftop.tailer_C64` if he drew
 * one. An EIGHTY-column drawing is not folded onto this screen - it is left
 * out whole, which is the board's own rule for art at this width: a drawing
 * cut down the middle is worse than no drawing, and the caller still gets the
 * table it was framing.
 */
export declare function renderNarrowScreen(screen: CtopScreen, art?: {
    header: string[];
    tailer: string[];
}, screenRows?: number): string[];
//# sourceMappingURL=narrow.d.ts.map
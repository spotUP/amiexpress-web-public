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
import {
  formatCtopBytes,
  type CtopUploader,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import { leftField, printableWidth, rightField } from '@amiexpress/bbs-door-sdk/formats/estringf';

import { shortDate, type CtopScreen } from './wide';

/** A C64's screen. */
export const NARROW_WIDTH = 40;
export const C64_ROWS = 25;

/*
 * The pens, kept as the wide screen's are so the two read as one door: green
 * for the frame and the ranks, yellow for names, magenta for totals, cyan for
 * the labels. Sixteen VIC-II colours, nearest match, no backgrounds.
 */
const RANK_PEN = '\x1b[32m';
const NAME_PEN = '\x1b[33m';
const COUNT_PEN = '\x1b[36m';
const BYTES_PEN = '\x1b[37m';
const RULE_PEN = '\x1b[34m';
const HEAD_PEN = '\x1b[35m';
const TITLE_PEN = '\x1b[1;44;33m';
const RESET = '\x1b[0m';

/**
 * `RR NAME(17) FILES(3) BYTES(13)` - 2+1+17+1+3+1+13 = 38, one inside the
 * thirty-nine a row may use. Thirteen columns of bytes hold `2,020,282,473`,
 * which is this board's own record and the reason the field is not smaller.
 */
const RANK_COLUMNS = 2;
const NAME_COLUMNS = 17;
const FILES_COLUMNS = 3;
const BYTES_COLUMNS = 13;

/**
 * The chrome above and below the list: title, conference, rule, column
 * heads, rule, totals, last period, record. Eight rows, and the board adds
 * a blank line and its own `(Pause)` prompt under them.
 */
export const NARROW_CHROME_ROWS = 8;
export const BOARD_PAUSE_ROWS = 2;

/**
 * How many uploaders fit under the chrome on a C64's screen.
 *
 * The sysop's `ROWS=` is one number for both widths and twelve of them do not
 * fit beside forty-column chrome and the board's own pause - the title
 * scrolls away before the caller reads it. So the narrow list sizes itself
 * and takes the sysop's number only when it is smaller.
 */
export function narrowListRows(rows: number, screenRows = C64_ROWS): number {
  const spare = screenRows - NARROW_CHROME_ROWS - BOARD_PAUSE_ROWS;
  return Math.max(1, Math.min(rows, spare));
}

/**
 * A value cut to `width`, saying so when it was cut.
 *
 * Three ASCII dots, not an ellipsis: this wire is latin-1 and U+2026 is
 * neither latin-1 nor PETSCII. A silent cut is a lie at this width - `EALL`
 * and `EALL/HT` are two different uploaders.
 */
export function ellipsis(value: string, width: number): string {
  const trimmed = value.trim();
  if (trimmed.length <= width) return leftField(trimmed, width);
  if (width <= 3) return trimmed.slice(0, width);
  return trimmed.slice(0, width - 3) + '...';
}

/** The title bar, in forty columns rather than seventy-seven. */
export const NARROW_BANNER = `${TITLE_PEN}${leftField('  CONFERENCE TOP UPLOADERS', NARROW_WIDTH - 1)}${RESET}`;

/** The rule that opens and closes the table. */
export const NARROW_RULE = `${RULE_PEN}${'-'.repeat(NARROW_WIDTH - 1)}`;

/**
 * Which conference this is, and where its period stands.
 *
 * The wide screen spends forty columns on the name and then counts the days
 * in a sentence. Forty columns have room for the name and a count, so the
 * sentence goes: `DAY 7/7` and `0 LEFT` say the same thing in ten.
 */
export function narrowConferenceLine(screen: CtopScreen): string {
  const { header } = screen.period;
  const length = header.resetDate - header.startDate;
  const period = screen.showResetDate
    ? shortDate(header.resetDate).toUpperCase()
    : `DAY ${screen.today - header.startDate + 1}/${length} ${header.resetDate - screen.today - 1} LEFT`;
  return NAME_PEN + ellipsis(screen.conferenceName.toUpperCase(), 39 - period.length - 1)
    + ' ' + COUNT_PEN + period;
}

/** Which columns the rows below are. */
export function narrowColumns(): string {
  return HEAD_PEN + leftField('NO', RANK_COLUMNS)
    + ' ' + leftField('HANDLE', NAME_COLUMNS)
    + ' ' + rightField('FLS', FILES_COLUMNS)
    + ' ' + rightField('BYTES', BYTES_COLUMNS);
}

/** One uploader, in the columns a C64 has. */
export function narrowRow(rank: number, uploader: CtopUploader): string {
  return RANK_PEN + rightField(String(rank), RANK_COLUMNS)
    + ' ' + NAME_PEN + ellipsis(uploader.userName, NAME_COLUMNS)
    + ' ' + COUNT_PEN + rightField(String(uploader.files), FILES_COLUMNS)
    + ' ' + BYTES_PEN + rightField(formatCtopBytes(uploader.bytes), BYTES_COLUMNS);
}

/** The line that says nobody has uploaded here. */
export const NARROW_NO_UPLOADERS = `${RANK_PEN}   NO UPLOADS IN THIS CONFERENCE`;

/**
 * The totals and the two record holders, three lines instead of three wide
 * ones. `LAST` is the winner of the period that ended; `REC` is the board's
 * all-time record for this conference.
 */
export function narrowFooter(screen: CtopScreen): string[] {
  const { header, totalFiles, totalBytes } = screen.period;
  const winner = (label: string, name: string, bytes: bigint, files: number): string =>
    HEAD_PEN + leftField(label, 4)
      + NAME_PEN + ellipsis(name, 12)
      + ' ' + COUNT_PEN + rightField(String(files), 3)
      + ' ' + BYTES_PEN + rightField(formatCtopBytes(bytes), BYTES_COLUMNS);
  return [
    HEAD_PEN + leftField('TOT', 4)
      + COUNT_PEN + leftField('', 12)
      + ' ' + COUNT_PEN + rightField(String(totalFiles), 3)
      + ' ' + BYTES_PEN + rightField(formatCtopBytes(totalBytes), BYTES_COLUMNS),
    winner('LAST', header.periodUpName, header.periodUpBytes, header.periodUpFiles),
    winner('REC', header.topUpName, header.topUpBytes, header.topUpFiles),
  ];
}

/** A drawing drawn for this screen, or nothing at all. */
function fitsNarrow(art: readonly string[]): string[] {
  return art.every(row => printableWidth(row) < NARROW_WIDTH) ? [...art] : [];
}

/**
 * The whole forty-column screen, in the order it goes out.
 *
 * `art` is the sysop's `Conftop.header_C64`/`Conftop.tailer_C64` if he drew
 * one. An EIGHTY-column drawing is not folded onto this screen - it is left
 * out whole, which is the board's own rule for art at this width: a drawing
 * cut down the middle is worse than no drawing, and the caller still gets the
 * table it was framing.
 */
export function renderNarrowScreen(
  screen: CtopScreen,
  art: { header: string[]; tailer: string[] } = { header: [], tailer: [] },
  screenRows = C64_ROWS,
): string[] {
  const rows = narrowListRows(screen.rows, screenRows);
  const shown = screen.period.uploaders
    .filter(uploader => uploader.bytes > screen.minLimit)
    .slice(0, rows);

  const lines = [
    ...fitsNarrow(art.header),
    NARROW_BANNER,
    narrowConferenceLine(screen),
    NARROW_RULE,
    narrowColumns(),
    ...(shown.length > 0
      ? shown.map((uploader, index) => narrowRow(index + 1, uploader))
      : [NARROW_NO_UPLOADERS]),
    NARROW_RULE,
    ...narrowFooter(screen),
    ...fitsNarrow(art.tailer),
  ];
  return lines.map(line => (line.length > 0 ? line + RESET : line));
}

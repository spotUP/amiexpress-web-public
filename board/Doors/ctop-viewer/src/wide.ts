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
import {
  formatCtopBytes,
  fromAmigaDays,
  type CtopPeriod,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';
import { formatE, leftField, rightField } from '@amiexpress/bbs-door-sdk/formats/estringf';

/** The width of the table, and of the rules above and below it. */
export const WIDE_COLUMNS = 77;

const RESET = '\x1b[0m';
const CLEAR = '\x1b[2J\x1b[H';

const TITLE = 'Conference Top Uploaders (Conftop-II) Coded by REbEL/QTX';

/**
 * THE TABLE'S COLUMNS, and the one place their widths are written.
 *
 * The column heads and the rule under them used to be two frozen strings in
 * `ctop.e`, which is why a wider terminal never got a wider table there. Here
 * they are BUILT from these widths, and the eighty-column test proves the
 * build still spells the frozen strings exactly - so a caller at 80 sees what
 * he always saw, and a caller at 132 gets the extra columns where the door
 * was cutting names off.
 */
const RANK_WIDTH = 3;
const NAME_WIDTH = 23;
const LOCATION_WIDTH = 24;
const FILES_WIDTH = 5;
const BYTES_WIDTH = 18;

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
export function tableWidths(columns = 80): TableWidths {
  const surplus = Math.max(0, Math.floor(columns) - 80);
  const toLocation = Math.ceil(surplus * 0.6);
  const widths = {
    rank: RANK_WIDTH,
    name: NAME_WIDTH + (surplus - toLocation),
    location: LOCATION_WIDTH + toLocation,
    files: FILES_WIDTH,
    bytes: BYTES_WIDTH,
    total: 0,
  };
  widths.total = widths.rank + widths.name + widths.location + widths.files + widths.bytes + 4;
  return widths;
}

/** `===-====...` - one run of `=` per column, joined by the separator. */
export function ruleFor(widths: TableWidths): string {
  return [widths.rank, widths.name, widths.location, widths.files, widths.bytes]
    .map(width => '='.repeat(width))
    .join('-');
}

/** `No# Username (Handle) ... Uploaded Bytes`, trailing blanks trimmed. */
export function columnHeadsFor(widths: TableWidths): string {
  return [
    leftField('No#', widths.rank),
    leftField('Username (Handle)', widths.name),
    leftField('Location (Group)', widths.location),
    leftField('Files', widths.files),
    leftField('Uploaded Bytes', widths.bytes),
  ].join(' ').replace(/ +$/, '');
}

const CONFERENCE_DAY = '\x1b[32mConference: \x1b[33m\\l\\s[40]  \x1b[32mDay (\x1b[33m\\d/\\d - \\d days left\x1b[32m)\x1b[0m';
const CONFERENCE_RESET_DATE = '\x1b[32mConference: \x1b[33m\\l\\s[32]  \x1b[32mResetDate (\x1b[33m\\s 00:00:00\x1b[32m)\x1b[0m';
const CONFERENCE_FINAL = '\x1b[32mConference: \x1b[33m\\l\\s[38]  \x1b[32mDay (\x1b[33m\\d/\\d - Final Results\x1b[32m)\x1b[0m';
/**
 * One uploader. The pens and the separators are `ctop.e`'s (writeFile,
 * ctop.e:963); the widths come from `tableWidths`, and the rank field is the
 * rule's three columns spent as two digits and a full stop.
 */
function rowFor(
  widths: TableWidths,
  rank: number,
  name: string,
  location: string,
  files: number,
  bytes: string,
): string {
  return '\x1b[32m' + rightField(String(rank), widths.rank - 1) + '. '
    + '\x1b[0m' + leftField(name, widths.name) + ' '
    + '\x1b[33m' + leftField(location, widths.location) + ' '
    + '\x1b[32m' + rightField(String(files), widths.files) + ' '
    + '\x1b[0m' + rightField(bytes, widths.bytes);
}
const EMPTY_ROW = '\x1b[32m\\r\\d[2].';
const NO_UPLOADERS = '\x1b[32m\\r\\d[2].\x1b[0m            - NO UPLOADERS ARE AVAILABLE IN THIS CONFERENCE -';
const TOTALS = '\x1b[35mTotal Uploaded Files\x1b[36m: [ \x1b[0m\\r\\d[5] \x1b[36m]   \x1b[35mTotal Uploaded Bytes\x1b[36m: [ \x1b[0m\\r\\s[17] \x1b[36m]\x1b[0m';
const LAST_PERIOD = '\x1b[33mTop Uploader Last Period\x1b[32m:\x1b[0m \\l\\s[16] \x1b[33mBytes\x1b[32m:\x1b[0m \\r\\s[15] \x1b[33mFiles\x1b[32m: \x1b[0m\\r\\d[4]';
const RECORD = '\x1b[33mTop Uploader Record     \x1b[32m:\x1b[0m \\l\\s[16] \x1b[33mBytes\x1b[32m:\x1b[0m \\r\\s[15] \x1b[33mFiles\x1b[32m: \x1b[0m\\r\\d[4]';

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
export function banner(clear: boolean, width = WIDE_COLUMNS): string[] {
  return [
    (clear ? CLEAR : '') + `\x1b[4;33m${' '.repeat(width)}\x1b[0m`,
    `\x1b[4;33;44m${leftField(TITLE, width)}\x1b[0m`,
    '',
  ];
}

/**
 * `Mon Sep 21` - the day, the month and the date, which is all `formatDate`
 * keeps of a DOS date string (ctop.e:307-329).
 */
export function shortDate(amigaDay: number): string {
  const date = fromAmigaDays(amigaDay);
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][date.getUTCDay()];
  const month = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][date.getUTCMonth()];
  return `${day} ${month} ${String(date.getUTCDate()).padStart(2, '0')}`;
}

/**
 * The line that says which conference this is and where the period stands.
 *
 * `finalResult` is the bulletin written at the reset, where there are no days
 * left to count because the period has just ended.
 */
export function conferenceLine(screen: CtopScreen, finalResult = false): string {
  const { header } = screen.period;
  const length = header.resetDate - header.startDate;
  if (finalResult) {
    return formatE(CONFERENCE_FINAL, [screen.conferenceName, length, length]);
  }
  if (screen.showResetDate) {
    return formatE(CONFERENCE_RESET_DATE, [screen.conferenceName, shortDate(header.resetDate)]);
  }
  return formatE(CONFERENCE_DAY, [
    screen.conferenceName,
    screen.today - header.startDate + 1,
    length,
    header.resetDate - screen.today - 1,
  ]);
}

/**
 * The table's rows.
 *
 * An uploader under `MIN_LIMIT` is not drawn, and his SLOT is not drawn
 * either - ctop.e tests the limit inside the row loop and falls through to
 * the empty-slot branch, so a conference full of small uploads shows a short
 * table rather than a list of blank numbers. `SKIP_EMPTY_LINES` then decides
 * whether the unused slots are printed at all.
 */
export function tableRows(screen: CtopScreen, widths = tableWidths()): string[] {
  const lines: string[] = [];
  const { uploaders } = screen.period;

  for (let i = 0; i < screen.rows; i++) {
    const uploader = uploaders[i];
    if (uploader && uploader.bytes > screen.minLimit) {
      lines.push(rowFor(
        widths,
        i + 1,
        uploader.userName,
        uploader.location,
        uploader.files,
        formatCtopBytes(uploader.bytes),
      ));
      continue;
    }
    if (screen.skipEmpty) continue;
    // The "nobody has uploaded" notice sits halfway down the empty table.
    const middle = (screen.rows >> 1) - 1;
    lines.push(formatE(uploaders.length === 0 && i === middle ? NO_UPLOADERS : EMPTY_ROW, [i + 1]));
  }
  return lines;
}

/** The totals, and under them the two record holders. */
export function tableFooter(
  screen: CtopScreen,
  finalResult = false,
  widths = tableWidths(),
): string[] {
  const { header, totalFiles, totalBytes } = screen.period;
  const lines = ['', formatE(TOTALS, [totalFiles, formatCtopBytes(totalBytes)])];
  if (finalResult) return lines;
  lines.push(`\x1b[34m${ruleFor(widths)}`);
  lines.push(formatE(LAST_PERIOD, [
    header.periodUpName, formatCtopBytes(header.periodUpBytes), header.periodUpFiles,
  ]));
  lines.push(formatE(RECORD, [
    header.topUpName, formatCtopBytes(header.topUpBytes), header.topUpFiles,
  ]));
  return lines;
}

/** The table alone - what the bulletin file holds, and what the screen shows. */
export function renderWideTable(
  screen: CtopScreen,
  finalResult = false,
  columns = 80,
): string[] {
  const widths = tableWidths(columns);
  return [
    conferenceLine(screen, finalResult),
    '',
    `\x1b[35m${columnHeadsFor(widths)}`,
    `\x1b[34m${ruleFor(widths)}`,
    ...tableRows(screen, widths),
    ...tableFooter(screen, finalResult, widths),
  ];
}

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
export function renderWideScreen(
  screen: CtopScreen,
  art: { header: string[]; tailer: string[] },
  columns = 80,
): string[] {
  const width = tableWidths(columns).total;
  const lines = [
    ...banner(false, width),
    ...art.header,
    ...banner(art.header.length === 0, width),
    ...renderWideTable(screen, false, columns),
    ...art.tailer,
  ];
  /*
   * A BLANK LINE STAYS BLANK. `WriteStr` with an empty string writes the
   * newline and nothing else (AEDoorLibrary.writeStr), so the capture's empty
   * rows carry no reset - and a door that puts one there is one byte wider
   * than the screen it is replacing.
   */
  return lines.map(line => (line.length > 0 ? line + RESET : line));
}

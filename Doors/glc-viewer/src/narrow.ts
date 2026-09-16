/**
 * The last-callers list on forty columns.
 *
 * WHY THE DOOR DOES THIS ITSELF. The board has a frame adapter that narrows a
 * wide door's output, and this door cannot use it: `ADAPTED_DOOR_TYPES` is
 * `XIM, DD, SIM, FIM` - the 68K wire - and a TypeScript door's output never
 * crosses that seam (`door-min-columns.util.ts:233`). So a C64 caller reading
 * GLC has exactly two honest options: be refused, or be drawn for.
 *
 * The sysop asked for the second: "using our typescript port of global last
 * callers also lets us really finetune the rest of the ui for petscii"
 * (2026-09-16).
 *
 * WHAT IS DROPPED, and why it is a choice rather than a truncation. Eighty
 * columns carry username, BBS, date, time on, time off, action letters and
 * two transfer totals. Forty carry what a caller reads the list FOR - who
 * called, from where, and when - and the rest is left out rather than
 * squeezed into two characters each. The action letters keep their column
 * because they are the list's own shorthand and cost four.
 */
import { leftField, rightField } from './estringf';
import type { GlcCall, GlcDayStats, GlcRecords } from './render';

/** A C64's screen, and the width every line here is built to. */
export const NARROW_WIDTH = 40;

/*
 * The pens, kept as the wide screen's are so the two read as one door:
 * cyan names, green systems, white times, blue rules.
 */
const NAME_PEN = '\x1b[36m';
const SYSTEM_PEN = '\x1b[32m';
const TIME_PEN = '\x1b[37m';
const RULE_PEN = '\x1b[34m';
const TITLE_PEN = '\x1b[1;44;33m';
const STAT_PEN = '\x1b[35m';
const RESET = '\x1b[0m';

/** `NAME(13) SYSTEM(13) ACTS(4) TIME(5)` - 13+1+13+1+4+1+5 = 38, and two spare. */
const NAME_COLUMNS = 13;
const SYSTEM_COLUMNS = 13;
const ACTION_COLUMNS = 4;
const TIME_COLUMNS = 5;

/** The title bar, in forty columns rather than seventy-nine. */
export const NARROW_BANNER = `${TITLE_PEN}    GLOBAL LASTCALLERS - REBEL/QTX   ${RESET}`;

/** The rule that opens and closes the table. */
export const NARROW_RULE = `${RULE_PEN}${'-'.repeat(NARROW_WIDTH)}`;

/** Which columns the rows below are. */
export function narrowColumns(showLocation: boolean): string {
  return NAME_PEN + leftField('HANDLE', NAME_COLUMNS)
    + ' ' + leftField(showLocation ? 'FROM' : 'BBS', SYSTEM_COLUMNS)
    + ' ' + leftField('ACTS', ACTION_COLUMNS)
    + ' ' + rightField('ON', TIME_COLUMNS);
}

/** One caller, cut to the columns a C64 has. */
export function narrowRow(call: GlcCall, showLocation: boolean): string {
  const system = showLocation ? call.Location : call.Bbsname;
  return NAME_PEN + leftField(call.Username.trim(), NAME_COLUMNS)
    + ' ' + SYSTEM_PEN + leftField(system.trim(), SYSTEM_COLUMNS)
    + ' ' + TIME_PEN + leftField(call.Actions.trim(), ACTION_COLUMNS)
    + ' ' + rightField(call.Timeon.trim(), TIME_COLUMNS);
}

/**
 * The day totals, two lines instead of three.
 *
 * The all-time record row is dropped at this width: the two days are what
 * changes, and a C64 screen is twenty-five rows with a list already on it.
 */
export function narrowFooter(yesterday: GlcDayStats, records: GlcRecords): string[] {
  return [
    `${STAT_PEN}YESTERDAY ${TIME_PEN}${rightField(yesterday.calls.trim(), 4)}${STAT_PEN} CALLS`
      + `  TOP CPS ${TIME_PEN}${rightField(yesterday.topcps.trim(), 6)}`,
    `${STAT_PEN}MOST CALLED ${SYSTEM_PEN}${leftField(records.mostcalled.trim(), 16)}`
      + `${STAT_PEN} ${TIME_PEN}${rightField(records.calls.trim(), 4)}${RESET}`,
  ];
}

export interface NarrowScreen {
  logo: readonly string[];
  showLocation: boolean;
  screenClear: boolean;
  calls: readonly GlcCall[];
  yesterday: GlcDayStats;
  records: GlcRecords;
}

/** The whole screen, forty columns wide, in the order it goes out. */
export function renderNarrowScreen(screen: NarrowScreen): string[] {
  const lines: string[] = [];

  // The clear rides on the first drawn line, as the wide screen sends it.
  const head = screen.logo.length > 0 ? [...screen.logo] : [];
  if (head.length > 0) {
    head[0] = (screen.screenClear ? '\x0c' : '') + head[0];
    for (const line of head) lines.push(line);
  } else if (screen.screenClear) {
    lines.push('\x0c');
  }

  lines.push(NARROW_BANNER);
  lines.push(narrowColumns(screen.showLocation));
  lines.push(NARROW_RULE);
  for (const call of screen.calls) lines.push(narrowRow(call, screen.showLocation));
  lines.push(NARROW_RULE);
  for (const line of narrowFooter(screen.yesterday, screen.records)) lines.push(line);
  lines.push(`${NARROW_RULE}${RESET}`);

  return lines;
}

/** Printable columns of a line - CSI sequences take no space on screen. */
export function printableWidth(line: string): number {
  return line.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, '').replace(/\x0c/g, '').length;
}

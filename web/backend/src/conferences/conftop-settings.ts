/**
 * ConfTop's per-conference settings, which live in an Amiga icon.
 *
 * ConfTop ("Conference Top Uploaders" v2.3, Bobo/Mystic and Looby/Insane) is
 * a 68K door we do not build. Its only lever is tooltypes, and it reads them
 * from TWO icons: `Doors:Conftop.info` for anything that should apply to
 * every conference, and `<confdir>/Conftop.info` for one conference's own -
 * "you have one icon for global data in doors: and you have one icon in each
 * conference you want to run conftop in" (Conftop.Guide, "How to configurate
 * conftop"). This module owns the per-conference one, which is where every
 * setting a sysop actually changes lives.
 *
 * WHY IT IS IN THE ADMIN AT ALL. `ROWS=20` on a 25-row terminal cut the top
 * off the conference-join bulletin - rows 1 to 4 of the uploader list had
 * scrolled away before the caller saw them ("more screens are cutt off in the
 * bbs", the sysop, 2026-09-14). The fix was two tooltypes, and setting them
 * meant editing binary icons on the live volume by hand. A setting that can
 * only be changed that way is a setting that stays wrong.
 *
 * Nothing here CREATES an icon. Per the guide, creating one is how ConfTop is
 * installed into a conference, and installing a door is not what a settings
 * form does; a conference with no icon reports `present: false` and the form
 * says so.
 */
import * as fs from 'fs';
import * as path from 'path';
import { parseInfoFile, updateTooltype, removeTooltype, writeInfoFile } from '../utils/info-file.util';
import { conferenceDir } from './conference-paths';

/** The icon ConfTop reads for one conference. */
export const CONFTOP_ICON = 'Conftop.info';

/**
 * Rows ConfTop spends whatever `ROWS` says: the conference line, a blank, the
 * column heading, its rule, a blank and the totals. Measured off the board's
 * own output - `Conf5/Bulletins/conftop.txt` was 26 lines at `ROWS=20`.
 */
export const CONFTOP_CHROME_ROWS = 6;

/** What a caller's terminal shows without scrolling. */
export const SCREEN_ROWS = 25;

/**
 * Rows the conference JOIN prints after the bulletin - "Joining Conference",
 * the message stats and the pause (express.e:5079-5113). The bulletin cannot
 * have all 25 to itself, because this follows it on the same screen.
 */
export const JOIN_TAIL_ROWS = 6;

/** The most rows of uploaders that still leaves the join its own space. */
export const MAX_FITTING_ROWS = SCREEN_ROWS - JOIN_TAIL_ROWS - CONFTOP_CHROME_ROWS;

/** How tall ConfTop's output is at a given `ROWS`. */
export const conftopHeight = (rows: number): number => CONFTOP_CHROME_ROWS + rows;

/** Settings whose tooltype carries a value. */
const SCALARS = {
  /** How many uploaders to list. The one that caused the cut-off screens. */
  rows: 'ROWS',
  /** `WEEKLY`, or a number of days, and the tooltype that installs ConfTop. */
  days: 'DAYS',
  /** Who gets the results message when the period resets. */
  mailUser: 'MAILUSER',
  /** Where the generated bulletin is written. */
  bullFile: 'BULLFILE',
  /** Only uploaders above this many bytes are listed. */
  minLimit: 'MIN_LIMIT',
} as const;

/**
 * Settings whose PRESENCE is the value. ConfTop reads them with
 * FindToolType, so a bare `SKIP_EMPTY_LINES` is the on state and the absence
 * of the line is the off state - there is no `=0`.
 */
const FLAGS = {
  /**
   * Without it an empty conference prints twenty numbered blank slots, which
   * is most of a screen saying nothing.
   */
  skipEmptyLines: 'SKIP_EMPTY_LINES',
  /** Print the date the current period resets. */
  showResetDate: 'SHOW_RESETDATE',
} as const;

export interface ConftopSettings {
  /** False when this conference has no ConfTop icon: it does not run it. */
  present: boolean;
  rows: number | null;
  days: string | null;
  mailUser: string | null;
  bullFile: string | null;
  minLimit: number | null;
  skipEmptyLines: boolean;
  showResetDate: boolean;
  /** `CONFTOP_CHROME_ROWS + rows`, so the form can say what it costs. */
  height: number | null;
  /** Does that height leave the conference join room on the same screen. */
  fits: boolean;
}

export type ConftopUpdates = Partial<Omit<ConftopSettings, 'present' | 'height' | 'fits'>>;

/** The icon for one conference, via its LOCATION - never a built `Conf<n>`. */
export function conftopIconPath(bbsRoot: string, conferenceNumber: number): string {
  return path.join(conferenceDir(bbsRoot, conferenceNumber), CONFTOP_ICON);
}

/** A tooltype's value, or null when the icon does not carry the key. */
function valueOf(tooltypes: Array<{ key: string; value: string; commented: boolean }>, key: string): string | null {
  const found = tooltypes.find(tt => tt.key === key && !tt.commented);
  return found ? found.value : null;
}

/** Present and uncommented - which is what FindToolType answers. */
function flagOf(tooltypes: Array<{ key: string; value: string; commented: boolean }>, key: string): boolean {
  return tooltypes.some(tt => tt.key === key && !tt.commented);
}

export function readConftopSettings(bbsRoot: string, conferenceNumber: number): ConftopSettings {
  const file = conftopIconPath(bbsRoot, conferenceNumber);
  const absent: ConftopSettings = {
    present: false, rows: null, days: null, mailUser: null, bullFile: null,
    minLimit: null, skipEmptyLines: false, showResetDate: false, height: null, fits: true,
  };
  if (!fs.existsSync(file)) return absent;

  const info = parseInfoFile(file);
  const tooltypes = info.tooltypes;

  const rowsRaw = valueOf(tooltypes, SCALARS.rows);
  const rows = rowsRaw !== null && /^\d+$/.test(rowsRaw) ? Number(rowsRaw) : null;
  const minRaw = valueOf(tooltypes, SCALARS.minLimit);

  return {
    present: true,
    rows,
    days: valueOf(tooltypes, SCALARS.days),
    mailUser: valueOf(tooltypes, SCALARS.mailUser),
    bullFile: valueOf(tooltypes, SCALARS.bullFile),
    minLimit: minRaw !== null && /^\d+$/.test(minRaw) ? Number(minRaw) : null,
    skipEmptyLines: flagOf(tooltypes, FLAGS.skipEmptyLines),
    showResetDate: flagOf(tooltypes, FLAGS.showResetDate),
    height: rows === null ? null : conftopHeight(rows),
    fits: rows === null ? true : conftopHeight(rows) <= SCREEN_ROWS - JOIN_TAIL_ROWS,
  };
}

/**
 * Write the settings a sysop changed, and ONLY those.
 *
 * Every other tooltype in the icon is left exactly as it was - this door has
 * settings we do not model (SHARE_DATA, EXCLUDE_n, PLAYPEN_n, CONFNAME) and a
 * form that dropped them would break a board to change one number.
 */
export function writeConftopSettings(
  bbsRoot: string,
  conferenceNumber: number,
  updates: ConftopUpdates,
): ConftopSettings {
  const file = conftopIconPath(bbsRoot, conferenceNumber);
  if (!fs.existsSync(file)) {
    // Creating this icon is how ConfTop is INSTALLED into a conference
    // (Conftop.Guide). A settings form does not install doors.
    throw new Error(
      `Conference ${conferenceNumber} does not run ConfTop: there is no ${CONFTOP_ICON} in its directory.`,
    );
  }

  if (updates.rows !== undefined && updates.rows !== null) {
    if (!Number.isInteger(updates.rows) || updates.rows < 1) {
      throw new Error('Rows must be a whole number of at least 1.');
    }
    if (conftopHeight(updates.rows) > SCREEN_ROWS - JOIN_TAIL_ROWS) {
      throw new Error(
        `Rows=${updates.rows} prints ${conftopHeight(updates.rows)} lines. `
        + `A caller has ${SCREEN_ROWS}, and the conference join needs ${JOIN_TAIL_ROWS} of them `
        + `after the bulletin, so the most that fits is ${MAX_FITTING_ROWS}.`,
      );
    }
  }

  let info = parseInfoFile(file);

  for (const [field, key] of Object.entries(SCALARS) as Array<[keyof typeof SCALARS, string]>) {
    const next = updates[field as keyof ConftopUpdates];
    if (next === undefined) continue;
    info = next === null || next === ''
      ? removeTooltype(info, key)
      : updateTooltype(info, key, String(next), false);
  }

  for (const [field, key] of Object.entries(FLAGS) as Array<[keyof typeof FLAGS, string]>) {
    const next = updates[field as keyof ConftopUpdates];
    if (next === undefined) continue;
    // A flag is its own presence: written bare, removed rather than set off.
    info = next ? updateTooltype(info, key, '', false) : removeTooltype(info, key);
  }

  writeInfoFile(info);
  return readConftopSettings(bbsRoot, conferenceNumber);
}

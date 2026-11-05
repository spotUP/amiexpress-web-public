/**
 * What the sysop told this door to do, read where he wrote it.
 *
 * Conftop-II is configured through icon tooltypes and reads THREE files in
 * order, each overriding the last (ctop.e:1101-1105):
 *
 *   PROGDIR:conftop.info        the door's own defaults
 *   BBS:Doors/conftop.info      the board's, for every conference
 *   <conference>/Conftop.info   this conference's
 *
 * and the conference's file is also the INSTALL SWITCH: when it is missing
 * the door says "Conference Top Uploaders is not installed in this
 * conference" and does nothing at all (ctop.e:1136). That is how a sysop
 * turns the table off for a conference, so it is kept exactly.
 *
 * The tooltypes come through the board rather than being parsed here, because
 * `(ROWS=12)` and `!ROWS=12` are how an Amiga sysop switches a setting OFF
 * and a door that scans for `ROWS=` reads them as on.
 */
import { parseCtopSchedule, type CtopSchedule } from '@amiexpress/bbs-door-sdk/formats/ctop-data';

export interface CtopSettings {
  /** False when this conference has no `Conftop.info` - the door is off here. */
  installed: boolean;
  /** How long a period lasts (`DAYS`). */
  schedule: CtopSchedule;
  /** How many table rows to draw (`ROWS`, default 10). */
  rows: number;
  /** Who gets the results by mail at each reset (`MAILUSER`), or ''. */
  mailUser: string;
  /** Where the results are written as a bulletin (`BULLFILE`), or ''. */
  bullFile: string;
  /** The subject of that mail (`SUBJECT`). */
  subject: string;
  /** The name of the data file (`DATAFILE`, default `ctop.data`). */
  dataFile: string;
  /** `MIN_LIMIT` - an uploader under this many bytes is not listed. */
  minLimit: bigint;
  /** `SKIP_EMPTY_LINES` - draw a short table instead of padding it. */
  skipEmpty: boolean;
  /** `SHOW_RESETDATE` - name the day the period ends instead of counting. */
  showResetDate: boolean;
  /** `CONFNAME` - what to call the conference, when the sysop overrides it. */
  conferenceName: string;
}

export const CTOP_DEFAULTS: CtopSettings = {
  installed: false,
  schedule: { kind: 'weekly' },
  rows: 10,
  mailUser: '',
  bullFile: '',
  subject: 'Results from Conftop!',
  dataFile: 'ctop.data',
  minLimit: 0n,
  skipEmpty: false,
  showResetDate: false,
  conferenceName: '',
};

/** One icon's worth of settings, folded onto what is already known. */
export function applyTooltypes(
  settings: CtopSettings,
  tooltypes: Record<string, string>,
): CtopSettings {
  const next = { ...settings };
  if ('DAYS' in tooltypes) next.schedule = parseCtopSchedule(tooltypes.DAYS);
  if ('ROWS' in tooltypes) {
    const rows = parseInt(tooltypes.ROWS, 10);
    next.rows = Number.isFinite(rows) && rows >= 1 ? rows : 10;
  }
  if ('MAILUSER' in tooltypes) next.mailUser = tooltypes.MAILUSER;
  if ('BULLFILE' in tooltypes) next.bullFile = tooltypes.BULLFILE;
  if ('SUBJECT' in tooltypes) next.subject = tooltypes.SUBJECT;
  if ('DATAFILE' in tooltypes) next.dataFile = tooltypes.DATAFILE;
  if ('CONFNAME' in tooltypes) next.conferenceName = tooltypes.CONFNAME;
  if ('MIN_LIMIT' in tooltypes) {
    const limit = parseInt(tooltypes.MIN_LIMIT, 10);
    next.minLimit = Number.isFinite(limit) && limit >= 1 ? BigInt(limit) : 0n;
  }
  if ('SKIP_EMPTY_LINES' in tooltypes) next.skipEmpty = true;
  if ('SHOW_RESETDATE' in tooltypes) next.showResetDate = true;
  return next;
}

/**
 * The three icons, in the order the Amiga door reads them.
 *
 * `read` is the board's tooltype reader; it answers `null` for a file that is
 * not there, which is what decides whether the door is installed here.
 */
export function loadCtopSettings(
  read: (relativePath: string) => Record<string, string> | null,
  conferenceRelativePath: string,
): CtopSettings {
  let settings = { ...CTOP_DEFAULTS };
  for (const candidate of ['Doors/ctop-viewer/conftop.info', 'Doors/conftop.info']) {
    const tooltypes = read(candidate);
    if (tooltypes) settings = applyTooltypes(settings, tooltypes);
  }
  const conference = read(`${conferenceRelativePath}/Conftop.info`);
  if (conference) {
    settings = applyTooltypes(settings, conference);
    settings.installed = true;
  }
  return settings;
}

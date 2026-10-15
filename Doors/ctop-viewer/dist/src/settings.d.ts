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
import { type CtopSchedule } from '@amiexpress/bbs-door-sdk/formats/ctop-data';
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
export declare const CTOP_DEFAULTS: CtopSettings;
/** One icon's worth of settings, folded onto what is already known. */
export declare function applyTooltypes(settings: CtopSettings, tooltypes: Record<string, string>): CtopSettings;
/**
 * The three icons, in the order the Amiga door reads them.
 *
 * `read` is the board's tooltype reader; it answers `null` for a file that is
 * not there, which is what decides whether the door is installed here.
 */
export declare function loadCtopSettings(read: (relativePath: string) => Record<string, string> | null, conferenceRelativePath: string): CtopSettings;
//# sourceMappingURL=settings.d.ts.map
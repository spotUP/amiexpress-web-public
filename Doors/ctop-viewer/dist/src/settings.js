"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.CTOP_DEFAULTS = void 0;
exports.applyTooltypes = applyTooltypes;
exports.loadCtopSettings = loadCtopSettings;
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
const ctop_data_1 = require("@amiexpress/bbs-door-sdk/formats/ctop-data");
exports.CTOP_DEFAULTS = {
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
function applyTooltypes(settings, tooltypes) {
    const next = { ...settings };
    if ('DAYS' in tooltypes)
        next.schedule = (0, ctop_data_1.parseCtopSchedule)(tooltypes.DAYS);
    if ('ROWS' in tooltypes) {
        const rows = parseInt(tooltypes.ROWS, 10);
        next.rows = Number.isFinite(rows) && rows >= 1 ? rows : 10;
    }
    if ('MAILUSER' in tooltypes)
        next.mailUser = tooltypes.MAILUSER;
    if ('BULLFILE' in tooltypes)
        next.bullFile = tooltypes.BULLFILE;
    if ('SUBJECT' in tooltypes)
        next.subject = tooltypes.SUBJECT;
    if ('DATAFILE' in tooltypes)
        next.dataFile = tooltypes.DATAFILE;
    if ('CONFNAME' in tooltypes)
        next.conferenceName = tooltypes.CONFNAME;
    if ('MIN_LIMIT' in tooltypes) {
        const limit = parseInt(tooltypes.MIN_LIMIT, 10);
        next.minLimit = Number.isFinite(limit) && limit >= 1 ? BigInt(limit) : 0n;
    }
    if ('SKIP_EMPTY_LINES' in tooltypes)
        next.skipEmpty = true;
    if ('SHOW_RESETDATE' in tooltypes)
        next.showResetDate = true;
    return next;
}
/**
 * The three icons, in the order the Amiga door reads them.
 *
 * `read` is the board's tooltype reader; it answers `null` for a file that is
 * not there, which is what decides whether the door is installed here.
 */
function loadCtopSettings(read, conferenceRelativePath) {
    let settings = { ...exports.CTOP_DEFAULTS };
    for (const candidate of ['Doors/ctop-viewer/conftop.info', 'Doors/conftop.info']) {
        const tooltypes = read(candidate);
        if (tooltypes)
            settings = applyTooltypes(settings, tooltypes);
    }
    const conference = read(`${conferenceRelativePath}/Conftop.info`);
    if (conference) {
        settings = applyTooltypes(settings, conference);
        settings.installed = true;
    }
    return settings;
}
//# sourceMappingURL=settings.js.map
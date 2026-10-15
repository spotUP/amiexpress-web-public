"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.readCtopFile = readCtopFile;
exports.importLegacyRecord = importLegacyRecord;
exports.resetIsDue = resetIsDue;
exports.performReset = performReset;
/**
 * The end of a period: who won it, who holds the record, and a clean slate.
 *
 * THIS IS WHY THE PORT COULD NOT BE DISPLAY-ONLY. Nothing else on this board
 * rolls a conference's period. The upload path appends records
 * (`ctop-updater.util.ts`) and the door does everything else, so a CTOP that
 * only drew the table would leave every conference in the week it was in when
 * the 68K binary was retired - the same winner on the screen for ever.
 *
 * WHAT A RESET DOES, in `ctop.e`'s order (doDbReset, 483-577):
 *
 *   1. read the period that just ended out of the data file
 *   2. its top uploader becomes "Top Uploader Last Period"
 *   3. and, if he beat it, "Top Uploader Record" as well
 *   4. mail the final table to `MAILUSER`, write it to `BULLFILE`
 *   5. work out the next period's dates, skipping any that have gone by
 *   6. write the header back - WITHOUT the records, which is the reset
 *
 * The door does this when a caller opens it and the reset date has come, so
 * on a quiet board the roll happens late rather than never. That is the
 * Amiga's own behaviour and callers are used to seeing "Resetting Conference
 * Top Uploaders..." on the way in.
 */
const fs = __importStar(require("fs"));
const path = __importStar(require("path"));
const ctop_data_1 = require("@amiexpress/bbs-door-sdk/formats/ctop-data");
/** Where the old Conftop I kept its record holder, for the one-time import. */
const LEGACY_RECORD_OFFSET = 214;
const LEGACY_FILE = 'conftop.data';
/** The data file, or an empty period when there is not one yet. */
function readCtopFile(dataPath) {
    try {
        return (0, ctop_data_1.decodeCtopFile)(fs.readFileSync(dataPath));
    }
    catch {
        return null;
    }
}
/**
 * Conftop I's record holder, imported once when a conference's file is
 * created (ctop.e:490-506).
 *
 * The old file kept the name at byte 214 and the totals straight after it,
 * with the byte count as a plain long rather than packed decimal. A board
 * that never ran Conftop I has no such file and keeps `NONE`.
 */
function importLegacyRecord(conferenceDir) {
    try {
        const buf = fs.readFileSync(path.join(conferenceDir, LEGACY_FILE));
        if (buf.length < LEGACY_RECORD_OFFSET + 48)
            return null;
        const name = buf.subarray(LEGACY_RECORD_OFFSET, LEGACY_RECORD_OFFSET + 40);
        const end = name.indexOf(0);
        return {
            topUpName: name.subarray(0, end === -1 ? name.length : end).toString('latin1'),
            topUpBytes: BigInt(buf.readInt32BE(LEGACY_RECORD_OFFSET + 40)),
            topUpFiles: buf.readInt32BE(LEGACY_RECORD_OFFSET + 44),
        };
    }
    catch {
        return null;
    }
}
/** Has the period this file describes come to an end? */
function resetIsDue(dataPath, today = (0, ctop_data_1.toAmigaDays)(new Date())) {
    const buf = (() => {
        try {
            return fs.readFileSync(dataPath);
        }
        catch {
            return null;
        }
    })();
    // No file at all is "due": the conference has never had a period, and the
    // reset is what creates one.
    if (!buf || buf.length < 4)
        return true;
    return today >= buf.readInt32BE(0);
}
/**
 * Roll the period, and write the new header back.
 *
 * The records are DROPPED, which is the reset: the Amiga reopens the file
 * with `MODE_NEWFILE` and writes ninety-six bytes into it (ctop.e:565-576).
 */
function performReset(conferenceDir, dataFile, schedule, today = (0, ctop_data_1.toAmigaDays)(new Date())) {
    const dataPath = path.join(conferenceDir, dataFile);
    const existing = readCtopFile(dataPath);
    const created = existing === null;
    const header = existing
        ? { ...existing.header }
        : {
            resetDate: 0, startDate: 0,
            topUpName: 'NONE', topUpBytes: 0n, topUpFiles: 0,
            periodUpName: 'NONE', periodUpBytes: 0n, periodUpFiles: 0,
            ...(importLegacyRecord(conferenceDir) ?? {}),
        };
    const ended = existing ?? (0, ctop_data_1.aggregateCtop)(header, []);
    const winner = ended.uploaders[0];
    let newRecord = false;
    if (winner) {
        header.periodUpName = winner.userName;
        header.periodUpFiles = winner.files;
        header.periodUpBytes = winner.bytes;
        if (winner.bytes > header.topUpBytes) {
            header.topUpName = winner.userName;
            header.topUpFiles = winner.files;
            header.topUpBytes = winner.bytes;
            newRecord = true;
        }
    }
    else {
        header.periodUpName = 'NONE';
        header.periodUpFiles = 0;
        header.periodUpBytes = 0n;
    }
    const dates = existing
        ? (0, ctop_data_1.rollCtopPeriod)(existing.header.resetDate, today, schedule)
        : (0, ctop_data_1.firstCtopPeriod)(today, schedule);
    header.resetDate = dates.resetDate;
    header.startDate = dates.startDate;
    fs.writeFileSync(dataPath, (0, ctop_data_1.encodeCtopHeader)(header));
    return { header, ended, newRecord, created };
}
//# sourceMappingURL=reset.js.map
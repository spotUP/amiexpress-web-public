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
import * as fs from 'fs';
import * as path from 'path';

import {
  aggregateCtop,
  decodeCtopFile,
  encodeCtopHeader,
  firstCtopPeriod,
  rollCtopPeriod,
  toAmigaDays,
  type CtopHeader,
  type CtopPeriod,
  type CtopSchedule,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';

/** Where the old Conftop I kept its record holder, for the one-time import. */
const LEGACY_RECORD_OFFSET = 214;
const LEGACY_FILE = 'conftop.data';

export interface ResetOutcome {
  /** The header written back, whether or not anything else changed. */
  header: CtopHeader;
  /** The period that just ended - what the mail and the bulletin describe. */
  ended: CtopPeriod;
  /** True when the record holder changed hands. */
  newRecord: boolean;
  /** True when the file did not exist and this call created it. */
  created: boolean;
}

/** The data file, or an empty period when there is not one yet. */
export function readCtopFile(dataPath: string): CtopPeriod | null {
  try {
    return decodeCtopFile(fs.readFileSync(dataPath));
  } catch {
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
export function importLegacyRecord(conferenceDir: string): Pick<CtopHeader, 'topUpName' | 'topUpBytes' | 'topUpFiles'> | null {
  try {
    const buf = fs.readFileSync(path.join(conferenceDir, LEGACY_FILE));
    if (buf.length < LEGACY_RECORD_OFFSET + 48) return null;
    const name = buf.subarray(LEGACY_RECORD_OFFSET, LEGACY_RECORD_OFFSET + 40);
    const end = name.indexOf(0);
    return {
      topUpName: name.subarray(0, end === -1 ? name.length : end).toString('latin1'),
      topUpBytes: BigInt(buf.readInt32BE(LEGACY_RECORD_OFFSET + 40)),
      topUpFiles: buf.readInt32BE(LEGACY_RECORD_OFFSET + 44),
    };
  } catch {
    return null;
  }
}

/** Has the period this file describes come to an end? */
export function resetIsDue(dataPath: string, today = toAmigaDays(new Date())): boolean {
  const buf = ((): Buffer | null => {
    try { return fs.readFileSync(dataPath); } catch { return null; }
  })();
  // No file at all is "due": the conference has never had a period, and the
  // reset is what creates one.
  if (!buf || buf.length < 4) return true;
  return today >= buf.readInt32BE(0);
}

/**
 * Roll the period, and write the new header back.
 *
 * The records are DROPPED, which is the reset: the Amiga reopens the file
 * with `MODE_NEWFILE` and writes ninety-six bytes into it (ctop.e:565-576).
 */
export function performReset(
  conferenceDir: string,
  dataFile: string,
  schedule: CtopSchedule,
  today = toAmigaDays(new Date()),
): ResetOutcome {
  const dataPath = path.join(conferenceDir, dataFile);
  const existing = readCtopFile(dataPath);
  const created = existing === null;

  const header: CtopHeader = existing
    ? { ...existing.header }
    : {
      resetDate: 0, startDate: 0,
      topUpName: 'NONE', topUpBytes: 0n, topUpFiles: 0,
      periodUpName: 'NONE', periodUpBytes: 0n, periodUpFiles: 0,
      ...(importLegacyRecord(conferenceDir) ?? {}),
    };

  const ended = existing ?? aggregateCtop(header, []);
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
  } else {
    header.periodUpName = 'NONE';
    header.periodUpFiles = 0;
    header.periodUpBytes = 0n;
  }

  const dates = existing
    ? rollCtopPeriod(existing.header.resetDate, today, schedule)
    : firstCtopPeriod(today, schedule);
  header.resetDate = dates.resetDate;
  header.startDate = dates.startDate;

  fs.writeFileSync(dataPath, encodeCtopHeader(header));
  return { header, ended, newRecord, created };
}

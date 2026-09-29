/**
 * The uploader's tagline, as the board's EXAMINE door keeps it - for an upload
 * that cannot run the door.
 *
 * A DELIBERATE DEVIATION from express.e, asked for by the sysop (2026-09-30:
 * "improve it so it gets sent by lines as well it's ok to deviate here").
 * express.e runs EXAMINE for an FTP upload too (doBackgroundCheck), with no one
 * at the keyboard: every prompt File Description shows waits out its 300 s
 * door timeout, and the upload most likely ends with no description at all.
 * So FTP keeps the built-in FILE_ID reader, and the line the door would have
 * added - the uploader's tagline, set with SENT - is read from the door's own
 * data file and appended here.
 *
 * File Description 1.1's `FileDescription.Tagdata`, beside its binary: one
 * 102-byte record per user slot (record = slot - 1). Bytes 0-69 hold the
 * tagline, NUL-terminated; byte 81 is "Use Tagline" - 0 No, 1 Yes, 2 Ask.
 * Measured on the live board: the sysop's record (slot 23) is record 22 with
 * his tagline and Use Tagline = 1, matching his SENT screen.
 */
import * as path from 'path';

import * as amigafs from '../utils/amigafs';

export const TAGDATA_RECORD_BYTES = 102;
const TAGLINE_BYTES = 70;
const USE_TAGLINE_AT = 81;

/** The EXAMINE door's LOCATION, as a path on this board, or null. */
function examineDoorPath(dataDir: string): string | null {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { commandCache } = require('../handlers/command-execution.handler');
  const location: string | undefined = commandCache.syscmd.get('EXAMINE')?.location;
  if (!location) return null;
  // `DOORS:FileDescription/FileDescription.x`: the volume is a directory of the
  // board, found in any case below.
  const relative = location.replace(':', '/').replace(/\\/g, '/');
  return amigafs.resolvePath(path.join(dataDir, relative));
}

/**
 * The tagline for a user slot, or null when there is none to add: no EXAMINE
 * door, no tag data beside it, no record for the slot, an empty tagline, or
 * the uploader set Use Tagline to No. "Ask" adds it - an FTP upload has no one
 * to ask, and the caller chose to have a tagline.
 */
export function examineTaglineFor(dataDir: string, slotNumber: number | undefined): string | null {
  if (!slotNumber || slotNumber < 1) return null;
  const binary = examineDoorPath(dataDir);
  if (!binary) return null;
  const stem = path.basename(binary).split('.')[0];
  const tagdata = amigafs.findCaseInsensitive(path.dirname(binary), `${stem}.Tagdata`);
  if (!tagdata) return null;

  let bytes: Buffer;
  try {
    bytes = amigafs.readFileSync(tagdata) as Buffer;
  } catch {
    return null;
  }
  const at = (slotNumber - 1) * TAGDATA_RECORD_BYTES;
  if (at + TAGDATA_RECORD_BYTES > bytes.length) return null;
  const record = bytes.subarray(at, at + TAGDATA_RECORD_BYTES);
  if (record[USE_TAGLINE_AT] === 0) return null;
  const end = record.indexOf(0);
  const text = record.subarray(0, end >= 0 && end < TAGLINE_BYTES ? end : TAGLINE_BYTES).toString('latin1').trimEnd();
  return text.length > 0 ? text : null;
}

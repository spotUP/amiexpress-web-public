/**
 * Conftop-II's `ctop.data`, written after an upload.
 *
 * On a real Amiga board express.e runs the door with the uploaded filename on
 * its command line and the door appends the record (`updateStats`,
 * ctop.e:604-632). Here the board does it directly, so that a caller who
 * never opens CTOP still counts.
 *
 * The LAYOUT is not here. It lives in `@amiexpress/bbs-door-sdk/formats/
 * ctop-data`, with the reader in the CTOP door, because a writer and a reader
 * holding their own copies of a 96-byte header is how a conference ends up
 * showing somebody else's name.
 */

import * as fs from 'fs/promises';
import * as path from 'path';

import {
  CTOP_HEADER_SIZE,
  encodeCtopHeader,
  encodeCtopRecord,
  firstCtopPeriod,
  parseCtopSchedule,
  toAmigaDays,
  type CtopSchedule,
} from '@amiexpress/bbs-door-sdk/formats/ctop-data';

export { CTOP_HEADER_SIZE, CTOP_RECORD_SIZE } from '@amiexpress/bbs-door-sdk/formats/ctop-data';

export function buildCtopRecord(username: string, location: string, fileSize: number): Buffer {
  return encodeCtopRecord({ userName: username, location, bytes: fileSize });
}

/**
 * The header a conference gets when its file is created here.
 *
 * `NONE` for both winners, and a first period that ends when the schedule
 * says - the door then rewrites this whole header at the first reset, so the
 * only thing that has to be right is the pair of dates.
 */
function buildHeader(schedule: CtopSchedule): Buffer {
  const { startDate, resetDate } = firstCtopPeriod(toAmigaDays(new Date()), schedule);
  return encodeCtopHeader({
    resetDate,
    startDate,
    topUpName: 'NONE',
    topUpBytes: 0n,
    topUpFiles: 0,
    periodUpName: 'NONE',
    periodUpBytes: 0n,
    periodUpFiles: 0,
  });
}

/**
 * Append one upload record to `<conferencePath>/ctop.data`.
 * Creates the file with the 96-byte header on first call.
 * Only call for non-duplicate active uploads (mirrors express.e behaviour).
 */
export async function appendCtopRecord(
  conferencePath: string,
  username: string,
  location: string,
  fileSize: number,
  schedule: string | CtopSchedule = 'WEEKLY'
): Promise<void> {
  const ctopPath = path.join(conferencePath, 'ctop.data');
  const record = buildCtopRecord(username, location, fileSize);

  let needsHeader = false;
  try {
    const stat = await fs.stat(ctopPath);
    needsHeader = stat.size < CTOP_HEADER_SIZE;
  } catch {
    needsHeader = true;
  }

  if (needsHeader) {
    const header = buildHeader(
      typeof schedule === 'string' ? parseCtopSchedule(schedule) : schedule
    );
    await fs.writeFile(ctopPath, Buffer.concat([header, record]));
    console.log(`[Conftop] Created ctop.data with first record in ${path.basename(conferencePath)}`);
  } else {
    await fs.appendFile(ctopPath, record);
    console.log(`[Conftop] Appended ctop record for ${username} in ${path.basename(conferencePath)}`);
  }
}

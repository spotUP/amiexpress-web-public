/**
 * Conftop-II ctop.data updater
 *
 * After each successful upload, Conftop-II expects a 66-byte record appended
 * to <confDir>/ctop.data. If the file does not yet exist we write the 96-byte
 * header first. This mirrors what the door's updateStats() procedure does when
 * called by express.e with the uploaded filename on the command line.
 *
 * ctop.data layout (from ctop.e source):
 *   Header (96 bytes):
 *     resetDate       Int32BE  4
 *     startDate       Int32BE  4
 *     topUpName       char[32] 32  (null-padded, default "NONE")
 *     topUpBytes      char[8]  8   (BCD, all zeros)
 *     topUpFiles      Int32BE  4
 *     periodUpName    char[32] 32  (null-padded, default "NONE")
 *     periodUpBytes   char[8]  8   (BCD, all zeros)
 *     periodUpFiles   Int32BE  4
 *   Records (66 bytes each):
 *     userName        char[32] 32
 *     userLocation    char[30] 30
 *     fsize           Int32BE  4
 */

import * as fs from 'fs/promises';
import * as path from 'path';

export const CTOP_HEADER_SIZE = 96;
export const CTOP_RECORD_SIZE = 66;

// Amiga epoch starts 1978-01-01; Unix epoch is 1970-01-01 → 2922 days apart.
const UNIX_TO_AMIGA_DAYS = 2922;

function toAmigaDays(date: Date): number {
  return Math.floor(date.getTime() / 86400000) - UNIX_TO_AMIGA_DAYS;
}

// Amiga Workbench dow(): 1 = Monday, …, 7 = Sunday.
function amigaDow(amigaDay: number): number {
  const v = amigaDay % 7;
  return v === 0 ? 7 : v;
}

function fillNullPadded(buf: Buffer, offset: number, str: string, len: number): void {
  buf.fill(0, offset, offset + len);
  const bytes = Buffer.from(str, 'latin1');
  bytes.copy(buf, offset, 0, Math.min(bytes.length, len));
}

function buildHeader(): Buffer {
  const today = toAmigaDays(new Date());
  // Advance to the next Monday for the weekly reset date (mirrors ctop.e DAYS=WEEKLY logic).
  let resetDate = today + 1;
  while (amigaDow(resetDate) !== 1) resetDate++;
  const startDate = resetDate - 7;

  const buf = Buffer.alloc(CTOP_HEADER_SIZE, 0);
  let off = 0;
  buf.writeInt32BE(resetDate, off); off += 4;
  buf.writeInt32BE(startDate, off); off += 4;
  fillNullPadded(buf, off, 'NONE', 32); off += 32;
  off += 8; // topUpBytes BCD — all zeros
  buf.writeInt32BE(0, off); off += 4;
  fillNullPadded(buf, off, 'NONE', 32); off += 32;
  off += 8; // periodUpBytes BCD — all zeros
  buf.writeInt32BE(0, off);
  return buf;
}

export function buildCtopRecord(username: string, location: string, fileSize: number): Buffer {
  const buf = Buffer.alloc(CTOP_RECORD_SIZE, 0);
  fillNullPadded(buf, 0, username, 32);
  fillNullPadded(buf, 32, location, 30);
  buf.writeInt32BE(fileSize, 62);
  return buf;
}

/**
 * Append one upload record to <conferencePath>/ctop.data.
 * Creates the file with the 96-byte header on first call.
 * Only call for non-duplicate active uploads (mirrors express.e behaviour).
 */
export async function appendCtopRecord(
  conferencePath: string,
  username: string,
  location: string,
  fileSize: number
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
    const header = buildHeader();
    await fs.writeFile(ctopPath, Buffer.concat([header, record]));
    console.log(`[Conftop] Created ctop.data with first record in ${path.basename(conferencePath)}`);
  } else {
    await fs.appendFile(ctopPath, record);
    console.log(`[Conftop] Appended ctop record for ${username} in ${path.basename(conferencePath)}`);
  }
}

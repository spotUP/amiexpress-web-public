/**
 * Conftop-II's `ctop.data`, read and written the way the Amiga door does.
 *
 * ONE definition, because there are two writers. The board appends a record
 * after every upload (`ctop-updater.util.ts`) and the door rewrites the
 * header at every period reset; a second copy of the layout in either place
 * is the bug this board has had nine times - a reader and a writer that
 * disagree by four bytes and a file that decodes into somebody else's name.
 *
 * THE FILE (all integers big-endian, as a 68K wrote them):
 *
 *   Header, 96 bytes, written whole at each reset (ctop.e:565-576)
 *     resetDate      long     4   Amiga day the current period ends
 *     startDate      long     4   Amiga day it began
 *     topUpName      char[32]     all-time record holder
 *     topUpBytes     bcd[8]       ... and the bytes he uploaded
 *     topUpFiles     long     4
 *     periodUpName   char[32]     who won the period that just ended
 *     periodUpBytes  bcd[8]
 *     periodUpFiles  long     4
 *
 *   Then one record per upload, 66 bytes, appended (ctop.e:604-632)
 *     userName       char[32]
 *     location       char[30]
 *     bytes          long     4
 *
 * WHY BCD. The totals are packed decimal, two digits per byte, sixteen
 * digits in eight bytes - the door adds them with the 68K's `ABCD`
 * instruction (ctop.e:202-218) because an Amiga `long` stops at four
 * gigabytes and a conference's lifetime upload total does not. Sixteen
 * decimal digits do not fit a JavaScript number either, so they are carried
 * here as `bigint` and packed back on the way out.
 *
 * Names are latin-1 and NUL-padded, never NUL-terminated by rule: a 32-byte
 * name fills its field exactly.
 */

export const CTOP_HEADER_SIZE = 96;
export const CTOP_RECORD_SIZE = 66;
export const CTOP_BCD_BYTES = 8;

/** Amiga time starts 1978-01-01; unix time starts 1970-01-01. */
export const UNIX_TO_AMIGA_DAYS = 2922;

export interface CtopHeader {
  /** Amiga day the period ends. The door resets once today reaches it. */
  resetDate: number;
  /** Amiga day the period began. */
  startDate: number;
  /** The board's all-time record uploader, or `NONE`. */
  topUpName: string;
  topUpBytes: bigint;
  topUpFiles: number;
  /** Who won the period that ended last, or `NONE`. */
  periodUpName: string;
  periodUpBytes: bigint;
  periodUpFiles: number;
}

/** One upload, as the board appended it. */
export interface CtopRecord {
  userName: string;
  location: string;
  bytes: number;
}

/** One uploader's period, after the records for the same name are added up. */
export interface CtopUploader {
  userName: string;
  /** The location from that uploader's LAST record - what ctop.e keeps. */
  location: string;
  bytes: bigint;
  files: number;
}

export interface CtopPeriod {
  header: CtopHeader;
  /** Uploaders, biggest first - the order the table is drawn in. */
  uploaders: CtopUploader[];
  totalFiles: number;
  totalBytes: bigint;
}

/* ------------------------------------------------------------------ BCD */

/**
 * Eight packed-decimal bytes as a number.
 *
 * A nibble above 9 cannot come out of `ABCD` and does come out of a file
 * somebody else wrote, so it is read for what it is rather than rejected:
 * the door must draw SOMETHING for a damaged total, and the alternative is a
 * conference whose screen throws.
 */
export function bcdToBigInt(bytes: Uint8Array): bigint {
  let value = 0n;
  for (let i = 0; i < CTOP_BCD_BYTES && i < bytes.length; i++) {
    value = value * 100n + BigInt((bytes[i] >> 4) * 10 + (bytes[i] & 0x0f));
  }
  return value;
}

/**
 * A number as eight packed-decimal bytes.
 *
 * Above sixteen digits the high end is dropped, which is what the 68K's
 * eight-byte `ABCD` chain does when it carries off the top.
 */
export function bigIntToBcd(value: bigint): Uint8Array {
  const out = new Uint8Array(CTOP_BCD_BYTES);
  let left = value < 0n ? 0n : value;
  for (let i = CTOP_BCD_BYTES - 1; i >= 0; i--) {
    const pair = Number(left % 100n);
    out[i] = ((Math.floor(pair / 10) & 0x0f) << 4) | (pair % 10);
    left /= 100n;
  }
  return out;
}

/**
 * A total with thousands separators, as `formatseparators` writes them
 * (ctop.e:291-306). The separator is the door's, not the locale's - this
 * wire is latin-1 and the screen is eighty fixed columns.
 */
export function formatCtopBytes(value: bigint, separator = ','): string {
  const digits = value.toString();
  let out = '';
  for (let i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 === 0) out += separator;
    out += digits[i];
  }
  return out;
}

/* ----------------------------------------------------------------- dates */

/** The Amiga day number for a date - what `getSystemDate()` returns. */
export function toAmigaDays(date: Date): number {
  return Math.floor(date.getTime() / 86_400_000) - UNIX_TO_AMIGA_DAYS;
}

/** The date an Amiga day number names, at midnight UTC. */
export function fromAmigaDays(days: number): Date {
  return new Date((days + UNIX_TO_AMIGA_DAYS) * 86_400_000);
}

/** Workbench's day of week: 1 is Monday, 7 is Sunday (ctop.e:281-284). */
export function amigaDayOfWeek(days: number): number {
  const v = ((days % 7) + 7) % 7;
  return v === 0 ? 7 : v;
}

/** Day of month (ctop.e:286-289, which reads it back out of a date string). */
export function amigaDayOfMonth(days: number): number {
  return fromAmigaDays(days).getUTCDate();
}

/* ----------------------------------------------------------------- bytes */

const LATIN1 = 'latin1';

function readName(buf: Buffer, offset: number, length: number): string {
  const field = buf.subarray(offset, offset + length);
  const end = field.indexOf(0);
  return field.subarray(0, end === -1 ? field.length : end).toString(LATIN1);
}

function writeName(buf: Buffer, offset: number, value: string, length: number): void {
  buf.fill(0, offset, offset + length);
  const bytes = Buffer.from(value, LATIN1);
  bytes.copy(buf, offset, 0, Math.min(bytes.length, length));
}

/** The 96-byte header. Throws nothing: a short file yields a zeroed header. */
export function decodeCtopHeader(buf: Buffer): CtopHeader {
  const source = buf.length >= CTOP_HEADER_SIZE
    ? buf
    : Buffer.concat([buf, Buffer.alloc(CTOP_HEADER_SIZE - buf.length)]);
  return {
    resetDate: source.readInt32BE(0),
    startDate: source.readInt32BE(4),
    topUpName: readName(source, 8, 32),
    topUpBytes: bcdToBigInt(source.subarray(40, 48)),
    topUpFiles: source.readInt32BE(48),
    periodUpName: readName(source, 52, 32),
    periodUpBytes: bcdToBigInt(source.subarray(84, 92)),
    periodUpFiles: source.readInt32BE(92),
  };
}

export function encodeCtopHeader(header: CtopHeader): Buffer {
  const buf = Buffer.alloc(CTOP_HEADER_SIZE, 0);
  buf.writeInt32BE(header.resetDate, 0);
  buf.writeInt32BE(header.startDate, 4);
  writeName(buf, 8, header.topUpName, 32);
  Buffer.from(bigIntToBcd(header.topUpBytes)).copy(buf, 40);
  buf.writeInt32BE(header.topUpFiles, 48);
  writeName(buf, 52, header.periodUpName, 32);
  Buffer.from(bigIntToBcd(header.periodUpBytes)).copy(buf, 84);
  buf.writeInt32BE(header.periodUpFiles, 92);
  return buf;
}

export function encodeCtopRecord(record: CtopRecord): Buffer {
  const buf = Buffer.alloc(CTOP_RECORD_SIZE, 0);
  writeName(buf, 0, record.userName, 32);
  writeName(buf, 32, record.location, 30);
  buf.writeInt32BE(record.bytes, 62);
  return buf;
}

/**
 * Every record after the header.
 *
 * A trailing part-record is ignored rather than guessed at - the door reads
 * until `Read()` returns nothing (ctop.e:849-878) and a file cut short by a
 * full disk is exactly that.
 */
export function decodeCtopRecords(buf: Buffer): CtopRecord[] {
  const records: CtopRecord[] = [];
  for (
    let offset = CTOP_HEADER_SIZE;
    offset + CTOP_RECORD_SIZE <= buf.length;
    offset += CTOP_RECORD_SIZE
  ) {
    records.push({
      userName: readName(buf, offset, 32),
      location: readName(buf, offset + 32, 30),
      bytes: buf.readInt32BE(offset + 62),
    });
  }
  return records;
}

/**
 * The table, built from the file: one row per uploader, biggest first.
 *
 * `buildOutput` in ctop.e (814-885) groups by name with `StrCmp`, which on
 * the Amiga is case-SENSITIVE, and keeps the location off the last record
 * seen. Both are kept: a caller who changed his location mid-period is shown
 * where he is now, and `Sysop` and `sysop` stay two rows, as they do on a
 * real board.
 */
export function aggregateCtop(header: CtopHeader, records: CtopRecord[]): CtopPeriod {
  const byName = new Map<string, CtopUploader>();
  let totalFiles = 0;
  let totalBytes = 0n;

  for (const record of records) {
    let uploader = byName.get(record.userName);
    if (!uploader) {
      uploader = { userName: record.userName, location: record.location, bytes: 0n, files: 0 };
      byName.set(record.userName, uploader);
    }
    uploader.location = record.location;
    uploader.bytes += BigInt(record.bytes);
    uploader.files += 1;
    totalFiles += 1;
    totalBytes += BigInt(record.bytes);
  }

  /*
   * Biggest first, and ties keep the order they arrived in. The Amiga sort
   * compares the BCD totals alone (`itemCompare`, ctop.e:198-200), so two
   * uploaders on the same byte count are left as the file has them.
   */
  const uploaders = [...byName.values()].sort((a, b) => (a.bytes === b.bytes ? 0 : a.bytes > b.bytes ? -1 : 1));

  return { header, uploaders, totalFiles, totalBytes };
}

/** The whole file, decoded. */
export function decodeCtopFile(buf: Buffer): CtopPeriod {
  const header = decodeCtopHeader(buf);
  return aggregateCtop(header, decodeCtopRecords(buf));
}

/* --------------------------------------------------------------- periods */

/**
 * How long a period lasts, as `DAYS=` in `Conftop.info` says it
 * (ctop.e:423-433). `WEEKLY` and `MONTHLY` are the two names; anything else
 * is a count of days, and a count below one is a week.
 */
export type CtopSchedule =
  | { kind: 'weekly' }
  | { kind: 'monthly' }
  | { kind: 'days'; days: number };

export function parseCtopSchedule(value: string | undefined): CtopSchedule {
  const text = (value ?? '').trim().toUpperCase();
  if (text === 'MONTHLY') return { kind: 'monthly' };
  if (text === 'WEEKLY' || text === '') return { kind: 'weekly' };
  const days = parseInt(text, 10);
  return Number.isFinite(days) && days >= 1 ? { kind: 'days', days } : { kind: 'weekly' };
}

export interface CtopPeriodDates {
  startDate: number;
  resetDate: number;
}

/**
 * The first period of a conference that has never had one (ctop.e:548-560).
 *
 * A weekly period ends on the next Monday, a monthly one on the first of the
 * next month, and a counted one `days` from today - so the first period a
 * board sees is usually SHORT, which is deliberate: the door would otherwise
 * announce a winner of a week that only started on Thursday.
 */
export function firstCtopPeriod(today: number, schedule: CtopSchedule): CtopPeriodDates {
  if (schedule.kind === 'weekly') {
    let resetDate = today + 1;
    while (amigaDayOfWeek(resetDate) !== 1) resetDate++;
    return { startDate: resetDate - 7, resetDate };
  }
  if (schedule.kind === 'monthly') {
    let resetDate = today + 1;
    while (amigaDayOfMonth(resetDate) !== 1) resetDate++;
    let startDate = today;
    while (amigaDayOfMonth(startDate) !== 1) startDate--;
    return { startDate, resetDate };
  }
  return { startDate: today, resetDate: today + schedule.days };
}

/**
 * The period after this one (ctop.e:529-547).
 *
 * It advances until the new reset date is in the future, which is what makes
 * a board that was off for a month come back with ONE reset rather than four:
 * the periods in between had no uploads in them and no winner to announce.
 */
export function rollCtopPeriod(
  resetDate: number,
  today: number,
  schedule: CtopSchedule,
): CtopPeriodDates {
  let start = resetDate;
  let next = resetDate;
  do {
    start = next;
    if (schedule.kind === 'weekly') {
      next = start + 7;
    } else if (schedule.kind === 'monthly') {
      next = start + 1;
      while (amigaDayOfMonth(next) !== 1) next++;
    } else {
      next = start + schedule.days;
    }
  } while (next <= today);
  return { startDate: start, resetDate: next };
}

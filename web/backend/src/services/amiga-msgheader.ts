/**
 * The msgHeader record as a REAL AmiExpress board writes it.
 *
 * Not the same as `MessageIndexManager`'s, and that is the point. Both are
 * 110 bytes, but Amiga E aligns a LONG to an even offset, so the on-disk
 * record carries two pad bytes INSIDE it:
 *
 *   0    status      1 byte
 *   1    (pad)       1 byte   <- aligns msgNumb
 *   2    msgNumb     4 bytes, big-endian
 *   6    toName     31 bytes
 *   37   fromName   31 bytes
 *   68   subject    31 bytes
 *   99   (pad)       1 byte   <- aligns msgDate
 *   100  msgDate     4 bytes
 *   104  recv        4 bytes
 *   108  extMsgNum   2 bytes
 *                  = 110
 *
 * `MessageIndexManager` puts both pads at the END instead, which is
 * self-consistent - it writes and reads its own files - and unable to read a
 * board that AmiExpress wrote. Measured against the reference-boardBBS reference
 * tree: with the pads at the end, message numbers all came back 0 and every
 * name was overlapped by the previous record's tail ("Hamletlund" for
 * "Hamlet", after "Tom Englund"). With them where they belong, the same file
 * reads as messages 1, 2, 3, 4 from Tom Englund, Hamlet, Sandman and Biotech,
 * dated through one evening in December 2017.
 *
 * This reader exists for IMPORT, where the bytes come from a real Amiga
 * board. The port's own message bases stay on the port's layout until someone
 * decides to migrate them, and that decision is not this file's to make.
 */

/** One header, as it sits in an AmiExpress `HeaderFile`. */
export interface AmigaMsgHeader {
  status: number;
  msgNumb: number;
  toName: string;
  fromName: string;
  subject: string;
  /** Unix timestamp, seconds. */
  msgDate: number;
  recv: number;
  extMsgNum: number;
}

/** Bytes per record, pads included. */
export const AMIGA_MSGHEADER_SIZE = 110;

/** A fixed-width Amiga string: NUL-terminated inside its field. */
function fixedString(buffer: Buffer, at: number, width: number): string {
  const end = Math.min(at + width, buffer.length);
  const raw = buffer.subarray(at, end);
  const nul = raw.indexOf(0);
  // latin1: an Amiga name can carry a high-bit character, and a UTF-8 read
  // would turn it into U+FFFD.
  return (nul >= 0 ? raw.subarray(0, nul) : raw).toString('latin1');
}

export function parseAmigaMsgHeader(buffer: Buffer, offset: number): AmigaMsgHeader {
  return {
    status: buffer.readUInt8(offset),
    msgNumb: buffer.readUInt32BE(offset + 2),
    toName: fixedString(buffer, offset + 6, 31),
    fromName: fixedString(buffer, offset + 37, 31),
    subject: fixedString(buffer, offset + 68, 31),
    msgDate: buffer.readUInt32BE(offset + 100),
    recv: buffer.readUInt32BE(offset + 104),
    extMsgNum: buffer.readUInt16BE(offset + 108),
  };
}

/** Every header in a `HeaderFile`, ignoring a trailing partial record. */
export function parseAmigaHeaderFile(buffer: Buffer): AmigaMsgHeader[] {
  const count = Math.floor(buffer.length / AMIGA_MSGHEADER_SIZE);
  const headers: AmigaMsgHeader[] = [];

  for (let i = 0; i < count; i++) {
    headers.push(parseAmigaMsgHeader(buffer, i * AMIGA_MSGHEADER_SIZE));
  }

  return headers;
}

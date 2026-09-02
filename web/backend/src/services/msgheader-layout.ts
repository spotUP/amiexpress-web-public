import { AMIGA_MSGHEADER_SIZE } from './amiga-msgheader';

/**
 * Which of the two layouts a single header record is written in.
 *
 * This board's HeaderFiles carry BOTH, inside the same file. Conf1 holds
 * messages dated March 1996 next to messages this port wrote in 2026, and
 * Conf2 record 130 is an AmiExpress record sitting among 159 of the port's.
 * So the question has to be asked per RECORD; asking it per file gets one of
 * them wrong.
 *
 *   AmiExpress   status(0) pad(1) msgNumb(2) toName(6) fromName(37)
 *                subject(68) pad(99) msgDate(100) recv(104) extMsgNum(108)
 *   this port    status(0) msgNumb(1) toName(5) fromName(36)
 *                subject(67) msgDate(98) recv(102) extMsgNum(106) pad(108,109)
 *
 * The tell is byte 36. In the AmiExpress layout it is the last byte of a
 * 31-byte toName field, which is NUL padding for every name shorter than 31
 * characters. In this port's layout it is the FIRST character of fromName,
 * and a message always has a sender.
 *
 * Dates look like a better signal and are not: in the port's layout bytes
 * 100..103 straddle the low half of msgDate and the high half of recv, so
 * reading them as an AmiExpress msgDate lands inside a plausible window by
 * coincidence - it called 23 of Conf1's port records "1996" that way.
 *
 * Corroborated rather than trusted alone: an AmiExpress record must also have
 * its two pad bytes clear and a printable sender where AmiExpress puts one.
 * Anything that fits neither description is reported, never guessed at - a
 * wrong guess here rewrites somebody's mail.
 */
export type MsgHeaderLayout = 'amiga' | 'port' | 'unknown';

function printableName(buffer: Buffer, at: number, width: number): boolean {
  const raw = buffer.subarray(at, at + width);
  const nul = raw.indexOf(0);
  const name = nul >= 0 ? raw.subarray(0, nul) : raw;
  if (name.length === 0) return false;
  return name.every(c => c >= 0x20 && c <= 0xfe);
}

export function classifyMsgHeaderRecord(buffer: Buffer, offset: number): MsgHeaderLayout {
  if (offset + AMIGA_MSGHEADER_SIZE > buffer.length) return 'unknown';
  const r = buffer.subarray(offset, offset + AMIGA_MSGHEADER_SIZE);

  /*
   * The pad bytes are NOT part of the test, though they look like the
   * obvious one. Amiga E does not clear structure padding: byte 99 of a
   * genuine AmiExpress record in this board's Conf12 is 0x47, left over from
   * whatever occupied that memory before the record was written. Requiring
   * the pads to be zero called all 38 of that file's records unidentifiable.
   *
   * The NAME fields are zero-padded, because a short name written into a
   * 31-byte array leaves the remainder clear - which is what makes byte 36
   * the tell.
   */
  const amigaShaped =
    r[36] === 0                    // the tail of toName, still clear
    && printableName(r, 6, 31)     // toName where AmiExpress puts it
    && printableName(r, 37, 31);   // fromName where AmiExpress puts it

  const portShaped =
    r[36] !== 0
    && printableName(r, 36, 31)    // fromName where this port puts it
    && printableName(r, 5, 31);    // toName where this port puts it

  if (amigaShaped && !portShaped) return 'amiga';
  if (portShaped && !amigaShaped) return 'port';
  return 'unknown';
}

/**
 * The same record, rewritten in the AmiExpress layout.
 *
 * Field by field rather than by shifting bytes: the two layouts do not differ
 * by a constant offset - one pad moves in before msgNumb and another before
 * msgDate - so a memmove would put the subject's tail into the date.
 */
export function portRecordToAmiga(buffer: Buffer, offset: number): Buffer {
  const r = buffer.subarray(offset, offset + AMIGA_MSGHEADER_SIZE);
  const out = Buffer.alloc(AMIGA_MSGHEADER_SIZE);

  out.writeUInt8(r.readUInt8(0), 0);          // status
  out.writeInt32BE(r.readInt32BE(1), 2);      // msgNumb
  r.copy(out, 6, 5, 36);                      // toName
  r.copy(out, 37, 36, 67);                    // fromName
  r.copy(out, 68, 67, 98);                    // subject
  out.writeInt32BE(r.readInt32BE(98), 100);   // msgDate
  out.writeInt32BE(r.readInt32BE(102), 104);  // recv
  out.writeInt16BE(r.readInt16BE(106), 108);  // extMsgNum

  return out;
}

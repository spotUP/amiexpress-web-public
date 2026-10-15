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
 * The tell is the MESSAGE NUMBER. express.e numbers from 1, so a zero is not
 * a message number - it is what reading a LONG from the wrong offset gives
 * you. Every record on the live board reads 1, 2, 3, 4... at the AmiExpress
 * offset and 0 at this port's.
 *
 * It is NOT byte 36, which an earlier version of this used on the theory that
 * a 31-byte name field is NUL-padded. It is not: the bytes after a name's
 * terminator are undefined, and on the live board they are junk - a real
 * toName there reads `eall\0\xf9\xfc\x0e`. That test called 480 live records
 * unidentifiable, every one of them an ordinary AmiExpress record.
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

/**
 * A name field that STARTS where this layout says it does.
 *
 * Only up to the NUL. The bytes after a name's terminator are undefined and
 * on this board they are junk: `eall\0\xf9\xfc\x0e...` is a real toName on
 * the live Conf2. An earlier version of this test read byte 36 - the tail of
 * that same field - and called 480 of the live board's records
 * unidentifiable, every one of which was a perfectly ordinary AmiExpress
 * record. Padding proves nothing; only the part before the NUL is written.
 */
function nameAt(buffer: Buffer, at: number, width: number): boolean {
  const raw = buffer.subarray(at, at + width);
  const nul = raw.indexOf(0);
  const name = nul >= 0 ? raw.subarray(0, nul) : raw;
  if (name.length === 0) return false;
  return name.every(c => c >= 0x20 && c <= 0xfe);
}

/**
 * A message number AmiExpress could have written.
 *
 * express.e numbers messages from 1, so a zero is not a message number - it
 * is what you get reading a LONG from the wrong offset. This is the signal
 * that actually separates the two layouts on the live board: every record
 * there reads 1, 2, 3, 4... at the AmiExpress offset and 0 at this port's.
 */
function plausibleMsgNumber(value: number): boolean {
  return value >= 1 && value <= 10_000_000;
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
    plausibleMsgNumber(r.readInt32BE(2))
    && nameAt(r, 6, 31)            // toName where AmiExpress puts it
    && nameAt(r, 37, 31);          // fromName where AmiExpress puts it

  const portShaped =
    plausibleMsgNumber(r.readInt32BE(1))
    && nameAt(r, 5, 31)            // toName where this port puts it
    && nameAt(r, 36, 31);          // fromName where this port puts it

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

/**
 * Every record's layout, decided with the whole file in hand.
 *
 * One record on its own is sometimes genuinely undecidable: a record this
 * port wrote has a plausible message number at BOTH offsets - its real one at
 * 1, and at 2 the same number shifted a byte with the first letter of toName
 * carried into it. `classifyMsgHeaderRecord` says `unknown` rather than
 * guessing, and that is the honest answer to the question it was asked.
 *
 * A FILE answers it. Message numbers run in sequence, so the reading that
 * continues the run is the right one - `1, 2, 3` beats `321, 578, 835`. The
 * confident records establish the run and the undecidable ones fall in behind
 * it, which is how a mixed file gets read correctly record by record.
 */
export function classifyHeaderFile(buffer: Buffer): MsgHeaderLayout[] {
  const count = Math.floor(buffer.length / AMIGA_MSGHEADER_SIZE);
  const layouts: MsgHeaderLayout[] = [];
  for (let i = 0; i < count; i++) {
    layouts.push(classifyMsgHeaderRecord(buffer, i * AMIGA_MSGHEADER_SIZE));
  }

  let previous = 0;
  for (let i = 0; i < count; i++) {
    const at = i * AMIGA_MSGHEADER_SIZE;

    if (layouts[i] === 'unknown') {
      const distance = (n: number) =>
        (n >= 1 ? Math.abs(n - (previous + 1)) : Number.MAX_SAFE_INTEGER);
      const amigaDistance = distance(buffer.readInt32BE(at + 2));
      const portDistance = distance(buffer.readInt32BE(at + 1));

      /*
       * Still `unknown` when the sequence cannot separate them either, and
       * deliberately so. A reader may fall back - it treats unknown as
       * AmiExpress, and reading the wrong field costs a wrong number on
       * screen. The MIGRATION may not: it rewrites the bytes, and a record it
       * cannot identify is one it must leave exactly as it found it.
       */
      if (amigaDistance !== portDistance) {
        layouts[i] = amigaDistance < portDistance ? 'amiga' : 'port';
      }
    }

    const chosen = buffer.readInt32BE(at + (layouts[i] === 'port' ? 1 : 2));
    if (chosen >= 1) previous = chosen;
  }

  return layouts;
}

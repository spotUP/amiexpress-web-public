import { readPackedBCD, type BCDValue } from '../utils/bcd-math.util';

/**
 * Conf.DB: what each USER has done in one conference.
 *
 * The importer treated this file as conference metadata - it returned a name,
 * an access level and a type from it and left a `TODO: Parse binary structure`
 * over a hardcoded `accessLevel: 10`. None of those live here. A conference's
 * name comes from `ConfConfig.info`, and conference ACCESS is per user
 * (`checkConfAccess`, express.e:8499): either an "X" at position n-1 of the
 * user's `conferenceAccess` string, or a `Conf.<n>` tooltype on the access
 * AREA the user belongs to. AmiExpress has no per-conference access level at
 * all.
 *
 * What Conf.DB actually holds is an array of `confBase` records (axobjects.e:
 * 136-155), one per user slot, addressed by slot number. axSetupTool creates
 * the file as CONFDBSIZE=74000 zero bytes (frmConfEdit.e:840-848), and 74000
 * is 74 x 1000: 74 bytes per record, a thousand slots. Every Conf.DB on this
 * board is exactly that size, which is how the record size was confirmed
 * rather than assumed.
 *
 * Losing it loses the things a caller would notice on the morning after an
 * import: where their message pointer was, what their ratio is, which
 * conferences they had new-mail and new-files scanning turned on for, and
 * which voting topics they had already answered.
 */

/** axobjects.e:136-155, and 74000 / 74 = 1000 slots exactly. */
export const CONF_BASE_SIZE = 74;

/** axconsts.e:45-47 - packed into the low bits of handle[0]. */
const ZOOM_SCAN_MASK = 2;
const MAIL_SCAN_MASK = 4;
const FILE_SCAN_MASK = 8;

/**
 * The highest vote topic express.e walks (20544). Topic n lives at bit n+3 of
 * the `handle` bit array, which is why the scan masks stop at bit 3.
 */
const MAX_VOTE_TOPICS = 25;

export interface ConfBaseRecord {
  /** Index in the file, which IS the user's slot number. */
  slot: number;

  /** handle[0] bits - what this user asked to be scanned on entry. */
  newMailScan: boolean;
  newFileScan: boolean;
  zoomScan: boolean;
  /** Vote topics (1-25) this user has already answered. */
  votedTopics: number[];

  /** Exact byte counters. BCD is why they are exact - see readPackedBCD. */
  downloadBytes: BCDValue;
  uploadBytes: BCDValue;

  newSinceDate: number;
  /** The message pointer: what a new-mail scan starts after. */
  confRead: number;
  confYM: number;
  bytesDownload: number;
  bytesUpload: number;
  uploadTracking: number;
  upload: number;
  downloads: number;
  ratioType: number;
  ratio: number;
  messagesPosted: number;
  /** Per-USER access within this conference, not the conference's own level. */
  access: number;
  active: number;
}

/**
 * `handle[16]` is a bit array, not a name.
 *
 * The field is called handle in axobjects.e and holds no text: express.e ORs
 * the scan masks into byte 0 (22485-22499) and sets one bit per answered vote
 * topic above them (`confbyte:=Shr(topicNum+3,3)`, 21014-21016). Reading it as
 * a string would have produced a control character followed by whatever the
 * voting booth had written.
 */
function votedTopics(buffer: Buffer, offset: number): number[] {
  const topics: number[] = [];
  for (let topic = 1; topic <= MAX_VOTE_TOPICS; topic++) {
    const bit = topic + 3;
    const byte = buffer[offset + (bit >> 3)] ?? 0;
    if ((byte & (1 << (bit % 8))) !== 0) topics.push(topic);
  }
  return topics;
}

/** One record. Big-endian throughout: these are 68K structs. */
export function parseConfBaseRecord(buffer: Buffer, offset: number, slot: number): ConfBaseRecord {
  const flags = buffer[offset] ?? 0;

  return {
    slot,
    zoomScan: (flags & ZOOM_SCAN_MASK) !== 0,
    newMailScan: (flags & MAIL_SCAN_MASK) !== 0,
    newFileScan: (flags & FILE_SCAN_MASK) !== 0,
    votedTopics: votedTopics(buffer, offset),
    downloadBytes: readPackedBCD(buffer, offset + 16),
    uploadBytes: readPackedBCD(buffer, offset + 24),
    newSinceDate: buffer.readInt32BE(offset + 32),
    confRead: buffer.readInt32BE(offset + 36),
    confYM: buffer.readInt32BE(offset + 40),
    bytesDownload: buffer.readInt32BE(offset + 44),
    bytesUpload: buffer.readInt32BE(offset + 48),
    uploadTracking: buffer.readInt16BE(offset + 52),
    // 54 unused:INT and 56 unused2:LONG - dailyBytesDld, kept as padding by
    // axobjects.e itself. Read nothing from them.
    upload: buffer.readInt16BE(offset + 60),
    downloads: buffer.readInt16BE(offset + 62),
    ratioType: buffer.readInt16BE(offset + 64),
    ratio: buffer.readInt16BE(offset + 66),
    messagesPosted: buffer.readInt16BE(offset + 68),
    access: buffer.readInt16BE(offset + 70),
    active: buffer.readInt16BE(offset + 72),
  };
}

/**
 * Every record in the file, in slot order.
 *
 * A trailing partial record is ignored rather than guessed at: the board
 * writes whole records at slot boundaries and a short tail means the file is
 * damaged, not that there is another user in it.
 */
export function parseConfDb(buffer: Buffer): ConfBaseRecord[] {
  const records: ConfBaseRecord[] = [];
  const count = Math.floor(buffer.length / CONF_BASE_SIZE);
  for (let slot = 0; slot < count; slot++) {
    records.push(parseConfBaseRecord(buffer, slot * CONF_BASE_SIZE, slot));
  }
  return records;
}

/**
 * Which slot belongs to which person is NOT decided here.
 *
 * The obvious helper - "only the records that look used" - was written and
 * then deleted: on this board it answered 1000 out of 1000, because
 * AmiExpress seeds every slot with a newSinceDate and a bytesUpload of 1, so
 * "looks used" is a heuristic that quietly means "all of them" on one board
 * and something else on the next.
 *
 * A record's slot IS the user's slot number, and the archive parses the users
 * anyway. Pairing by slot is an answer from the data; a guess about which
 * records look interesting is not.
 */
export function confBaseForSlot(
  records: ConfBaseRecord[], slot: number,
): ConfBaseRecord | undefined {
  return records.find(r => r.slot === slot);
}

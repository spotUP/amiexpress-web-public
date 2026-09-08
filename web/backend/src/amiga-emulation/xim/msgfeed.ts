/**
 * AEW_MSGQUERY (10200) - this board's own read command for the PUBLIC feed.
 *
 * The board decodes, the door renders. A 68K door cannot parse HeaderFile
 * itself (two interleaved record layouts - services/msgheader-layout.ts), so
 * the 110-byte record stays parsed in exactly one place and this answers in
 * plain text a C89 client splits on '|'. And a door reading the disk could
 * not apply the caller's ACS, so the read filter stays server-side where
 * express.e:12344-12348 already put it.
 *
 * Read-only by construction: msg.data === 0 (write) never reaches here;
 * XIMProtocol answers it with 0.
 *
 * THE THREE VERBS, and no more in v1:
 *
 *   STAT                    -> "<visibleTotal>|<newForMe>|<pointer>|<confName>"
 *   LIST <first> <count>    -> up to <count> rows from msgNumb >= <first>,
 *                              ascending: "<num>|<from>|<subject>|<ddmmmyy>|<flag>\n"
 *                              truncated at a ROW boundary to fit
 *   BODY <msgNum> <chunk>   -> bytes [chunk*190, +190) of that message's body
 *
 * ROW RENDERING RULES, fixed here because the C parser is written against
 * them:
 *
 * - Fields are '|'-separated; a '|' in a subject or a name becomes '!'.
 * - A newline in a subject becomes a space; anything that is not printable
 *   Latin-1 becomes one '?'. Control bytes are included in that: a raw ESC
 *   in a subject would otherwise be an ANSI sequence painted into the door's
 *   screen.
 * - Rows end with '\n', including the last. Truncation is ALWAYS at a row
 *   boundary; a partial row is never sent.
 * - Fields are append-only: new ones go on the end, and the C splitter keeps
 *   the first FIELDS_MAX and never rejects a row for having more.
 *
 * WHY THIS RETURNS FIELDS AND NOT RENDERED ROWS - the one place this
 * deliberately does not reuse an existing builder. `buildMsgListRow`
 * (handlers/message/messaging.handler.ts:277) is express.e:8864 byte-for-byte
 * at 80 columns and delegates 40 to `narrowMailRow`
 * (utils/table-format.util.ts:247); both are pinned by
 * tests/handlers/narrow-tables.test.ts. They are the right answer for the
 * board's own `L` listing and the wrong one here: the door lays out for three
 * screens against its own `screen.cols`, so it needs the fields. Sending
 * rendered 80-column rows would either break the C64 or fork those builders.
 */

import { config } from '../../config';
import { ACSPermission } from '../../constants/acs-permissions';
import { messageIndexManager, MsgStatus, type MsgHeader } from '../../services/MessageIndexManager';
import { checkSecurity } from '../../utils/acs.util';
import { readMessageFile } from '../../utils/message-file.util';
import { loadMsgPointers, validatePointers } from '../../utils/message-pointers.util';

/**
 * GENERIC_STRING is 198 (xim/types.ts). 190 leaves headroom for the NUL and
 * for a backend that decides to prefix a guard byte, and it is the number the
 * C side pages on - `AE_MSG_REPLY_MAX` in sdk/c/include/ae_msgbase.h must
 * match it.
 */
export const MSGQUERY_REPLY_MAX = 190;

export interface MsgQueryAnswer {
  /** What goes into the message's embedded string. */
  text: string;
  /** What goes into msg.data: bytes written. 0 means "nothing more". */
  bytes: number;
}

const NOTHING: MsgQueryAnswer = { text: '', bytes: 0 };

/** Latin-1, printable, and never a delimiter. */
function sanitiseField(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (value[i] === '|') { out += '!'; continue; }        // the house escape
    if (code === 10 || code === 13 || code === 9) { out += ' '; continue; }
    if (code < 0x20 || code === 0x7f || code > 0xff) { out += '?'; continue; }
    out += value[i];
  }
  return out.trim();
}

/** The body, made safe to put on an XIM wire without changing what it says. */
function sanitiseBody(value: string): string {
  let out = '';
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code === 13) continue;                              // CRLF -> LF
    if (code === 10 || code === 9) { out += value[i]; continue; }
    if (code < 0x20 || code === 0x7f || code > 0xff) { out += '?'; continue; }
    out += value[i];
  }
  return out;
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * `08Sep26`. Local time, the same clock `formatMessageDate`
 * (utils/message-file.util.ts:117) renders the board's own message headers on,
 * so the door and the `R` prompt never show a message on two different days.
 */
function ddmmmyy(unixSeconds: number): string {
  if (!unixSeconds) return '';
  const at = new Date(unixSeconds * 1000);
  if (Number.isNaN(at.getTime())) return '';
  return `${String(at.getDate()).padStart(2, '0')}${MONTHS[at.getMonth()]}${String(at.getFullYear()).slice(-2)}`;
}

/** A message this feed exists to show: public, and addressed to everyone. */
function isPublicFeedMessage(header: MsgHeader): boolean {
  if (header.status !== MsgStatus.NORMAL && header.status !== MsgStatus.CENSORED) return false;
  const to = (header.toName || '').trim().toUpperCase();
  return to === 'EALL' || to === 'ALL';
}

/**
 * The board's own read filter, express.e:12344-12348, applied server-side.
 *
 * The door is a lens, never a bypass: it can show nothing the caller could not
 * already read at the `R` prompt. Only a CENSORED ('p') message is ever gated
 * - an ordinary 'P' is public and always readable, which is what makes this
 * feed worth having.
 *
 * The status BYTE decides, never `toName`. `readMessageFile`
 * (utils/message-file.util.ts:309) derives `isPrivate` from
 * `toName !== 'ALL'`, so it reports every eALL message as private; copying
 * that shortcut here would empty the public feed of exactly the messages it
 * exists to show.
 */
function callerMayRead(header: MsgHeader, user: any, confMailName: string): boolean {
  if (header.status !== MsgStatus.CENSORED) return true;
  if (checkSecurity(user, ACSPermission.SYSOP_READ)) return true;

  const to = (header.toName || '').trim().toLowerCase();
  const from = (header.fromName || '').trim().toLowerCase();
  if (confMailName && (to === confMailName || from === confMailName)) return true;
  if (to === 'eall' && checkSecurity(user, ACSPermission.READ_PRIV_EALL)) return true;
  if (to === 'all' && checkSecurity(user, ACSPermission.READ_PRIV_ALL)) return true;
  return false;
}

/**
 * What one walk of this conference found, for one caller.
 *
 * Memoised on the session for a few seconds because a door pages the listing:
 * at ~40 bytes a row and 190 bytes a reply, a 200-message feed is fifty LIST
 * calls, and re-running the new-mail scan for each of them would read the
 * HeaderFile fifty times. The window is short enough that a caller who leaves
 * the door, reads mail at the `R` prompt and comes back sees fresh counts.
 */
interface FeedWalk {
  /** Public messages this caller may read, ascending by message number. */
  visible: MsgHeader[];
  /** Message numbers that are NEW for this caller, from the ONE predicate. */
  newNumbers: Set<number>;
  /** The caller's validated last-new-read pointer. */
  pointer: number;
}

const WALK_TTL_MS = 3000;

async function walkFeed(session: any): Promise<FeedWalk> {
  const confId = Number(session?.currentConf ?? session?.currentConference ?? session?.conferenceId ?? 1);
  const msgBaseId = Number(session?.currentMsgBase ?? 1);
  const user = session?.user ?? null;
  const cacheKey = `${confId}:${msgBaseId}:${user?.id ?? 'anon'}`;

  const cached = session?.__subsFeedWalk;
  if (cached && cached.key === cacheKey && Date.now() - cached.at < WALK_TTL_MS) {
    return cached.walk as FeedWalk;
  }

  /*
   * The per-conference display name, which is what express.e:12345 compares
   * toName/fromName against - NOT the raw username, because a REALNAME or
   * INTERNETNAME conference addresses mail by a different one.
   *
   * Only asked for when somebody is logged on, and guarded: it reads the
   * conference's tooltypes through the database, and a door can be launched
   * before the caller has one (the login-time display flow). An unguarded
   * call there took the whole node down with a SQLITE_ERROR.
   */
  let confMailName = '';
  if (user) {
    try {
      const { getConfMailNameFor } = require('../../handlers/message/message-entry.handler');
      confMailName = String(getConfMailNameFor(user, confId, msgBaseId) || '').toLowerCase();
    } catch (error) {
      console.error('[AEW_MSGQUERY] could not resolve the conference mail name:', error);
    }
  }

  let headers: MsgHeader[] = [];
  try {
    headers = messageIndexManager.readHeaderFile(confId);
  } catch (error) {
    console.error('[AEW_MSGQUERY] could not read the message base:', error);
    headers = [];
  }

  const visible = headers
    .filter(h => isPublicFeedMessage(h))
    .filter(h => callerMayRead(h, user, confMailName))
    .sort((a, b) => a.msgNumb - b.msgNumb);   // plain number order, always

  let pointer = 0;
  const newNumbers = new Set<number>();

  if (user?.id) {
    try {
      const confBase = await loadMsgPointers(String(user.id), confId, msgBaseId);
      const mailStat = messageIndexManager.readMailStats(confId);
      pointer = (mailStat ? validatePointers(confBase, mailStat) : confBase).lastNewReadConf || 0;

      /*
       * NOT counted here. ASKED for.
       *
       * `scanConferenceForNewMail` (handlers/message/message-scan.handler.ts)
       * already answers "what is new for this caller", and its own comment
       * records that it replaced two separate walks BECAUSE they had grown two
       * copies of the rule. A count rolled by hand here would be the third.
       *
       * Its private messages are dropped: this is the public feed. What
       * survives is intersected with `visible` below, so the number STAT
       * reports and the rows LIST flags 'N' cannot disagree.
       */
      const scan = require('../../handlers/message/message-scan.handler');
      const found = await scan.scanConferenceForNewMail(
        String(user.id), confId, msgBaseId, user, config.get('dataDir'),
      );
      for (const message of found.messages) {
        if (!message.isPrivate) newNumbers.add(message.msgNum);
      }
    } catch (error) {
      console.error('[AEW_MSGQUERY] could not read the caller\'s pointers:', error);
    }
  }

  const walk: FeedWalk = { visible, newNumbers, pointer };
  if (session) session.__subsFeedWalk = { key: cacheKey, at: Date.now(), walk };
  return walk;
}

/**
 * One row's flag: a single ASCII character, never a code to decode.
 *
 * 'N' wins over '*' on purpose - the door's whole job is to move callers onto
 * the unread ones, and a censored message is only ever shown to somebody who
 * already holds the permission to see it.
 */
function flagFor(header: MsgHeader, walk: FeedWalk): string {
  if (walk.newNumbers.has(header.msgNumb)) return 'N';
  if (header.status === MsgStatus.CENSORED) return '*';
  return '-';
}

function renderRow(header: MsgHeader, walk: FeedWalk): string {
  return [
    String(header.msgNumb),
    sanitiseField((header.fromName || '').trim()),
    sanitiseField((header.subject || '').trim()),
    ddmmmyy(header.msgDate),
    flagFor(header, walk),
  ].join('|') + '\n';
}

/**
 * Answer one query.
 *
 * Async because it reads the message base, which is why it lives with the I/O
 * family in XIMProtocol rather than the synchronous data-query family.
 */
export async function handleMsgQuery(query: string, session: any): Promise<MsgQueryAnswer> {
  const words = String(query || '').trim().split(/\s+/);
  const verb = (words[0] || '').toUpperCase();

  try {
    if (verb === 'STAT') return await answerStat(session);
    if (verb === 'LIST') return await answerList(session, Number(words[1] ?? 0), Number(words[2] ?? 0));
    if (verb === 'BODY') return await answerBody(session, Number(words[1] ?? 0), Number(words[2] ?? 0));
  } catch (error) {
    // A door must not hang because a message base is unreadable. An empty
    // answer is the same thing a classic AmiExpress says to this command, and
    // the door already has a sentence for it.
    console.error(`[AEW_MSGQUERY] "${query}" failed:`, error);
    return NOTHING;
  }

  // An unknown verb is answered with nothing rather than guessed at: this is
  // an append-only protocol, and a future door asking a verb this board does
  // not have must fall back, not be given something that looks like an answer.
  return NOTHING;
}

async function answerStat(session: any): Promise<MsgQueryAnswer> {
  const walk = await walkFeed(session);
  const newForMe = walk.visible.filter(h => walk.newNumbers.has(h.msgNumb)).length;
  const confName = sanitiseField(String(session?.conferenceName || 'Main'));

  const text = `${walk.visible.length}|${newForMe}|${walk.pointer}|${confName}`;
  return { text, bytes: text.length };
}

async function answerList(session: any, first: number, count: number): Promise<MsgQueryAnswer> {
  const wanted = Number.isFinite(count) && count > 0 ? count : 1;
  const walk = await walkFeed(session);

  /*
   * A NEGATIVE `first` means "start `count` rows back from the END" - the
   * newest window, still delivered in plain ascending number order.
   *
   * This is an argument, not a fourth verb, and it composes with the ordinary
   * forward paging: the door asks LIST -1 100 once and then continues with
   * LIST <n> 96, <n> 92 ... exactly as it would have from any other start.
   *
   * It exists because message numbers are SPARSE. A door cannot compute "the
   * hundredth from the end" from a total and a highest number, so without this
   * a door opening on a 260-message conference would either show the OLDEST
   * hundred - which is the wrong end of a discussion - or page the whole base
   * to find the newest, at one XIM round trip per four rows.
   */
  const from = Number.isFinite(first) && first > 0 ? first : 0;
  const startAt = Number.isFinite(first) && first < 0
    ? Math.max(0, walk.visible.length - wanted)
    : 0;

  let text = '';
  let sent = 0;

  for (let i = startAt; i < walk.visible.length; i++) {
    const header = walk.visible[i]!;
    if (header.msgNumb < from) continue;
    if (sent >= wanted) break;
    const row = renderRow(header, walk);
    // Truncation is always at a row boundary. A door that had to reassemble
    // half a row would need the state this protocol deliberately does not have.
    if (text.length + row.length > MSGQUERY_REPLY_MAX) break;
    text += row;
    sent++;
  }

  return { text, bytes: text.length };
}

async function answerBody(session: any, msgNum: number, chunk: number): Promise<MsgQueryAnswer> {
  if (!Number.isFinite(msgNum) || msgNum <= 0) return NOTHING;
  const at = Number.isFinite(chunk) && chunk > 0 ? Math.floor(chunk) : 0;

  const walk = await walkFeed(session);
  // The same filter the listing used. A message the caller cannot see in the
  // list is not readable by asking for its body directly either.
  if (!walk.visible.some(h => h.msgNumb === msgNum)) return NOTHING;

  const confId = Number(session?.currentConf ?? session?.currentConference ?? session?.conferenceId ?? 1);
  const message = await readMessageFile(confId, msgNum, config.get('dataDir'));
  if (!message) return NOTHING;

  const body = sanitiseBody(String(message.body || ''));
  const start = at * MSGQUERY_REPLY_MAX;
  if (start >= body.length) return NOTHING;

  const text = body.slice(start, start + MSGQUERY_REPLY_MAX);
  return { text, bytes: text.length };
}

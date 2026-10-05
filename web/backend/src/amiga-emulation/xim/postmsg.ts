/**
 * AEW_POSTMSG (10500): a door posts a message through the board's own save.
 *
 * WHY THIS EXISTS. SUBS is a second way into the board's OWN message bases -
 * "a new way of accessing the mail and making the messages more exposed" (the
 * sysop, 2026-10-04). It reads HeaderFile off the disk so it runs on a real
 * Amiga, and it lets a caller post without leaving it. Until now that post was
 * written by the door itself, which skipped everything express.e's saveNewMSG
 * does around the file: the post count, the callers log, the comment
 * notification, achievements, the database copy every other reader uses, the
 * board's UTF-8 body - and the board's posting access, which a door cannot
 * evaluate (2026-10-04 SUBS proposal, conflicts 6-8). express.e has no
 * command for a door to post; this is this board's own, like AEW_SETPOINTER.
 *
 * The post goes through message-entry.handler.ts saveNewMessage, the same
 * function the E command's editor saves with, after the same access checks
 * enterMSG makes (express.e:24860 ACS_ENTER_MESSAGE, 10800-10816 EALL).
 *
 * WIRE FORMAT. A post does not fit in one message - String is 200 bytes - so
 * it is a short conversation of WRITES (data 0), each answered 1 taken / 0
 * refused, and the door READS the outcome back (data != 0, answer in String):
 *
 *     TO <P|R> <name>   start a post; the access checks happen here, before
 *                       the caller types anything. <name> is EALL or ALL.
 *     SUBJECT <text>    the subject, cut to 30 as enterMSG cuts it
 *     TEXT <bytes>      append body bytes, LF between lines; repeat
 *     SEND              save it
 *
 *     read ->  READY | POSTED <n> | LOCKED | FAILED | NO <sentence>
 *
 * THE DEGRADATION CONTRACT, the same as AEW_SETPOINTER's: a board that does
 * not know 10500 leaves String as the door sent it - empty, for a read - so a
 * door that reads back "" knows it is on a board that will not post for it,
 * and writes the message base itself (ae_msg_write), as it must on a real
 * AmiExpress.
 */
import type { BBSSession } from '../../index';
import { ACSPermission } from '../../constants/acs-permissions';
import { checkSecurity } from '../../utils/security.util';
import { isExtSendMsgBase } from '../../handlers/message/conf-mail-name';
import { namesMissing, saveNewMessage } from '../../handlers/message/message-entry.handler';

interface PendingPost {
  toUser: string;
  isPrivate: boolean;
  subject: string;
  body: string;
}

interface DoorPostState {
  pending: PendingPost | null;
  /** What the door reads back. */
  answer: string;
}

const states = new WeakMap<object, DoorPostState>();

function stateOf(session: object): DoorPostState {
  let s = states.get(session);
  if (!s) {
    s = { pending: null, answer: 'NO Nothing has been started.' };
    states.set(session, s);
  }
  return s;
}

/** The part of a request after its verb, untouched - a body keeps its spaces. */
function argumentOf(request: string, verb: string): string {
  const rest = request.slice(verb.length);
  return rest.startsWith(' ') ? rest.slice(1) : rest;
}

/**
 * enterMSG's access checks for a recipient, without its prompts. Returns the
 * stored recipient, or the sentence that refuses it.
 */
function recipientFor(session: BBSSession, name: string): { toUser: string } | { refused: string } {
  const conf = Number(session.currentConf || 0);
  const base = Number(session.currentMsgBase || 1);
  if (!session.user || conf < 1) return { refused: 'Nobody is in a conference.' };

  // internalCommandE (express.e:24860)
  if (!checkSecurity(session.user, ACSPermission.ENTER_MESSAGE)) {
    return { refused: 'You may not enter messages here.' };
  }
  // captureRealAndInternetNames: the board asks for the name at E; a door
  // cannot, so it says where to go.
  if (namesMissing(session, conf, base)) {
    return { refused: 'This conference needs your name first: use E at the prompt.' };
  }

  const lower = name.trim().toLowerCase();
  if (lower === '' || lower === 'all') return { toUser: 'ALL' };     // express.e:10796
  if (lower === 'eall') {
    if (isExtSendMsgBase(session)) return { refused: "Can't use EALL in external message bases!!" };
    if (!checkSecurity(session.user, ACSPermission.EALL_MESSAGES)) {   // express.e:10810
      return { refused: 'You may not post to everyone in this conference.' };
    }
    return { toUser: 'EALL' };
  }
  return { refused: 'A door can post to EALL or ALL. Use E at the prompt for one person.' };
}

/** What the door's read gets: the outcome of the last thing it asked. */
export function postMessageAnswer(session: object): string {
  return stateOf(session).answer;
}

/**
 * One AEW_POSTMSG write. Returns 1 when it was taken, 0 when refused - the
 * reason is in the answer the door reads next.
 */
export async function handlePostMessage(
  request: string,
  socket: any,
  session: BBSSession,
): Promise<0 | 1> {
  const state = stateOf(session as object);
  const text = String(request || '');
  const verb = (text.match(/^\S*/)?.[0] || '').toUpperCase();

  if (verb === 'TO') {
    const words = argumentOf(text, 'TO');
    const status = words.charAt(0).toUpperCase();
    state.pending = null;
    if (status !== 'P' && status !== 'R') {
      state.answer = 'NO A post is P or R.';
      return 0;
    }
    const who = recipientFor(session, words.slice(1));
    if ('refused' in who) {
      state.answer = `NO ${who.refused}`;
      return 0;
    }
    state.pending = { toUser: who.toUser, isPrivate: status === 'R', subject: '', body: '' };
    state.answer = 'READY';
    return 1;
  }

  const pending = state.pending;
  if (!pending) {
    state.answer = 'NO Nothing has been started.';
    return 0;
  }

  if (verb === 'SUBJECT') {
    // enterMSG's subject lineInput takes 30 (express.e:10847).
    pending.subject = argumentOf(text, 'SUBJECT').substring(0, 30);
    return 1;
  }

  if (verb === 'TEXT') {
    pending.body += argumentOf(text, 'TEXT');
    return 1;
  }

  if (verb === 'SEND') {
    state.pending = null;
    if (pending.subject === '') {
      state.answer = 'NO A post needs a subject.';
      return 0;
    }
    const lines = pending.body.split('\n').map((line) => line.replace(/\r$/, ''));
    while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop();
    if (lines.length === 0) {
      state.answer = 'NO Nothing to post.';
      return 0;
    }

    const outcome = await saveNewMessage(socket, session, {
      toUser: pending.toUser,
      subject: pending.subject,
      body: lines,
      isPrivate: pending.isPrivate,
    });
    if (outcome.saved) {
      state.answer = `POSTED ${outcome.msgNum}`;
      return 1;
    }
    state.answer = outcome.reason === 'locked' ? 'LOCKED' : 'FAILED';
    return 0;
  }

  state.answer = 'NO Unknown request.';
  return 0;
}

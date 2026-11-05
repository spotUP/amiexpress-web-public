/**
 * AEW_SETPOINTER (10300): let a door advance the caller's read pointers.
 *
 * WHY THIS EXISTS, and why it is an extension rather than a parity handler.
 *
 * On a real AmiExpress a door CANNOT advance the caller's message pointers.
 * That is not an omission in this port - it was measured in express.e:
 *
 *   - `LAST_READ` / `LAST_SCANNED` (express.e:3963-3966) answer into
 *     `msg.data` and never store. Three lines below, `MSGBASE_LOC`
 *     (express.e:3967-3973) DOES use the settable idiom - `IF (msg.data)`
 *     read, `ELSE` store - so read-only here is a deliberate choice, not a
 *     missing branch.
 *   - `LOADACCOUNT` (express.e:4557-4562) and `SAVEACCOUNT` (:4587-4595) both
 *     call `loadMsgPointers` afterwards, which discards anything a door put
 *     in its copy. The pointers live in `confBase`, not in the user record.
 *   - `saveMsgPointers` (express.e:4916-4973) writes `confBases.item(...)`, an
 *     IN-MEMORY array flushed by the board. A door writing `Conf.DB` on disk
 *     would be racing that copy, and the board's copy wins at logoff.
 *
 * So the board owns the pointer, and every express.e writer is a board-side
 * reader: `readit` (express.e:12370, 12376) and the custom ASCII/QWK dumps
 * (:26493, :26725), each followed by `saveMsgPointers`.
 *
 * That is fine until a DOOR becomes the reader. SUBS reads the message base
 * off the disk itself so it runs on a real Amiga, and the plan ships `R.info`
 * so it can take over the `R` command entirely. At that point nothing advances
 * the pointer, every message reads as new for ever, and the door's own
 * "N new for you" is a number the caller can never move.
 *
 * THE DEGRADATION CONTRACT - this is the part that keeps SUBS portable:
 *
 *   The request carries `msg.data = 0` (a write, per the direction flag every
 *   DT_ field uses - xim/data-query.ts:92). This board replies 1 when it
 *   stored the value. A board that does not know the command falls through to
 *   the unknown-command default, which replies with `msg.data` UNCHANGED -
 *   that is 0. So the door can tell the two apart with no version check, and a
 *   real AmiExpress simply keeps today's behaviour instead of breaking.
 *
 * The value travels in the STRING, not in `msg.data`, precisely so the reply
 * can carry an unambiguous 1/0. Putting it in `msg.data` would make a stored
 * value of 1 indistinguishable from "command unknown".
 *
 * Wire format - `msg.string`:
 *
 *     READ <n>     set the manual read pointer   (express.e lastMsgReadConf):
 *                  the last message read
 *     SCAN <n>     set the new-scan pointer      (express.e lastNewReadConf):
 *                  the NEXT message to scan, so a door that read up to m sends
 *                  m+1 (read-msg.ts searchNewMail sets msgNum+1; the join's
 *                  "Last message auto scanned" prints it minus one, 5103)
 *     RECV <n>     the caller opened message n: mark it received when it is
 *                  addressed to him, as readit does (express.e:8943-8949)
 *
 * Reply in `msg.data`: 1 stored, 0 refused or unknown.
 *
 * This is written up for the AmiExpress author as a proposed protocol
 * addition; see `thoughts/shared/plans/2026-09-13-proposed-setpointer.md`.
 */
import { loadMsgPointers, saveMsgPointers } from '../../utils/message-pointers.util';

/** What the board did with the request. 1 stored, 0 refused. */
export type PointerAnswer = 0 | 1;

/**
 * Pointers only ever move FORWARD.
 *
 * express.e's own writers are `IF(msgNum>lastMsgReadConf) THEN
 * lastMsgReadConf:=msgNum` (express.e:12370, 12376) - never a plain
 * assignment. A door that walks a list backwards, or re-reads an old message,
 * must not un-read everything after it. Rewinding is a sysop operation, not a
 * door one, so a lower value is accepted as a no-op rather than an error: the
 * door asked for a state that is already true.
 */
function forwardOnly(current: number, requested: number): number {
  return requested > current ? requested : current;
}

/**
 * Answer one AEW_SETPOINTER request.
 *
 * Returns 0 for anything it will not do - no session, no user, a verb it does
 * not know, a number it cannot parse - because the door's fallback for all of
 * them is identical: carry on without marking read.
 */
export async function handleSetPointer(
  request: string,
  session: any,
): Promise<PointerAnswer> {
  const words = String(request || '').trim().split(/\s+/);
  const verb = (words[0] || '').toUpperCase();
  const value = Number(words[1]);

  if (verb !== 'READ' && verb !== 'SCAN' && verb !== 'RECV') return 0;
  // NaN, negative and fractional all fail this - a pointer is a message
  // number, and express.e stores it as a LONG.
  if (!Number.isInteger(value) || value < 0) return 0;

  const user = session?.user;
  // Inside a message-base door the row is the one the launch loaded the
  // pointers from (custom-msgbase.ts doorPointerRow) - which is NOT always the
  // caller's conference: MS runs the door for each conference in turn.
  const row = session?.customMsgPointerRow;
  const confId = Number(row?.conf ?? session?.currentConf);
  const msgBaseId = Number(row?.msgBaseId ?? session?.currentMsgBase);
  if (!user?.id || !Number.isInteger(confId) || confId < 1) return 0;
  if (!Number.isInteger(msgBaseId) || msgBaseId < 1) return 0;

  if (verb === 'RECV') return markReceivedByDoor(session, confId, value);

  try {
    const confBase = await loadMsgPointers(String(user.id), confId, msgBaseId);

    // The session is what every other reader in this process consults, and
    // conference.handler copies session -> confBase on join. Move both, or a
    // later join would write the stale session value back over this one.
    if (verb === 'READ') {
      const next = forwardOnly(Number(session.lastMsgReadConf || 0), value);
      session.lastMsgReadConf = next;
      confBase.lastMsgReadConf = next;
      confBase.lastNewReadConf = Number(session.lastNewReadConf || confBase.lastNewReadConf || 0);
    } else {
      const next = forwardOnly(Number(session.lastNewReadConf || 0), value);
      session.lastNewReadConf = next;
      confBase.lastNewReadConf = next;
      confBase.lastMsgReadConf = Number(session.lastMsgReadConf || confBase.lastMsgReadConf || 0);
    }

    await saveMsgPointers(confBase);
    return 1;
  } catch (err) {
    // A door must never hang or die because the board could not write a
    // pointer. Saying 0 leaves it in exactly the state it would be in on a
    // real AmiExpress, which the door already has to handle.
    console.warn('[AEW_SETPOINTER] could not store the pointer:', err);
    return 0;
  }
}

/**
 * RECV: the board's own rule (read-msg.ts markReceived), on the header the
 * door named. 1 when the message is now received by its addressee - marked
 * here or before - and 0 when it is not his, or not there.
 */
function markReceivedByDoor(session: any, confId: number, msgNum: number): PointerAnswer {
  if (msgNum < 1) return 0;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { messageIndexManager } = require('../../services/MessageIndexManager');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { markReceived, sameName } = require('../../handlers/message/read-msg');
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { getConfMailName } = require('../../handlers/message/conf-mail-name');
    const headers = messageIndexManager.readHeaderFile(confId) as Array<{ msgNumb: number; toName: string; recv: number }>;
    const h = headers.find((x) => x.msgNumb === msgNum);
    if (!h) return 0;
    if (markReceived(session, confId, h)) return 1;
    return h.recv !== 0 && sameName(h.toName, getConfMailName(session)) ? 1 : 0;
  } catch (err) {
    console.warn('[AEW_SETPOINTER] could not mark received:', err);
    return 0;
  }
}

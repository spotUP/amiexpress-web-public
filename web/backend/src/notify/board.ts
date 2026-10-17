/**
 * The Board channel: a notification drawn on the caller's own terminal.
 *
 * Same two entry points, same drawing and same rules as
 * achievements/notices.ts - this file only supplies the Board channel's
 * table and notice. The toast renderer, the bytes-for-this-terminal rule and
 * the "at the prompt" test are the achievements ones, imported:
 *
 *   drainNotifyInbox(socket, session)   called by displayMainMenu beside
 *       drainAchievementNotices; reads and deletes everything waiting for the
 *       caller and writes each.
 *   deliverBoard(io, userId, item)      called by the dispatcher; drawn now
 *       when the caller is at the prompt on a live session, otherwise kept in
 *       notify_inbox for the next menu (which is also the next login).
 */
import type { AchievementNotice } from '@amiexpress/bbs-door-sdk/components/achievement-toast';
import type { NotifyItem } from '@amiexpress/bbs-door-sdk/formats/notify';
import { atThePrompt, defaultNoticeDeps, noticeBytes } from '../achievements/notices';
import type { NoticeDeps, NoticeSession } from '../achievements/notices';
import { emitterForUserId } from '../server/session-emitter-registry';
import { isParked } from '../server/session-parking';
import { addInbox, markOffered, needsOffer, takeInbox } from './repository';

/** The command that opens the Notifications door. */
export const NOTIFY_COMMAND = 'NOTIFY';

/** The one-time logon offer, as the shared toast shows it. */
export const OFFER_NOTICE: AchievementNotice = {
  kind: 'notice',
  title: 'NOTIFICATIONS',
  text: `Type ${NOTIFY_COMMAND} to choose how the board reaches you: email, push or here.`,
};

/** An item as the shared toast wants it. */
export function toNotice(item: NotifyItem): AchievementNotice {
  return { kind: 'notice', title: item.title.toUpperCase(), text: item.body };
}

/** Called by displayMainMenu before the prompt. Non-throwing: a failure here must not stop the menu. */
export function drainNotifyInbox(
  socket: { emit: (event: string, data: string) => unknown },
  session: NoticeSession,
  deps: NoticeDeps = defaultNoticeDeps,
): number {
  try {
    const userId = session.user?.id;
    const handle = deps.rawDb();
    // A parked session has nobody at the screen: the inbox waits for the resume.
    if (userId === undefined || userId === null || !handle || isParked(session)) return 0;
    const items = takeInbox(handle, String(userId));
    for (const item of items) socket.emit('ansi-output', noticeBytes(session, toNotice(item)));
    // Once per caller, ever: the first menu after logon of someone who never
    // opened NOTIFY. Recorded before it is drawn, so a failed draw is not repeated.
    let offered = 0;
    if (needsOffer(handle, String(userId))) {
      markOffered(handle, String(userId), Math.floor(deps.now() / 1000));
      socket.emit('ansi-output', noticeBytes(session, OFFER_NOTICE));
      offered = 1;
    }
    return items.length + offered;
  } catch (err) {
    console.warn(`[WARN] notify: board notices not drawn: ${(err as Error).message}`);
    return 0;
  }
}

/** Drawn now ('shown'), kept for the next menu ('kept'), or lost to a missing database ('dropped'). */
export function deliverBoard(io: unknown, userId: string, item: NotifyItem, deps: NoticeDeps = defaultNoticeDeps): 'shown' | 'kept' | 'dropped' {
  const handle = deps.rawDb();
  if (!handle) return 'dropped';
  try {
    const live = emitterForUserId(userId, io as any);
    if (live && !isParked(live.session) && atThePrompt(live.session as unknown as NoticeSession)) {
      // A prompt ends mid-line: start the toast on a line of its own, in the
      // same write (see deliverNotice).
      live.emitter.emit('ansi-output', '\r\n' + noticeBytes(live.session as unknown as NoticeSession, toNotice(item)));
      return 'shown';
    }
  } catch (err) {
    console.warn(`[WARN] notify: live board notice failed, kept for the next menu: ${(err as Error).message}`);
  }
  addInbox(handle, userId, item, Math.floor(deps.now() / 1000));
  return 'kept';
}

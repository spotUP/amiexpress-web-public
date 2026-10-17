/**
 * Where an unlock is shown (S6): at exactly one place, the command-prompt
 * boundary - inside displayMainMenu, after the menu and before the prompt.
 * Never mid-door, never between a prompt and its answer.
 *
 * Two entry points, one drawing (the SDK's toast):
 *   drainAchievementNotices(socket, session)  called by displayMainMenu; reads
 *       and deletes every pending notice for the caller and writes each.
 *   deliverNotice(io, userId, notice)         called by the flusher when the
 *       server answers; if the caller is at the prompt right now it is drawn
 *       at once, otherwise it waits in achievement_pending_notices for the
 *       next menu - which is also the next login.
 */
import type Database from 'better-sqlite3';
import { renderAchievementToast } from '@amiexpress/bbs-door-sdk/components/achievement-toast';
import type { AchievementNotice } from '@amiexpress/bbs-door-sdk/components/achievement-toast';
import { db } from '../database';
import { LoggedOnSubState } from '../constants/bbs-states';
import { emitterForUserId } from '../server/session-emitter-registry';
import { addLinkNotice, addUnlockNotice, takeNotices } from './outbox.repository';
import type { Notice } from './outbox.repository';
import type { UnlockOut } from './contract';
import { doorScreenWidth } from '../amiga-emulation/xim/screen-width.util';

/** The command a caller types to reach the ACHIEVE door. */
export const ACHIEVE_COMMAND = 'ACHIEVE';

export interface NoticeSession {
  user?: { id?: string | number } | null;
  subState?: string;
  inDoorManager?: boolean;
  screenWidth?: number;
  petsciiMode?: boolean;
  /** 40 (a C64) or 80 (the web terminal's wide PETSCII screen). Absent = 40. */
  petsciiColumns?: number;
  terminalType?: string;
  /** Set while the session is parked (server/session-parking.ts isParked). */
  detachedAt?: number;
}

export interface NoticeDeps {
  rawDb: () => Database.Database | undefined;
  now: () => number;
}

export const defaultNoticeDeps: NoticeDeps = {
  rawDb: () => (db as any).db as Database.Database | undefined,
  now: () => Date.now(),
};

/** A pending row, or an unlock straight from the server, as the toast wants it. */
export function toToast(kind: 'unlock' | 'link', unlock: UnlockOut | null): AchievementNotice {
  if (kind === 'link' || !unlock) return { kind: 'link', doorCommand: ACHIEVE_COMMAND };
  return { kind: 'unlock', name: unlock.name, tier: unlock.tier, points: unlock.points };
}

/** The bytes for this caller's terminal. */
export function noticeBytes(session: NoticeSession, notice: AchievementNotice): string {
  const petscii = session.petsciiMode === true || session.terminalType === 'c64';
  // A PETSCII screen's width is the MODE's, never the browser's report:
  // doorScreenWidth is the same authority BB_SCRWIDTH, wrapForSession and
  // BBSApi.getTerminalSize already answer with - 40 for a C64, 80 for the
  // wide screen. Reading `screenWidth` first drew an 80-wide toast across a
  // C64's 40-column screen whenever the session still carried the width the
  // browser reported before the caller answered P.
  const width = petscii ? doorScreenWidth(session, 40) : (session.screenWidth ?? 80);
  // The frame is the SDK's border alphabet: Amiga ASCII for every non-PETSCII
  // caller. The web terminal is Topaz and has no PC box-drawing, so even a
  // Unicode-capable session is not given any.
  return renderAchievementToast(notice, width, { petscii, bare: true }) + '\r\n';
}

/** True when a toast may be drawn on this session right now. */
export function atThePrompt(session: NoticeSession): boolean {
  if (session.inDoorManager) return false;
  return session.subState === LoggedOnSubState.READ_COMMAND || session.subState === LoggedOnSubState.READ_SHORTCUTS;
}

/**
 * Called by displayMainMenu before the prompt: everything the caller has
 * not seen, oldest first. Non-throwing: a failure here must not stop the
 * menu.
 */
export function drainAchievementNotices(socket: { emit: (event: string, data: string) => unknown }, session: NoticeSession, deps: NoticeDeps = defaultNoticeDeps): number {
  try {
    const userId = session.user?.id;
    const handle = deps.rawDb();
    if (userId === undefined || userId === null || !handle) return 0;
    const notices: Notice[] = takeNotices(handle, String(userId));
    for (const n of notices) socket.emit('ansi-output', noticeBytes(session, toToast(n.kind, n.unlock)));
    return notices.length;
  } catch (err) {
    console.warn(`[WARN] achievements: notices not drawn: ${(err as Error).message}`);
    return 0;
  }
}

/**
 * Called by the flusher. Drawn now if the caller is at the prompt on a live
 * session; otherwise kept for the next menu. Returns 'shown' or 'kept'.
 */
export function deliverNotice(io: unknown, userId: string, kind: 'unlock' | 'link', unlock: UnlockOut | null, deps: NoticeDeps = defaultNoticeDeps): 'shown' | 'kept' | 'dropped' {
  const handle = deps.rawDb();
  if (!handle) return 'dropped';
  const now = Math.floor(deps.now() / 1000);
  try {
    const live = emitterForUserId(userId, io as any);
    if (live && atThePrompt(live.session as unknown as NoticeSession)) {
      // Start on a line of our own.
      //
      // This path fires while the caller is sitting AT the prompt, and a
      // prompt ends mid-line with no newline after it - so a toast written
      // straight out begins at whatever column the cursor happened to be in,
      // and the box's top edge starts inside "Menu (56 mins. left): ".
      // Reported from the board 2026-09-08 with a screenshot of exactly that.
      //
      // The menu path (drainAchievementNotices) does not need this: it runs
      // after the menu's own newline and before the prompt is written.
      // One write, not two: the newline belongs to the same toast, and a
      // second emit is a second packet on a byte transport for no reason.
      live.emitter.emit(
        'ansi-output',
        '\r\n' + noticeBytes(live.session as unknown as NoticeSession, toToast(kind, unlock)),
      );
      return 'shown';
    }
  } catch (err) {
    console.warn(`[WARN] achievements: live notice failed, kept for the next menu: ${(err as Error).message}`);
  }
  if (kind === 'unlock' && unlock) addUnlockNotice(handle, userId, unlock, now);
  else addLinkNotice(handle, userId, now);
  return 'kept';
}

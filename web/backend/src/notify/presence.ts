/**
 * Is this caller logged on right now, over any transport?
 *
 * Decision 6: a caller who is on the board sees the notification at the prompt
 * (the Board channel), so email and push are not sent for them. This is the
 * one question both senders ask; push (N5) reuses it.
 *
 * The board's own lookup, not a new one: `userSessions` (userId -> session) is
 * populated after login for web, telnet and SSH alike (see
 * server/session-emitter-registry.ts), and /health counts a caller the same
 * way - state LOGGEDON with a user attached.
 */
import { BBSState } from '../constants/bbs-states';
import { userSessions } from '../server/session-manager';
import { isParked } from '../server/session-parking';

export function isLoggedOn(userId: string | number): boolean {
  const session = userSessions.get(String(userId));
  // A parked session (dropped, waiting for its resume) is away: nobody is at the prompt.
  return !!session && session.state === BBSState.LOGGEDON && !!session.user && !isParked(session);
}

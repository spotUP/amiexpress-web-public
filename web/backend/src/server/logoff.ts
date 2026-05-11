/**
 * Centralised disconnect helper — state-machine analogue of express.e's
 * `state := STATE_LOGGING_OFF; RETURN` pattern (e.g. lines 28736-28742
 * for the reserved-node bump; 28722-28725 for invalid credentials).
 *
 * Replaces the project's prior `socket.emit(...); setTimeout(() =>
 * socket.disconnect(), N); return` boilerplate (~31 sites across
 * auth-socket-handlers, command.handler, new-user.handler, gdpr.handler).
 *
 * Two things this guarantees over the inline pattern:
 *
 *  1. **State discipline.** Every logoff sets `session.state` to a
 *     terminal value (BBSState.LOGGING_OFF by default, BBSState.AWAIT
 *     for pre-login bumps that never reached LOGGEDON) before tearing
 *     the socket down. The previous inline pattern set the state only
 *     at some sites; the rest left state stale, so any code path that
 *     read `session.state` after a bump saw the wrong value.
 *
 *  2. **Force-close at engine layer.** `socket.disconnect(true)` closes
 *     the underlying engine.io transport rather than just the
 *     namespace, so a malicious or stuck client can't keep the TCP
 *     connection open after a bump. The inline `socket.disconnect()`
 *     calls were namespace-only.
 *
 * Timing: the readDelayMs window exists so the user can actually read
 * the goodbye message before the connection drops. socket.io's emit
 * is asynchronous — the message packet is queued on the engine
 * transport in the current tick and flushed at the next event-loop
 * iteration. A non-zero delay also gives short ANSI messages a moment
 * to render in the client's terminal. Defaults to 500ms (matches
 * historical timing for failed-auth bumps); pass 1500ms for the
 * longer "Thanks you will now be disconnected" cases where the user
 * needs more reading time.
 */

import type { Socket } from 'socket.io';
import { BBSState } from '../constants/bbs-states';
import type { BBSSession } from '../index';

export interface BeginLogoffOptions {
  /**
   * Optional final message to emit before close. If supplied, sent
   * via `socket.emit(event, message)` immediately before the close
   * timer is scheduled. Callers that already emitted their own
   * messages (multi-line goodbyes etc) can leave this undefined.
   */
  message?: string;
  /**
   * Socket.io event channel for the message. Defaults to
   * 'ansi-output' — the channel xterm.js subscribes to.
   */
  event?: string;
  /**
   * Final session.state value. Defaults to BBSState.LOGGING_OFF (the
   * canonical post-LOGGEDON terminal state). Use BBSState.AWAIT for
   * pre-login bumps where the user never authenticated. Skipped when
   * the caller passes no session (sessionless connect-time disconnect).
   */
  finalState?: BBSState;
  /**
   * Milliseconds to wait between scheduling the disconnect and
   * actually firing it. Lets the client render the final message
   * before the connection drops. Defaults to 500.
   */
  readDelayMs?: number;
}

/**
 * Begin the logoff state transition for a socket. Sets the session
 * state, emits the optional final message, and schedules a
 * force-close of the underlying engine.io transport after readDelayMs.
 *
 * Returns synchronously; the disconnect itself happens asynchronously
 * via a timer (unref'd so a pending close doesn't keep the process
 * alive after tests finish). Idempotent: a second call on the same
 * socket is a no-op once the close has been scheduled.
 */
export function beginLogoff(
  socket: Socket,
  session: BBSSession | undefined,
  opts: BeginLogoffOptions = {},
): void {
  // Mark the socket so a follow-up beginLogoff is a no-op. The flag
  // lives on the socket instance, not the session, because some bump
  // paths run without a session (raw connect-time rejections).
  const marked = (socket as any).__logoffScheduled;
  if (marked) return;
  (socket as any).__logoffScheduled = true;

  if (session) {
    session.state = opts.finalState ?? BBSState.LOGGING_OFF;
  }
  if (opts.message !== undefined) {
    try {
      socket.emit(opts.event ?? 'ansi-output', opts.message);
    } catch {
      // Emit can fail if the socket was already torn down by the
      // transport layer. Continue to schedule disconnect anyway.
    }
  }
  const delay = Math.max(0, opts.readDelayMs ?? 500);
  const timer = setTimeout(() => {
    try {
      // disconnect(true) closes the engine.io transport, not just the
      // namespace. Critical when a bumped socket would otherwise
      // continue to consume server resources via the namespace-only
      // disconnect path.
      socket.disconnect(true);
    } catch {
      // Socket already gone (closed by the client or another path).
    }
  }, delay);
  // Don't let a pending logoff timer keep the Node process alive.
  // Tests that disconnect quickly need this; production keeps the
  // server alive via the listening socket.
  if (typeof timer.unref === 'function') timer.unref();
}

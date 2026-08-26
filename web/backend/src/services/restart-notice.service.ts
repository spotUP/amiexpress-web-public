/**
 * Restart notice broadcast.
 *
 * Deploying recreates the container, which drops every connected session at
 * once. On 2026-08-26 eight deploys went out in 46 minutes and the user was
 * thrown out of /chat over and over while trying to test the very fixes being
 * deployed. This gives everybody a countdown first.
 *
 * The signal comes from the deploy workflow as SIGUSR1 (see index.ts), which
 * is sent AFTER the image has been built and BEFORE the container is
 * recreated - so the countdown overlaps nothing and costs no extra downtime.
 *
 * Delivery is split by who owns the screen:
 *   - a door is running  -> structured 'system:notice' event, which the door
 *                           renders through its own notification path
 *   - plain terminal     -> an ANSI banner on 'ansi-output'
 *
 * Writing the banner unconditionally would paint it across a blessed door's
 * screen; see utils/door-owns-terminal.ts.
 */

import { AnsiUtil } from '../utils/ansi.util';
import { doorOwnsTerminal } from '../utils/door-owns-terminal';
import { sessions, getSocketIdByNodeId } from '../server/session-manager';

/** Minimal shape of the socket.io server this module needs. */
export interface RestartNoticeIo {
  to(socketId: string): { emit(event: string, ...args: any[]): void };
}

export interface RestartNoticeDeps {
  sessions: Map<string, any>;
  getSocketIdByNodeId: (nodeId: number) => string | undefined;
}

export interface RestartNoticePayload {
  kind: 'restart';
  seconds: number;
  message: string;
}

/** Seconds remaining at which a notice is sent, longest first. */
export const NOTICE_MARKS = [60, 30, 10, 5];

/** Default countdown length; override with RESTART_NOTICE_SECONDS. */
export const DEFAULT_RESTART_SECONDS = 60;

function defaultDeps(): RestartNoticeDeps {
  return { sessions, getSocketIdByNodeId };
}

export function restartNoticeText(seconds: number): string {
  return seconds === 1
    ? 'SYSTEM UPDATE - restarting in 1 second. You will be reconnected automatically.'
    : `SYSTEM UPDATE - restarting in ${seconds} seconds. You will be reconnected automatically.`;
}

/**
 * Send one notice to every live session. Returns how many were reached, split
 * by delivery path, so the caller can log something meaningful.
 */
export function broadcastRestartNotice(
  io: RestartNoticeIo,
  seconds: number,
  deps: RestartNoticeDeps = defaultDeps(),
): { doors: number; terminals: number } {
  const message = restartNoticeText(seconds);
  const banner = '\r\n' + AnsiUtil.warning('*** ' + message + ' ***') + '\r\n';
  const payload: RestartNoticePayload = { kind: 'restart', seconds, message };

  let doors = 0;
  let terminals = 0;

  for (const [nodeIdKey, session] of deps.sessions.entries()) {
    const nodeId = parseInt(nodeIdKey, 10);
    if (Number.isNaN(nodeId)) continue;

    const socketId = deps.getSocketIdByNodeId(nodeId);
    if (!socketId) continue;

    if (doorOwnsTerminal(session)) {
      io.to(socketId).emit('system:notice', payload);
      doors++;
    } else {
      io.to(socketId).emit('ansi-output', banner);
      terminals++;
    }
  }

  // Say how many were actually reached. A silent broadcast that found no
  // sessions looks identical to one that worked, and the whole point of this
  // is that people are told before their session dies.
  console.log(
    `[RESTART NOTICE] ${seconds}s: notified ${doors} door session(s), ${terminals} terminal session(s)`,
  );

  return { doors, terminals };
}

/**
 * Send the first notice immediately and schedule the rest of the countdown.
 * Returns the pending timers so a caller (or a test) can cancel them.
 */
export function startRestartCountdown(
  io: RestartNoticeIo,
  totalSeconds: number = DEFAULT_RESTART_SECONDS,
  deps: RestartNoticeDeps = defaultDeps(),
): ReturnType<typeof setTimeout>[] {
  const marks = NOTICE_MARKS.filter((m) => m <= totalSeconds);
  if (marks.length === 0) marks.push(totalSeconds);

  const timers: ReturnType<typeof setTimeout>[] = [];

  marks.forEach((mark, index) => {
    const delayMs = (totalSeconds - mark) * 1000;
    if (index === 0 && delayMs === 0) {
      broadcastRestartNotice(io, mark, deps);
      return;
    }
    const timer = setTimeout(() => {
      broadcastRestartNotice(io, mark, deps);
    }, delayMs);
    // Never hold the process open for a countdown - the container is about to
    // be replaced anyway.
    (timer as any).unref?.();
    timers.push(timer);
  });

  return timers;
}

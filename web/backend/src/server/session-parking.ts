/**
 * Park and resume (session-persistence plan, S6).
 *
 * A logged-on web caller whose socket drops (a phone locking its screen, a
 * train tunnel, a laptop lid) does not log off. The session's link parks: the
 * node stays held, the door keeps running, output is held, and the caller has
 * `WEB_RESUME_MINUTES` to come back with the resume token. Coming back
 * attaches the PARKED link to the new socket, so `session.webLink` is still
 * the link of the socket the session lives on, and `session.socketId` moves
 * with it (the invariant S5 set up).
 *
 * When the window ends the link ends with `transport close`, which runs the
 * one disconnect handler and its finalize - the same `Loss Carrier` path a
 * drop took before parking existed.
 *
 * Imports point one way: socket-handlers imports this file, never the
 * reverse. Heavy modules (db, logon gates, node manager, ANSI buffer) are
 * required lazily so tests that mock the connection path keep working.
 */
import type { Socket } from 'socket.io';
import { BBSState } from '../constants/bbs-states';
import type { BBSSession } from '../index';
import type { DropDecision, SessionLink } from './session-link';
import {
  lookupResumeToken, rotateResumeToken, setResumeExpiry, tokenFingerprint,
} from './resume-tokens';
import { sessions, socketToNodeId, socketToUser, setSession } from './session-manager';
import { startObserving, stopObserving } from './session-observers';
import { cleanupTransfer } from '../utils/raw-transfer-teardown.util';
import { sessionWantsPetscii, disposePetsciiSessionModel } from '../utils/petscii-session-model';

/** The node action a parked session shows (WHO, the sysop node list). */
export const PARKED_ACTION = 'Detached';
export type ResumeRefusal = 'unknown' | 'expired' | 'ended' | 'account';

/** What `parkDecision` reads; a BBSSession satisfies it. */
export interface ParkableSession {
  connectionType?: string;
  chatOnly?: boolean;
  state?: unknown;
  user?: unknown;
  cleanLogoff?: boolean;
  sysopKicked?: boolean;
}

const PARKABLE_REASONS = new Set(['transport close', 'transport error', 'ping timeout']);
const DEFAULT_MINUTES = 10;
const windowTimers = new WeakMap<object, ReturnType<typeof setTimeout>>();
/** When each parked session's window ends (ms epoch), so a refused resume can re-arm it. */
const windowDeadlines = new WeakMap<object, number>();
/** Sessions a resume has claimed and not yet finished (N1: one token, one resume). */
const resuming = new WeakSet<object>();
/** The finalize a session's end is running, so a caller can wait for it. */
const endings = new WeakMap<object, Promise<void>>();

/** `web_resume_minutes` (WEB_RESUME_MINUTES) in ms; default 10 min, 0 = never park. */
export function resumeWindowMs(): number {
  try {
    const { config } = require('../config');
    const { getBoardConfig } = require('../services/bbs-config-file.service');
    const m = getBoardConfig(config.get('dataDir'))?.web_resume_minutes;
    return (typeof m === 'number' && m >= 0 ? m : DEFAULT_MINUTES) * 60_000;
  } catch {
    return DEFAULT_MINUTES * 60_000;
  }
}

/**
 * WEB_: express.e logs off on carrier loss (express.e:8160-8166). A web caller's
 * carrier is a socket a phone drops whenever it locks, so a logged-on web
 * session waits `WEB_RESUME_MINUTES` for its caller first (sysop, 2026-10-15).
 */
export function parkDecision(s: ParkableSession, reason: string, windowMs: number): DropDecision {
  if (windowMs <= 0) return 'end';
  if ((s.connectionType ?? 'web') !== 'web' || s.chatOnly) return 'end';
  if (s.state !== BBSState.LOGGEDON || !s.user) return 'end';
  if (s.cleanLogoff || s.sysopKicked) return 'end';
  return PARKABLE_REASONS.has(reason) ? 'park' : 'end';
}

export function isParked(s: { detachedAt?: number } | null | undefined): boolean {
  return typeof s?.detachedAt === 'number';
}

function clearWindow(session: object): void {
  const t = windowTimers.get(session);
  if (t !== undefined) clearTimeout(t);
  windowTimers.delete(session);
}

/** Run the window clock to `deadline`; when it runs out, the link ends and the session with it. */
function armWindow(link: SessionLink, session: object, deadline: number): void {
  clearWindow(session);
  windowDeadlines.set(session, deadline);
  const t = setTimeout(() => link.end('transport close'), Math.max(0, deadline - Date.now()));
  (t as { unref?: () => void }).unref?.();
  windowTimers.set(session, t);
}

/** Give the link its drop rule; the window timer dies with the session. */
export function installParking(link: SessionLink, session: BBSSession): void {
  link.on('disconnect', () => clearWindow(session));
  link.setHooks({
    onDrop: (reason) => {
      const windowMs = resumeWindowMs();
      const d = parkDecision(session as unknown as ParkableSession, reason, windowMs);
      if (d !== 'park') return d;
      session.detachedAt = Date.now();
      cleanupTransfer(session);                      // a ZMODEM cannot cross sockets (Decision 16)
      setResumeExpiry(session, session.detachedAt + windowMs);
      armWindow(link, session, session.detachedAt + windowMs);
      console.log(`[PARK] node ${session.nodeId} parked for ${windowMs / 60000} min (${reason})`);
      return 'park';
    },
  });
}

/** The disconnect handler registers the finalize it runs, so `endParkedSessionsFor` can wait for it. */
export function noteSessionEnding(session: object, finalize: Promise<void>): void {
  endings.set(session, finalize);
}

type Resumed = { ok: true; session: BBSSession } | { ok: false; reason: ResumeRefusal };

/**
 * Attach a parked (or frozen-but-connected, Decision 7) session to `raw`.
 * Refusals leave the session as it was, except a refused ACCOUNT, which also
 * ends the parked session: a banned or deleted caller must not keep a node.
 *
 * One token, one resume: the session is claimed before the first await, so a
 * second resume with the same token in the same moment (a socket.io retry
 * beside a wake) meets `unknown`, as it would after the rotation (plan,
 * Review focus 2).
 */
export async function resumeParked(raw: Socket, token: unknown): Promise<Resumed> {
  const found = lookupResumeToken(token);
  if (!found.ok) {
    console.log(`[RESUME] refused (${found.reason})`);
    return { ok: false, reason: found.reason };
  }
  const { userId, nodeId } = found.bound;
  const session = found.bound.session as BBSSession;
  if (resuming.has(session)) {
    console.log(`[RESUME] refused (unknown): node ${nodeId} is already being resumed`);
    return { ok: false, reason: 'unknown' };
  }
  const link = session.webLink;
  const live = () => sessions.get(String(nodeId)) === session && !!link && !link.ended;
  if (!live()) {
    console.log(`[RESUME] refused (ended) for node ${nodeId}`);
    return { ok: false, reason: 'ended' };
  }
  // Before any await: claim the session, and stop the window clock so the
  // window cannot end while the account is read.
  resuming.add(session);
  clearWindow(session);
  try {
    return await attachResumed(raw, token, session, link!, userId, nodeId, live);
  } finally {
    resuming.delete(session);
  }
}

async function attachResumed(
  raw: Socket, token: unknown, session: BBSSession, link: SessionLink,
  userId: string, nodeId: number, live: () => boolean,
): Promise<Resumed> {
  const { db } = require('../database');
  const { tokenHolderRefusal } = require('../services/logon-gates');
  let user: { id: number; username: string; baud?: unknown; realname?: string; secLevel?: number; expert?: unknown; ansi?: unknown } | null;
  try {
    user = await db.getUserById(Number(userId));
  } catch (err) {
    // The board could not read the account: that says nothing about the
    // account, so this resume is refused and the session stays parked until
    // its window ends, its token still good.
    console.error(`[RESUME] refused (unknown) for node ${nodeId}: account lookup failed:`, err instanceof Error ? err.message : err);
    if (live() && isParked(session)) armWindow(link, session, windowDeadlines.get(session) ?? Date.now());
    return { ok: false, reason: 'unknown' };
  }
  if (!live()) return { ok: false, reason: 'ended' };
  if (!user || tokenHolderRefusal(user).refusal !== null) {
    console.log(`[RESUME] refused (account) for node ${nodeId}; ending its parked session`);
    link.end('server namespace disconnect');
    return { ok: false, reason: 'account' };
  }

  const oldId = link.id;
  link.attach(raw);
  socketToNodeId.delete(oldId);
  socketToUser.delete(oldId);
  setSession(raw.id, session);
  socketToUser.set(raw.id, userId);
  const { nodeManager } = require('../services/node-manager.service');
  nodeManager.rekeySession(oldId, raw.id);
  stopObserving(oldId);
  startObserving(raw.id);

  session.detachedAt = undefined;
  setResumeExpiry(session, null);
  const next = rotateResumeToken(session);

  const userBaud = Number(user.baud) || 0;
  session.modemBps = userBaud;
  session.modemEmulationEnabled = userBaud > 0;
  (session as unknown as { modemSpeed?: number }).modemSpeed = userBaud;
  raw.emit('modem-speed', userBaud);
  try {
    const { getAnsiBuffer } = require('../utils/ansi-buffer.util');
    getAnsiBuffer(link).setFlushDelay(userBaud > 0 ? 0 : 16);
  } catch { /* no buffer on this link yet */ }

  // The browser clears the door it thought was up when it reconnects, and
  // door:load-client never comes again: re-announce the running client door.
  const door = session as unknown as { clientDoorActive?: boolean; clientDoorId?: string };
  if (door.clientDoorActive && door.clientDoorId) raw.emit('door:active-client', { doorId: door.clientDoorId });

  raw.emit('session-restored', {
    user: {
      id: user.id, username: user.username, realname: user.realname,
      secLevel: user.secLevel, expert: user.expert, ansi: user.ansi,
    },
    userId: user.id,
    username: user.username,
    nodeId: session.nodeId,
    currentConf: session.currentConf,
    resumeToken: next,
  });

  const held = link.takeHeld();
  if (held.overflowed || sessionWantsPetscii(session)) {
    // Held output is incomplete, or a PETSCII model describes a screen the
    // rebuilt browser canvas no longer has: start the screen over instead.
    disposePetsciiSessionModel(session);
    raw.emit('ansi-output', '\x1b[2J\x1b[H');
    const geo = session as unknown as { screenWidth?: number; screenHeight?: number };
    session.bbsApi?.emitInternal?.('screen:resize', { cols: geo.screenWidth ?? 80, rows: geo.screenHeight ?? 25 });
  } else {
    for (const [e, a] of held.chunks) raw.emit(e, ...a);
  }

  console.log(`[RESUME] node ${session.nodeId} resumed (token ${tokenFingerprint(String(token))})`);
  return { ok: true, session };
}

/** End every parked session of `userId` and wait for each finalize. Returns the count. */
export async function endParkedSessionsFor(userId: string): Promise<number> {
  const parked = [...sessions.values()].filter((s) =>
    isParked(s) && s.webLink && !s.webLink.ended && String((s.user as { id?: unknown } | undefined)?.id) === String(userId));
  for (const s of parked) {
    s.webLink!.end('transport close');
    await endings.get(s);
  }
  return parked.length;
}

/** The session parked longest (S11 uses it to free a node). */
export function oldestParkedSession(): BBSSession | null {
  let best: BBSSession | null = null;
  for (const s of sessions.values()) {
    if (isParked(s) && (best === null || s.detachedAt! < best.detachedAt!)) best = s;
  }
  return best;
}

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
import { BBSState, LoggedOnSubState } from '../constants/bbs-states';
import type { BBSSession } from '../index';
import type { DropDecision, SessionLink } from './session-link';
import {
  issueResumeToken, lookupResumeToken, setResumeExpiry, tokenFingerprint,
} from './resume-tokens';
import { sessions, socketToNodeId, socketToUser, setSession, getNextAvailableNodeId } from './session-manager';
import { startObserving, stopObserving } from './session-observers';
import { rekeyScreenModel, renderWholeScreen } from '../services/screen-model/screen-model';
import { getSystemTime } from '../utils/date-time.util';
import { publishNodeStatus } from '../utils/acs.util';
import { cleanupTransfer } from '../utils/raw-transfer-teardown.util';
import { sessionWantsPetscii, disposePetsciiSessionModel } from '../utils/petscii-session-model';

/** The node action a parked session shows (WHO, the sysop node list). */
export { PARKED_ACTION } from '../utils/who-table.util';
/** Why a resume was refused. */
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
/**
 * Who waits for a session to leave the maps (S11). The finalize clears the
 * maps and frees the node first, then does slow paperwork (logoff batches
 * run a 68K door); a reclaim needs only the first part.
 */
const forgottenWaiters = new WeakMap<object, Array<() => void>>();

/**
 * Wait until `session` leaves the maps. Several callers can wait on one
 * session (two [E]nd answers for the same holder); each gets woken, and
 * `stop` drops only its own waiter.
 */
function waitForgotten(session: object): { forgotten: Promise<void>; stop: () => void } {
  let wake!: () => void;
  const forgotten = new Promise<void>((resolve) => { wake = resolve; });
  const list = forgottenWaiters.get(session) ?? [];
  list.push(wake);
  forgottenWaiters.set(session, list);
  const stop = () => {
    const now = forgottenWaiters.get(session);
    if (!now) return;
    const rest = now.filter((w) => w !== wake);
    if (rest.length) forgottenWaiters.set(session, rest);
    else forgottenWaiters.delete(session);
  };
  return { forgotten, stop };
}

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
      session.detachedBoardTime = getSystemTime();   // the CallersLog off time if the window runs out (S8)
      cleanupTransfer(session);                      // a ZMODEM cannot cross sockets (Decision 16)
      setResumeExpiry(session, session.detachedAt + windowMs);
      armWindow(link, session, session.detachedAt + windowMs);
      publishNodeStatus(session);                    // WHO doors: carrier lost
      console.log(`[PARK] node ${session.nodeId} parked for ${windowMs / 60000} min (${reason})`);
      return 'park';
    },
  });
}

/**
 * The finalize calls this right after the session left the maps and its
 * token was revoked: its node is free from here on, whatever the paperwork
 * after it does.
 */
export function noteSessionForgotten(session: object): void {
  const waiting = forgottenWaiters.get(session) ?? [];
  forgottenWaiters.delete(session);
  for (const wake of waiting) wake();
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
 * Only the token's own tab offers it (the client keeps it under the tab's
 * sessionStorage id), so it may replace a frozen-but-connected socket (a
 * half-open phone socket).
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
  let user: AttachUser | null;
  try {
    user = await db.getUserById(userId);
  } catch (err) {
    // The board could not read the account: that says nothing about the
    // account, so this resume is refused and the session stays parked until
    // its window ends, its token still good.
    console.error(`[RESUME] refused (unknown) for node ${nodeId}: account lookup failed:`, err instanceof Error ? err.message : err);
    if (live() && isParked(session)) armWindow(link, session, windowDeadlines.get(session) ?? Date.now());
    return { ok: false, reason: 'unknown' };
  }
  if (!live()) return { ok: false, reason: 'ended' };
  const standing = user ? tokenHolderRefusal(user).refusal : null;
  if (!user || standing !== null) {
    console.log(user
      ? `[RESUME] refused (account) for node ${nodeId}: standing refusal "${String(standing)}"; ending its parked session`
      : `[RESUME] refused (account) for node ${nodeId}: no user row for id ${userId}; ending its parked session`);
    link.end('server namespace disconnect');
    return { ok: false, reason: 'account' };
  }

  attachParkedTo(raw, session, user);
  console.log(`[RESUME] node ${session.nodeId} resumed (token ${tokenFingerprint(String(token))})`);
  return { ok: true, session };
}

/** The account fields a reattached session re-announces to the browser. */
export interface AttachUser {
  id: number | string; username: string; baud?: unknown; realname?: string; secLevel?: number; expert?: unknown; ansi?: unknown;
}

/**
 * Move a parked session's link onto `raw` and re-key everything that names
 * the old socket: the session maps, the node manager, the session log. Then
 * clear the park, issue a fresh token, re-announce the modem speed and the
 * client door, send `session-restored`, and replay the held output.
 *
 * Shared by a handshake resume (`resumeParked`) and a second device that
 * answers [R]esume at the login prompt (services/parked-session-choice.ts).
 */
export function attachParkedTo(raw: Socket, session: BBSSession, user: AttachUser): void {
  const link = session.webLink!;
  clearWindow(session);
  const oldId = link.id;
  link.attach(raw);
  socketToNodeId.delete(oldId);
  socketToUser.delete(oldId);
  setSession(raw.id, session);
  socketToUser.set(raw.id, String(user.id));
  const { nodeManager } = require('../services/node-manager.service');
  nodeManager.rekeySession(oldId, raw.id);
  // The screen model moves with the caller BEFORE stopObserving(oldId), which
  // would drop it: it is what repaints the new terminal below.
  rekeyScreenModel(oldId, raw.id);
  stopObserving(oldId);
  startObserving(raw.id);

  session.detachedAt = undefined;
  session.detachedBoardTime = undefined;
  setResumeExpiry(session, null);
  publishNodeStatus(session);                        // WHO doors: its action again
  // A fresh token for this socket; the old one stops working at once. Issued,
  // not rotated: a session moved from another device (S9) may hold none.
  const next = issueResumeToken(session, String(user.id), session.nodeId);

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
  // One source for the repaint: the screen model, which saw everything the
  // board sent this caller, held output included (observeOutput runs on every
  // send, parked or not). So when it has a screen, the held chunks are NOT
  // replayed on top (that would draw the same output twice); the terminal is
  // cleared and given the whole screen. A move from a still-attached window
  // was never parked and holds nothing, which is why held output alone left a
  // blank screen. PETSCII keeps its own model path below.
  const whole = sessionWantsPetscii(session) ? null : renderWholeScreen(raw.id);
  if (whole !== null) {
    raw.emit('ansi-output', '\x1b[2J\x1b[H');
    raw.emit('ansi-output', whole);
    const geo = session as unknown as { screenWidth?: number; screenHeight?: number };
    session.bbsApi?.emitInternal?.('screen:resize', { cols: geo.screenWidth ?? 80, rows: geo.screenHeight ?? 25 });
  } else if (held.overflowed || sessionWantsPetscii(session)) {
    // Held output is incomplete, or a PETSCII model describes a screen the
    // rebuilt browser canvas no longer has: start the screen over instead.
    disposePetsciiSessionModel(session);
    raw.emit('ansi-output', '\x1b[2J\x1b[H');
    const geo = session as unknown as { screenWidth?: number; screenHeight?: number };
    session.bbsApi?.emitInternal?.('screen:resize', { cols: geo.screenWidth ?? 80, rows: geo.screenHeight ?? 25 });
    // WEB_: the resize repaints a running door only. At the board's own
    // prompt no door is listening, so the cleared canvas stayed blank with a
    // bare cursor: the board draws its menu and prompt again itself.
    if (session.subState === LoggedOnSubState.READ_COMMAND) {
      const { displayMainMenu } = require('../handlers/command-handler/menu');
      Promise.resolve(displayMainMenu(link, session, true, true)).catch((err: unknown) => {
        console.error(`[RESUME] node ${session.nodeId}: could not redraw the menu:`, err);
      });
    }
  } else {
    for (const [e, a] of held.chunks) raw.emit(e, ...a);
  }

}

/**
 * S9: the caller at `raw` answered [R]esume at the login prompt. `forget`
 * drops the provisional session that socket logged in on (its maps and its
 * node); then the parked session moves onto the socket. The session is
 * claimed and its window stopped first, so neither a handshake resume nor
 * the window can take it during `forget`. False when there was nothing to
 * move: `gone` when the parked session had already ended (or was being
 * resumed) and nothing was touched, `lost` when it ended during `forget`.
 */
export async function moveParkedTo(
  raw: Socket, session: BBSSession, user: AttachUser, forget: () => Promise<void>,
): Promise<'moved' | 'gone' | 'lost'> {
  const link = session.webLink;
  // S15: a session still attached in another window moves the same way; its
  // old socket hears one line, then `link.attach` unbinds and disconnects it
  // (session-link.ts), so its late `disconnect` never reaches the session.
  const live = () => !!link && !link.ended && sessions.get(String(session.nodeId)) === session;
  if (!live() || resuming.has(session)) return 'gone';
  resuming.add(session);
  clearWindow(session);
  try {
    await forget();
    if (!live()) return 'lost';
    const old = link!.raw;
    if (!isParked(session) && old && old !== raw && old.connected) {
      old.emit('system-message', { text: '\r\nThis session moved to another window.\r\n' });
    }
    attachParkedTo(raw, session, user);
    console.log(`[RESUME] node ${session.nodeId} moved from another window or device`);
    return 'moved';
  } finally {
    resuming.delete(session);
  }
}

/**
 * The account's parked session, if it has one (S9 asks before taking it).
 * `skip` holds sessions the caller was already asked about (L19), so a
 * second parked session is found past the first.
 */
export function parkedSessionOf(userId: string, skip?: ReadonlySet<BBSSession>): BBSSession | null {
  for (const s of sessions.values()) {
    if (skip?.has(s)) continue;
    if (isParked(s) && s.webLink && !s.webLink.ended && String((s.user as { id?: unknown } | undefined)?.id) === String(userId)) return s;
  }
  return null;
}

/**
 * S15: the account's session that is still attached on another node (web
 * with a connected socket, or a telnet/SSH line), other than `self`. A
 * password login is offered to take it over instead of meeting ONENODE.
 *
 * L19: `skip` holds the holders already asked about. One that did not leave
 * (its line never closed) used to be found first again, and the caller
 * stopped there - the account's other holders were never offered.
 */
export function liveSessionOf(userId: string, self: BBSSession, skip?: ReadonlySet<BBSSession>): BBSSession | null {
  for (const s of sessions.values()) {
    if (s === self || isParked(s) || skip?.has(s)) continue;
    if (String((s.user as { id?: unknown } | undefined)?.id) !== String(userId)) continue;
    const reachable = s.connectionEmitter
      ? true
      : !!s.webLink && !s.webLink.ended && s.webLink.connected;
    if (reachable) return s;
  }
  return null;
}

/**
 * S15 [E]nd for a live session: it ends the way the admin kick ends one
 * (`sysopKicked`, so its finalize writes one normal logoff line), and this
 * waits until it is off the board. Bounded: a transport that never says
 * `disconnect` leaves it there, and the already-on check then refuses as
 * before.
 */
export async function endLiveSession(session: BBSSession, waitMs = 5000): Promise<void> {
  if (sessions.get(String(session.nodeId)) !== session) return;
  const { forgotten, stop } = waitForgotten(session);
  const kickedBefore = (session as { sysopKicked?: boolean }).sysopKicked;
  (session as { sysopKicked?: boolean }).sysopKicked = true;
  const text = '\r\nThis session was ended by a login in another window.\r\n';
  const emitter = (session.connectionEmitter ?? session.webLink) as
    { emit: (e: string, d: unknown) => void; disconnect: (close?: boolean) => void } | undefined;
  emitter?.emit('system-message', { text });
  emitter?.disconnect(true);
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<void>((resolve) => { timer = setTimeout(resolve, waitMs); });
  // Off the board is enough: the login that asked goes on while the old
  // node's paperwork (logoff batches run a 68K door) finishes behind it. A
  // finalize that ends or throws before that point also ends the wait.
  const ending = endings.get(session)?.catch(() => undefined);
  await Promise.race(ending ? [forgotten, ending, timeout] : [forgotten, timeout]);
  if (timer) clearTimeout(timer);
  stop();
  // The timeout won and the session is still on the board: its transport
  // never said `disconnect`. It is not being ended after all, so its later
  // real drop must not log a kick or be refused a park (parkDecision).
  if (sessions.get(String(session.nodeId)) === session) {
    (session as { sysopKicked?: boolean }).sysopKicked = kickedBefore;
  }
}

/**
 * End every parked session of `userId` and wait until each is off the board
 * (`reclaimParkedNode`'s wait), not for its paperwork: the logoff batches can
 * run a 68K door for a minute, and the login waiting here held its caller at
 * a dead prompt that long. Returns the count.
 */
export async function endParkedSessionsFor(userId: string): Promise<number> {
  const parked = [...sessions.values()].filter((s) =>
    isParked(s) && s.webLink && !s.webLink.ended && String((s.user as { id?: unknown } | undefined)?.id) === String(userId));
  for (const s of parked) {
    const { forgotten, stop } = waitForgotten(s);
    s.webLink!.end('transport close');
    const ending = endings.get(s);
    if (ending) await Promise.race([forgotten, ending.catch(() => undefined)]);
    stop();
  }
  return parked.length;
}

/**
 * The session parked longest (S11 uses it to free a node). A session whose
 * caller is coming back right now (`resuming`) is not a candidate: a caller
 * who is here beats a caller who might come back, and that one is here.
 */
export function oldestParkedSession(): BBSSession | null {
  let best: BBSSession | null = null;
  for (const s of sessions.values()) {
    if (!isParked(s) || !s.webLink || s.webLink.ended || resuming.has(s)) continue;
    if (best === null || s.detachedAt! < best.detachedAt!) best = s;
  }
  return best;
}

/**
 * A full board frees a node before it turns a caller away (plan Decision 17):
 * the session parked longest ends through the one disconnect handler - the
 * same `Loss Carrier` finalize its window would have run, stamped with the
 * drop time (S8), account saved, token revoked, node released - and this
 * waits until that finalize has taken the session off the maps (not for its
 * logoff batches, which can run a door for seconds). False when nothing is parked: the caller is
 * refused as before.
 *
 * WEB_: express.e has no parked state; a dropped carrier there is already a
 * logoff (express.e:8160-8166), so its node was free all along.
 */
export async function reclaimParkedNode(): Promise<boolean> {
  const s = oldestParkedSession();
  if (!s) return false;
  console.log(`[RECLAIM] board full: ending the session parked longest, node ${s.nodeId}`);
  // Wait for the node, not the paperwork: the finalize wakes this as soon as
  // the session has left the maps. A finalize that ends (or throws) before
  // that point also ends the wait.
  const { forgotten, stop } = waitForgotten(s);
  s.webLink!.end('transport close');
  const ending = endings.get(s);
  if (ending) await Promise.race([forgotten, ending.catch(() => undefined)]);
  stop();
  return true;
}

/**
 * The node a reclaim gave back, or null when nothing was parked and the board
 * is still full. The byte transports call it only after their allocator said
 * null, so a board with a free node never waits:
 * `getNextAvailableNodeId() ?? await reclaimedNodeId()`.
 */
export async function reclaimedNodeId(): Promise<number | null> {
  return (await reclaimParkedNode()) ? getNextAvailableNodeId() : null;
}

/**
 * S6: a logged-on web caller whose socket drops parks for WEB_RESUME_MINUTES
 * and resumes into the same node and door with the resume token.
 *
 * The first describe drives the product's entry point, `acceptWebConnection`,
 * with raw sockets carrying `handshake.auth.resume` (the one reachability
 * test, plus the refusal that must fall through to a fresh call). The second
 * tests the rules that live in session-parking.ts directly.
 */
import { EventEmitter } from 'events';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/database', () => ({
  db: { getUserById: jest.fn(async (id: number) => (id === 7 ? { id: 7, username: 'phone', baud: 0, secLevel: 20 } : null)) },
}));
jest.mock('../../src/services/login-connect.service', () => ({
  runPreLoginConnect: jest.fn(async () => ({ passwordResetActive: false })),
}));
// The session log keeps an un-unref'd retention timer per ended session; a
// test that hangs up its calls would otherwise keep jest alive for it.
jest.mock('../../src/server/session-observers', () => ({
  ...jest.requireActual('../../src/server/session-observers'),
  startObserving: jest.fn(), stopObserving: jest.fn(),
}));
jest.mock('../../src/services/logon-gates', () => ({ tokenHolderRefusal: () => ({ refusal: null }) }));
jest.mock('../../src/services/node-manager.service', () => ({ nodeManager: { rekeySession: jest.fn(), releaseSession: jest.fn(async () => undefined) } }));
jest.mock('../../src/config', () => {
  // A scratch board root: the connection path's imports create stores under it.
  const dir: string = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 's6-park-'));
  return {
    config: {
      get: (k: string) => (k === 'dataDir' ? dir : undefined),
      getConfig: () => ({ dataDir: dir, hostname: 'localhost', port: 3000 }),
    },
  };
});
jest.mock('../../src/services/bbs-config-file.service', () => ({
  getBoardConfig: () => ({ web_resume_minutes: 10 }),
  loadBBSConfig: () => ({}),
}));

import { createSessionLink, HELD_OUTPUT_LIMIT } from '../../src/server/session-link';
import { installParking, resumeParked, isParked, endParkedSessionsFor } from '../../src/server/session-parking';
import { issueResumeToken, issueResumeTokenForLogin, _resetResumeTokensForTests } from '../../src/server/resume-tokens';
import { acceptWebConnection } from '../../src/server/web-connection';
import { runPreLoginConnect } from '../../src/services/login-connect.service';
import { disarmIdleTimeout } from '../../src/services/idle-timeout.service';
import { sessions, getSession } from '../../src/server/session-manager';
import { BBSState } from '../../src/constants/bbs-states';
import { socketToUser } from '../../src/server/session-manager';
import { db } from '../../src/database';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { formatLongDate, formatLongTime } from '../../src/utils/date-time.util';

function fakeRaw(id: string) {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.sent = [] as Array<[string, unknown[]]>; ee.handshake = {};
  ee.rooms = new Set<string>(); ee.anys = [] as any[]; ee.outs = [] as any[];
  ee.join = (r: string) => ee.rooms.add(r); ee.leave = (r: string) => ee.rooms.delete(r);
  ee.onAny = (f: any) => ee.anys.push(f); ee.offAny = (f: any) => { ee.anys = ee.anys.filter((x: any) => x !== f); };
  ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
  ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
  ee.onAnyOutgoing = (f: any) => ee.outs.push(f); ee.offAnyOutgoing = (f: any) => { ee.outs = ee.outs.filter((x: any) => x !== f); };
  ee.emit = (e: string, ...a: unknown[]) => { ee.sent.push([e, a]); ee.outs.forEach((f: any) => f(e, ...a)); return true; };
  return ee;
}

function loggedOn(state = BBSState.LOGGEDON) {
  const a = fakeRaw('A');
  const link = createSessionLink(a);
  const session: any = {
    nodeId: 3, socketId: 'A', state, user: { id: '7' }, connectionType: 'web',
    clientDoorActive: true, clientDoorId: 'beeb', currentConf: 1,
  };
  session.webLink = link;
  sessions.set('3', session);
  const finalized = jest.fn();
  link.on('disconnect', finalized);
  installParking(link as any, session);
  return { a, link, session, finalized };
}

beforeEach(() => { sessions.clear(); _resetResumeTokensForTests(); (runPreLoginConnect as jest.Mock).mockClear(); });

/** A browser's raw socket as acceptWebConnection receives it; `resume` is handshake.auth.resume. */
function browser(id: string, resume?: unknown, claim?: boolean) {
  const raw = fakeRaw(id);
  const auth = resume === undefined ? {} : claim === undefined ? { resume } : { resume, claim };
  raw.handshake = { address: '127.0.0.1', headers: {}, auth };
  raw.nsp = { sockets: new Map() };
  return raw;
}
const io = { sockets: { sockets: new Map() } } as never;
function connectDeps(nodeId: number) {
  return {
    nodeManager: { assignSessionToNode: jest.fn(async () => ({ nodeId })) },
    chatState: { sessions: [], messages: [] },
  };
}
const eventNames = (raw: any): string[] => raw.sent.map(([e]: [string]) => e);

describe('a dropped phone resumes its session, through acceptWebConnection', () => {
  const opened: any[] = [];
  // Every call this describe opens is ended the way a hang-up ends it, so no
  // session-scoped timer outlives the test.
  afterEach(async () => {
    for (const s of opened.splice(0)) {
      disarmIdleTimeout(s);
      if (s?.webLink && !s.webLink.ended) s.webLink.end('server namespace disconnect');
    }
    await new Promise((r) => setTimeout(r, 50));
  });

  /** A caller connected through the entry point, then logged on, holding a login token, then dropped. */
  async function droppedCaller() {
    const a = browser('A');
    await acceptWebConnection(io, a as never, connectDeps(3) as never);
    const session: any = getSession('A');
    opened.push(session);
    Object.assign(session, {
      state: BBSState.LOGGEDON, user: { id: 7 }, currentConf: 1,
      clientDoorActive: true, clientDoorId: 'beeb',
    });
    const token = issueResumeTokenForLogin(session, '7')!;
    a.connected = false; a.fire('disconnect', 'transport close');
    return { a, session, token };
  }

  it('a new socket with the token rejoins the same session and node: held output, the door, a rotated token, no new node or welcome', async () => {
    const { a, session, token } = await droppedCaller();
    const link = session.webLink;
    expect(isParked(session)).toBe(true);
    link.emit('ansi-output', 'door frame while away');
    expect(a.sent.some(([, args]: [string, unknown[]]) => args[0] === 'door frame while away')).toBe(false);

    const b = browser('B', token);
    const deps = connectDeps(4);
    await acceptWebConnection(io, b as never, deps as never);

    expect(deps.nodeManager.assignSessionToNode).not.toHaveBeenCalled();
    expect(runPreLoginConnect).toHaveBeenCalledTimes(1);           // A's welcome only
    expect(isParked(session)).toBe(false);
    expect(getSession('B')).toBe(session);
    expect(sessions.get('3')).toBe(session);
    expect(session.nodeId).toBe(3);
    expect(session.webLink).toBe(link);
    expect(link.raw).toBe(b);
    expect(link.id).toBe('B');
    expect(session.socketId).toBe('B');
    expect(eventNames(b)).toEqual(expect.arrayContaining(['session-restored', 'door:active-client']));
    expect(eventNames(b)).not.toContain('session-restore-failed');
    expect(b.sent).toContainEqual(['door:active-client', [{ doorId: 'beeb' }]]);
    expect(b.sent).toContainEqual(['ansi-output', ['door frame while away']]);
    const restored = b.sent.find(([e]: [string]) => e === 'session-restored')[1][0];
    expect(restored.nodeId).toBe(3);
    expect(restored.resumeToken).toEqual(expect.any(String));
    expect(restored.resumeToken).not.toBe(token);

    // The old token is spent: a third socket offering it is refused and gets a fresh call.
    const c = browser('C', token);
    await acceptWebConnection(io, c as never, connectDeps(5) as never);
    opened.push(getSession('C'));
    expect(c.sent[0]).toEqual(['session-restore-failed', [{ reason: 'unknown' }]]);
    expect(getSession('B')).toBe(session);
    expect(link.raw).toBe(b);
  });

  /** A caller connected through the entry point and logged on, still connected. */
  async function liveCaller() {
    const a = browser('A');
    await acceptWebConnection(io, a as never, connectDeps(3) as never);
    const session: any = getSession('A');
    opened.push(session);
    Object.assign(session, { state: BBSState.LOGGEDON, user: { id: 7 }, currentConf: 1 });
    const token = issueResumeTokenForLogin(session, '7')!;
    return { a, session, token };
  }

  it('a claim never takes over a live session: refused as in use, the first tab keeps it, the claimer gets a fresh call', async () => {
    const { a, session, token } = await liveCaller();
    const b = browser('B', token, true);
    await acceptWebConnection(io, b as never, connectDeps(4) as never);
    expect(b.sent).toContainEqual(['session-restore-failed', [{ reason: 'in-use' }]]);
    expect(eventNames(b)).not.toContain('session-restored');
    expect(a.connected).toBe(true);
    expect(session.webLink.ended).toBe(false);
    expect(isParked(session)).toBe(false);
    opened.push(getSession('B'));
  });

  it('a claim resumes a PARKED session', async () => {
    const { session, token } = await droppedCaller();
    const b = browser('B', token, true);
    await acceptWebConnection(io, b as never, connectDeps(4) as never);
    expect(eventNames(b)).toContain('session-restored');
    expect(isParked(session)).toBe(false);
  });

  it('an unknown token is refused first, then the fresh call runs; the parked session stays parked', async () => {
    const { session } = await droppedCaller();
    const x = browser('X', 'x'.repeat(43));
    const deps = connectDeps(4);
    await acceptWebConnection(io, x as never, deps as never);
    opened.push(getSession('X'));

    expect(x.sent[0]).toEqual(['session-restore-failed', [{ reason: 'unknown' }]]);
    expect(deps.nodeManager.assignSessionToNode).toHaveBeenCalledWith('X', 'X');
    expect(runPreLoginConnect).toHaveBeenCalledTimes(2);           // A's, then X's fresh call
    expect((runPreLoginConnect as jest.Mock).mock.calls[1][1]).toBe(getSession('X'));
    expect(getSession('X')!.nodeId).toBe(4);
    expect(isParked(session)).toBe(true);
    expect(sessions.get('3')).toBe(session);
    expect(session.webLink.id).toBe('A');
  });
});

describe('the parking rules (session-parking.ts)', () => {
  beforeEach(() => { jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('a logged-on drop parks: no logoff, output is held', () => {
    const { a, link, session, finalized } = loggedOn();
    a.connected = false; a.fire('disconnect', 'transport close');
    expect(isParked(session)).toBe(true);
    expect(finalized).not.toHaveBeenCalled();
    link.emit('ansi-output', 'while away');
    expect(a.sent).toEqual([]);
  });

  it('a resume stops the window clock and announces the door before session-restored', async () => {
    const { a, session, finalized } = loggedOn();
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    const b = fakeRaw('B');
    expect((await resumeParked(b, token)).ok).toBe(true);
    const names = eventNames(b);
    expect(names.indexOf('door:active-client')).toBeLessThan(names.indexOf('session-restored'));
    jest.advanceTimersByTime(11 * 60_000);
    expect(finalized).not.toHaveBeenCalled();
  });

  it('a resume says nothing about a door when no client door is running', async () => {
    const { a, session } = loggedOn();
    session.clientDoorActive = false;
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    const b = fakeRaw('B');
    expect((await resumeParked(b, token)).ok).toBe(true);
    expect(eventNames(b)).not.toContain('door:active-client');
  });

  // With no disconnect handler on the link nothing revokes the token, so it
  // says expired; through the real handler it says unknown
  // (a-parked-session-ends-for-good.test.ts).
  it('the end of the window ends the link once, and its token then says expired', async () => {
    const { a, session, finalized } = loggedOn();
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    jest.advanceTimersByTime(10 * 60_000 - 1);
    expect(finalized).not.toHaveBeenCalled();
    jest.advanceTimersByTime(2);
    expect(finalized).toHaveBeenCalledTimes(1);
    expect(finalized).toHaveBeenCalledWith('transport close');
    const b = fakeRaw('B');
    expect(await resumeParked(b, token)).toEqual({ ok: false, reason: 'expired' });
    expect(b.sent).toEqual([]);
  });

  it('a bad token, or one bound to another node, is refused and the session stays parked', async () => {
    const { a, session, link, finalized } = loggedOn();
    a.connected = false; a.fire('disconnect', 'transport close');
    const b = fakeRaw('B');
    expect(await resumeParked(b, 'not-a-token')).toEqual({ ok: false, reason: 'unknown' });
    expect(await resumeParked(b, 42)).toEqual({ ok: false, reason: 'unknown' });
    const otherNode = issueResumeToken(session, '7', 4);           // the session is on node 3
    expect(await resumeParked(b, otherNode)).toEqual({ ok: false, reason: 'ended' });
    expect(isParked(session)).toBe(true);
    expect(link.id).toBe('A');
    expect(finalized).not.toHaveBeenCalled();
    expect(b.sent).toEqual([]);
  });

  it('a token whose account no longer passes is refused, and that parked session ends (a refused account keeps no node)', async () => {
    const { a, session, link, finalized } = loggedOn();
    const token = issueResumeToken(session, '8', 3);               // user 8 does not exist
    a.connected = false; a.fire('disconnect', 'transport close');
    const b = fakeRaw('B');
    expect(await resumeParked(b, token)).toEqual({ ok: false, reason: 'account' });
    expect(finalized).toHaveBeenCalledTimes(1);
    expect(link.id).toBe('A');
    expect(b.sent).toEqual([]);
  });

  it('after a held-output overflow the resume clears the screen and asks the door to repaint, replaying nothing', async () => {
    const { a, link, session } = loggedOn();
    const emitInternal = jest.fn();
    Object.assign(session, { bbsApi: { emitInternal }, screenWidth: 40, screenHeight: 25 });
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    link.emit('ansi-output', 'x'.repeat(HELD_OUTPUT_LIMIT + 1));
    const b = fakeRaw('B');
    expect((await resumeParked(b, token)).ok).toBe(true);
    expect(b.sent).toContainEqual(['ansi-output', ['\x1b[2J\x1b[H']]);
    expect(b.sent.filter(([e]: [string]) => e === 'ansi-output')).toHaveLength(1);
    expect(emitInternal).toHaveBeenCalledWith('screen:resize', { cols: 40, rows: 25 });
  });

  it('a PETSCII caller is repainted, not replayed, even without an overflow', async () => {
    const { a, link, session } = loggedOn();
    const emitInternal = jest.fn();
    Object.assign(session, { bbsApi: { emitInternal }, terminalType: 'c64' });
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    link.emit('ansi-output', 'petscii frame while away');
    const b = fakeRaw('B');
    expect((await resumeParked(b, token)).ok).toBe(true);
    expect(b.sent).toContainEqual(['ansi-output', ['\x1b[2J\x1b[H']]);
    expect(b.sent).not.toContainEqual(['ansi-output', ['petscii frame while away']]);
    expect(emitInternal).toHaveBeenCalledWith('screen:resize', { cols: 80, rows: 25 });
  });

  it('a drop before logon ends the session at once', () => {
    const { a, session, finalized } = loggedOn(BBSState.AWAIT);
    a.connected = false; a.fire('disconnect', 'transport close');
    expect(isParked(session)).toBe(false);
    expect(finalized).toHaveBeenCalledWith('transport close');
  });

  it('a fresh login ends the caller\'s parked session, though the account is mapped to the new socket too', async () => {
    // The state login-post leaves: both sockets map to the account. The full
    // finalize through the real disconnect handler is pinned in
    // goodbye-logoff-skips-grace.test.ts (S6 review B1).
    const { a, finalized } = loggedOn();
    socketToUser.set('A', '7');
    socketToUser.set('FRESH', '7');
    try {
      a.connected = false; a.fire('disconnect', 'transport close');
      expect(await endParkedSessionsFor('7')).toBe(1);
      expect(finalized).toHaveBeenCalledTimes(1);
    } finally {
      socketToUser.delete('A'); socketToUser.delete('FRESH');
    }
  });

  it('two resumes with one token in the same moment: one attaches, the other is unknown', async () => {
    const { a, session, link, finalized } = loggedOn();
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    const b = fakeRaw('B'); const c = fakeRaw('C');
    const [rb, rc] = await Promise.all([resumeParked(b, token), resumeParked(c, token)]);
    expect(rb.ok).toBe(true);
    expect(rc).toEqual({ ok: false, reason: 'unknown' });
    expect(link.id).toBe('B');
    expect(c.sent).toEqual([]);
    expect(finalized).not.toHaveBeenCalled();
  });

  it('an account lookup that fails refuses the resume and leaves the session parked, its window and token intact', async () => {
    const { a, session, link, finalized } = loggedOn();
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    jest.advanceTimersByTime(4 * 60_000);
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    (db.getUserById as jest.Mock).mockRejectedValueOnce(new Error('SQLITE_BUSY'));
    const b = fakeRaw('B');
    expect(await resumeParked(b, token)).toEqual({ ok: false, reason: 'unknown' });
    quiet.mockRestore();
    expect(isParked(session)).toBe(true);
    expect(link.id).toBe('A');
    expect(finalized).not.toHaveBeenCalled();
    expect(b.sent).toEqual([]);
    jest.advanceTimersByTime(6 * 60_000 - 2);                      // the window keeps its original end
    expect(finalized).not.toHaveBeenCalled();
    jest.advanceTimersByTime(3);
    expect(finalized).toHaveBeenCalledTimes(1);
  });

  it('a resume takes over a socket that is still connected: the old one is closed, the session carries on', async () => {
    const { a, session, link, finalized } = loggedOn();
    const token = issueResumeToken(session, '7', 3);
    const b = fakeRaw('B');
    expect((await resumeParked(b, token)).ok).toBe(true);
    expect(a.connected).toBe(false);
    expect(link.id).toBe('B');
    expect(link.raw).toBe(b);
    expect(sessions.get('3')).toBe(session);
    expect(finalized).not.toHaveBeenCalled();
  });
});

describe('the CallersLog off time of a parked call (S8)', () => {
  const T = new Date(2026, 9, 16, 21, 15, 7);
  let lines: string[];
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(T);
    lines = [];
    jest.spyOn(callersLogManager, 'logActivity').mockImplementation((_n, s) => { lines.push(s); });
  });
  afterEach(() => { jest.restoreAllMocks(); jest.useRealTimers(); });

  it('a park whose window runs out is logged off at the time it dropped', () => {
    const { a, session, finalized } = loggedOn();
    session.user.username = 'spot';
    a.connected = false; a.fire('disconnect', 'transport close');
    jest.advanceTimersByTime(10 * 60_000 + 1);
    expect(finalized).toHaveBeenCalledTimes(1);
    callersLogManager.logLogoffOnce(session, 'Loss Carrier');
    expect(lines).toEqual([`${formatLongDate(T)} (${formatLongTime(T)}) spot Off Loss Carrier`]);
  });

  it('a resumed call that later says G is logged off at the G', async () => {
    const { a, session } = loggedOn();
    session.user.username = 'spot';
    const token = issueResumeToken(session, '7', 3);
    a.connected = false; a.fire('disconnect', 'transport close');
    jest.advanceTimersByTime(60_000);
    expect((await resumeParked(fakeRaw('B'), token)).ok).toBe(true);
    jest.advanceTimersByTime(5 * 60_000);
    const g = new Date();
    callersLogManager.logLogoffOnce(session, 'N');
    expect(formatLongTime(g)).not.toBe(formatLongTime(T));
    expect(lines).toEqual([`${formatLongDate(g)} (${formatLongTime(g)}) spot Off Normally`]);
  });
});

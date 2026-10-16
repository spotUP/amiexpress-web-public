/**
 * S6: every way a PARKED web session ends goes through the real disconnect
 * handler and finalizes it: node freed, Loss Carrier (or the stat that
 * applies) written, resume token revoked. The parked link here is built the
 * way production builds it - a real SessionLink, the real parking rule
 * (installParking) and the real registerDisconnectHandler - and the account
 * is mapped in socketToUser as its login mapped it (S6 review B1, N3).
 */
process.env.SKIP_DB_INIT = '1';
import { EventEmitter } from 'events';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/handlers/command-execution.handler', () => ({ runSysCommand: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/logon-gates', () => ({ tokenHolderRefusal: () => ({ refusal: null }) }));
jest.mock('../../src/database', () => ({
  db: {
    updateUser: jest.fn(async () => undefined),
    getUserById: jest.fn(async () => ({ id: 7, username: 'phone', baud: 0, secLevel: 20 })),
  },
  getDatabase: () => ({ updateUser: jest.fn(async () => undefined) }),
}));
let mockResumeMinutes = 10;
jest.mock('../../src/services/bbs-config-file.service', () => ({
  ...jest.requireActual('../../src/services/bbs-config-file.service'),
  getBoardConfig: () => ({ web_resume_minutes: mockResumeMinutes }),
}));

import { BBSState } from '../../src/constants/bbs-states';
import { registerDisconnectHandler } from '../../src/server/socket-handlers';
import { setSession, sessions, socketToUser, userSessions } from '../../src/server/session-manager';
import { createSessionLink } from '../../src/server/session-link';
import { installParking, isParked, resumeParked } from '../../src/server/session-parking';
import { issueResumeToken, lookupResumeToken, _resetResumeTokensForTests } from '../../src/server/resume-tokens';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { armIdleTimeout, disarmIdleTimeout } from '../../src/services/idle-timeout.service';
import { db } from '../../src/database';

function fakeRaw(id: string) {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.handshake = { address: '127.0.0.1', headers: {}, auth: {} };
  ee.sent = [] as unknown[];
  ee.join = () => {}; ee.leave = () => {}; ee.onAny = () => {}; ee.offAny = () => {};
  ee.onAnyOutgoing = () => {}; ee.offAnyOutgoing = () => {};
  ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
  ee.emit = (...a: unknown[]) => { ee.sent.push(a); return true; };
  ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
  return ee;
}

let logoffSpy: jest.SpyInstance;
let activitySpy: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  mockResumeMinutes = 10;
  sessions.clear();
  _resetResumeTokensForTests();
  logoffSpy = jest.spyOn(callersLogManager, 'logLogoffOnce').mockImplementation(() => undefined as never);
  activitySpy = jest.spyOn(callersLogManager, 'logActivity').mockImplementation(() => undefined);
});
afterEach(() => {
  jest.clearAllTimers();
  jest.useRealTimers();
  jest.restoreAllMocks();
  socketToUser.clear();
  userSessions.clear();
});

/** A logged-on web caller on node 3, holding a resume token. `drop` parks it. */
function caller(node = 3) {
  const a = fakeRaw(`A${node}`);
  const link = createSessionLink(a);
  const session: any = {
    nodeId: node, socketId: a.id, tempData: {}, state: BBSState.LOGGEDON, connectionType: 'web',
    user: { id: '7', username: 'phone' }, webLink: link, currentConf: 1,
  };
  installParking(link as never, session);
  registerDisconnectHandler(link as never);
  setSession(a.id, session);
  socketToUser.set(a.id, '7');
  const token = issueResumeToken(session, '7', node);
  const drop = () => { a.connected = false; a.fire('disconnect', 'transport close'); };
  return { a, link, session, token, drop };
}

/** Let the async disconnect handler run to its end. */
async function settle() {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  await jest.advanceTimersByTimeAsync(0);
}

function expectFinalized(node: number, token: string, reason = 'Loss Carrier') {
  expect(sessions.has(String(node))).toBe(false);
  expect(lookupResumeToken(token)).toEqual({ ok: false, reason: 'unknown' });
  expect(logoffSpy).toHaveBeenCalledTimes(1);
  expect(logoffSpy.mock.calls[0][1]).toBe(reason);
}

describe('a parked session ends for good', () => {
  it('when its window runs out: Loss Carrier once, node freed, the token then unknown', async () => {
    const { link, session, token, drop } = caller();
    drop();
    await settle();
    expect(isParked(session)).toBe(true);
    expect(logoffSpy).not.toHaveBeenCalled();
    await jest.advanceTimersByTimeAsync(10 * 60_000 + 1);
    await settle();
    expect(link.ended).toBe(true);
    expectFinalized(3, token);
    expect(await resumeParked(fakeRaw('B') as never, token)).toEqual({ ok: false, reason: 'unknown' });
  });

  it('when its idle timeout fires while parked: the timeout line, then the timeout stat', async () => {
    const { link, session, token, drop } = caller();
    armIdleTimeout(link as never, session);
    drop();
    await settle();
    expect(isParked(session)).toBe(true);
    await jest.advanceTimersByTimeAsync(9 * 60_000);
    await settle();
    expect(activitySpy).toHaveBeenCalledWith(3, '\t**Input timed out **');
    expect(link.ended).toBe(true);
    expect(sessions.has('3')).toBe(false);
    expect(lookupResumeToken(token)).toEqual({ ok: false, reason: 'unknown' });
    expect(logoffSpy).toHaveBeenCalledTimes(1);
    disarmIdleTimeout(session);
  });

  it.each([['G (cleanLogoff)', 'cleanLogoff'], ['a sysop kick (sysopKicked)', 'sysopKicked']])(
    'at once after %s: no parking, no window', async (_label, flag) => {
      const { session, token, drop } = caller();
      session[flag] = true;
      drop();
      await settle();
      expect(isParked(session)).toBe(false);
      expectFinalized(3, token, 'N');
    });

  it('an already-parked session keeps its window when the setting changes; 0 only stops new parks', async () => {
    const first = caller(3);
    first.drop();
    await settle();
    mockResumeMinutes = 2;
    await jest.advanceTimersByTimeAsync(5 * 60_000);
    await settle();
    expect(isParked(first.session)).toBe(true);                    // still on its 10 minutes
    expect(sessions.has('3')).toBe(true);

    mockResumeMinutes = 0;
    const second = caller(4);
    second.drop();
    await settle();
    expect(isParked(second.session)).toBe(false);                  // 0: no new park
    expect(isParked(first.session)).toBe(true);                    // the parked one is untouched

    await jest.advanceTimersByTimeAsync(5 * 60_000 + 1);
    await settle();
    expect(sessions.has('3')).toBe(false);                         // its own window ended it
  });

  it('a resume racing the window end is refused with ended, and the session is still finalized once', async () => {
    const { link, token, drop } = caller();
    drop();
    await settle();
    let release!: (u: unknown) => void;
    (db.getUserById as jest.Mock).mockImplementationOnce(() => new Promise((r) => { release = r; }));
    const pending = resumeParked(fakeRaw('B') as never, token);
    link.end('transport close');                                   // the window ends while the account is read
    release({ id: 7, username: 'phone', secLevel: 20 });
    expect(await pending).toEqual({ ok: false, reason: 'ended' });
    await settle();
    expectFinalized(3, token);
  });

  it('no log line carries the token: drop, refusals, resume, window end', async () => {
    const lines: string[] = [];
    for (const m of ['log', 'warn', 'error', 'info', 'debug'] as const) {
      jest.spyOn(console, m).mockImplementation((...a: unknown[]) => { lines.push(a.map(String).join(' ')); });
    }
    const { token, drop } = caller();
    drop();
    await settle();
    await resumeParked(fakeRaw('X') as never, token.slice(0, -1) + (token.endsWith('a') ? 'b' : 'a'));
    const b = fakeRaw('B');
    const r = await resumeParked(b as never, token);
    expect(r.ok).toBe(true);
    b.connected = false; b.fire('disconnect', 'transport close');
    await settle();
    await jest.advanceTimersByTimeAsync(10 * 60_000 + 1);
    await settle();
    expect(lines.length).toBeGreaterThan(0);
    const fresh = (b.sent.find((x: unknown[]) => x[0] === 'session-restored') as any)[1].resumeToken as string;
    for (const t of [token, fresh]) expect(lines.filter((l) => l.includes(t))).toEqual([]);
  });
});

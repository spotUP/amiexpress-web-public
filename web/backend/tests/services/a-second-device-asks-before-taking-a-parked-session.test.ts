/**
 * S9: a fresh login that finds the account's web session parked (its phone
 * dropped; session-parking.ts) asks what to do with it instead of quietly
 * ending it. Web: [R]esume it here or [E]nd it. Telnet/SSH: [E]nd it or [Q]uit.
 *
 * Driven through `runPostAuthLogin`, the pipeline every transport's login
 * runs through, with both calls opened by `acceptWebConnection`.
 */
import { EventEmitter } from 'events';

process.env.SKIP_DB_INIT = '1';

jest.mock('../../src/server/logoff', () => ({
  ...jest.requireActual('../../src/server/logoff'),
  beginLogoff: jest.fn(),
}));
// Reaching the already-on check proves the login went on past the question.
jest.mock('../../src/services/user-already-online', () => ({
  ...jest.requireActual('../../src/services/user-already-online'),
  userAlreadyOnNode: jest.fn((): number | null => 2),
}));
jest.mock('../../src/handlers/screen.handler', () => ({
  ...jest.requireActual('../../src/handlers/screen.handler'),
  displayScreen: jest.fn(async () => true),
  doPause: jest.fn(async () => undefined),
}));
jest.mock('../../src/index', () => ({}));
jest.mock('../../src/database', () => ({
  db: {
    getUserById: jest.fn(async () => null),
    updateUser: jest.fn(async () => undefined),
    generateAccessToken: jest.fn(async () => 'token'),
    generateRefreshToken: jest.fn(async () => 'refresh'),
    getUserByUsername: jest.fn(async () => null),
  },
  getDatabase: () => ({ updateUser: jest.fn(async () => undefined), getUserByUsername: jest.fn(async () => null) }),
}));
jest.mock('../../src/services/login-connect.service', () => ({
  runPreLoginConnect: jest.fn(async () => ({ passwordResetActive: false })),
}));
jest.mock('../../src/server/session-observers', () => ({
  ...jest.requireActual('../../src/server/session-observers'),
  startObserving: jest.fn(), stopObserving: jest.fn(),
}));
jest.mock('../../src/services/logon-gates', () => ({
  ...jest.requireActual('../../src/services/logon-gates'),
  tokenHolderRefusal: () => ({ refusal: null }),
}));
jest.mock('../../src/services/node-manager.service', () => ({ nodeManager: { rekeySession: jest.fn(), releaseSession: jest.fn(async () => undefined) } }));
jest.mock('../../src/config', () => {
  const dir: string = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 's9-park-'));
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

import { acceptWebConnection } from '../../src/server/web-connection';
import { isParked, endParkedSessionsFor } from '../../src/server/session-parking';
import { _resetResumeTokensForTests } from '../../src/server/resume-tokens';
import { disarmIdleTimeout } from '../../src/services/idle-timeout.service';
import { sessions, getSession } from '../../src/server/session-manager';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { nodeManager } from '../../src/services/node-manager.service';
import { runPostAuthLogin } from '../../src/services/login-post.service';
import { beginLogoff } from '../../src/server/logoff';
import { userAlreadyOnNode } from '../../src/services/user-already-online';

function browser(id: string) {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.sent = [] as Array<[string, unknown[]]>;
  ee.handshake = { address: '127.0.0.1', headers: {}, auth: {} };
  ee.nsp = { sockets: new Map() };
  ee.rooms = new Set<string>(); ee.anys = [] as any[]; ee.outs = [] as any[];
  ee.join = (r: string) => ee.rooms.add(r); ee.leave = (r: string) => ee.rooms.delete(r);
  ee.onAny = (f: any) => ee.anys.push(f); ee.offAny = (f: any) => { ee.anys = ee.anys.filter((x: any) => x !== f); };
  ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
  ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
  ee.onAnyOutgoing = (f: any) => ee.outs.push(f); ee.offAnyOutgoing = (f: any) => { ee.outs = ee.outs.filter((x: any) => x !== f); };
  ee.emit = (e: string, ...a: unknown[]) => { ee.sent.push([e, a]); ee.outs.forEach((f: any) => f(e, ...a)); return true; };
  return ee;
}
const io = { sockets: { sockets: new Map() } } as never;
const deps = (nodeId: number) => ({
  nodeManager: { assignSessionToNode: jest.fn(async () => ({ nodeId })) },
  chatState: { sessions: [], messages: [] },
});
const text = (raw: any): string => raw.sent.filter(([e]: [string]) => e === 'ansi-output').map(([, a]: [string, unknown[]]) => String(a[0])).join('');
const user = () => ({ id: 7, username: 'phone', slotNumber: 7, calls: 3, callsToday: 0, ansi: true });
const opened: any[] = [];

beforeEach(() => { sessions.clear(); _resetResumeTokensForTests(); jest.clearAllMocks(); (userAlreadyOnNode as jest.Mock).mockReturnValue(2); });
afterEach(async () => {
  for (const s of opened.splice(0)) {
    disarmIdleTimeout(s);
    if (s?.webLink && !s.webLink.ended) s.webLink.end('server namespace disconnect');
  }
  await new Promise((r) => setTimeout(r, 50));
});

/** Phone A logged on in the beeb door on node 3, then its socket dropped. */
async function parkedPhone() {
  const a = browser('A');
  await acceptWebConnection(io, a as never, deps(3) as never);
  const parked: any = getSession('A');
  opened.push(parked);
  Object.assign(parked, { state: BBSState.LOGGEDON, user: { id: 7 }, currentConf: 1, clientDoorActive: true, clientDoorId: 'beeb' });
  const finalized = jest.fn();
  parked.webLink.on('disconnect', finalized);
  a.connected = false; a.fire('disconnect', 'transport close');
  expect(isParked(parked)).toBe(true);
  return { parked, finalized };
}

/** Browser B on node 4 has just passed the password and is in the post-auth login. */
async function secondBrowser() {
  const b = browser('B');
  await acceptWebConnection(io, b as never, deps(4) as never);
  const session: any = getSession('B');
  opened.push(session);
  Object.assign(session, { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, tempData: {} });
  const login = runPostAuthLogin(session.webLink, session, user() as any, { lastLoginBeforeUpdate: new Date(0) });
  await new Promise((r) => setImmediate(r));
  return { b, session, login };
}

it('a web login is asked R or E, and R moves the parked session onto this socket: same node, same door, one session', async () => {
  const { parked, finalized } = await parkedPhone();
  const { b, session, login } = await secondBrowser();
  expect(text(b)).toContain('You have a session waiting on node 3');
  expect(text(b)).toContain('[R]esume it here or [E]nd it and log in fresh? ');

  session.loginInputHandler('R');
  expect(await login).toEqual({ ok: false, terminated: 'parked-session-resumed' });

  expect(getSession('B')).toBe(parked);
  expect(parked.nodeId).toBe(3);
  expect(parked.clientDoorId).toBe('beeb');
  expect(isParked(parked)).toBe(false);
  expect(parked.webLink.raw).toBe(b);
  expect(sessions.get('3')).toBe(parked);
  expect(sessions.has('4')).toBe(false);
  expect([...sessions.values()].filter((s: any) => String(s.user?.id) === '7')).toHaveLength(1);
  expect(nodeManager.releaseSession).toHaveBeenCalledWith('B');
  expect(b.sent.map(([e]: [string]) => e)).toContain('session-restored');
  expect(finalized).not.toHaveBeenCalled();
  expect(userAlreadyOnNode).not.toHaveBeenCalled();
});

it('E ends the parked session through one finalize and the login goes on', async () => {
  const { parked, finalized } = await parkedPhone();
  const { session, login } = await secondBrowser();
  session.loginInputHandler('e');
  expect(await login).toEqual({ ok: false, terminated: 'already-on-another-node' });
  expect(finalized).toHaveBeenCalledTimes(1);
  expect(parked.webLink.ended).toBe(true);
  expect(userAlreadyOnNode).toHaveBeenCalled();
});

it('junk keys ask again, and a parked session that ended while asking lets R log in as usual', async () => {
  const { parked } = await parkedPhone();
  const { b, session, login } = await secondBrowser();
  session.loginInputHandler('x');
  session.loginInputHandler('Q');
  expect(text(b).split('[R]esume it here').length - 1).toBe(3);

  await endParkedSessionsFor('7');
  session.loginInputHandler('R');
  expect(await login).toEqual({ ok: false, terminated: 'already-on-another-node' });
  expect(getSession('B')).toBe(session);
  expect(parked.webLink.ended).toBe(true);
});

it('telnet is offered E or Q only; R asks again, Q quits and leaves the parked session parked', async () => {
  const { parked, finalized } = await parkedPhone();
  const emitted: string[] = [];
  const telnet = { id: 'telnet-1', emit(_e: string, d?: unknown) { emitted.push(String(d)); return true; }, on() { return this; }, join() { return this; } };
  const session: any = { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, connectionType: 'telnet', nodeId: 5, tempData: {} };
  const login = runPostAuthLogin(telnet as any, session, user() as any, { lastLoginBeforeUpdate: new Date(0) });
  await new Promise((r) => setImmediate(r));
  expect(emitted.join('')).toContain('[E]nd it and log in here, or [Q]uit? ');
  expect(emitted.join('')).not.toContain('[R]esume');

  session.loginInputHandler('R');
  session.loginInputHandler('q');
  expect(await login).toEqual({ ok: false, terminated: 'parked-session-quit' });
  expect(beginLogoff).toHaveBeenCalledTimes(1);
  expect(isParked(parked)).toBe(true);
  expect(finalized).not.toHaveBeenCalled();
});

/**
 * S15: a password login whose account still holds a LIVE session on another
 * node (a window that never dropped) is offered the takeover S9 offers for a
 * parked one, through the same question and the same move path.
 * Web on both sides: [R]esume it here or [E]nd it and log in fresh.
 * Either side telnet/SSH: [E]nd it and log in here, or [Q]uit.
 *
 * Driven through `runPostAuthLogin` with `typedPassword` (the flag the
 * typed-password path in command.handler.ts passes), both calls opened by
 * `acceptWebConnection`, and the live call's real finalize registered.
 */
import { EventEmitter } from 'events';

process.env.SKIP_DB_INIT = '1';
jest.setTimeout(30000);

jest.mock('../../src/ftp/ftp-presence', () => ({
  ...jest.requireActual('../../src/ftp/ftp-presence'),
  ftpCallersOnline: jest.fn(() => []),
}));
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
jest.mock('../../src/services/node-manager.service', () => ({ nodeManager: { rekeySession: jest.fn(), releaseSession: jest.fn(async () => undefined), reservedNodeIds: () => [], configuredNodeIds: () => [] } }));
jest.mock('../../src/config', () => {
  const dir: string = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 's15-live-'));
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
jest.mock('../../src/server/database-helpers', () => ({
  ...jest.requireActual('../../src/server/database-helpers'),
  callersLog: jest.fn(async () => undefined),
}));

import { acceptWebConnection } from '../../src/server/web-connection';
import { endLiveSession, isParked, parkDecision, resumeParked } from '../../src/server/session-parking';
import { _resetResumeTokensForTests, issueResumeToken } from '../../src/server/resume-tokens';
import { disarmIdleTimeout } from '../../src/services/idle-timeout.service';
import { sessions, getSession, setSession } from '../../src/server/session-manager';
import { TelnetConnection } from '../../src/server/telnet-server';
import { setupTelnetSSHHandler } from '../../src/server/transport-session';
import { BBSState, LoggedOnSubState } from '../../src/constants/bbs-states';
import { runPostAuthLogin } from '../../src/services/login-post.service';
import { beginLogoff } from '../../src/server/logoff';
import { userAlreadyOnNode } from '../../src/services/user-already-online';
import { ftpCallersOnline } from '../../src/ftp/ftp-presence';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { registerDisconnectHandler } from '../../src/server/socket-handlers';

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
const said = (raw: any, event: string): string =>
  raw.sent.filter(([e]: [string]) => e === event).map(([, a]: [string, any[]]) => String(a[0]?.text ?? a[0])).join('');
const opened: any[] = [];
let logoffs: jest.SpyInstance;

beforeEach(() => {
  sessions.clear(); _resetResumeTokensForTests(); jest.clearAllMocks();
  (userAlreadyOnNode as jest.Mock).mockReturnValue(2);
  logoffs = jest.spyOn(callersLogManager, 'logLogoff').mockImplementation(() => undefined as never);
});
afterEach(async () => {
  logoffs.mockRestore();
  for (const s of opened.splice(0)) {
    disarmIdleTimeout(s);
    if (s?.webLink && !s.webLink.ended) s.webLink.end('server namespace disconnect');
  }
  await new Promise((r) => setTimeout(r, 50));
});

/** Window A logged on in the beeb door on node 3; it stays connected. */
async function liveWindow() {
  const a = browser('A');
  await acceptWebConnection(io, a as never, deps(3) as never);
  const live: any = getSession('A');
  opened.push(live);
  Object.assign(live, {
    state: BBSState.LOGGEDON, user: { id: 7, username: 'phone' }, currentConf: 1,
    clientDoorActive: true, clientDoorId: 'beeb',
  });
  registerDisconnectHandler(live.webLink);
  const finalized = jest.fn();
  live.webLink.on('disconnect', finalized);
  return { a, live, finalized };
}

/** Window B on node 4 has just typed the password and is in the post-auth login. */
async function passwordLogin(id = 'B', node = 4, extra: object = {}) {
  const b = browser(id);
  await acceptWebConnection(io, b as never, deps(node) as never);
  const session: any = getSession(id);
  opened.push(session);
  Object.assign(session, { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, tempData: {} });
  const login = runPostAuthLogin(session.webLink, session, { ...user(), ...extra } as any, { lastLoginBeforeUpdate: new Date(0), typedPassword: true });
  await new Promise((r) => setImmediate(r));
  return { b, session, login };
}

it('R moves the live web session here: same node, same session, the old window is told and server-disconnected, no logoff', async () => {
  const { a, live, finalized } = await liveWindow();
  const { b, session, login } = await passwordLogin();
  expect(text(b)).toContain('You are logged in on node 3');
  expect(text(b)).toContain('in another window. [R]esume it here or [E]nd it and log in fresh? ');

  session.loginInputHandler('R');
  expect(await login).toEqual({ ok: false, terminated: 'parked-session-resumed' });

  expect(getSession('B')).toBe(live);
  expect(live.nodeId).toBe(3);
  expect(live.clientDoorId).toBe('beeb');
  expect(live.webLink.raw).toBe(b);
  expect(sessions.get('3')).toBe(live);
  expect(sessions.has('4')).toBe(false);
  expect([...sessions.values()].filter((s: any) => String(s.user?.id) === '7')).toHaveLength(1);
  expect(said(a, 'system-message')).toContain('This session moved to another window.');
  expect(a.connected).toBe(false);
  expect(b.sent.map(([e]: [string]) => e)).toContain('session-restored');
  expect(finalized).not.toHaveBeenCalled();
  expect(logoffs).not.toHaveBeenCalled();
  expect(isParked(live)).toBe(false);
  expect(userAlreadyOnNode).not.toHaveBeenCalled();
});

it('E ends the live session through its finalize with one normal logoff line, and the login goes on', async () => {
  const { a, live, finalized } = await liveWindow();
  const { session, login } = await passwordLogin();
  session.loginInputHandler('e');
  // Reaching the (mocked) already-on check proves the login went on.
  expect(await login).toEqual({ ok: false, terminated: 'already-on-another-node' });
  expect(finalized).toHaveBeenCalledTimes(1);
  expect(live.webLink.ended).toBe(true);
  expect(live.sysopKicked).toBe(true);
  expect(sessions.get('3')).toBeUndefined();
  // One logoff line, `N` as for a sysop kick (express.e:8160-8166 logoffLog).
  expect(logoffs.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([[3, 'phone', 'N']]);
  expect(said(a, 'system-message')).toContain('This session was ended by a login in another window.');
  expect(userAlreadyOnNode).toHaveBeenCalled();
});

it('a telnet holder is offered E or Q only; R asks again and Q quits, leaving it on', async () => {
  const lines: string[] = [];
  const telnet = { id: 'telnet-9', emit(_e: string, d?: any) { lines.push(String(d?.text ?? d)); return true; }, disconnect: jest.fn() };
  const held: any = { state: BBSState.LOGGEDON, user: { id: 7, username: 'phone' }, nodeId: 5, connectionEmitter: telnet, connectionType: 'telnet' };
  sessions.set('5', held);
  const { b, session, login } = await passwordLogin();
  expect(text(b)).toContain('You are logged in on node 5');
  expect(text(b)).toContain('[E]nd it and log in here, or [Q]uit? ');
  expect(text(b)).not.toContain('[R]esume');
  session.loginInputHandler('R');
  session.loginInputHandler('q');
  expect(await login).toEqual({ ok: false, terminated: 'parked-session-quit' });
  expect(beginLogoff).toHaveBeenCalledTimes(1);
  expect(telnet.disconnect).not.toHaveBeenCalled();
  expect(sessions.get('5')).toBe(held);
});

it('a live session that ends while the question is up lets R log in as usual', async () => {
  const { a, live } = await liveWindow();
  const { session, login } = await passwordLogin();
  a.disconnect();
  await new Promise((r) => setTimeout(r, 20));
  session.loginInputHandler('R');
  expect(await login).toEqual({ ok: false, terminated: 'already-on-another-node' });
  expect(getSession('B')).toBe(session);
  expect(live.webLink.ended).toBe(true);
});

it('a resume-token claim on a live session is still refused in-use', async () => {
  const { live } = await liveWindow();
  const token = issueResumeToken(live, '7', 3);
  const c = browser('C');
  expect(await resumeParked(c as never, token, { claim: true })).toEqual({ ok: false, reason: 'in-use' });
  expect(getSession('A')).toBe(live);
});

it('an FTP-node holder still gets ONENODE, with no question', async () => {
  (userAlreadyOnNode as jest.Mock).mockReturnValue(null);
  (ftpCallersOnline as jest.Mock).mockReturnValue([{ nodeId: 90, username: 'phone' }]);
  const { b, login } = await passwordLogin();
  expect(await login).toEqual({ ok: false, terminated: 'already-on-another-node' });
  expect(text(b)).not.toContain('in another window');
});

it('a token login is not offered a live session (only a typed password is)', async () => {
  await liveWindow();
  const b = browser('B');
  await acceptWebConnection(io, b as never, deps(4) as never);
  const session: any = getSession('B');
  opened.push(session);
  Object.assign(session, { state: BBSState.LOGON, subState: LoggedOnSubState.READ_COMMAND, tempData: {} });
  expect(await runPostAuthLogin(session.webLink, session, user() as any, { lastLoginBeforeUpdate: new Date(0) }))
    .toEqual({ ok: false, terminated: 'already-on-another-node' });
  expect(text(b)).not.toContain('in another window');
});

/**
 * A telnet line on the real byte transport: TelnetConnection over a socket
 * stub that, like a net.Socket, says 'close' after end(). Bound through
 * setupTelnetSSHHandler, the production entry point for every telnet caller.
 */
class ClosingNetSocket extends EventEmitter {
  remoteAddress = '127.0.0.1';
  destroyed = false;
  writable = true;
  ended = 0;
  write(): boolean { return true; }
  end(): void { this.ended += 1; this.writable = false; setImmediate(() => this.emit('close')); }
}
function telnetHolder(nodeId: number) {
  const socket = new ClosingNetSocket();
  const connection = new TelnetConnection(socket as never);
  const id = connection as unknown as { sessionId: string; nodeId: number };
  id.nodeId = nodeId; id.sessionId = `telnet-${nodeId}-test`;
  const held: any = {
    state: BBSState.LOGGEDON, subState: LoggedOnSubState.DISPLAY_MENU, user: { id: 7, username: 'phone', secLevel: 10 },
    nodeId, currentConf: 1, connectionType: 'telnet', terminalType: 'ansi', screenWidth: 80, screenHeight: 24, tempData: {},
  };
  connection.session = held;
  setSession(connection.sessionId, held);
  setupTelnetSSHHandler(connection, 'telnet', {
    io: { sockets: { sockets: new Map() } }, sessions,
    nodeManager: { releaseSession: async () => undefined }, handleCommand: () => undefined,
  } as never);
  return { socket, held };
}

describe('S15 review: E against holders', () => {
  it('E on a telnet holder hangs up the real line: its finalize runs, one logoff line, and the login is not left waiting', async () => {
    const { socket, held } = await Promise.resolve(telnetHolder(5));
    expect(sessions.get('5')).toBe(held);
    const { session, login } = await passwordLogin();
    const started = Date.now();
    session.loginInputHandler('e');
    expect(await login).toEqual({ ok: false, terminated: 'already-on-another-node' });
    // The waiter was woken by the finalize, not by the 5 s bound.
    expect(Date.now() - started).toBeLessThan(2000);
    expect(socket.ended).toBeGreaterThanOrEqual(1);
    expect(sessions.get('5')).toBeUndefined();
    expect(logoffs.mock.calls.map((c) => [c[0], c[1], c[2]])).toEqual([[5, 'phone', 'N']]);
  });

  it('E then a clear already-on check: the login reaches LOGGEDON on the new node and the old node is free', async () => {
    const { live } = await liveWindow();
    // Consent already given, so nothing after the already-on check stops it.
    const { session, login } = await passwordLogin('B', 4, { gdprConsentAt: new Date(0) });
    (userAlreadyOnNode as jest.Mock).mockImplementation(() => (sessions.get('3') ? 3 : null));
    (ftpCallersOnline as jest.Mock).mockReturnValue([]);
    session.loginInputHandler('e');
    expect(await login).toEqual({ ok: true });
    expect(session.state).toBe(BBSState.LOGGEDON);
    expect(sessions.get('4')).toBe(session);
    expect(sessions.get('3')).toBeUndefined();
    expect(live.webLink.ended).toBe(true);
  });

  it('two E answers for one holder both return as soon as it leaves', async () => {
    const { live } = await liveWindow();
    const started = Date.now();
    await Promise.all([endLiveSession(live, 3000), endLiveSession(live, 3000)]);
    expect(Date.now() - started).toBeLessThan(1000);
    expect(sessions.get('3')).toBeUndefined();
  });

  it('a holder whose line never drops is not left marked as kicked when the wait gives up', async () => {
    const { live } = await liveWindow();
    live.webLink.disconnect = () => undefined; // the transport never says disconnect
    await endLiveSession(live, 30);
    expect(sessions.get('3')).toBe(live);
    expect(live.sysopKicked).toBeFalsy();
    // Its later real drop parks it like any other web session.
    expect(parkDecision(live, 'transport close', 60_000)).toBe('park');
  });
});

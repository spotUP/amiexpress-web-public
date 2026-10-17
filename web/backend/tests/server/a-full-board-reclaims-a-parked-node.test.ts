/**
 * S11 (plan Decision 17): a full board ends the session parked longest before
 * it turns a caller away - on the web through `acceptWebConnection`, on telnet
 * through `TelnetServer.handleConnection`. The parked session ends through the
 * one disconnect handler: `Loss Carrier` in the CallersLog, its token revoked,
 * its node handed to the new caller. Nothing parked: refused as before.
 */
process.env.SKIP_DB_INIT = '1';
import { EventEmitter } from 'events';

jest.mock('../../src/index', () => ({}));
jest.mock('../../src/database', () => ({
  db: {
    getUserById: jest.fn(async () => ({ id: 7, username: 'phone', baud: 0, secLevel: 20 })),
    updateUser: jest.fn(async () => undefined),
  },
  getDatabase: () => ({ updateUser: jest.fn(async () => undefined) }),
}));
jest.mock('../../src/handlers/command-execution.handler', () => ({ runSysCommand: jest.fn().mockResolvedValue(undefined) }));
jest.mock('../../src/services/login-connect.service', () => ({
  runPreLoginConnect: jest.fn(async () => ({ passwordResetActive: false })),
}));
jest.mock('../../src/server/session-observers', () => ({
  ...jest.requireActual('../../src/server/session-observers'),
  startObserving: jest.fn(), stopObserving: jest.fn(),
}));
jest.mock('../../src/services/logon-gates', () => ({ tokenHolderRefusal: () => ({ refusal: null }) }));
// Two configured nodes, 3 and 4; nothing reserved.
jest.mock('../../src/services/node-manager.service', () => ({
  nodeManager: {
    rekeySession: jest.fn(), releaseSession: jest.fn(async () => undefined),
    configuredNodeIds: () => [3, 4], reservedNodeIds: () => [],
  },
}));
jest.mock('../../src/config', () => {
  const dir: string = require('fs').mkdtempSync(require('path').join(require('os').tmpdir(), 's11-reclaim-'));
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

import { createSessionLink } from '../../src/server/session-link';
import { installParking, isParked } from '../../src/server/session-parking';
import { registerDisconnectHandler } from '../../src/server/socket-handlers';
import { issueResumeToken, lookupResumeToken, _resetResumeTokensForTests } from '../../src/server/resume-tokens';
import { acceptWebConnection } from '../../src/server/web-connection';
import { disarmIdleTimeout } from '../../src/services/idle-timeout.service';
import { sessions, getSession, setSession, socketToUser, userSessions, allNodesBusyNotice } from '../../src/server/session-manager';
import { BBSState } from '../../src/constants/bbs-states';
import { callersLogManager } from '../../src/services/CallersLogManager';
import { TelnetServer } from '../../src/server/telnet-server';

function fakeRaw(id: string) {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.sent = [] as Array<[string, unknown[]]>;
  ee.handshake = { address: '127.0.0.1', headers: {}, auth: {} };
  ee.nsp = { sockets: new Map() };
  ee.join = () => {}; ee.leave = () => {};
  ee.onAny = () => {}; ee.offAny = () => {}; ee.onAnyOutgoing = () => {}; ee.offAnyOutgoing = () => {};
  ee.disconnect = () => { ee.connected = false; ee.fire('disconnect', 'server namespace disconnect'); };
  ee.fire = (e: string, ...a: unknown[]) => EventEmitter.prototype.emit.call(ee, e, ...a);
  ee.emit = (e: string, ...a: unknown[]) => { ee.sent.push([e, a]); return true; };
  return ee;
}

/** A logged-on web caller on `node`, dropped (parked) at `droppedAt`. */
function parkedCaller(node: number, droppedAt: number, userId: string) {
  const a = fakeRaw(`P${node}`);
  const link = createSessionLink(a);
  const session: any = {
    nodeId: node, socketId: a.id, tempData: {}, state: BBSState.LOGGEDON, connectionType: 'web',
    user: { id: userId, username: `u${userId}` }, webLink: link, currentConf: 1,
  };
  installParking(link as never, session);
  registerDisconnectHandler(link as never);
  setSession(a.id, session);
  socketToUser.set(a.id, userId);
  const token = issueResumeToken(session, userId, node);
  a.connected = false; a.fire('disconnect', 'transport close');
  session.detachedAt = droppedAt;   // the drop's age is what decides
  return { session, token, link };
}

/** A caller who is here, holding `node` (attached, so never reclaimable). */
function liveCaller(node: number) {
  const session: any = { nodeId: node, socketId: `L${node}`, state: BBSState.LOGGEDON, connectionType: 'telnet', tempData: {} };
  setSession(`L${node}`, session);
  return session;
}

/** NodeManager's answer on a full board, then (after a reclaim) the freed node. */
function webDeps(...answers: Array<number | null>) {
  const assign = jest.fn();
  for (const n of answers) {
    if (n === null) assign.mockRejectedValueOnce(new Error('No available nodes'));
    else assign.mockResolvedValueOnce({ nodeId: n });
  }
  return { nodeManager: { assignSessionToNode: assign }, chatState: { sessions: [], messages: [] } };
}
const io = { sockets: { sockets: new Map() } } as never;

let logoffSpy: jest.SpyInstance;
const opened: any[] = [];
beforeEach(() => {
  sessions.clear();
  _resetResumeTokensForTests();
  logoffSpy = jest.spyOn(callersLogManager, 'logLogoffOnce').mockImplementation(() => undefined as never);
  jest.spyOn(callersLogManager, 'logActivity').mockImplementation(() => undefined);
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(async () => {
  for (const s of opened.splice(0)) {
    if (!s) continue;
    disarmIdleTimeout(s);
    if (s.webLink && !s.webLink.ended) s.webLink.end('server namespace disconnect');
  }
  for (const s of sessions.values()) if ((s as any).webLink && !(s as any).webLink.ended) (s as any).webLink.end('server namespace disconnect');
  await new Promise((r) => setTimeout(r, 20));
  jest.restoreAllMocks();
  socketToUser.clear();
  userSessions.clear();
});

describe('a full board reclaims a parked node (web, through acceptWebConnection)', () => {
  it('one live, one parked: the new caller gets the parked node, the parked caller is logged off with Loss Carrier', async () => {
    liveCaller(4);
    const { session: parked, token, link } = parkedCaller(3, 1_000, '7');
    expect(isParked(parked)).toBe(true);

    const n = fakeRaw('N');
    const deps = webDeps(null, 3);
    await acceptWebConnection(io, n as never, deps as never);
    opened.push(getSession('N'));

    expect(link.ended).toBe(true);
    expect(logoffSpy).toHaveBeenCalledTimes(1);
    expect(logoffSpy.mock.calls[0][1]).toBe('Loss Carrier');
    expect(lookupResumeToken(token)).toEqual({ ok: false, reason: 'unknown' });
    expect(deps.nodeManager.assignSessionToNode).toHaveBeenCalledTimes(2);
    expect(getSession('N')!.nodeId).toBe(3);
    expect(n.sent.some(([, a]: [string, unknown[]]) => a[0] === allNodesBusyNotice())).toBe(false);
  });

  it('two parked: the one parked longest goes, the other stays parked', async () => {
    const newer = parkedCaller(4, 9_000, '8');
    const older = parkedCaller(3, 2_000, '7');

    const n = fakeRaw('N');
    await acceptWebConnection(io, n as never, webDeps(null, 3) as never);
    opened.push(getSession('N'));

    expect(older.link.ended).toBe(true);
    expect(newer.link.ended).toBe(false);
    expect(isParked(newer.session)).toBe(true);
    expect(logoffSpy).toHaveBeenCalledTimes(1);
    expect(getSession('N')!.nodeId).toBe(3);
  });

  it('nothing parked: refused with the busy notice, as before', async () => {
    liveCaller(3); liveCaller(4);
    const n = fakeRaw('N');
    const deps = webDeps(null);
    await acceptWebConnection(io, n as never, deps as never);

    expect(deps.nodeManager.assignSessionToNode).toHaveBeenCalledTimes(1);
    expect(n.sent).toContainEqual(['ansi-output', [allNodesBusyNotice()]]);
    expect(n.connected).toBe(false);
    expect(logoffSpy).not.toHaveBeenCalled();
  });
});

describe('a full board reclaims a parked node (telnet, through TelnetServer.handleConnection)', () => {
  function telnetSocket() {
    return {
      remoteAddress: '10.9.0.9', destroyed: false,
      setNoDelay: jest.fn(), setKeepAlive: jest.fn(), setTimeout: jest.fn(),
      write: jest.fn(), end: jest.fn(), destroy: jest.fn(), on: jest.fn(), once: jest.fn(),
    };
  }

  it('one live, one parked: the telnet caller is seated on the parked node', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'queueMicrotask'] });
    try {
      liveCaller(4);
      const { link } = parkedCaller(3, 1_000, '7');
      const server = new TelnetServer(0);
      const s = telnetSocket();
      await (server as any).handleConnection(s);

      expect(link.ended).toBe(true);
      expect(logoffSpy.mock.calls[0][1]).toBe('Loss Carrier');
      expect(s.write).not.toHaveBeenCalledWith(allNodesBusyNotice());
      const seated = [...(server as any).connections.values()];
      expect(seated).toHaveLength(1);
      expect(seated[0].nodeId).toBe(3);
      for (const c of seated) opened.push(c.session);
    } finally {
      jest.clearAllTimers();
      jest.useRealTimers();
    }
  });

  it('nothing parked: the busy notice and a hang-up, as before', async () => {
    liveCaller(3); liveCaller(4);
    const server = new TelnetServer(0);
    const s = telnetSocket();
    await (server as any).handleConnection(s);
    expect(s.write).toHaveBeenCalledWith(allNodesBusyNotice());
    expect(s.end).toHaveBeenCalled();
    expect((server as any).connections.size).toBe(0);
  });
});

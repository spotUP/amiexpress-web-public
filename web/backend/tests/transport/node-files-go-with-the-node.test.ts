/**
 * The node files go with the node, in the same step that frees it.
 *
 * 2026-11-09, live: a caller logged off and logged straight back in on the
 * same node. The second login hung on a blank screen for good. The 68K
 * trace said why: zOOsTAT (SysCmd S, run at auto-rejoin) did
 * fopen("bbs:node1.user") and got `IoErr=205`, then fread through the NULL
 * FILE* into ExecBase (0x80000 -> 0x800a3 at pc=0x4bbc) and ran away.
 *
 * node1.user was missing because the PREVIOUS session's disconnect cleanup
 * deleted it. `finalizeDisconnectCleanup` freed the node first
 * (forgetSession), then awaited the callers log, the SAmiLog store, the
 * logoff batches (whole 68K doors), the account save - and only then
 * deleted node<n>.user. In that window the next caller took the free node
 * and wrote his own node1.user; the old cleanup deleted it under him.
 *
 * express.e cannot race itself: node n is one process, and its logoff runs
 * clearUser() (express.e:2917-2925, at 8182) BEFORE saveAccount (8207),
 * doLogoffNotify (8211) and the LOGOFF syscommand (8222). The files are
 * gone before any paperwork, and nothing in the paperwork reads them.
 *
 * This pins both halves: the files are gone the moment the node is free
 * (before the first await), and a new caller's file on the same node
 * survives the old caller's cleanup.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const caller = (username: string, id: string): any => ({
  id,
  username,
  password: '',
  secLevel: 30,
  timesOn: 1,
  created: new Date(0),
  slotNumber: 0,
});

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => { resolve = r; });
  return { promise, resolve };
}

describe('node<n>.user leaves with the node, not after the paperwork', () => {
  let dir: string;

  beforeEach(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), 'node-files-'));
    jest.resetModules();
  });

  afterEach(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  it('is deleted before the first await, and a new caller\'s file on the same node outlives the old cleanup', async () => {
    const { NodeFileManager } = jest.requireActual('../../src/services/NodeFileManager');
    const mgr = new NodeFileManager(dir);
    jest.doMock('../../src/services/NodeFileManager', () => ({
      ...jest.requireActual('../../src/services/NodeFileManager'),
      nodeFileManager: mgr,
    }));

    // The logoff batches are the slow step: a 68K door. Hold them open
    // until the test lets go.
    const batches = deferred();
    const callersLog = jest.fn(async () => undefined);
    jest.doMock('../../src/server/database-helpers', () => ({
      ...jest.requireActual('../../src/server/database-helpers'),
      callersLog,
    }));
    jest.doMock('../../src/services/batch-scheduler', () => ({
      ...jest.requireActual('../../src/services/batch-scheduler'),
      logoffBatchesAlreadyRan: () => false,
      runLogoffBatches: jest.fn(async () => { await batches.promise; }),
    }));

    const sessionManager = require('../../src/server/session-manager');
    const handlers = require('../../src/server/socket-handlers');

    const nodeFile = path.join(dir, 'node1.user');

    // Caller A is on node 1; the login wrote his node file.
    const userA = caller('lctest1', '1');
    const sessionA: any = {
      user: userA, nodeId: 1, socketId: 'sock-a', state: 'LOGGEDON', connectionType: 'telnet',
    };
    sessionManager.setSession('sock-a', sessionA);
    sessionManager.socketToUser.set('sock-a', '1');
    sessionManager.socketToNodeId.set('sock-a', 1);
    mgr.writeNodeUserFile(1, userA);
    expect(fs.existsSync(nodeFile)).toBe(true);

    // A drops. The cleanup starts; its first await is inside the paperwork.
    const socket: any = { id: 'sock-a', emit: () => true, on: () => {}, off: () => {} };
    const cleanup = handlers.finalizeDisconnectCleanup(socket, sessionA, 'sock-a');

    // express.e order: the node is free AND its files are gone, together,
    // before any paperwork. No window for the next caller to fall into.
    expect(sessionManager.sessions.has('1')).toBe(false);
    expect(fs.existsSync(nodeFile)).toBe(false);

    // Caller B takes the free node while A's logoff batches still run, and
    // his login writes node1.user - as runPostAuthLogin does.
    const userB = caller('lctest1', '1');
    mgr.writeNodeUserFile(1, userB);
    expect(fs.existsSync(nodeFile)).toBe(true);

    // A's paperwork finishes.
    batches.resolve();
    await cleanup;

    // B's file is still there for his auto-rejoin door to open.
    expect(callersLog).toHaveBeenCalledWith('1', 'lctest1', 'Logged off');
    expect(fs.existsSync(nodeFile)).toBe(true);
  });

  it('a session whose node was taken by another (a kick) leaves the new caller\'s file alone', async () => {
    const { NodeFileManager } = jest.requireActual('../../src/services/NodeFileManager');
    const mgr = new NodeFileManager(dir);
    jest.doMock('../../src/services/NodeFileManager', () => ({
      ...jest.requireActual('../../src/services/NodeFileManager'),
      nodeFileManager: mgr,
    }));
    jest.doMock('../../src/server/database-helpers', () => ({
      ...jest.requireActual('../../src/server/database-helpers'),
      callersLog: jest.fn(async () => undefined),
    }));
    jest.doMock('../../src/services/batch-scheduler', () => ({
      ...jest.requireActual('../../src/services/batch-scheduler'),
      logoffBatchesAlreadyRan: () => false,
      runLogoffBatches: jest.fn(async () => undefined),
    }));

    const sessionManager = require('../../src/server/session-manager');
    const handlers = require('../../src/server/socket-handlers');
    const nodeFile = path.join(dir, 'node1.user');

    // A was kicked: the kick freed node 1 and deleted its files. B took
    // node 1 and his login wrote node1.user. A's socket closes only now.
    const sessionA: any = {
      user: caller('lctest1', '1'), nodeId: 1, socketId: 'sock-a', state: 'LOGGEDON', connectionType: 'telnet',
    };
    const userB = caller('lctest2', '2');
    const sessionB: any = {
      user: userB, nodeId: 1, socketId: 'sock-b', state: 'LOGGEDON', connectionType: 'telnet',
    };
    sessionManager.setSession('sock-b', sessionB);
    sessionManager.socketToUser.set('sock-b', '2');
    mgr.writeNodeUserFile(1, userB);

    const socket: any = { id: 'sock-a', emit: () => true, on: () => {}, off: () => {} };
    await handlers.finalizeDisconnectCleanup(socket, sessionA, 'sock-a');

    expect(sessionManager.sessions.get('1')).toBe(sessionB);
    expect(fs.existsSync(nodeFile)).toBe(true);
  });
});

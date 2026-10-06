/**
 * A caller who has gone is off the board BEFORE the logoff paperwork runs.
 *
 * 2026-09-08 05:28, live: the sysop's tab dropped, the disconnect handler
 * did its work - and /health went on reporting two callers, so the deploy
 * guard refused to deploy on their behalf. The log said why: the logoff
 * BATCHES run doors, and `runLogoffBatches` awaited a whole 68K emulator
 * (ByteKillHandler) while the session still sat in the `sessions` map that
 * /health counts. A door that hangs or throws leaves the caller there for
 * ever.
 *
 * `forgetSession` is the one place that takes a session out of every map
 * that says "this caller is on", and it now runs before any of the
 * bookkeeping. This pins the maps it must empty.
 */
process.env.SKIP_DB_INIT = '1';
process.env.SKIP_SERVER_START = '1';

import { forgetSession } from '../../src/server/socket-handlers';
import { sessions, userSessions, socketToUser, socketToNodeId, setSession } from '../../src/server/session-manager';

function seatCaller(nodeId: number, userId: string, socketId: string) {
  const session: any = {
    user: { id: userId, username: 'Knut', secLevel: 30 },
    nodeId, socketId, state: 'LOGGEDON', connectionType: 'web',
  };
  setSession(socketId, session);
  socketToUser.set(socketId, userId);
  socketToNodeId.set(socketId, nodeId);
  return session;
}

describe('a dropped caller leaves the board', () => {
  beforeEach(() => { sessions.clear(); userSessions.clear(); socketToUser.clear(); socketToNodeId.clear(); });

  it('is gone from every map that answers "who is on"', () => {
    const session = seatCaller(2, 'u-gone', 'sock-2');
    expect(sessions.get('2')).toBe(session);
    expect(userSessions.get('u-gone')).toBe(session);

    forgetSession(session, 'sock-2', 'u-gone');

    expect(sessions.has('2')).toBe(false);          // what /health counts
    expect(userSessions.has('u-gone')).toBe(false);
    expect(socketToUser.has('sock-2')).toBe(false);
    expect(socketToNodeId.has('sock-2')).toBe(false);
  });

  it('takes the caller\'s other sockets with them, and leaves other callers alone', () => {
    const gone = seatCaller(2, 'u-gone', 'sock-2');
    socketToUser.set('sock-2b', 'u-gone');           // a second tab of the same caller
    const stays = seatCaller(3, 'u-stays', 'sock-3');

    forgetSession(gone, 'sock-2', 'u-gone');

    expect(socketToUser.has('sock-2b')).toBe(false);
    expect(sessions.get('3')).toBe(stays);
    expect(userSessions.get('u-stays')).toBe(stays);
  });

  it('a node that ends while the same account is on another node leaves; the other stays (ghost on /health)', () => {
    const telnet = seatCaller(2, 'u-twice', 'sock-2');
    const web = seatCaller(3, 'u-twice', 'sock-3');   // userSessions now points at the web one

    forgetSession(telnet, 'sock-2', 'u-twice');

    expect(sessions.has('2')).toBe(false);
    expect(socketToNodeId.has('sock-2')).toBe(false);
    expect(sessions.get('3')).toBe(web);
    expect(userSessions.get('u-twice')).toBe(web);
    expect(socketToUser.get('sock-3')).toBe('u-twice');
    expect(socketToNodeId.get('sock-3')).toBe(3);
  });

  it('a session with no user is dropped by its socket', () => {
    const anon: any = { nodeId: 4, socketId: 'sock-4', state: 'CONNECTING' };
    setSession('sock-4', anon);
    socketToNodeId.set('sock-4', 4);
    forgetSession(anon, 'sock-4', '');
    expect(sessions.has('4')).toBe(false);
  });

  /*
   * REWRITTEN 2026-09-16. This used to read `socket-handlers.ts`, strip its
   * comments, slice from the function's name and compare the INDEX of three
   * substrings. It passes on source that never runs, it breaks on a rename or
   * a reformat, and it says nothing about what happens when the paperwork is
   * slow - which is the whole bug.
   *
   * `finalizeDisconnectCleanup` is exported, so the test calls it and makes
   * the paperwork ASK: at the moment the logoff batches and the callers log
   * run, is this caller still on the board? That is the invariant, stated
   * where it bit - /health counts the `sessions` map, and a door hanging
   * inside a logoff batch used to hold a departed caller in it for ever.
   */
  it('has cleared the maps by the time the logoff paperwork runs', async () => {
    jest.resetModules();

    // What the paperwork saw when it ran. Recorded rather than asserted
    // inside the mock, so a mock that never runs cannot pass silently.
    const boardDuringPaperwork: Array<{ step: string; stillSeated: boolean }> = [];

    const sessionManager = require('../../src/server/session-manager');
    const stillSeated = () => sessionManager.sessions.has('7');

    jest.doMock('../../src/server/database-helpers', () => ({
      ...jest.requireActual('../../src/server/database-helpers'),
      callersLog: jest.fn(async () => {
        boardDuringPaperwork.push({ step: 'callersLog', stillSeated: stillSeated() });
      }),
    }));
    jest.doMock('../../src/services/batch-scheduler', () => ({
      ...jest.requireActual('../../src/services/batch-scheduler'),
      logoffBatchesAlreadyRan: () => false,
      runLogoffBatches: jest.fn(async () => {
        boardDuringPaperwork.push({ step: 'runLogoffBatches', stillSeated: stillSeated() });
      }),
    }));

    const handlers = require('../../src/server/socket-handlers');
    const session: any = {
      user: { id: '77', username: 'Knut', secLevel: 30 },
      nodeId: 7, socketId: 'sock-7', state: 'LOGGEDON', connectionType: 'web',
    };
    sessionManager.setSession('sock-7', session);
    sessionManager.socketToUser.set('sock-7', '77');
    sessionManager.socketToNodeId.set('sock-7', 7);
    expect(stillSeated()).toBe(true);

    const socket: any = { id: 'sock-7', emit: () => true, on: () => {}, off: () => {} };
    await handlers.finalizeDisconnectCleanup(socket, session, 'sock-7');

    // Both pieces of paperwork ran...
    expect(boardDuringPaperwork.map((s) => s.step)).toEqual(
      expect.arrayContaining(['callersLog', 'runLogoffBatches']),
    );
    // ...and neither of them could see the caller on the board.
    for (const { step, stillSeated: seated } of boardDuringPaperwork) {
      expect({ step, seated }).toEqual({ step, seated: false });
    }
    expect(stillSeated()).toBe(false);
  });
});

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

  it('a session with no user is dropped by its socket', () => {
    const anon: any = { nodeId: 4, socketId: 'sock-4', state: 'CONNECTING' };
    setSession('sock-4', anon);
    socketToNodeId.set('sock-4', 4);
    forgetSession(anon, 'sock-4', '');
    expect(sessions.has('4')).toBe(false);
  });

  it('the cleanup clears the maps BEFORE it runs the logoff paperwork', () => {
    // The order is the whole fix: a door in a logoff batch must not be able
    // to keep a departed caller on the board.
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(path.join(__dirname, '../../src/server/socket-handlers.ts'), 'utf8');
    // Comments out: this file's own comments name the things being ordered.
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const body = code.slice(code.indexOf('async function finalizeDisconnectCleanup'));
    const forget = body.indexOf('forgetSession(session, socketId, userId)');
    const batches = body.indexOf('runLogoffBatches(');
    const callersLogged = body.indexOf("callersLog(session.user.id");
    expect(forget).toBeGreaterThan(-1);
    expect(batches).toBeGreaterThan(forget);
    expect(callersLogged).toBeGreaterThan(forget);
  });
});

/**
 * The telnet front end shows who is actually on.
 *
 * It asked over Socket.IO - `socket.emit('get-active-users')`, then waited
 * 150ms for an `active-users` reply - and the reply could never arrive. A
 * door runs INSIDE the backend and the socket it holds is the user's own
 * server-side socket, so the emit went OUT to the browser, which has no
 * listener for it. The backend's matching `socket.on('get-active-users')`
 * only fires when a CLIENT asks, and no client ever does.
 *
 * So the timeout fired on every single connection and the door drew
 * placeholders: every row "Awaiting Call", the caller's own row
 * "Connecting", on a board with people logged in.
 *
 * `bbs.getOnlineUsers()` had been declared in the SDK's BBSApi interface the
 * whole time with nothing implementing it - a door calling it got `undefined`
 * and no error.
 */

process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

import { sessions } from '../../src/server/session-manager';
import { listOnlineNodes } from '../../src/doors/who-is-online';

function putSession(nodeId: number, user: unknown): void {
  sessions.set(String(nodeId), { nodeId, user } as never);
}

describe('who is online', () => {
  beforeEach(() => sessions.clear());
  afterEach(() => sessions.clear());

  it('lists a node with a logged-in user on it', () => {
    putSession(3, { username: 'Spot', location: 'nEVERLaND', ip: '10.0.0.9' });

    expect(listOnlineNodes()).toEqual([
      {
        nodeNumber: 3,
        username: 'Spot',
        location: 'nEVERLaND',
        ipAddress: '10.0.0.9',
        status: 'active',
      },
    ]);
  });

  it('leaves out a connection that has not logged in', () => {
    // A socket in AWAIT has a session and no user. It is not "online" and
    // must not take a row on the node table.
    putSession(1, undefined);
    putSession(2, { username: 'Phantasm' });

    expect(listOnlineNodes().map(n => n.nodeNumber)).toEqual([2]);
  });

  it('shows PRIVATE rather than a blank address', () => {
    putSession(1, { username: 'Spot' });

    const [node] = listOnlineNodes();
    expect(node.ipAddress).toBe('PRIVATE');
    expect(node.location).toBe('');
  });
});

describe('the telnet front end', () => {
  const source = fs.readFileSync(
    path.join(__dirname, '..', '..', '..', '..', 'Doors', 'telnet-front', 'index.ts'),
    'utf8',
  );

  // The round trip is the bug, not a slow path: it cannot complete at all.
  // A longer timeout would have changed nothing.
  it('does not ask for the node list over the socket', () => {
    expect(source).not.toContain("emit('get-active-users')");
    expect(source).not.toContain("once('active-users'");
  });

  it('reads the session map through the door API instead', () => {
    expect(source).toContain('bbs.getOnlineUsers()');
  });

  // Pre-login the door runs before a door API is handed out, and an empty
  // board is then the honest answer rather than a crash.
  it('survives having no door API, which is how it runs pre-login', () => {
    expect(source).toContain("typeof bbs?.getOnlineUsers === 'function'");
  });
});

describe('the BBS door API', () => {
  it('implements the getOnlineUsers the SDK has always declared', () => {
    const api = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'doors', 'BBSApi.ts'),
      'utf8',
    );
    const sdk = fs.readFileSync(
      path.join(__dirname, '..', '..', '..', '..', 'sdk', 'core', 'types.ts'),
      'utf8',
    );

    expect(sdk).toContain('getOnlineUsers()');
    expect(api).toContain('getOnlineUsers()');
  });

  // Both readers take the same definition of "online", so the socket API and
  // the door cannot answer differently.
  it('shares one definition with the socket handler', () => {
    const handlers = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src', 'server', 'socket-handlers.ts'),
      'utf8',
    );

    expect(handlers).toContain('listOnlineNodes');
  });
});

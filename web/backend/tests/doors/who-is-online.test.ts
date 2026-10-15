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
 *
 * Driven: the real telnet-front door through the SDK's Door.execute() with
 * the real BBSApi, the real BBSApi.getOnlineUsers(), and the real socket
 * handler's `get-active-users` reply - each read against the session map.
 */

process.env.SKIP_DB_INIT = '1';

// The socket handlers module reaches index.ts; nothing here needs it.
jest.mock('../../src/index', () => ({}));
// The door imports the SDK barrel, whose audio engine pulls in the ESM-only
// `tone` (same stub as tests/doors/ncurses-pong-takes-input.test.ts).
jest.mock('tone', () => ({}), { virtual: true });

import type { BBSApi as SdkBBSApi } from '../../../../sdk/core/types';
import * as fs from 'fs';
import * as path from 'path';
import type { Socket } from 'socket.io';

import { sessions } from '../../src/server/session-manager';
import { listOnlineNodes } from '../../src/doors/who-is-online';
import { BBSApi, createBBSApi } from '../../src/doors/BBSApi';
import telnetFront from '../../../../Doors/telnet-front/index';

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

/** A door-side socket that records everything the door emits. */
function recordingSocket() {
  const emitted: Array<{ event: string; data: unknown }> = [];
  const socket: any = {
    id: 'telnet-front-test',
    handshake: { address: '10.0.0.1', headers: {} },
    emit: (event: string, data: unknown) => { emitted.push({ event, data }); return true; },
    on: () => socket,
    once: () => socket,
    off: () => socket,
    removeListener: () => socket,
  };
  return { socket, emitted };
}

async function runTelnetFront(withApi: boolean) {
  const { socket, emitted } = recordingSocket();
  // Pre-login (AWAIT): the door draws and returns without waiting for a key.
  const bbsSession: any = { nodeId: 1, state: 'AWAIT' };
  const bbs = withApi ? createBBSApi(socket as unknown as Socket, bbsSession) : undefined;
  await telnetFront.execute({
    socket: socket as unknown as Socket,
    bbsSession,
    user: { id: '1', username: 'Caller', accessLevel: 10, timesCalled: 1, uploads: 0, downloads: 0 },
    params: [],
    bbs,
  } as any);
  const screen = emitted.filter((e) => e.event === 'ansi-output').map((e) => String(e.data)).join('');
  return { emitted, screen };
}

describe('the telnet front end', () => {
  beforeEach(() => sessions.clear());
  afterEach(() => sessions.clear());

  // The round trip is the bug, not a slow path: it cannot complete at all.
  // A longer timeout would have changed nothing.
  it('does not ask for the node list over the socket', async () => {
    putSession(2, { username: 'Phantasm', location: 'Uprough', ip: '10.0.0.7' });
    const { emitted } = await runTelnetFront(true);
    expect(emitted.map((e) => e.event)).not.toContain('get-active-users');
  });

  it('reads the session map through the door API instead', async () => {
    putSession(2, { username: 'Phantasm', location: 'Uprough', ip: '10.0.0.7' });
    const { screen } = await runTelnetFront(true);
    expect(screen).toContain('Phantasm');
    expect(screen).toContain('Uprough');
  });

  // Pre-login the door runs before a door API is handed out, and an empty
  // board is then the honest answer rather than a crash.
  it('survives having no door API, which is how it runs pre-login', async () => {
    putSession(2, { username: 'Phantasm', location: 'Uprough', ip: '10.0.0.7' });
    const { screen } = await runTelnetFront(false);
    expect(screen).toContain('Awaiting Call');
    expect(screen).not.toContain('Phantasm');
  });
});

describe('the BBS door API', () => {
  beforeEach(() => sessions.clear());
  afterEach(() => sessions.clear());

  it('implements the getOnlineUsers the SDK declares, in the shape it declares', () => {
    putSession(4, { username: 'Spot', location: 'nEVERLaND', ip: '10.0.0.9' });
    const api = new BBSApi({ emit: () => true, on: () => undefined } as any, { nodeId: 1 } as any);
    // The SDK declared `Promise<User[]>` while the board returned node rows
    // synchronously. The row type is now the SDK's own (who-is-online.ts
    // imports it), so the board's tsc fails when the two disagree; this
    // checks the call answers synchronously with those rows.
    const declared: ReturnType<SdkBBSApi['getOnlineUsers']> = api.getOnlineUsers();
    expect(declared).toEqual(listOnlineNodes());
    expect(api.getOnlineUsers().map((n) => n.username)).toEqual(['Spot']);
  });

  // Both readers take the same definition of "online", so the socket API and
  // the door cannot answer differently.
  it('shares one definition with the socket handler', () => {
    putSession(4, { username: 'Spot', location: 'nEVERLaND', ip: '10.0.0.9' });
    putSession(5, undefined); // connected, not logged in: not online

    const handlers: Record<string, (...args: any[]) => void> = {};
    const replies: Array<{ event: string; data: any }> = [];
    const socket: any = {
      id: 'who-is-online-socket',
      handshake: { address: '127.0.0.1' },
      on(event: string, cb: (...args: any[]) => void) { handlers[event] = cb; return socket; },
      onAny() { return socket; },
      emit(event: string, data: any) { replies.push({ event, data }); return true; },
      join() { return socket; },
      removeAllListeners() { return socket; },
    };
    const io: any = { sockets: { sockets: new Map() }, emit() { return true; }, to() { return { emit() { return true; } }; } };
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { setSession } = require('../../src/server/session-manager');
    const { registerSocketHandlers } = require('../../src/server/socket-handlers');
    /* eslint-enable @typescript-eslint/no-var-requires */
    // The asking socket's own session: the sysop - every row carries a
    // caller's IP address, so nobody else is answered (see the next case).
    setSession(socket.id, { nodeId: 6, socketId: socket.id, user: { id: 1, username: 'Sysop', secLevel: 255 } });
    registerSocketHandlers(io, socket);

    handlers['get-active-users']();
    const reply = replies.find((r) => r.event === 'active-users');
    expect(reply?.data).toEqual({ users: listOnlineNodes() });
    expect(reply?.data.users.map((n: { nodeNumber: number }) => n.nodeNumber)).toEqual([4, 6]);
  });

  it("does not hand a visitor at the login prompt every caller's IP address", () => {
    // The asking socket is connected and has not logged on; the board used to
    // answer it with every online caller's name, location and IP.
    putSession(4, { username: 'Spot', location: 'nEVERLaND', ip: '10.0.0.9' });

    const handlers: Record<string, (...args: any[]) => void> = {};
    const replies: Array<{ event: string; data: any }> = [];
    const socket: any = {
      id: 'who-is-online-visitor',
      handshake: { address: '127.0.0.1' },
      on(event: string, cb: (...args: any[]) => void) { handlers[event] = cb; return socket; },
      onAny() { return socket; },
      emit(event: string, data: any) { replies.push({ event, data }); return true; },
      join() { return socket; },
      removeAllListeners() { return socket; },
    };
    const io: any = { sockets: { sockets: new Map() }, emit() { return true; }, to() { return { emit() { return true; } }; } };
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { setSession } = require('../../src/server/session-manager');
    const { registerSocketHandlers } = require('../../src/server/socket-handlers');
    /* eslint-enable @typescript-eslint/no-var-requires */
    setSession(socket.id, { nodeId: 7, socketId: socket.id });
    registerSocketHandlers(io, socket);

    handlers['get-active-users']();
    expect(replies.find((r) => r.event === 'active-users')).toBeUndefined();
  });
});

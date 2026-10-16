/**
 * A web caller's connection handler wraps his socket in a session link.
 *
 * `acceptWebConnection` is the browser caller's entry point (moved out of
 * index.ts so it can be driven). Every holder of the session must hold the
 * LINK, never the raw socket, so a later transport change needs no holder
 * re-pointed; the emitter registry must answer that link for the session.
 */
import { EventEmitter } from 'events';

// The heavy neighbours stand in; the row is about what the handler builds.
const mockRegisterSocketHandlers = jest.fn();
jest.mock('../../src/server/socket-handlers', () => ({
  registerSocketHandlers: (...a: unknown[]) => mockRegisterSocketHandlers(...a),
  applyPendingGeometry: jest.fn(),
}));
const mockArmIdle = jest.fn();
jest.mock('../../src/services/idle-timeout.service', () => ({
  armIdleTimeout: (...a: unknown[]) => mockArmIdle(...a),
}));
const mockPreLogin = jest.fn(async () => ({ passwordResetActive: false }));
jest.mock('../../src/services/login-connect.service', () => ({
  runPreLoginConnect: (...a: unknown[]) => (mockPreLogin as (...x: unknown[]) => unknown)(...a),
}));
jest.mock('../../src/services/bbs-config-file.service', () => ({
  loadBBSConfig: () => ({}),
  getBoardConfig: () => ({}),
}));

import type { Server as IOServer, Socket } from 'socket.io';
import { acceptWebConnection } from '../../src/server/web-connection';
import { getSession, sessions } from '../../src/server/session-manager';
import { emitterForSession, socketIoSocketFor } from '../../src/server/session-emitter-registry';
import { isSessionLink } from '../../src/server/session-link';

function fakeRaw(id: string): Socket {
  const ee: any = new EventEmitter();
  ee.id = id; ee.connected = true; ee.sent = [];
  ee.rooms = new Set<string>();
  ee.handshake = { address: '127.0.0.1', headers: {}, auth: {} };
  ee.nsp = { sockets: new Map() };
  ee.join = (r: string) => ee.rooms.add(r); ee.leave = (r: string) => ee.rooms.delete(r);
  ee.onAny = jest.fn(); ee.offAny = jest.fn(); ee.onAnyOutgoing = jest.fn(); ee.offAnyOutgoing = jest.fn();
  ee.disconnect = jest.fn();
  ee.emit = (e: string, ...a: unknown[]) => { ee.sent.push([e, a]); return true; };
  return ee as Socket;
}

const deps = {
  nodeManager: { assignSessionToNode: jest.fn(async () => ({ nodeId: 3 })) },
  chatState: { sessions: [], messages: [] } as never,
};
const fakeIo = { sockets: { sockets: new Map() } } as unknown as IOServer;

beforeEach(() => { mockArmIdle.mockClear(); mockRegisterSocketHandlers.mockClear(); });
afterEach(() => { sessions.clear(); });

describe('acceptWebConnection', () => {
  it('a web caller gets a session whose emitter is a link over his socket', async () => {
    const raw = fakeRaw('A');
    await acceptWebConnection(fakeIo, raw, deps);
    const session = getSession('A')!;
    expect(isSessionLink(session.webLink)).toBe(true);
    expect(session.webLink!.raw).toBe(raw);
    expect(emitterForSession(session)).toBe(session.webLink);
    // the registry hands a room operation the live raw socket, never a parked one
    expect(socketIoSocketFor(session)).toBe(raw);
  });

  it('hands the link, not the raw socket, to the idle timer and the socket handlers', async () => {
    const raw = fakeRaw('B');
    await acceptWebConnection(fakeIo, raw, deps);
    const session = getSession('B')!;
    expect(mockArmIdle).toHaveBeenCalledTimes(1);
    expect(mockArmIdle.mock.calls[0][0]).toBe(session.webLink);
    expect(mockRegisterSocketHandlers.mock.calls[0][1]).toBe(session.webLink);
    expect(session.remoteAddress).toBe('127.0.0.1');
  });
});

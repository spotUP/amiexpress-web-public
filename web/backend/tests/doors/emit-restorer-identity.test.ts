/**
 * Oracle-at-the-choke, Task OC-6 (open question Q3): a restorer puts back the
 * emit it FOUND.
 *
 * Three sites wrapped `socket.emit` for the duration of a call and then
 * "restored" a BOUND COPY of it:
 *
 *   const originalEmit = this.socket.emit.bind(this.socket);
 *   this.socket.emit = (...) => { ... };
 *   await handler(...);
 *   this.socket.emit = originalEmit;      // NOT what was there
 *
 * Three defects follow from that one line, and each has a test below.
 *
 *  1. The bound copy is an OWN property that is not `===` to what was found.
 *     On a socket.io Socket, `emit` is a PROTOTYPE method, so every one of
 *     these calls pins a permanent own property onto the instance - the exact
 *     mutation `c64-door-adapter.ts:333-344` was written to avoid.
 *  2. The restore sat inside the `try` whose `catch` swallows, so a handler
 *     that throws leaked the interceptor for the rest of the connection.
 *  3. The restore was unconditional, so a wrapper installed DURING the call
 *     (a C64 door adapter, a modem emulator, the PETSCII model choke) was
 *     silently torn off and its layer lost.
 *
 * The survivor pattern is the adapter's (`c64-door-adapter.ts:272` captures
 * the VALUE found, `:337` refuses to restore over a later wrapper, `:339`
 * restores or `delete`s): restore-what-was-found, own-property aware, in a
 * `finally`, and only while ours is still the live one.
 */
process.env.SKIP_DB_INIT = '1';

// `door.handler.ts:23` imports BBSState from `src/index`, and importing that
// module for real boots the whole server in-process and leaves its heartbeat
// timer running, so the suite never exits under CI's plain
// `npx jest ... --ci` (no `--forceExit`). The repo's existing answer is to
// mock the module - the identical mock `tests/doors/door-min-columns-gate.test.ts:13-16`
// uses for the same import chain, and 17 other suites use elsewhere. BBSState
// is the ONLY value this file's chain takes from it; every other reference
// (`BBSApi.ts:21`, `group-chat.handler.ts:22`, `door.handler.ts:43`) is a
// type-only import and is erased.
jest.mock('../../src/index', () => ({
  BBSState: { LOGGEDON: 'loggedon', AWAIT: 'await' },
  LoggedOnSubState: {},
}));

import { createBBSApi } from '../../src/doors/BBSApi';
import { createDoorSocketWrapper } from '../../src/handlers/door.handler';
import { buildConnectionEmitter } from '../../src/server/connection-emitter';

// Only the two handlers under test are stubbed. The rest of the module has to
// stay real: `src/index.ts` wires `setGroupChatDependencies` at import time,
// and a bare factory would blank it and break the whole suite's boot.
jest.mock('../../src/handlers/chat/group-chat.handler', () => ({
  ...jest.requireActual('../../src/handlers/chat/group-chat.handler'),
  handleRoomJoin: jest.fn(async () => undefined),
  handleRoomCreate: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const groupChat = require('../../src/handlers/chat/group-chat.handler');

/**
 * The shape `tests/petscii-frame/c64-door-adapter.test.ts:253-273` uses: a
 * real socket.io Socket carries `emit` on its PROTOTYPE, never as an own
 * property of the instance.
 */
class ProtoEmitSocket {
  readonly out: Array<[string, any]> = [];
  readonly id = 'proto-emit-1';
  emit(event: string, ...args: any[]): boolean {
    this.out.push([event, args[0]]);
    return true;
  }
  on(): this { return this; }
  off(): this { return this; }
  removeListener(): this { return this; }
  removeAllListeners(): this { return this; }
}

const session = (): any => ({ nodeNumber: 1, user: { id: 1, username: 'tester' } });

function apiOn(socket: any) {
  return createBBSApi(socket as any, session());
}

beforeEach(() => {
  jest.clearAllMocks();
  groupChat.handleRoomJoin.mockImplementation(async () => undefined);
  groupChat.handleRoomCreate.mockImplementation(async () => undefined);
});

describe('BBSApi.joinRoom', () => {
  it('leaves the socket emit exactly as it found it', async () => {
    const socket: any = new ProtoEmitSocket();
    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);

    await apiOn(socket).joinRoom('lobby');

    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);
    expect(socket.emit).toBe(ProtoEmitSocket.prototype.emit);
  });

  it('restores the socket emit after the handler throws', async () => {
    const socket: any = new ProtoEmitSocket();
    groupChat.handleRoomJoin.mockImplementation(async () => {
      throw new Error('room is full');
    });

    const result = await apiOn(socket).joinRoom('lobby');

    expect(result.success).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);
    expect(socket.emit).toBe(ProtoEmitSocket.prototype.emit);
  });
});

describe('BBSApi.createRoom', () => {
  it('leaves the socket emit exactly as it found it', async () => {
    const socket: any = new ProtoEmitSocket();
    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);

    await apiOn(socket).createRoom('lobby');

    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);
    expect(socket.emit).toBe(ProtoEmitSocket.prototype.emit);
  });

  it('restores the socket emit after the handler throws', async () => {
    const socket: any = new ProtoEmitSocket();
    groupChat.handleRoomCreate.mockImplementation(async () => {
      throw new Error('name taken');
    });

    const result = await apiOn(socket).createRoom('lobby');

    expect(result.success).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(socket, 'emit')).toBe(false);
    expect(socket.emit).toBe(ProtoEmitSocket.prototype.emit);
  });
});

describe('a door wrapper on a telnet emitter', () => {
  it('restores the emitter own emit, not a bound copy of it', () => {
    const connection: any = {
      write: () => undefined,
      session: { terminalType: 'modern', petsciiMode: false },
      sessionId: 'oc6-telnet',
      on() {}, off() {}, close() {},
    };
    // `buildConnectionEmitter` has no `onAnyOutgoing`, so the wrapper takes
    // the `socket.emit = ...` branch and `cleanupOutgoing` is the restorer.
    const emitter = buildConnectionEmitter(connection);
    expect(typeof emitter.onAnyOutgoing).toBe('undefined');
    const emitterOwnEmit = emitter.emit;
    expect(Object.prototype.hasOwnProperty.call(emitter, 'emit')).toBe(true);

    const wrapped = createDoorSocketWrapper(emitter, connection.session, {});
    expect(emitter.emit).not.toBe(emitterOwnEmit);

    wrapped._doorCleanup();

    expect(emitter.emit).toBe(emitterOwnEmit);
  });
});

describe('a wrapper installed during the call', () => {
  it('survives the restore at all three sites', async () => {
    // 1. joinRoom
    const joinSocket: any = new ProtoEmitSocket();
    const joinMarker = jest.fn(() => true);
    groupChat.handleRoomJoin.mockImplementation(async (s: any) => {
      s.emit = joinMarker;
    });
    await apiOn(joinSocket).joinRoom('lobby');
    expect(joinSocket.emit).toBe(joinMarker);

    // 2. createRoom
    const createSocket: any = new ProtoEmitSocket();
    const createMarker = jest.fn(() => true);
    groupChat.handleRoomCreate.mockImplementation(async (s: any) => {
      s.emit = createMarker;
    });
    await apiOn(createSocket).createRoom('lobby');
    expect(createSocket.emit).toBe(createMarker);

    // 3. the telnet door wrapper: a layer installed while the door runs
    const connection: any = {
      write: () => undefined,
      session: { terminalType: 'modern', petsciiMode: false },
      sessionId: 'oc6-telnet-layered',
      on() {}, off() {}, close() {},
    };
    const emitter = buildConnectionEmitter(connection);
    const wrapped = createDoorSocketWrapper(emitter, connection.session, {});
    const doorMarker = jest.fn(() => true);
    emitter.emit = doorMarker;

    wrapped._doorCleanup();

    expect(emitter.emit).toBe(doorMarker);
  });
});

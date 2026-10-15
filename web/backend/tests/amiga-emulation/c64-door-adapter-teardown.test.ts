/**
 * A disconnect or `door:terminate` never returns through executeAmigaDoor's
 * `finally`, so AmigaDoorSession.removeSocketHandlers() is the LAST place that
 * can restore the socket's emit. Left patched, the menu, the logoff screen and
 * the next door would all go through a reconstructor with no owner.
 *
 * This drives the REAL removeSocketHandlers, not a mock of it. The method
 * touches only `this.socket` and the four handler fields, so it is called
 * against a hand-built `this` - the same technique
 * tests/amiga-emulation/door-modem-throttle.test.ts uses for
 * suspend/restoreModemThrottle, and for the same reason: no emulator, no ROM,
 * no live socket, but the shipped code runs.
 */
import {
  c64AdapterFor,
  installC64DoorAdapter,
} from '../../src/server/c64-door-adapter';

const { AmigaDoorSession } = require('../../src/amiga-emulation/AmigaDoorSession');

/** Socket with a REAL listener registry, so off() has something to remove. */
function makeSocket(session: any) {
  const out: Array<[string, any]> = [];
  const handlers = new Map<string, Set<(...a: any[]) => void>>();
  const socket: any = {
    id: 'teardown-1',
    session,
    out,
    emit: (ev: string, d?: any) => {
      out.push([ev, d]);
      return true;
    },
    on(ev: string, h: (...a: any[]) => void) {
      if (!handlers.has(ev)) handlers.set(ev, new Set());
      handlers.get(ev)!.add(h);
      return this;
    },
    off(ev: string, h: (...a: any[]) => void) {
      handlers.get(ev)?.delete(h);
      return this;
    },
    fire(ev: string, ...a: any[]) {
      for (const h of handlers.get(ev) ?? []) h(...a);
    },
    listenerCount: (ev: string) => handlers.get(ev)?.size ?? 0,
  };
  return socket;
}

/** The subset of `this` removeSocketHandlers reads. */
function teardownContext(socket: any) {
  const noop = () => undefined;
  socket.on('door:input', noop);
  socket.on('keys:state', noop);
  socket.on('disconnect', noop);
  socket.on('door:terminate', noop);
  return {
    socket,
    onDoorInput: noop,
    onKeysState: noop,
    onSocketDisconnect: noop,
    onDoorTerminate: noop,
  } as any;
}

const c64 = () => ({ petsciiMode: true, screenWidth: 40 });

beforeEach(() => jest.useFakeTimers());
afterEach(() => jest.useRealTimers());

describe('AmigaDoorSession.removeSocketHandlers uninstalls the C64 door adapter', () => {
  it('a disconnect teardown restores the emit, drops the adapter and clears every timer', () => {
    const socket = makeSocket(c64());
    const originalEmit = socket.emit;
    const ctx = teardownContext(socket);

    installC64DoorAdapter(socket, socket.session);
    socket.emit('ansi-output', 'MID-DOOR OUTPUT');       // a frame is pending, timers armed
    expect(c64AdapterFor(socket)).not.toBeNull();
    expect(socket.emit).not.toBe(originalEmit);
    expect(jest.getTimerCount()).toBeGreaterThan(0);

    // The real teardown, exactly as the disconnect / door:terminate paths reach it.
    AmigaDoorSession.prototype['removeSocketHandlers'].call(ctx);

    expect(c64AdapterFor(socket)).toBeNull();
    expect(socket.emit).toBe(originalEmit);
    expect(jest.getTimerCount()).toBe(0);
    // The door's own listeners went too - this is still the method's day job.
    expect(socket.listenerCount('door:input')).toBe(0);
    expect(socket.listenerCount('disconnect')).toBe(0);
  });

  // SILENT. This path is reached because the caller went away or the door was
  // killed: a frame still pending belongs to a door that has already ended,
  // and painting it drops a stale door screen on top of the menu the caller
  // sees next - or writes to a socket nobody is reading.
  it('emits NOTHING on the way out: the pending frame is dropped, not painted', () => {
    const socket = makeSocket(c64());
    const ctx = teardownContext(socket);

    installC64DoorAdapter(socket, socket.session);
    socket.emit('ansi-output', '\x1b[2J\x1b[HHALF A DOOR SCREEN');
    socket.out.length = 0;                                // only what teardown emits

    AmigaDoorSession.prototype['removeSocketHandlers'].call(ctx);

    expect(socket.out.filter(([ev]: [string, any]) => ev === 'ansi-output')).toEqual([]);
    expect(c64AdapterFor(socket)).toBeNull();
  });

  // The same live-getter hazard the adapter suite covers, at the teardown that
  // actually runs on a disconnect.
  it('still tears down when the connection was handed a new session mid-door', () => {
    const socket = makeSocket(c64());
    const originalEmit = socket.emit;
    const ctx = teardownContext(socket);

    installC64DoorAdapter(socket, socket.session);
    socket.session = c64();                               // re-login / node reassignment

    AmigaDoorSession.prototype['removeSocketHandlers'].call(ctx);

    expect(c64AdapterFor(socket)).toBeNull();
    expect(socket.emit).toBe(originalEmit);
    expect(jest.getTimerCount()).toBe(0);
  });

  it('is a no-op for an 80-column session, which never had an adapter', () => {
    const socket = makeSocket({ petsciiMode: false, screenWidth: 80 });
    const originalEmit = socket.emit;
    const ctx = teardownContext(socket);

    expect(installC64DoorAdapter(socket, socket.session)).toBeNull();
    AmigaDoorSession.prototype['removeSocketHandlers'].call(ctx);

    expect(socket.emit).toBe(originalEmit);
    expect(c64AdapterFor(socket)).toBeNull();
  });

  it('tolerates being called twice', () => {
    const socket = makeSocket(c64());
    const originalEmit = socket.emit;
    const ctx = teardownContext(socket);
    installC64DoorAdapter(socket, socket.session);

    AmigaDoorSession.prototype['removeSocketHandlers'].call(ctx);
    expect(() => AmigaDoorSession.prototype['removeSocketHandlers'].call(ctx)).not.toThrow();
    expect(socket.emit).toBe(originalEmit);
    expect(jest.getTimerCount()).toBe(0);
  });
});

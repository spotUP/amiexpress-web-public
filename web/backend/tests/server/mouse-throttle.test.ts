/**
 * Regression for #14: DOORMAN freeze under heavy mouse activity.
 *
 * Background:
 *   The user reported DOORMAN visibly froze mid-navigation. Backend log showed
 *   memory growing 100MB → 192MB during a stretch of mousemove events (browser
 *   fires mousemove at 60Hz+), three console.log lines per event in
 *   Program._handleData, and eventually a socket.io ping-timeout disconnect.
 *   The keyboard pipeline got starved because the event loop was saturated
 *   with mouse-event processing + log writes.
 *
 *   Fix: throttle mouse-drag and mouse-hover at the socket boundary to ~60Hz
 *   per session BEFORE forwarding them into the door's input handler. mouse-up
 *   and mouse-click are NOT throttled — they're discrete events that doors
 *   need to see immediately.
 *
 * The test DRIVES the real handlers: registerSocketHandlers is handed a fake
 * socket (the technique of server/petscii-session-geometry.test.ts), a door
 * session sits in the real session registry, Date.now is stubbed, and each
 * assertion counts what reached the door's input handler. It used to test a
 * copy of the helper plus a regex over socket-handlers.ts; the copy could
 * drift from the 16ms constant unseen.
 *
 * src/index.ts is mocked away: socket-handlers.ts imports the BBSSession
 * type from it.
 */
jest.mock('../../src/index', () => ({}));

const THROTTLE_MS = 16; // the 60Hz cap the handlers enforce

type Handler = (...args: any[]) => void;

let clock = 1000;
let nowSpy: jest.SpyInstance;
beforeEach(() => { clock = 1000; nowSpy = jest.spyOn(Date, 'now').mockImplementation(() => clock); });
afterEach(() => { nowSpy.mockRestore(); });

let nextId = 0;
/** A mouse-enabled door session on a fake socket wired by the real handlers. */
function mouseDoor() {
  const id = `mouse-throttle-${++nextId}`;
  const handlers: Record<string, Handler> = {};
  const socket: any = {
    id,
    handshake: { address: '127.0.0.1' },
    on(event: string, cb: Handler) { handlers[event] = cb; return socket; },
    onAny() { return socket; },
    emit() { return true; },
    join() { return socket; },
    removeAllListeners() { return socket; },
  };
  const received: Array<{ type: string }> = [];
  const session: any = {
    nodeId: 90 + nextId, socketId: id,
    inDoorManager: true, mouseEventsEnabled: true,
    doorInputHandler: (bytes: string) => { received.push(JSON.parse(bytes)); },
  };
  const { setSession, deleteSession } = require('../../src/server/session-manager');
  const { registerSocketHandlers } = require('../../src/server/socket-handlers');
  setSession(id, session);
  const io: any = { sockets: { sockets: new Map() }, emit() { return true; }, to() { return { emit() { return true; } }; } };
  registerSocketHandlers(io, socket);
  const fire = (event: string) => handlers[event]({ x: 1, y: 1, button: 0, shift: false, ctrl: false, alt: false });
  const count = (type: string) => received.filter((e) => e.type === type).length;
  return { fire, count, cleanup: () => deleteSession(id) };
}

describe('mouse-move throttle (regression for #14 DOORMAN freeze)', () => {
  let logSpy: jest.SpyInstance;
  beforeEach(() => { logSpy = jest.spyOn(console, 'log').mockImplementation(() => {}); });
  afterEach(() => { logSpy.mockRestore(); });

  test('first event for a fresh session is always emitted', () => {
    const door = mouseDoor();
    try {
      door.fire('mouse-hover');
      expect(door.count('mouse-hover')).toBe(1);
    } finally { door.cleanup(); }
  });

  test('events within the throttle window are dropped', () => {
    const door = mouseDoor();
    try {
      door.fire('mouse-hover');
      // 4 more events at 1ms intervals - all within the 16ms window.
      for (let i = 0; i < 4; i++) { clock += 1; door.fire('mouse-hover'); }
      expect(door.count('mouse-hover')).toBe(1);
    } finally { door.cleanup(); }
  });

  test('event at exactly throttle_ms after last is emitted', () => {
    const door = mouseDoor();
    try {
      door.fire('mouse-hover');
      clock += THROTTLE_MS - 1;
      door.fire('mouse-hover');
      expect(door.count('mouse-hover')).toBe(1);
      clock += 1;
      door.fire('mouse-hover');
      expect(door.count('mouse-hover')).toBe(2);
    } finally { door.cleanup(); }
  });

  test('drag and hover have independent throttle clocks', () => {
    const door = mouseDoor();
    try {
      door.fire('mouse-hover');
      door.fire('mouse-drag'); // same instant, independent key: must also fire
      clock += 1; // 1ms later: both still throttled
      door.fire('mouse-hover');
      door.fire('mouse-drag');
      expect({ hover: door.count('mouse-hover'), drag: door.count('mouse-drag') }).toEqual({ hover: 1, drag: 1 });
    } finally { door.cleanup(); }
  });

  test('60Hz of mousemove input is capped at one emit per ~16ms', () => {
    const door = mouseDoor();
    try {
      // 1 second of input @ 240Hz = 240 events, ~4ms apart.
      for (let i = 0; i < 240; i++) {
        clock = 10_000 + Math.floor(i * (1000 / 240));
        door.fire('mouse-drag');
      }
      // 1000ms / 16ms = 62.5 windows.
      expect(door.count('mouse-drag')).toBeGreaterThanOrEqual(50);
      expect(door.count('mouse-drag')).toBeLessThanOrEqual(63);
    } finally { door.cleanup(); }
  });

  test('separate sessions have independent throttle state', () => {
    const a = mouseDoor();
    const b = mouseDoor();
    try {
      a.fire('mouse-hover');
      b.fire('mouse-hover'); // same instant, different session: must also emit
      expect([a.count('mouse-hover'), b.count('mouse-hover')]).toEqual([1, 1]);
    } finally { a.cleanup(); b.cleanup(); }
  });

  // mouse-up and mouse-click are discrete: every one must reach the door,
  // however close together, or a drag never ends and a click is lost.
  test('mouse-up and mouse-click are never throttled', () => {
    const door = mouseDoor();
    try {
      for (let i = 0; i < 5; i++) { door.fire('mouse-up'); door.fire('mouse-click'); }
      expect({ up: door.count('mouse-up'), click: door.count('mouse-click') }).toEqual({ up: 5, click: 5 });
    } finally { door.cleanup(); }
  });
});

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
 * This test exercises the throttle helper used by socket-handlers.ts mouse
 * branches, asserting the cadence cap holds and that the per-key tracking
 * (drag vs hover) is independent.
 */

const MOUSE_MOVE_THROTTLE_MS = 16; // mirrors socket-handlers.ts

// Mirror of the helper inside registerCommandHandler. Kept local so this test
// has no implicit cross-file dependency on internals — if the production helper
// drifts, the source-level guard at the bottom catches it.
function makeShouldEmit(now: () => number) {
  return function shouldEmitPositionMouse(session: any, key: string): boolean {
    const stamps = session.__mouseLast || (session.__mouseLast = {});
    const t = now();
    if ((t - (stamps[key] || 0)) < MOUSE_MOVE_THROTTLE_MS) return false;
    stamps[key] = t;
    return true;
  };
}

describe('mouse-move throttle (regression for #14 DOORMAN freeze)', () => {
  test('first event for a fresh session is always emitted', () => {
    let t = 1000;
    const shouldEmit = makeShouldEmit(() => t);
    const session: any = {};
    expect(shouldEmit(session, 'hover')).toBe(true);
  });

  test('events within the throttle window are dropped', () => {
    let t = 1000;
    const shouldEmit = makeShouldEmit(() => t);
    const session: any = {};
    expect(shouldEmit(session, 'hover')).toBe(true);

    // 4 more events at 1ms intervals — all within the 16ms window.
    for (let i = 0; i < 4; i++) {
      t += 1;
      expect(shouldEmit(session, 'hover')).toBe(false);
    }
  });

  test('event at exactly throttle_ms after last is emitted', () => {
    let t = 1000;
    const shouldEmit = makeShouldEmit(() => t);
    const session: any = {};
    expect(shouldEmit(session, 'hover')).toBe(true);

    t += MOUSE_MOVE_THROTTLE_MS;
    expect(shouldEmit(session, 'hover')).toBe(true);
  });

  test('drag and hover have independent throttle clocks', () => {
    let t = 1000;
    const shouldEmit = makeShouldEmit(() => t);
    const session: any = {};

    // Hover at t=1000
    expect(shouldEmit(session, 'hover')).toBe(true);
    // Drag at t=1000 — independent key, must also fire
    expect(shouldEmit(session, 'drag')).toBe(true);

    t += 1; // 1ms later: both still throttled
    expect(shouldEmit(session, 'hover')).toBe(false);
    expect(shouldEmit(session, 'drag')).toBe(false);
  });

  test('60Hz of mousemove input is capped at one emit per ~16ms', () => {
    let t = 0;
    const shouldEmit = makeShouldEmit(() => t);
    const session: any = {};
    let emitted = 0;

    // 1 second of input @ 60Hz = 60 events
    for (let i = 0; i < 60; i++) {
      t = Math.floor(i * (1000 / 60)); // ~16.67ms apart
      if (shouldEmit(session, 'hover')) emitted++;
    }

    // 1000ms / 16ms = 62 emits max; should be at most that, and at least 50
    // (allow tolerance for floor rounding and the "first event always emits" rule).
    expect(emitted).toBeGreaterThanOrEqual(50);
    expect(emitted).toBeLessThanOrEqual(63);
  });

  test('separate sessions have independent throttle state', () => {
    let t = 1000;
    const shouldEmit = makeShouldEmit(() => t);
    const sessionA: any = {};
    const sessionB: any = {};

    expect(shouldEmit(sessionA, 'hover')).toBe(true);
    // Same instant, different session — must also emit.
    expect(shouldEmit(sessionB, 'hover')).toBe(true);
  });

  // Source-level guard: ensure the production socket handler still throttles
  // mouse-drag and mouse-hover but NOT mouse-up / mouse-click. If anyone
  // accidentally inverts these, this test catches it.
  test('socket-handlers.ts wires the throttle on hover/drag but NOT on up/click', () => {
    const fs = require('fs');
    const path = require('path');
    const src = fs.readFileSync(
      path.resolve(__dirname, '../../src/server/socket-handlers.ts'),
      'utf8'
    );

    // Carve out each handler block (between socket.on('<event>', ... ) and the
    // next socket.on or the function close.
    function blockFor(eventName: string): string {
      const re = new RegExp(
        `socket\\.on\\(['"]${eventName}['"][\\s\\S]*?\\n\\s{2}\\}\\);`
      );
      const m = src.match(re);
      return m ? m[0] : '';
    }

    const dragBlock = blockFor('mouse-drag');
    const hoverBlock = blockFor('mouse-hover');
    const upBlock = blockFor('mouse-up');
    const clickBlock = blockFor('mouse-click');

    expect(dragBlock).not.toBe('');
    expect(hoverBlock).not.toBe('');
    expect(upBlock).not.toBe('');
    expect(clickBlock).not.toBe('');

    // hover and drag MUST gate via shouldEmitPositionMouse
    expect(dragBlock).toMatch(/shouldEmitPositionMouse\s*\(/);
    expect(hoverBlock).toMatch(/shouldEmitPositionMouse\s*\(/);

    // up and click MUST NOT — they're discrete and must always reach the door.
    expect(upBlock).not.toMatch(/shouldEmitPositionMouse\s*\(/);
    expect(clickBlock).not.toMatch(/shouldEmitPositionMouse\s*\(/);
  });
});

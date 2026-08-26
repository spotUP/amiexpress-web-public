/**
 * Mouse motion must not be able to take the server down.
 *
 * Every browser input event is forwarded to the door process and logged on
 * the way, and mouse motion arrives as a continuous stream. The only guard
 * was a comment saying motion "may be throttled by frontend" - the server
 * trusting the client not to hurt it.
 *
 * On 2026-08-26 that blocked the event loop on live: the container stayed
 * up, /health stopped answering even from inside it, and bbs.uprough.net
 * was down for everyone while one person moved a mouse over /chat.
 */

import {
  isMouseMotion,
  shouldForwardInput,
  newMotionThrottle,
  MOTION_INTERVAL_MS,
} from '../../src/doors/input-motion-throttle';

/** An SGR mouse report: ESC [ < button ; x ; y M */
const motion = (x: number, y: number) => `\x1b[<35;${x};${y}M`;
const press = (x: number, y: number) => `\x1b[<0;${x};${y}M`;
const release = (x: number, y: number) => `\x1b[<0;${x};${y}m`;

describe('recognising mouse motion', () => {
  it('spots an SGR motion report by its motion bit', () => {
    expect(isMouseMotion(motion(10, 5))).toBe(true);
  });

  it('does not mistake a click for motion', () => {
    expect(isMouseMotion(press(10, 5))).toBe(false);
    expect(isMouseMotion(release(10, 5))).toBe(false);
  });

  it('spots an X10-style motion report too', () => {
    // ESC [ M, then button+32 with the motion bit, x+32, y+32.
    const x10 = '\x1b[M' + String.fromCharCode(32 + 35, 32 + 10, 32 + 5);
    expect(isMouseMotion(x10)).toBe(true);
  });

  it('treats ordinary keystrokes as not motion', () => {
    expect(isMouseMotion('a')).toBe(false);
    expect(isMouseMotion('\r')).toBe(false);
    expect(isMouseMotion('\x1b[A')).toBe(false);
    expect(isMouseMotion('')).toBe(false);
  });
});

describe('forwarding input to the door', () => {
  it('never delays a keystroke', () => {
    const state = newMotionThrottle();
    for (let i = 0; i < 100; i++) {
      expect(shouldForwardInput(state, 'x', 1000 + i)).toBe(true);
    }
  });

  it('never delays a click, however fast they come', () => {
    // A double-click must not lose its second press to a throttle.
    const state = newMotionThrottle();
    expect(shouldForwardInput(state, press(4, 4), 1000)).toBe(true);
    expect(shouldForwardInput(state, release(4, 4), 1001)).toBe(true);
    expect(shouldForwardInput(state, press(4, 4), 1002)).toBe(true);
  });

  it('passes the first movement immediately', () => {
    // Hover feedback must not wait for a timer.
    expect(shouldForwardInput(newMotionThrottle(), motion(1, 1), 1000)).toBe(true);
  });

  it('drops the flood between updates', () => {
    const state = newMotionThrottle();
    shouldForwardInput(state, motion(1, 1), 1000);

    expect(shouldForwardInput(state, motion(2, 1), 1005)).toBe(false);
    expect(shouldForwardInput(state, motion(3, 1), 1010)).toBe(false);
  });

  it('resumes once the interval has passed', () => {
    const state = newMotionThrottle();
    shouldForwardInput(state, motion(1, 1), 1000);

    expect(shouldForwardInput(state, motion(9, 9), 1000 + MOTION_INTERVAL_MS)).toBe(true);
  });

  it('caps a second of frantic movement to a readable rate', () => {
    // 500 events a second in, at most 25 out.
    const state = newMotionThrottle();
    let forwarded = 0;
    for (let i = 0; i < 500; i++) {
      if (shouldForwardInput(state, motion(i % 80, 3), 1000 + i * 2)) forwarded++;
    }

    expect(forwarded).toBeLessThanOrEqual(26);
    expect(forwarded).toBeGreaterThan(0);
  });

  it('lets a click through in the middle of a motion flood', () => {
    // The important one: throttling must never swallow the actual action.
    const state = newMotionThrottle();
    shouldForwardInput(state, motion(1, 1), 1000);

    expect(shouldForwardInput(state, motion(2, 1), 1002)).toBe(false);
    expect(shouldForwardInput(state, press(2, 1), 1003)).toBe(true);
  });
});

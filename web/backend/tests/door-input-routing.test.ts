/**
 * Where a keystroke goes while a door is running.
 *
 * "key input are still not working via telnet in gmaster and probably all our
 * typescript doors" (sysop, 2026-09-02). Two fixes went in before this one -
 * the game-mode gate that dropped the character path for telnet, and the
 * hybrid client that registered a 'command' listener for callers with no
 * browser - and a third case was still live: a door with a PROMPT listener
 * still registered.
 *
 * On web, socket.io hands a 'command' to every listener, so DoorManager's
 * prompt and the door's own handler BOTH get it. On telnet there is one
 * dispatcher, and it returned as soon as it found a 'command' listener. The
 * door never saw a key. It drew perfectly and did nothing - the exact shape
 * the sysop reported.
 *
 * These drive the decision itself, which is now one function both transports
 * ask (services/door-input-routing.ts). A test on the transports separately
 * is what let them disagree in the first place.
 */

export {};

import { routeDoorInput, isPauseKey } from '../src/services/door-input-routing';

const running = {
  doorActive: true,
  hasDoorInputHandler: true,
  hasCommandListener: false,
  bbsPauseActive: false,
};

describe('a keystroke while a door runs', () => {
  it('reaches the door', () => {
    const route = routeDoorInput('x', running);
    expect(route.toDoorHandler).toBe(true);
    expect(route.toBbs).toBe(false);
  });

  it('reaches the door AND a waiting prompt, not one or the other', () => {
    // The bug: telnet delivered to the prompt and returned, so a door with a
    // prompt listener left over took no input at all.
    const route = routeDoorInput('x', { ...running, hasCommandListener: true });
    expect(route.toCommandListeners).toBe(true);
    expect(route.toDoorHandler).toBe(true);
  });

  it('goes to a prompt alone when the door has no handler yet', () => {
    const route = routeDoorInput('x', {
      ...running, hasDoorInputHandler: false, hasCommandListener: true,
    });
    expect(route.toCommandListeners).toBe(true);
    expect(route.toDoorHandler).toBe(false);
    expect(route.toDoorInputEvent).toBe(false);
  });

  it('falls back to door:input when nothing is listening', () => {
    const route = routeDoorInput('x', {
      ...running, hasDoorInputHandler: false, hasCommandListener: false,
    });
    expect(route.toDoorInputEvent).toBe(true);
  });

  it('goes to the board when no door is running', () => {
    const route = routeDoorInput('x', { ...running, doorActive: false });
    expect(route.toBbs).toBe(true);
    expect(route.toDoorHandler).toBe(false);
  });
});

describe('a BBS pause underneath a door', () => {
  const paused = { ...running, bbsPauseActive: true };

  it('takes ENTER and SPACE, which is how it is dismissed', () => {
    // Telnet had no pause intercept at all: ENTER went to the door and the
    // pause stayed on screen, where a browser caller dismissed it.
    for (const key of ['\r', '\n', ' ']) {
      const route = routeDoorInput(key, paused);
      expect(route.toBbs).toBe(true);
      expect(route.toDoorHandler).toBe(false);
    }
  });

  it('leaves every other key to the door, which is still running', () => {
    for (const key of ['x', 'q', '\x1b[A']) {
      const route = routeDoorInput(key, paused);
      expect(route.toDoorHandler).toBe(true);
      expect(route.toBbs).toBe(false);
    }
  });

  it('knows its two keys', () => {
    expect(isPauseKey('\r')).toBe(true);
    expect(isPauseKey('\n')).toBe(true);
    expect(isPauseKey(' ')).toBe(true);
    expect(isPauseKey('x')).toBe(false);
    expect(isPauseKey('')).toBe(false);
  });
});

describe('an arrow key, which is what a game is played with', () => {
  it('reaches the door whole, prompt listener or not', () => {
    // A telnet arrow arrives as one three-byte string. Whatever else is
    // listening, the door has to get it.
    for (const hasCommandListener of [false, true]) {
      const route = routeDoorInput('\x1b[A', { ...running, hasCommandListener });
      expect(route.toDoorHandler).toBe(true);
    }
  });
});

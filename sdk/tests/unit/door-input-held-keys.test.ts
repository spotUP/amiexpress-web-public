/**
 * Held-key tracking in DoorInputManager.
 *
 * Reported live 2026-08-30: "all arcade games except arkanoid and gmaster
 * have key repeat/delay problems".
 *
 * Cause: blessed delivers characters, not key presses and releases, so a
 * held key arrives as the client's auto-repeat - one character, a
 * ~400-500ms gap, then a fast stream. A door that moves on each character
 * inherits that stutter. The two doors that feel right both avoid the
 * character stream: GrandMaster takes real edges from bbs.onKeyDown/onKeyUp
 * (its own comment records that its previous simulated-hold timeout expired
 * before the first auto-repeat even arrived), and Arkanoid keeps a held-key
 * set and moves once per frame while the key is down.
 *
 * These tests cover the shared mechanism that gives every door that model.
 */

import { DoorInputManager } from '../../utils/door-input-manager';

/**
 * Minimal stand-in for the session object. Captures the key handlers the
 * manager registers so a test can fire press/release edges by hand.
 */
function createSession() {
  let downHandler: ((key: string) => void) | null = null;
  let upHandler: ((key: string) => void) | null = null;

  return {
    bbs: {
      enableGameMode: () => {},
      disableGameMode: () => {},
      onKeyDown: (cb: (key: string) => void) => { downHandler = cb; },
      onKeyUp: (cb: (key: string) => void) => { upHandler = cb; },
    },
    // No bbsSession: skips the blessed input-handler bridge, which needs a
    // real screen and is not what these tests are about.
    press: (key: string) => downHandler?.(key),
    release: (key: string) => upHandler?.(key),
  };
}

function createManager(session: any) {
  const manager = new DoorInputManager(session, undefined as any, {
    trackHeldKeys: true,
    enableMouse: false,
    enableAutoSuspend: false,
  });
  manager.enable();
  return manager;
}

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

describe('DoorInputManager held-key tracking', () => {
  it('tracks a key as held between its press and release', () => {
    const session = createSession();
    const manager = createManager(session);

    expect(manager.isKeyStateActive()).toBe(true);
    expect(manager.isHeld('left')).toBe(false);

    session.press('ArrowLeft');
    expect(manager.isHeld('left')).toBe(true);
    expect(manager.heldKeys()).toEqual(['left']);

    session.release('ArrowLeft');
    expect(manager.isHeld('left')).toBe(false);
    expect(manager.heldKeys()).toEqual([]);
  });

  it('maps browser key names to the short names doors use', () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowUp');
    session.press(' ');
    session.press('Escape');

    expect(manager.isHeld('up')).toBe(true);
    expect(manager.isHeld('space')).toBe(true);
    expect(manager.isHeld('escape')).toBe(true);
  });

  it('steps immediately on the press, which is what removes the initial delay', () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowLeft');
    // The very first ask after the press must move - this is the difference
    // between this and waiting on the client's ~400ms auto-repeat gap.
    expect(manager.consumeRepeat('left', { repeatRate: 50 })).toBe(true);
    // ...and must not move again until the rate has elapsed.
    expect(manager.consumeRepeat('left', { repeatRate: 50 })).toBe(false);
  });

  it('repeats once the rate has elapsed, for as long as the key is held', async () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowRight');
    expect(manager.consumeRepeat('right', { repeatRate: 20 })).toBe(true);

    await sleep(35);
    expect(manager.consumeRepeat('right', { repeatRate: 20 })).toBe(true);

    session.release('ArrowRight');
    await sleep(35);
    expect(manager.consumeRepeat('right', { repeatRate: 20 })).toBe(false);
  });

  it('honours an initial delay when a door asks for one', async () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowLeft');
    // First step is always immediate, even with a delay configured.
    expect(manager.consumeRepeat('left', { initialDelay: 80, repeatRate: 10 })).toBe(true);

    // Inside the delay window the key must not repeat, however often asked.
    await sleep(30);
    expect(manager.consumeRepeat('left', { initialDelay: 80, repeatRate: 10 })).toBe(false);

    // Past it, repeats resume.
    await sleep(70);
    expect(manager.consumeRepeat('left', { initialDelay: 80, repeatRate: 10 })).toBe(true);
  });

  it('ignores auto-repeat key-downs for a key already held', async () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowLeft');
    expect(manager.consumeRepeat('left', { initialDelay: 60, repeatRate: 10 })).toBe(true);

    await sleep(40);
    // The client re-sends key-down as it auto-repeats. If that reset the
    // press time, the initial delay would restart forever and the key would
    // never reach its repeat phase.
    session.press('ArrowLeft');
    session.press('ArrowLeft');

    await sleep(40);
    expect(manager.consumeRepeat('left', { initialDelay: 60, repeatRate: 10 })).toBe(true);
  });

  it('reports no key state when the session cannot deliver key events', () => {
    // A telnet or SSH session: no onKeyDown/onKeyUp. Doors must fall back to
    // their character handler rather than silently losing all movement.
    const session: any = { bbs: { enableGameMode: () => {}, disableGameMode: () => {} } };
    const manager = new DoorInputManager(session, undefined as any, {
      trackHeldKeys: true,
      enableMouse: false,
      enableAutoSuspend: false,
    });
    manager.enable();

    expect(manager.isKeyStateActive()).toBe(false);
    expect(manager.isHeld('left')).toBe(false);
    expect(manager.consumeRepeat('left')).toBe(false);
  });

  it('forgets held keys on suspend, so nothing looks stuck down afterwards', () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowLeft');
    expect(manager.isHeld('left')).toBe(true);

    // While suspended no key-up can arrive, so the state must not persist.
    manager.suspend();
    expect(manager.isKeyStateActive()).toBe(false);
    expect(manager.isHeld('left')).toBe(false);

    manager.resume();
    expect(manager.isHeld('left')).toBe(false);
  });

  it('forgets held keys on disable', () => {
    const session = createSession();
    const manager = createManager(session);

    session.press('ArrowLeft');
    manager.disable();

    expect(manager.isKeyStateActive()).toBe(false);
    expect(manager.isHeld('left')).toBe(false);
  });

  it('stays inert for doors that do not opt in', () => {
    const session = createSession();
    const manager = new DoorInputManager(session, undefined as any, {
      enableMouse: false,
      enableAutoSuspend: false,
    });
    manager.enable();

    session.press('ArrowLeft');
    expect(manager.isKeyStateActive()).toBe(false);
    expect(manager.isHeld('left')).toBe(false);
  });
});

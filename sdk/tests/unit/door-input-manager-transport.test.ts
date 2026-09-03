/**
 * Held-key tracking follows the TRANSPORT, not the host object's shape.
 *
 * Symptom, reported for every arcade door on telnet: "the game draws but the
 * player never moves". The doors ask `isKeyStateActive()` and take a held-key
 * path when it is true, falling back to their character handler when it is
 * false. On a byte transport there is no key-up - telnet and SSH deliver a
 * character stream - so the held set can never fill and the player stands
 * still.
 *
 * The guard that decided this was a method-existence check
 * (`!bbs?.onKeyDown || !bbs?.onKeyUp`), and the BBS host defines both methods
 * unconditionally (`web/backend/src/doors/BBSApi.ts:591,604`), so it could
 * never be false for a real caller. The doc comment on
 * `setupHeldKeyTracking` always said the opposite - "silently does nothing
 * when the transport has no key events" - so the comment was the contract and
 * the code was the bug (task TP-7 of
 * `thoughts/shared/plans/2026-09-03-ssh-telnet-parity.md`).
 *
 * The guard now asks the host a capability question, `bbs.deliversKeyEvents`,
 * and is DEFAULT-CLOSED: a host that does not answer reports no edges. That is
 * the "tooltype booleans cannot default to true" rule applied to a capability -
 * a door that wrongly takes the character path is playable, a door that wrongly
 * waits for edges is frozen.
 */

import { DoorInputManager } from '../../utils/door-input-manager';

interface KeyHost {
  enableGameMode(): void;
  disableGameMode(): void;
  onKeyDown?(cb: (key: string) => void): void;
  onKeyUp?(cb: (key: string) => void): void;
  deliversKeyEvents?: boolean;
}

interface Harness {
  session: { bbs: KeyHost };
  press(key: string): void;
  release(key: string): void;
  /** How many times the host was asked to register an edge handler. */
  registrations(): number;
}

/**
 * A host in the shape `BBSApi` presents: `onKeyDown` / `onKeyUp` ALWAYS
 * defined, exactly as the real one defines them, so the only thing that can
 * distinguish a telnet caller from a web caller is the capability.
 */
function createHost(deliversKeyEvents: boolean | undefined): Harness {
  let downHandler: ((key: string) => void) | null = null;
  let upHandler: ((key: string) => void) | null = null;
  let registered = 0;

  const bbs: KeyHost = {
    enableGameMode: () => undefined,
    disableGameMode: () => undefined,
    onKeyDown: (cb: (key: string) => void) => { registered++; downHandler = cb; },
    onKeyUp: (cb: (key: string) => void) => { registered++; upHandler = cb; },
  };
  if (deliversKeyEvents !== undefined) bbs.deliversKeyEvents = deliversKeyEvents;

  return {
    session: { bbs },
    press: (key: string) => downHandler?.(key),
    release: (key: string) => upHandler?.(key),
    registrations: () => registered,
  };
}

function createManager(harness: Harness): DoorInputManager {
  const manager = new DoorInputManager(harness.session, undefined as never, {
    trackHeldKeys: true,
    enableMouse: false,
    enableAutoSuspend: false,
  });
  manager.enable();
  return manager;
}

describe('DoorInputManager key edges follow the transport', () => {
  it('reports no key edges on a telnet caller, whose host still defines onKeyDown and onKeyUp', () => {
    const harness = createHost(false);
    const manager = createManager(harness);

    expect(manager.isKeyStateActive()).toBe(false);
    expect(manager.isHeld('left')).toBe(false);
    expect(manager.consumeRepeat('left')).toBe(false);
    // Nothing was registered either: a handler on a transport that sends no
    // edges is a listener that can never fire.
    expect(harness.registrations()).toBe(0);
  });

  it('still tracks held keys on a web caller', () => {
    const harness = createHost(true);
    const manager = createManager(harness);

    expect(manager.isKeyStateActive()).toBe(true);
    expect(harness.registrations()).toBe(2);

    harness.press('ArrowLeft');
    expect(manager.isHeld('left')).toBe(true);
    expect(manager.consumeRepeat('left', { repeatRate: 50 })).toBe(true);

    harness.release('ArrowLeft');
    expect(manager.isHeld('left')).toBe(false);
  });

  it('is default-closed for a host that does not answer the capability question', () => {
    const harness = createHost(undefined);
    const manager = createManager(harness);

    expect(manager.isKeyStateActive()).toBe(false);
    expect(harness.registrations()).toBe(0);
  });
});

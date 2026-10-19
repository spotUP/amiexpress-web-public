/**
 * The board's answer to the SDK effect gate for TypeScript doors.
 *
 * TypeScript doors run inside the backend process, so a module-level flag
 * would leak one caller's animations-off choice into another caller's door.
 * The answer is per async context instead: the session of the door being run
 * lives in an AsyncLocalStorage, and the SDK's effectsAllowed() reads it
 * through a function installed on globalThis under a Symbol.for key (a door
 * may load its own copy of the SDK module, so a module variable would not be
 * seen by it).
 *
 * The store holds the session rather than a boolean, so a W row 23 toggle or
 * a nested game door is read live.
 */
import { AsyncLocalStorage, AsyncResource } from 'node:async_hooks';
import type { BBSSession } from '../index';
import { animationsAllowed } from '../services/user-settings/animations';

const BOARD_EFFECTS = Symbol.for('amiexpress.boardEffectsAllowed');

const store = new AsyncLocalStorage<BBSSession>();

/** The hook the SDK gate calls. Outside any door the board does not object. */
export function boardEffectsAllowed(): boolean {
  const session = store.getStore();
  return session ? animationsAllowed(session) : true;
}

(globalThis as unknown as Record<symbol, unknown>)[BOARD_EFFECTS] = boardEffectsAllowed;

/** Run a door entry point with the caller's session as the effect context. */
export function runInDoorContext<T>(session: BBSSession, fn: () => T): T {
  return store.run(session, fn);
}

/**
 * Bind a callback to the context it was registered in. Socket events and
 * input fire in socket.io's context, not the door's, so a handler the door
 * registers must carry the door's context with it.
 */
export function bindToDoorContext<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  return AsyncResource.bind(fn);
}

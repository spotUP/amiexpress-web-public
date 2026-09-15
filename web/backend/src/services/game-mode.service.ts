/**
 * Game mode helpers — single source of truth for switching a session into and
 * out of raw keydown/keyup mode.
 *
 * Lives in its own file (not socket-handlers) so callers like BBSApi can use it
 * without dragging in the full socket dispatch / command handler graph. Both
 * type imports below are erased by the compiler so this module stays light.
 */
import type { Socket } from 'socket.io';
import type { BBSSession } from '../index';

/**
 * The synthetic key repeat the browser runs between key-down and key-up.
 *
 * Game mode is what makes the browser send those EDGES at all; this is how
 * fast it fills the gap while a key is HELD. The two rates live in
 * `packages/terminal`; this side only names the mode.
 *
 * GAME IS THE DEFAULT, and it is not a preference - it is what every door
 * that ever enabled game mode has had. A first cut defaulted to the menu rate
 * and flagged nine arcade icons; GRANDMASTER broke within the hour ("gmaster
 * has a delay now when i hold the button") and showed why a changed default
 * is the wrong instrument: that first cut emitted the mode only from
 * `executeClientDoor`, so GMASTER - which reaches game mode from inside
 * itself - was never sent one at all and simply ran at the browser's new
 * DEFAULT rate. Every door on the two other routes was in the same position.
 *
 * (The commit that fixed it blamed grandmaster's DAS for riding the repeats.
 * It does not: `input/handler.ts` drops a key-down for a key already held,
 * and since 2026-09-15 reads the browser's own `repeat` flag as well. What
 * reached it was the default, not the mechanism.)
 *
 * A door whose screen is a LIST opts out with `KEY_REPEAT=application`.
 */
export type KeyRepeatMode = 'game' | 'application';

/**
 * Read a door's declared mode. Anything but `application` is the arcade rate.
 *
 * BOTH tooltype maps, for the reason `door-min-columns.util.ts` spells out at
 * length: a door registered from an installed record carries its tooltypes on
 * `doorInfo`, while the same door reached by command name has them on the Door
 * itself. Reading one of the two is how a tooltype comes out set in one route
 * and absent in the other.
 */
export function declaredKeyRepeatMode(door: unknown): KeyRepeatMode {
  const d = door as {
    toolTypes?: Record<string, string>;
    doorInfo?: { toolTypes?: Record<string, string> };
  } | null | undefined;
  const raw = d?.toolTypes?.['KEY_REPEAT'] ?? d?.doorInfo?.toolTypes?.['KEY_REPEAT'];
  return String(raw ?? '').trim().toLowerCase() === 'application' ? 'application' : 'game';
}

/**
 * Keys that STEER: a list scrolls, a cursor walks, a hand of twenty is read
 * left to right. These are the only ones worth repeating in a door whose
 * screen is a table.
 */
const NAVIGATION_KEYS = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'PageUp', 'PageDown', 'Home', 'End', 'Backspace', 'Delete',
]);

/**
 * SHOULD THIS AUTO-REPEAT REACH THE DOOR?
 *
 * "pressing v flicks back directly" (sysop, 2026-09-15). The browser repeats
 * a held key - after 400ms, then every 30ms in `game` mode and every 120ms in
 * `application` - and both of the paths a key takes to a door pass those
 * repeats straight through: the byte path in `socket-handlers.ts` and the
 * client-door bridge, neither of which looked at `repeat`. V turns the card
 * lobby's lower panel over, so a press held half a second turned it over
 * several times and left it where it started.
 *
 * The rule is HERE, on the server, and not in the browser, for one reason:
 * the browser's copy of it only arrives when the caller reloads. The sysop
 * held V with a tab that still had last night's JavaScript, and the repeats
 * came through at exactly 129ms apart - the application rate - with a fix
 * sitting in a bundle his tab had not fetched. A rule that a stale client can
 * opt out of is not a rule.
 *
 * In `application` mode a key is a COMMAND and gets one delivery per press;
 * only the keys that steer repeat. `game` mode is untouched - an arcade
 * door's movement is built ON these repeats.
 */
export function repeatReachesDoor(
  mode: KeyRepeatMode | undefined,
  key: string,
): boolean {
  if ((mode ?? 'game') !== 'application') return true;
  return NAVIGATION_KEYS.has(key);
}

/**
 * Tell the browser which repeat to use for the door now running.
 *
 * One emitter for every route into game mode - a client door, a hybrid
 * RPC-only door, and a server door calling `bbs.enableGameMode()` all arrive
 * here, which is why the mode is carried on the SESSION rather than passed by
 * whichever call site happens to know the tooltypes.
 */
export function emitKeyRepeatMode(socket: Socket, session: BBSSession): void {
  const mode: KeyRepeatMode = session.doorKeyRepeatMode ?? 'game';
  socket.emit('key-repeat-mode', mode);
  console.log(`[GameMode] key-repeat-mode=${mode}`);
}

/**
 * Enable game mode for a session.
 *
 * Should ONLY be called for doors that need raw keydown/keyup events.
 * Traditional 68K doors (XIM/AMI) use normal character input via door:input
 * and should NOT have game mode enabled. Only TypeScript game doors that
 * explicitly call bbs.enableGameMode() should use this.
 */
export function enableGameMode(
  socket: Socket,
  session: BBSSession,
  doorType: string,
): void {
  session.gameModeEnabled = true;
  session.currentDoorType = doorType;
  console.log(`[GameMode] Enabled for door (type=${doorType})`);
  socket.emit('game-mode', true);
  emitKeyRepeatMode(socket, session);
}

/**
 * Disable game mode for a session (auto-called when door exits).
 * Tears down KeyRepeatManager and clears held-key state in addition to the
 * frontend signal.
 */
export function disableGameMode(socket: Socket, session: BBSSession): void {
  if (session.keyRepeatManager) {
    session.keyRepeatManager.stop();
    session.keyRepeatManager = null;
  }
  session.gameModeEnabled = false;
  session.currentDoorType = undefined;
  session.keyState = {};
  socket.emit('game-mode', false);
  /*
   * Back to the arcade rate for whatever runs next: the board's own prompts
   * never saw anything else.
   *
   * What is NOT done here is forgetting `session.doorKeyRepeatMode`, and that
   * is the whole point. A HYBRID door - CARDLOBBY is one - launches its
   * client half and its server half in one breath, and the sequence on the
   * live board reads: executeClientDoor sets the mode and emits it,
   * something disables game mode, executeTypeScriptDoor's door enables it
   * again. Clearing the mode in the middle of that left the second enable
   * with nothing to say, so the card lobby ran at the arcade rate with
   * `KEY_REPEAT=application` sitting in its icon, doing nothing.
   *
   * The field is set afresh by every launch route instead, so a stale value
   * cannot survive into the next door.
   */
  socket.emit('key-repeat-mode', 'game');
  console.log('[GameMode] Disabled');
}

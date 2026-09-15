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
 * and flagged the arcade doors; GRANDMASTER disproved the theory behind it
 * within the hour ("gmaster has a delay now when i hold the button"), because
 * its DAS/ARR is driven BY these repeats rather than around them. A door whose
 * screen is a LIST opts out with `KEY_REPEAT=application` on its icon.
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
  // Back to the arcade rate for whatever runs next. The board's own prompts
  // never saw anything else, and the next door states its own mode on entry.
  session.doorKeyRepeatMode = undefined;
  socket.emit('key-repeat-mode', 'game');
  console.log('[GameMode] Disabled');
}

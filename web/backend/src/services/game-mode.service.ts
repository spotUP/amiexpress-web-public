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
  console.log('[GameMode] Disabled');
}

/**
 * Deleting a door, and making the board notice.
 *
 * Extracted from BBSApi.deleteDoor on 2026-08-31 for phase C, the same move
 * buildDoorList made in phase B and for the same reason: DELETE
 * /api/door-admin/installed/:cmd has no session, and a second copy of "remove
 * the files, then reload both registries" is a second thing to keep correct.
 *
 * The removal itself is amigaDoorManager's, unchanged. Its guard is the one
 * written after 2026-08-30, when an unchecked recursive delete took the whole
 * Doors/ tree out: every path it touches - the tracked database rows included
 * - is resolved and confined to Doors/, Commands/, or a recorded library under
 * Libs:, and never to one of those roots itself.
 *
 * Authorization is NOT here. The in-process caller checks the session's
 * secLevel; the HTTP route checks the token's. Neither may assume the other
 * did it.
 */

import type { DoorDeleteProgress, DoorDeleteResult } from './amigaDoorManager';

/**
 * Delete a door and reload the caches that would otherwise keep serving it.
 *
 * @param identifier command name for an Amiga door, directory name for a
 *                   TypeScript one
 * @param isTypeScriptDoor force the TypeScript path; omit to let the manager
 *                         decide by looking for a .info first
 * @param onStep called as each step happens, so a caller can stream a log
 *               rather than show one after the pause
 */
export async function deleteDoorAndRefresh(
  identifier: string,
  isTypeScriptDoor?: boolean,
  onStep?: DoorDeleteProgress,
): Promise<DoorDeleteResult> {
  try {
    const { getAmigaDoorManager, refreshDoorCache } = await import('./amigaDoorManager');
    const manager = getAmigaDoorManager();
    const result = await manager.deleteDoor(identifier, isTypeScriptDoor, onStep);

    if (result.success) {
      // Both registries are in memory. Without these, the door keeps being
      // offered on the menu until the next restart.
      onStep?.({ kind: 'ok', text: 'rescanning the door definitions' });
      await refreshDoorCache();
      try {
        const { initializeDoors } = require('../handlers/door.handler');
        onStep?.({ kind: 'ok', text: 'reloading the door registry' });
        await initializeDoors();
      } catch (e) {
        // The files are gone either way; say so rather than reporting a
        // failed delete.
        onStep?.({ kind: 'fail', text: `door registry reload failed: ${(e as Error).message}` });
        console.warn('[deleteDoorAndRefresh] Could not reload door registry:', e);
      }
    }

    return result;
  } catch (error) {
    console.error('[deleteDoorAndRefresh] Error:', error);
    return {
      success: false,
      message: `Delete failed: ${(error as Error).message}`,
    };
  }
}

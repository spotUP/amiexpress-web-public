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
import { reloadDoorRegistry } from './reload-door-registry';

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
    const { getAmigaDoorManager } = await import('./amigaDoorManager');
    const manager = getAmigaDoorManager();
    const result = await manager.deleteDoor(identifier, isTypeScriptDoor, onStep);

    if (result.success) {
      // Every cache between the .info files and the door list, in order.
      // This used to refresh amigaDoorManager's scan and rebuild the
      // registry - but the registry is built from commandCache, which
      // nothing invalidated, so a deleted door stayed in the list while
      // both steps reported OK. See reload-door-registry.ts.
      await reloadDoorRegistry(onStep);
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

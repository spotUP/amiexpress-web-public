/**
 * Commands and door management a door runs through BBSApi: queue or run a board command, list, delete and enable doors.
 *
 * Moved out of BBSApi.ts (file size); BBSApi keeps a one-line method for each, so
 * the door-facing surface is unchanged.
 */
import type { Socket } from 'socket.io';

import type { BBSSession } from '../index';
import { LoggedOnSubState } from '../constants/bbs-states';
import { buildDoorList, DoorListEntry } from './door-list';
import { deleteDoorAndRefresh } from './door-delete';
import { boardRoot } from '../utils/board-root.util';


/**
 * Execute a BBS command (same path as user-typed commands)
 * If a door is active, queue the command to run after the door exits.
 *
 * "A door is active" is session.doorExecuting, which executeTypeScriptDoor
 * holds for the whole of execute(). inDoorManager alone is not enough: the
 * SDK's dispose() clears it while the door is still inside execute(), and a
 * command run from there starts before the door returns (DOORS picking
 * PHREAKWARS: the menu door came back over it). inDoorManager still counts
 * for the runners that set only it (ARexx).
 */
export async function doorExecuteCommand(socket: Socket, session: BBSSession, command: string, params?: string | string[]): Promise<void> {
  const trimmed = (command || '').trim();
  if (!trimmed) return;

  const paramText = Array.isArray(params) ? params.join(' ') : (params || '').trim();
  const commandLine = paramText ? `${trimmed} ${paramText}` : trimmed;

  if (session.doorExecuting || session.inDoorManager) {
    if (!session.pendingDoorCommands) {
      session.pendingDoorCommands = [];
    }
    session.pendingDoorCommands.push(commandLine);
console.log(`[BBSApi.executeCommand] Queued command for after door exit: ${commandLine}`);
    return;
  }

  const { handleCommand } = require('../handlers/command.handler');
  // Bypass READ_COMMAND's line buffering and execute like an entered command.
  session.commandText = commandLine.toUpperCase();
  session.subState = LoggedOnSubState.PROCESS_COMMAND;
  await handleCommand(socket, session, '');
}

/**
 * Get list of available doors
 * Used by door menu systems to display available doors
 *
 * The build itself lives in ./door-list so the same rules serve the HTTP
 * route the DoorRepo C door reads (GET /api/door-admin/installed). This
 * method contributes the one thing a session knows and a route does not:
 * where the BBS root is.
 */
export async function doorGetDoorList(session: BBSSession): Promise<DoorListEntry[]> {
  const bbsRoot = (session as any)?.dataDir || boardRoot();
  return buildDoorList(bbsRoot);
}

/**
 * Delete a door completely (directory + .info files)
 * Used by door manager for uninstalling doors
 * @param identifier - Door name (directory name for TS doors) or command name (for Amiga doors)
 * @param isTypeScriptDoor - Set to true if this is a TypeScript/SDK door
 * @returns Result object with success status and message
 */
export async function doorDeleteDoor(session: BBSSession, 
  identifier: string,
  isTypeScriptDoor?: boolean,
  onStep?: (step: { kind: 'ok' | 'skip' | 'fail'; text: string }) => void
): Promise<{ success: boolean; message: string; removed?: string[] }> {
  // Check if user has sysop access
  if (session.user && session.user.secLevel < 250) {
    return {
      success: false,
      message: 'Access denied: SysOp access required to delete doors'
    };
  }

  // The removal and the cache reloads live in ./door-delete so the HTTP
  // route DELETE /api/door-admin/installed/:cmd runs the identical path.
  // Authorization stays here, because that route authorizes differently -
  // a launch token's secLevel, not a session's.
  return deleteDoorAndRefresh(identifier, isTypeScriptDoor, onStep);
}

/**
 * Enable or disable a door by its command name.
 * Requires SysOp access (secLevel >= 250).
 */
export async function doorSetDoorEnabled(session: BBSSession, command: string, enabled: boolean): Promise<{ success: boolean; message: string }> {
  if (session.user && session.user.secLevel < 250) {
    return { success: false, message: 'Access denied: SysOp access required' };
  }
  try {
    const { getAmigaDoorManager } = await import('./amigaDoorManager');
    const manager = getAmigaDoorManager();
    const result = await manager.setDoorEnabled(command, enabled);
    return result;
  } catch (error) {
    return { success: false, message: `Failed: ${(error as Error).message}` };
  }
}

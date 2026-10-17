/**
 * What the sysop's tools see of a session - one place, every transport.
 *
 * Two observers watched a caller's terminal: the admin session-log viewer
 * (services/SessionLogManager) and the debug MCP output tap (debug/OutputTap,
 * `get_output_tail` / `wait_for_output`). Both were fed only by wrappers on a
 * web socket's `emit` (server/socket-handlers.ts), so a telnet or SSH caller
 * never appeared in the session-log page and MCP debugging of one saw nothing
 * (web-vs-telnet audit item 15, 2026-09-28). Every transport's entry calls
 * these now.
 */
import { sessionLogManager } from '../services/SessionLogManager';
import { feedScreenModel, dropScreenModel, type ScreenModelSession } from '../services/screen-model/screen-model';

/** A caller's connection opened: the session log starts recording it. */
export function startObserving(connectionId: string): void {
  sessionLogManager.startSession(connectionId);
}

/**
 * Text the board sent this caller. `session` sizes the board's screen model
 * (services/screen-model), which every transport feeds here, on the live board
 * too: AEW_SCREEN SAVE/RESTORE reads it.
 */
export function observeOutput(connectionId: string, nodeId: number | undefined, text: unknown, session?: ScreenModelSession): void {
  if (typeof text !== 'string' || text.length === 0) return;
  sessionLogManager.captureOutput(connectionId, text);
  feedScreenModel(connectionId, session, text);
  // The MCP tap is a dev tool; it is not loaded on the live board.
  if (process.env.NODE_ENV !== 'production' && typeof nodeId === 'number' && nodeId > 0) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { outputTap } = require('../debug/OutputTap');
      outputTap.push(nodeId, text);
    } catch { /* no tap in this build */ }
  }
}

/** Keys this caller typed. */
export function observeInput(connectionId: string, text: unknown): void {
  if (typeof text !== 'string' || text.length === 0) return;
  sessionLogManager.captureInput(connectionId, text);
}

/** The connection closed: the session log closes its record. */
export function stopObserving(connectionId: string): void {
  sessionLogManager.endSession(connectionId);
  dropScreenModel(connectionId);
}

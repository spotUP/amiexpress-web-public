/**
 * File Maintenance States Handler
 * Handles all FM_* states for file maintenance operations
 * Extracted from command.handler.ts to reduce code duplication
 *
 * express.e:24889-25045
 *
 * @module file-maintenance-states
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { FileMaintenanceHandler } from '../file/file-maintenance.handler';
import { emitText } from '../../utils/output.util';

/**
 * State to handler mapping for FM_* states
 */
type FMHandler = (socket: any, session: BBSSession, input: string) => void | Promise<void>;

const FM_HANDLERS: Map<LoggedOnSubState, FMHandler> = new Map([
  [LoggedOnSubState.FM_YESNO_INPUT, FileMaintenanceHandler.handleYesNoInput],
  [LoggedOnSubState.FM_FILENAME_INPUT, FileMaintenanceHandler.handleFilenameInput],
  [LoggedOnSubState.FM_DIRSPAN_INPUT, FileMaintenanceHandler.handleDirSpanInput],
  [LoggedOnSubState.FM_ACTION_INPUT, FileMaintenanceHandler.handleActionInput],
  [LoggedOnSubState.FM_REMOVE_FLAG_INPUT, FileMaintenanceHandler.handleRemoveFlagInput],
  [LoggedOnSubState.FM_CONFIRM_DELETE, FileMaintenanceHandler.handleConfirmDeleteInput],
  [LoggedOnSubState.FM_MOVE_DEST_INPUT, FileMaintenanceHandler.handleMoveDestInput],
]);

/**
 * States that should echo input
 */
const ECHO_STATES = new Set<LoggedOnSubState>([
  LoggedOnSubState.FM_YESNO_INPUT,
  LoggedOnSubState.FM_FILENAME_INPUT,
  LoggedOnSubState.FM_DIRSPAN_INPUT,
  LoggedOnSubState.FM_ACTION_INPUT,
  LoggedOnSubState.FM_REMOVE_FLAG_INPUT,
  LoggedOnSubState.FM_CONFIRM_DELETE,
  LoggedOnSubState.FM_MOVE_DEST_INPUT,
]);

/**
 * Check if a subState is a FM_* state
 */
export function isFileMaintState(subState: LoggedOnSubState | undefined): boolean {
  if (!subState) return false;
  return FM_HANDLERS.has(subState);
}

/**
 * Handle input for FM_* states
 * Returns true if the state was handled, false otherwise
 */
export async function handleFileMaintInput(
  socket: any,
  session: BBSSession,
  data: string
): Promise<boolean> {
  const subState = session.subState as LoggedOnSubState;
  const handler = FM_HANDLERS.get(subState);

  if (!handler) {
    return false;
  }

  // Initialize inputBuffer if needed
  if (!session.inputBuffer) {
    session.inputBuffer = '';
  }

  // Determine if we should echo input
  const shouldEcho = ECHO_STATES.has(subState);

  // Handle Enter - process input (express.e:2342)
  if (data === '\r' || data === '\n') {
    const input = session.inputBuffer;
    session.inputBuffer = '';
    await handler(socket, session, input);
    return true;
  }

  // Handle Backspace (express.e:2304-2320)
  if (data === '\x7f' || data === '\b') {
    if (session.inputBuffer.length > 0) {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
      if (shouldEcho) {
        emitText(socket, '\b \b');
      }
    }
    return true;
  }

  // Handle printable characters (express.e:2342)
  if (data.length === 1 && data >= ' ' && data <= '~') {
    session.inputBuffer += data;
    if (shouldEcho) {
      emitText(socket, data);
    }
    return true;
  }

  // Ignore other control characters
  return true;
}

/**
 * Get the list of all FM_* states
 */
export function getFileMaintStates(): LoggedOnSubState[] {
  return Array.from(FM_HANDLERS.keys());
}

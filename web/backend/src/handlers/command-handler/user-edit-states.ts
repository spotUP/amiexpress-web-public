/**
 * User Edit States Handler
 * Handles all W_EDIT_* states for user parameter editing
 * Extracted from command.handler.ts to reduce code duplication
 *
 * @module user-edit-states
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import { handleBufferedInput } from './input-helpers';
import {
  handleWOptionSelectInput,
  handleWEditNameInput,
  handleWEditEmailInput,
  handleWEditRealnameInput,
  handleWEditInternetnameInput,
  handleWEditLocationInput,
  handleWEditPhoneInput,
  handleWEditPasswordInput,
  handleWEditPasswordConfirmInput,
  handleWEditLinesInput,
  handleWEditComputerInput,
  handleWEditScreentypeInput,
  handleWEditProtocolInput,
  handleWEditTranslatorInput,
  handleWEditModemSpeedInput,
  handleWEditFontInput,
} from '../commands/info-commands.handler';
import { emitText } from '../../utils/output.util';

/**
 * State to handler mapping for W_EDIT_* states
 * Each entry maps a LoggedOnSubState to its handler function
 */
const W_EDIT_HANDLERS: Map<LoggedOnSubState, (socket: any, session: BBSSession, input: string) => void | Promise<void>> = new Map([
  [LoggedOnSubState.W_OPTION_SELECT, handleWOptionSelectInput],
  [LoggedOnSubState.W_EDIT_NAME, handleWEditNameInput],
  [LoggedOnSubState.W_EDIT_EMAIL, handleWEditEmailInput],
  [LoggedOnSubState.W_EDIT_REALNAME, handleWEditRealnameInput],
  [LoggedOnSubState.W_EDIT_INTERNETNAME, handleWEditInternetnameInput],
  [LoggedOnSubState.W_EDIT_LOCATION, handleWEditLocationInput],
  [LoggedOnSubState.W_EDIT_PHONE, handleWEditPhoneInput],
  [LoggedOnSubState.W_EDIT_PASSWORD, handleWEditPasswordInput],
  [LoggedOnSubState.W_EDIT_PASSWORD_CONFIRM, handleWEditPasswordConfirmInput],
  [LoggedOnSubState.W_EDIT_LINES, handleWEditLinesInput],
  [LoggedOnSubState.W_EDIT_COMPUTER, handleWEditComputerInput],
  [LoggedOnSubState.W_EDIT_SCREENTYPE, handleWEditScreentypeInput],
  [LoggedOnSubState.W_EDIT_PROTOCOL, handleWEditProtocolInput],
  [LoggedOnSubState.W_EDIT_TRANSLATOR, handleWEditTranslatorInput],
  [LoggedOnSubState.W_EDIT_MODEM_SPEED, handleWEditModemSpeedInput],
  [LoggedOnSubState.W_EDIT_FONT, handleWEditFontInput],
]);

/**
 * States that should echo input (most W_EDIT states)
 */
const ECHO_STATES = new Set<LoggedOnSubState>([
  LoggedOnSubState.W_OPTION_SELECT,
  LoggedOnSubState.W_EDIT_NAME,
  LoggedOnSubState.W_EDIT_EMAIL,
  LoggedOnSubState.W_EDIT_REALNAME,
  LoggedOnSubState.W_EDIT_INTERNETNAME,
  LoggedOnSubState.W_EDIT_LOCATION,
  LoggedOnSubState.W_EDIT_PHONE,
  LoggedOnSubState.W_EDIT_LINES,
  LoggedOnSubState.W_EDIT_COMPUTER,
  LoggedOnSubState.W_EDIT_SCREENTYPE,
  LoggedOnSubState.W_EDIT_PROTOCOL,
  LoggedOnSubState.W_EDIT_TRANSLATOR,
  LoggedOnSubState.W_EDIT_MODEM_SPEED,
  LoggedOnSubState.W_EDIT_FONT,
]);

/**
 * States that should NOT echo input (password fields)
 */
const NO_ECHO_STATES = new Set<LoggedOnSubState>([
  LoggedOnSubState.W_EDIT_PASSWORD,
  LoggedOnSubState.W_EDIT_PASSWORD_CONFIRM,
]);

/**
 * Check if a subState is a W_EDIT_* state
 */
export function isUserEditState(subState: LoggedOnSubState | undefined): boolean {
  if (!subState) return false;
  return W_EDIT_HANDLERS.has(subState);
}

/**
 * Handle input for W_EDIT_* states
 * Returns true if the state was handled, false otherwise
 */
export async function handleUserEditInput(
  socket: any,
  session: BBSSession,
  data: string
): Promise<boolean> {
  const subState = session.subState as LoggedOnSubState;
  const handler = W_EDIT_HANDLERS.get(subState);

  if (!handler) {
    return false;
  }

  // Initialize inputBuffer if needed
  if (!session.inputBuffer) {
    session.inputBuffer = '';
  }

  // Determine if we should echo input
  const shouldEcho = ECHO_STATES.has(subState);
  const isPassword = NO_ECHO_STATES.has(subState);

  // Handle Enter - process input
  if (data === '\r' || data === '\n') {
    const input = session.inputBuffer;
    session.inputBuffer = '';
    await handler(socket, session, input);
    return true;
  }

  // Handle Backspace
  if (data === '\x7f' || data === '\b') {
    if (session.inputBuffer.length > 0) {
      session.inputBuffer = session.inputBuffer.slice(0, -1);
      if (shouldEcho || isPassword) {
        emitText(socket, '\b \b');
      }
    }
    return true;
  }

  // Handle printable characters
  if (data.length === 1 && data >= ' ' && data <= '~') {
    session.inputBuffer += data;
    if (shouldEcho) {
      emitText(socket, data);
    } else if (isPassword) {
      // Don't echo password characters (express.e masks with nothing)
    }
    return true;
  }

  // Ignore other control characters
  return true;
}

/**
 * Get the list of all W_EDIT_* states
 */
export function getUserEditStates(): LoggedOnSubState[] {
  return Array.from(W_EDIT_HANDLERS.keys());
}

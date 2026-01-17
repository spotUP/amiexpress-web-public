/**
 * Conference Maintenance States Handler
 * Handles all CM_* states for conference maintenance operations
 * Extracted from command.handler.ts to reduce code duplication
 *
 * @module conference-maint-states
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import {
  handleCMInput,
  handleCMNumericInput,
} from '../message/message-commands.handler';
import { emitText } from '../../utils/output.util';

/**
 * CM_INPUT numeric types
 */
type CMNumericType = 'HIGH_MSG' | 'LOW_MSG' | 'RATIO' | 'RATIO_TYPE' | 'CAPACITY';

/**
 * State to numeric type mapping
 */
const CM_NUMERIC_STATES: Map<LoggedOnSubState, CMNumericType> = new Map([
  [LoggedOnSubState.CM_INPUT_HIGH_MSG, 'HIGH_MSG'],
  [LoggedOnSubState.CM_INPUT_LOW_MSG, 'LOW_MSG'],
  [LoggedOnSubState.CM_INPUT_RATIO, 'RATIO'],
  [LoggedOnSubState.CM_INPUT_RATIO_TYPE, 'RATIO_TYPE'],
  [LoggedOnSubState.CM_INPUT_CAPACITY, 'CAPACITY'],
]);

/**
 * All CM_* states (menu + numeric inputs)
 */
const CM_STATES = new Set<LoggedOnSubState>([
  LoggedOnSubState.CM_DISPLAY_MENU,
  LoggedOnSubState.CM_INPUT_HIGH_MSG,
  LoggedOnSubState.CM_INPUT_LOW_MSG,
  LoggedOnSubState.CM_INPUT_RATIO,
  LoggedOnSubState.CM_INPUT_RATIO_TYPE,
  LoggedOnSubState.CM_INPUT_CAPACITY,
]);

/**
 * Check if a subState is a CM_* state
 */
export function isConfMaintState(subState: LoggedOnSubState | undefined): boolean {
  if (!subState) return false;
  return CM_STATES.has(subState);
}

/**
 * Handle input for CM_* states
 * Returns true if the state was handled, false otherwise
 */
export async function handleConfMaintInput(
  socket: any,
  session: BBSSession,
  data: string
): Promise<boolean> {
  const subState = session.subState as LoggedOnSubState;

  if (!CM_STATES.has(subState)) {
    return false;
  }

  // Handle CM menu state (single-key input)
  if (subState === LoggedOnSubState.CM_DISPLAY_MENU) {
    console.log('  In CM menu state');
    await handleCMInput(socket, session, data.trim());
    return true;
  }

  // Handle CM numeric input states (line-buffered input)
  const numericType = CM_NUMERIC_STATES.get(subState);
  if (numericType) {
    console.log(`  In CM ${numericType.toLowerCase()} input state`);

    // Initialize inputBuffer if needed
    if (!session.inputBuffer) {
      session.inputBuffer = '';
    }

    // Handle Enter - process input
    if (data === '\r' || data === '\n') {
      const input = session.inputBuffer;
      session.inputBuffer = '';
      await handleCMNumericInput(socket, session, input, numericType);
      return true;
    }

    // Handle Backspace
    if (data === '\x7f' || data === '\b') {
      if (session.inputBuffer.length > 0) {
        session.inputBuffer = session.inputBuffer.slice(0, -1);
        emitText(socket, '\b \b');
      }
      return true;
    }

    // Handle printable characters
    if (data.length === 1 && data >= ' ' && data <= '~') {
      session.inputBuffer += data;
      emitText(socket, data);
      return true;
    }

    // Ignore other control characters
    return true;
  }

  return false;
}

/**
 * Get the list of all CM_* states
 */
export function getConfMaintStates(): LoggedOnSubState[] {
  return Array.from(CM_STATES);
}

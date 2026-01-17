/**
 * State Router
 * Central routing for all LoggedOnSubState input handling
 * Delegates to specialized state handler modules
 *
 * This module reduces the size of command.handler.ts by extracting
 * repetitive state handling patterns into modular components.
 *
 * @module state-router
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';

// Import state handler modules
import { isUserEditState, handleUserEditInput } from './user-edit-states';
import { isFileMaintState, handleFileMaintInput } from './file-maintenance-states';
import { isConfMaintState, handleConfMaintInput } from './conference-maint-states';
import { isVotingState, handleVotingInput } from './voting-states';

/**
 * Result of state routing
 */
export interface StateRouteResult {
  /** Whether the state was handled */
  handled: boolean;
  /** Whether to continue processing (false = return early) */
  continueProcessing: boolean;
}

/**
 * Route input to appropriate state handler
 *
 * This function checks if the current session state can be handled
 * by one of the specialized state handler modules and delegates
 * the input processing accordingly.
 *
 * @param socket - Socket connection
 * @param session - Current BBS session
 * @param data - Input data
 * @returns Result indicating if state was handled
 */
export async function routeStateInput(
  socket: any,
  session: BBSSession,
  data: string
): Promise<StateRouteResult> {
  const subState = session.subState as LoggedOnSubState;

  // Try User Edit states (W_EDIT_*)
  if (isUserEditState(subState)) {
    const handled = await handleUserEditInput(socket, session, data);
    return { handled, continueProcessing: false };
  }

  // Try File Maintenance states (FM_*)
  if (isFileMaintState(subState)) {
    const handled = await handleFileMaintInput(socket, session, data);
    return { handled, continueProcessing: false };
  }

  // Try Conference Maintenance states (CM_*)
  if (isConfMaintState(subState)) {
    const handled = await handleConfMaintInput(socket, session, data);
    return { handled, continueProcessing: false };
  }

  // Try Voting states (VO_*)
  if (isVotingState(subState)) {
    const handled = await handleVotingInput(socket, session, data);
    return { handled, continueProcessing: false };
  }

  // State not handled by any module
  return { handled: false, continueProcessing: true };
}

/**
 * Check if a state is handled by the state router
 */
export function isRoutedState(subState: LoggedOnSubState | undefined): boolean {
  if (!subState) return false;
  return (
    isUserEditState(subState) ||
    isFileMaintState(subState) ||
    isConfMaintState(subState) ||
    isVotingState(subState)
  );
}

/**
 * Get all states handled by the router
 */
export function getRoutedStates(): LoggedOnSubState[] {
  const { getUserEditStates } = require('./user-edit-states');
  const { getFileMaintStates } = require('./file-maintenance-states');
  const { getConfMaintStates } = require('./conference-maint-states');
  const { getVotingStates } = require('./voting-states');

  return [
    ...getUserEditStates(),
    ...getFileMaintStates(),
    ...getConfMaintStates(),
    ...getVotingStates(),
  ];
}

// Re-export individual module functions for direct access
export {
  isUserEditState,
  handleUserEditInput,
  isFileMaintState,
  handleFileMaintInput,
  isConfMaintState,
  handleConfMaintInput,
  isVotingState,
  handleVotingInput,
};

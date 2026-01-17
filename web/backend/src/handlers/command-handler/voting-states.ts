/**
 * Voting Booth States Handler
 * Handles all VO_* states for voting booth operations
 * Extracted from command.handler.ts to reduce code duplication
 *
 * @module voting-states
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';
import {
  handleVoteTopicSelect,
  handleVoteAnswerInput,
  handleVoteMenuChoice,
} from '../commands/transfer-misc-commands.handler';
import { emitText } from '../../utils/output.util';

/**
 * State to handler mapping for VO_* states
 */
type VOHandler = (socket: any, session: BBSSession, input: string) => void | Promise<void>;

const VO_HANDLERS: Map<LoggedOnSubState, VOHandler> = new Map([
  [LoggedOnSubState.VO_TOPIC_SELECT, handleVoteTopicSelect],
  [LoggedOnSubState.VO_ANSWER_INPUT, handleVoteAnswerInput],
  [LoggedOnSubState.VO_MENU_CHOICE, handleVoteMenuChoice],
]);

/**
 * Check if a subState is a VO_* state
 */
export function isVotingState(subState: LoggedOnSubState | undefined): boolean {
  if (!subState) return false;
  return VO_HANDLERS.has(subState);
}

/**
 * Handle input for VO_* states
 * Returns true if the state was handled, false otherwise
 */
export async function handleVotingInput(
  socket: any,
  session: BBSSession,
  data: string
): Promise<boolean> {
  const subState = session.subState as LoggedOnSubState;
  const handler = VO_HANDLERS.get(subState);

  if (!handler) {
    return false;
  }

  console.log(`  In vote ${subState} state`);

  // Initialize inputBuffer if needed
  if (!session.inputBuffer) {
    session.inputBuffer = '';
  }

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

/**
 * Get the list of all VO_* states
 */
export function getVotingStates(): LoggedOnSubState[] {
  return Array.from(VO_HANDLERS.keys());
}

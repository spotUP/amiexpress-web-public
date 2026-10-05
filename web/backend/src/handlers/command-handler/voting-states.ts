/**
 * The voting booth's waiting state.
 *
 * The booth (commands/vote-booth.ts) is express.e's procedures, awaited: its
 * prompts read through utils/await-input, which handleCommand feeds before
 * any sub-state runs. While a procedure runs the session sits in
 * VO_TOPIC_SELECT, and a key that arrives between prompts has nothing to
 * answer - it is dropped here, as the reader's MSG_READER_NAV drops one.
 *
 * @module voting-states
 */

import { BBSSession } from '../../index';
import { LoggedOnSubState } from '../../constants/bbs-states';

const VOTING_STATES: LoggedOnSubState[] = [LoggedOnSubState.VO_TOPIC_SELECT];

/** Is the session inside the voting booth? */
export function isVotingState(subState: LoggedOnSubState | undefined): boolean {
  return !!subState && VOTING_STATES.includes(subState);
}

/** A key between the booth's prompts: dropped. */
export async function handleVotingInput(
  _socket: any,
  session: BBSSession,
  _data: string
): Promise<boolean> {
  return isVotingState(session.subState as LoggedOnSubState);
}

/** The voting booth's states. */
export function getVotingStates(): LoggedOnSubState[] {
  return [...VOTING_STATES];
}

/**
 * How long a door's `waitForReply` may wait, by what it is waiting FOR.
 *
 * Moved out of AEDoorLibrary.ts unchanged (2026-09-15) when that file reached
 * the 2000-line gate; the wait loop imports it back from here.
 */
import { XIMCommand } from '../xim/types';

/**
 * How long `waitForReply` may wait, by what it is waiting FOR.
 *
 * A command the BBS answers itself is quick, and a long stall is a bug worth
 * stopping. A command that waits for the CALLER is only as quick as they are,
 * and stopping it invents input they never gave.
 */
export function waitBudgetMs(command: number): number {
  return WAITS_FOR_A_PERSON.has(command) ? HUMAN_WAIT_MS : MACHINE_WAIT_MS;
}

/** The BBS answers this itself; a long stall means something is wedged. */
const MACHINE_WAIT_MS = 5000;

/**
 * A caller is at the other end. Long enough that only a wedged door reaches
 * it - reading a menu, thinking, and typing all happen well inside it - and
 * still bounded, so a node is never held for ever.
 */
const HUMAN_WAIT_MS = 10 * 60 * 1000;

/**
 * The two commands whose reply is a keystroke: `JH_LI` (line input, 0) and
 * `JH_HK` (hotkey, 6). Everything else is the board answering the door.
 */
const WAITS_FOR_A_PERSON = new Set<number>([XIMCommand.JH_LI, XIMCommand.JH_HK]);

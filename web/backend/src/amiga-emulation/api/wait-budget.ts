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

/**
 * WHETHER A WAITING DOOR PUMPS THE EVENT LOOP - on unless a board says no.
 *
 * Two runtimes, two answers, and only one of them was ever tested. Compose
 * passes `DOOR_ASYNC_WAIT=${DOOR_ASYNC_WAIT:-1}`, so the live board has run
 * the async wait since it was written; the code's own default was off, so
 * the dev stack, the probes and the corpus runner took the LEGACY loop -
 * ten thousand iterations and then give up, whatever the door was waiting
 * for. At a `JH_HK` prompt that hands the door a character 0 nobody typed
 * (`waitBudgetMs` above exists because of the same fault), and the caller
 * watches a door answer a key they never pressed.
 *
 * The sysop hit it on localhost, 2026-09-16: "the bbs halts at the next door
 * after it during log in" - GWall, drawing after GL, with
 * `No reply for command 6 ... (sync wait)` and `HotKey() -> char: 0` in the
 * log. Live was fine because compose set the flag there.
 *
 * So the default is what the board runs. `DOOR_ASYNC_WAIT=0` still selects
 * the old loop for anyone who needs to compare against it.
 */
export function asyncWaitEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const raw = (env.DOOR_ASYNC_WAIT ?? '').trim().toLowerCase();
  if (raw === '') return true;
  return !(raw === '0' || raw === 'false' || raw === 'off' || raw === 'no');
}

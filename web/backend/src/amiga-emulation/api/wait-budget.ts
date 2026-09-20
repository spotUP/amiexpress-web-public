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
 * The end of every wait, whatever it is waiting for.
 *
 * The deadline below is held off while the board is parked on the CALLER
 * (see AEDoorLibrary.waitForReply), which is correct while they are reading
 * and typing and wrong if they have gone. This is the line under it: a node
 * comes back on its own even when nobody answers the prompt at all.
 */
export const HUMAN_WAIT_CEILING_MS = HUMAN_WAIT_MS;

/*
 * WHY THE DEADLINE IS HELD WHILE A CALLER IS BEING WAITED FOR.
 *
 * A budget per command cannot tell a slow BOARD from a slow PERSON, and the
 * list below was incomplete by exactly one: `JH_PM`, which is what E's
 * `Prompt()` sends and what GWall reads its comment with. On 2026-09-20 a
 * caller typed for thirteen seconds, the five-second machine stop expired on
 * him, and the board answered that message afterwards - onto the reply port
 * the door's NEXT wait polls. Every command from then on was answered by the
 * previous command's reply: `HotKey()` returned a millisecond after each
 * prompt with an unfilled buffer, the door read character 0, rejected it as a
 * colour and redrew its menu for ever, at 100% CPU.
 *
 * So `AEDoorLibrary.waitForReply` asks the XIM layer whether it is parked on
 * the caller and holds the deadline while it is. That covers the commands
 * this list cannot: a `JH_SM` whose own output raises `(Pause)` is a person
 * too. `HUMAN_WAIT_CEILING_MS` above is the end of it either way, so a caller
 * who walks away still gives the node back.
 */

/**
 * The commands whose reply is a keystroke: `JH_LI` (line input, 0), `JH_PM`
 * (prompt-then-read, 5), `JH_HK` (hotkey, 6) and `JH_ExtHK` (extended
 * hotkey, 15). Everything else is the board answering the door.
 *
 * `JH_PM` was missing until 2026-09-20 and that omission is the whole of
 * GWall's looping colour prompt: E's `Prompt()` - which the door reads its
 * comment with - sends `JH_PM`, so a caller who took longer than five
 * seconds to type blew the machine stop, and every command after it was
 * answered by the previous one's late reply. `HotKey()` then returned
 * character 0 instantly, for ever.
 *
 * The list is no longer the only defence - the wait also holds its deadline
 * while the XIM layer says it is parked on the caller, which covers a
 * `(Pause)` raised mid-write by a command that is usually instant - but a
 * command known to read a person should not depend on that.
 */
const WAITS_FOR_A_PERSON = new Set<number>([
  XIMCommand.JH_LI,
  XIMCommand.JH_PM,
  XIMCommand.JH_HK,
  XIMCommand.JH_ExtHK,
]);

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

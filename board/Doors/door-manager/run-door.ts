/**
 * Starting a door from DOORMAN's list.
 *
 * The mechanics are not obvious and are the reason this is its own module.
 *
 * `bbs.executeCommand()` does NOT launch the door inline. While
 * `inDoorManager` is set on the session it queues the command and the BBS
 * runs it once THIS door exits (BBSApi.executeCommand). Two 68K doors cannot
 * share a node, so queue-then-exit is the only order that works - and it is
 * why the caller tears its view down immediately after a successful queue
 * rather than waiting for the user to quit.
 *
 * The consequence for errors: anything the BBS says about the command lands
 * AFTER doorman has closed, where it reads as doorman having crashed. So the
 * cases we can detect are refused here, while there is still a status line to
 * show them on.
 */

/** Only what the decision needs; the view passes its own richer object. */
export interface RunnableDoor {
  command?: string;
  enabled?: boolean;
}

export type RunDecision =
  | { ok: true; command: string }
  | { ok: false; reason: string };

/**
 * Whether this entry can be started, and under what command.
 *
 * Pure: no session, no blessed, no filesystem. The view turns an `ok` into a
 * queue-and-teardown and a refusal into a status line.
 */
export function decideRun(door: RunnableDoor | null): RunDecision {
  if (!door) {
    return { ok: false, reason: 'Nothing selected' };
  }

  // A disabled door is one the sysop has deliberately taken out of service.
  // Queueing it would end with the BBS refusing it after this view is gone.
  if (door.enabled === false) {
    const name = (door.command || '').trim();
    return { ok: false, reason: `${name || 'That door'} is disabled` };
  }

  const command = (door.command || '').trim();
  if (!command) {
    // Every door list is built from Commands/<dir>/<CMD>.info, so an entry
    // with no command should not exist - but the list has shown phantoms
    // before, and a blank command would queue an empty command line.
    return { ok: false, reason: 'That entry has no command to run' };
  }

  return { ok: true, command };
}

/** What the action needs from the view, so this module stays free of blessed. */
export interface RunContext {
  door: RunnableDoor | null;
  executeCommand: (command: string) => unknown;
  setStatus: (message: string, colour: 'green' | 'red' | 'yellow') => void;
  /** Called only after the command is queued: it runs when this door exits. */
  teardown: () => void;
}

/**
 * Queue the selected door and stand down, or explain why not.
 *
 * Returns true when the command was queued and the view was torn down.
 */
export function runSelectedDoor(ctx: RunContext): boolean {
  const decision = decideRun(ctx.door);
  if (!decision.ok) {
    ctx.setStatus(decision.reason, 'yellow');
    return false;
  }

  try {
    ctx.executeCommand(decision.command);
  } catch (err: any) {
    ctx.setStatus(`Could not start ${decision.command}: ${err?.message ?? err}`, 'red');
    return false;
  }

  ctx.teardown();
  return true;
}

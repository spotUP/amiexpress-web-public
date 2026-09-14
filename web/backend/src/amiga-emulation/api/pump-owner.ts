/**
 * ONE deasync pump at a time, and whoever is outermost owns it.
 *
 * Two places in the 68K path make an asynchronous thing look synchronous to a
 * door, and both do it with `deasync.loopWhile`:
 *
 *   - `AEDoorLibrary.waitForReply` under `DOOR_ASYNC_WAIT=1`, waiting for the
 *     BBS to reply to a JH_xx message.
 *   - the XIM processor in `session/lifecycle/door-message-callbacks.ts`,
 *     draining a handler's promise for commands 7, 8, 507, 617 and 618
 *     (JH_SF, JH_SG, DISPLAY_FILE, CHECK_TO_DISPLAY, JH_MCI) so a file's
 *     contents reach the socket BEFORE the reply unblocks the door.
 *
 * The second runs inside the first: `waitForReply` calls the XIM processor
 * from within its own loop. So switching the async wait on would nest one
 * pump inside another on exactly those five commands - which is why that flag
 * has sat dark since 2026-04-21 and why the starvation it was written to fix
 * is still live (`thoughts/shared/plans/2026-04-21-aedoor-waitforreply-event-loop.md`).
 *
 * Nesting is not something to make safe; it is something to not do. This is
 * the register that lets the inner site ASK. While a pump is running, the
 * inner site does not start a second one - it leaves its work pending and
 * returns, and the outer loop, which calls it again on every iteration,
 * finds the work finished on a later pass.
 *
 * When nothing is pumping - which is every board today, because the flag is
 * off - `isPumping()` is false and the inner site behaves exactly as it
 * always has. That is deliberate: this file changes nothing until the flag
 * is turned on.
 */

/**
 * Depth rather than a boolean: `waitForReply` is called from a trap handler
 * and a door can issue a command whose handling issues another. Counting
 * means the register still reads true when an inner owner finishes while an
 * outer one is still going.
 */
let depth = 0;

/** True while a deasync pump is running somewhere up the stack. */
export function isPumping(): boolean {
  return depth > 0;
}

/**
 * Run `body` as the owner of the pump.
 *
 * The count is restored in a `finally`, so a throw from inside the loop -
 * or from the emulator underneath it - cannot leave the register stuck on
 * and silently disable every inner drain for the life of the process.
 */
export function ownPump<T>(body: () => T): T {
  depth += 1;
  try {
    return body();
  } finally {
    depth -= 1;
  }
}

/** For tests, and for nothing else: put the register back to nobody pumping. */
export function resetPumpOwner(): void {
  depth = 0;
}

/**
 * THE TEARDOWN THAT COULD NOT HAPPEN WHERE IT WAS ASKED FOR.
 *
 * Under DOOR_ASYNC_WAIT=1 a door waiting in `AEDoorLibrary.waitForReply`
 * pumps the Node event loop from inside a trap handler, so a socket
 * disconnect - a browser reload - arrives re-entrantly, inside the door's
 * own execution. Tearing the session down there would empty the port
 * registry and delete the CPU that the trap handler is still standing in.
 *
 * So a request only STOPS the loop: `isRunning` goes false, the wait is told
 * to give up (`AEDoorLibrary.abandonWaits`), the trap returns NO_CARRIER to
 * the door, the loop condition ends the run, and the lifecycle's `finally`
 * settles the request with nothing left on the emulator's stack. THEN the
 * real `terminate()` runs, fires the exit hook, and AmigaDoorSession does the
 * destructive part. Same order express.e keeps (5147-5150): reqState set,
 * the wait returns, the door unwinds, the node is cleaned.
 *
 * The sysop's board jammed three times on 2026-09-15 through GWall for want
 * of this: the old wait never returned, so it polled the two ports it had
 * just lost for the full ten-minute budget, pumping the event loop each turn.
 */
export interface StoppableState {
  isRunning: boolean;
}

export class DeferredTermination {
  private pending = false;

  /** Stop the loop now; the destructive part happens at `settle`. */
  request(state: StoppableState): void {
    if (!state.isRunning) return;
    this.pending = true;
    state.isRunning = false;
  }

  /**
   * Whether `terminate()` must still get through its "already stopped" guard:
   * a requested termination has set isRunning false and is the one call that
   * has to run anyway. Clears the request, so it is one-shot.
   */
  claim(): boolean {
    const was = this.pending;
    this.pending = false;
    return was;
  }

  /** From the loop's `finally`: run the real teardown if one was requested. */
  settle(terminate: () => void): void {
    if (this.pending) terminate();
  }
}

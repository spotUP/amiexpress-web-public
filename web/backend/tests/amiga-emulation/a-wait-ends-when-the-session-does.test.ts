/**
 * A WAIT ENDS WHEN THE SESSION DOES - express.e:5147-5150.
 *
 * `doPause` and `readChar` stop waiting the moment `reqState<>REQ_STATE_NONE`
 * and hand back RESULT_NO_CARRIER. This port's `waitForReply` had no such
 * exit, and under DOOR_ASYNC_WAIT=1 that is not a theoretical gap: the loop
 * pumps the Node event loop on every turn, so a browser reload is delivered
 * INSIDE the wait. `AmigaDoorSession.terminate()` runs re-entrantly, empties
 * the port registry and deletes the CPU, and control comes back to a loop
 * that knows none of it - which then polled the two ports it had just lost
 * for the full JH_LI/JH_HK budget, pumping the whole event loop each time.
 *
 * That is `[ExecLibrary] Port not found: 0x12230c` / `0x126f00` thousands
 * of times a second, a node that never comes back, and a board that feels
 * jammed. The sysop hit it three times on 2026-09-15 through GWall: "i am
 * stuck in the global wall prompt now", "the whole bbs seems jammed now",
 * "bbs jammed". A one-session probe against the real binary never showed it,
 * because the probe ran without the flag; live runs with it.
 *
 * Driven through the real `waitForReply` on a real AEDoorLibrary, with an
 * exec library whose ports vanish mid-wait exactly as `cleanup()` makes them
 * vanish. The budget for a person-wait command is tens of seconds; the test
 * timeout is five, so the code before this commit fails by running to the
 * budget, and the fixed code returns within milliseconds of the teardown.
 */
import { AEDoorLibrary } from '../../src/amiga-emulation/api/AEDoorLibrary';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function libraryWhosePortsCanVanish() {
  const emulator: any = {
    readMemory32: () => 0, writeMemory32: () => undefined,
    setRegister: () => undefined, getRegister: () => 0,
    readMemory8: () => 0, writeMemory8: () => undefined,
    readString: () => '', writeString: () => undefined,
  };
  let portsRegistered = true;
  let polls = 0;
  const execLibrary: any = {
    getMsg: () => { polls += 1; return 0; },   // the reply never comes
    putMsg: () => undefined,
    replyMsg: () => undefined,
    hasPort: () => portsRegistered,
  };
  const socket: any = { on: () => undefined, emit: () => undefined };
  const library = new AEDoorLibrary(socket, emulator, execLibrary, {}) as any;
  const state = { bbsPortAddr: 0x12230c, replyPortAddr: 0x126f00, messageAddr: 0x3000, dataPtr: 0x4000 };
  return {
    library, state,
    /** What terminate() does to the registry, from inside the pump. */
    tearDown: () => { portsRegistered = false; },
    polls: () => polls,
  };
}

describe('a wait ends when the session does', () => {
  const previous = process.env.DOOR_ASYNC_WAIT;
  afterEach(() => {
    if (previous === undefined) delete process.env.DOOR_ASYNC_WAIT;
    else process.env.DOOR_ASYNC_WAIT = previous;
  });

  it('returns "no reply" within moments of the teardown, not at the end of the budget', () => {
    process.env.DOOR_ASYNC_WAIT = '1';
    const t = libraryWhosePortsCanVanish();

    // The reload lands 60 ms into the wait - delivered by the pump itself.
    setTimeout(t.tearDown, 60);
    const started = Date.now();
    const replied = t.library.waitForReply(t.state, XIMCommand.JH_LI);
    const elapsed = Date.now() - started;

    expect(replied).toBe(false);          // -> dispatchCommand returns -1: no carrier
    expect(elapsed).toBeLessThan(3000);   // the budget is tens of seconds
    // And it stopped POLLING: the flood was the same two ports asked for
    // again and again after they had gone.
    const pollsAtReturn = t.polls();
    expect(pollsAtReturn).toBeGreaterThan(0);
    expect(pollsAtReturn).toBeLessThan(5000);
  }, 5000);

  it('the sync loop stops at the same signal', () => {
    delete process.env.DOOR_ASYNC_WAIT;
    const t = libraryWhosePortsCanVanish();
    t.tearDown();   // already gone when the wait begins

    const replied = t.library.waitForReply(t.state, XIMCommand.JH_LI);

    expect(replied).toBe(false);
    expect(t.polls()).toBe(0);   // it never polled a port it did not have
  });

  it('ends on the explicit signal alone, before any port is touched', () => {
    /*
     * The re-entrant case: a disconnect delivered INSIDE the wait must not
     * clean up yet - deleting the CPU under the trap handler is the crash the
     * old code never lived long enough to reach - so the ports are still
     * there. abandonWaits() is what ends the wait then: express.e's reqState.
     */
    process.env.DOOR_ASYNC_WAIT = '1';
    const t = libraryWhosePortsCanVanish();

    setTimeout(() => t.library.abandonWaits(), 60);
    const started = Date.now();
    const replied = t.library.waitForReply(t.state, XIMCommand.JH_LI);

    expect(replied).toBe(false);
    expect(Date.now() - started).toBeLessThan(3000);
  }, 5000);

  it('still waits, and still hears a reply, while the session is alive', () => {
    // The control: nothing about a live session changed.
    process.env.DOOR_ASYNC_WAIT = '1';
    const t = libraryWhosePortsCanVanish();
    let asked = 0;
    t.library.execLibrary.getMsg = () => (++asked >= 3 ? 0x5000 : 0);

    expect(t.library.waitForReply(t.state, XIMCommand.JH_LI)).toBe(true);
  }, 5000);
});

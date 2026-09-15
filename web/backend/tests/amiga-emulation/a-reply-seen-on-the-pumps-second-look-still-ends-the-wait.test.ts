/**
 * A REPLY SEEN ON THE PUMP'S SECOND LOOK STILL ENDS THE WAIT.
 *
 * deasync.loopWhile evaluates its predicate TWICE per turn:
 *
 *     while (pred()) {            // deasync/index.js:69
 *       process._tickCallback()
 *       if (pred()) binding.run() // deasync/index.js:71
 *     }
 *
 * waitForReply's predicate is not a pure question. It CONSUMES: GetMsg takes
 * the reply off the door's reply port. When the caller's key is delivered by
 * the nextTick drain between the two looks, the second look takes the
 * message and returns false - so `binding.run()` is skipped - and the
 * `while` asks a third time: the port is empty now, the deadline is hours
 * away, and the loop spins until the caller reloads.
 *
 * The live board proved it on 2026-09-15 (run #5, node 2, GWall): the
 * reply-taker stack pointed at the wait's own poll, at deasync/index.js:71,
 * and the same wait's "still waiting" line kept counting afterwards. Every
 * earlier run that worked had taken its reply at :69. "y or n does nothing"
 * (sysop).
 *
 * This test uses the real deasync and the real loop. The stub reply port
 * answers on the SECOND ask only, and only once - the shape of a reply that
 * lands between the two looks.
 */
import { AEDoorLibrary } from '../../src/amiga-emulation/api/AEDoorLibrary';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function libraryWhoseReplyLandsBetweenTheLooks() {
  const emulator: any = {
    readMemory32: () => 0, writeMemory32: () => undefined,
    setRegister: () => undefined, getRegister: () => 0,
    readMemory8: () => 0, writeMemory8: () => undefined,
    readString: () => '', writeString: () => undefined,
  };
  let asked = 0;
  const execLibrary: any = {
    // Empty on the first look, the reply on the second, empty ever after -
    // a GetMsg consumes what it returns.
    getMsg: () => (++asked === 2 ? 0x5000 : 0),
    putMsg: () => undefined,
    replyMsg: () => undefined,
    hasPort: () => true,
  };
  const socket: any = { on: () => undefined, emit: () => undefined };
  const library = new AEDoorLibrary(socket, emulator, execLibrary, {}) as any;
  const state = { bbsPortAddr: 0x12230c, replyPortAddr: 0x126f00, messageAddr: 0x3000, dataPtr: 0x4000 };
  return { library, state, asked: () => asked };
}

describe('a reply seen on the pump\'s second look', () => {
  const previous = process.env.DOOR_ASYNC_WAIT;
  afterEach(() => {
    if (previous === undefined) delete process.env.DOOR_ASYNC_WAIT;
    else process.env.DOOR_ASYNC_WAIT = previous;
  });

  it('still ends the wait, at once, rather than spinning to the deadline', () => {
    process.env.DOOR_ASYNC_WAIT = '1';
    const t = libraryWhoseReplyLandsBetweenTheLooks();

    const started = Date.now();
    const replied = t.library.waitForReply(t.state, XIMCommand.JH_LI);
    const elapsed = Date.now() - started;

    expect(replied).toBe(true);
    // Before the fix this spent the whole MACHINE_WAIT_MS budget (5 s).
    expect(elapsed).toBeLessThan(1000);
    // And it did not go on asking an empty port after it had its answer.
    expect(t.asked()).toBeLessThanOrEqual(3);
  });
});

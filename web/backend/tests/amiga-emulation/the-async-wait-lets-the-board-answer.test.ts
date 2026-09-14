/**
 * Under DOOR_ASYNC_WAIT=1 the board keeps answering while a door waits.
 *
 * This is the whole point of the flag, and the thing the 2026-09-13 outage
 * was: a door sat in `waitForReply`'s tight loop, the JS event loop never
 * turned, and the board stopped answering anything - `/health` gave nothing
 * from inside its own container while fifteen callers queued on the socket.
 *
 * The sync loop cannot let a timer run: it is a `for` loop that returns only
 * when the reply lands or 10000 iterations pass. The async loop pumps libuv,
 * so timers, socket events and promise continuations get their turn - which
 * is what a health check is.
 *
 * Driven through the real `waitForReply` on a real AEDoorLibrary, with an
 * exec library that never replies, so the loop runs its full deadline and the
 * question is only whether anything else got to run while it did.
 */

import { AEDoorLibrary } from '../../src/amiga-emulation/api/AEDoorLibrary';

/** Enough of the emulator and exec library for waitForReply to run. */
function libraryUnderTest() {
  const emulator: any = {
    readMemory32: () => 0,
    writeMemory32: () => undefined,
    setRegister: () => undefined,
    getRegister: () => 0,
    readMemory8: () => 0,
    writeMemory8: () => undefined,
    readString: () => '',
    writeString: () => undefined,
  };
  const execLibrary: any = {
    // The door's reply never comes: the loop runs to its deadline.
    getMsg: () => 0,
    // The session is alive throughout - its ports stay registered.
    hasPort: () => true,
    putMsg: () => undefined,
    replyMsg: () => undefined,
  };

  // (socket, emulator, execLibrary, sessionData) - the socket is only used
  // to hang an input handler on.
  const socket: any = { on: () => undefined, emit: () => undefined };
  const library = new AEDoorLibrary(socket, emulator, execLibrary, {}) as any;
  const state = {
    bbsPortAddr: 0x1000,
    replyPortAddr: 0x2000,
    messageAddr: 0x3000,
    dataPtr: 0x4000,
  };
  return { library, state };
}

/** How many times a 10 ms timer fired while `body` ran. */
async function timerTicksDuring(body: () => void): Promise<number> {
  let ticks = 0;
  const timer = setInterval(() => { ticks += 1; }, 10);
  try {
    body();
  } finally {
    clearInterval(timer);
  }
  return ticks;
}

describe('the async wait lets the board answer', () => {
  const previous = process.env.DOOR_ASYNC_WAIT;
  afterEach(() => {
    if (previous === undefined) delete process.env.DOOR_ASYNC_WAIT;
    else process.env.DOOR_ASYNC_WAIT = previous;
  });

  it('turns the event loop while a door waits, where the sync loop cannot', async () => {
    const { library, state } = libraryUnderTest();

    process.env.DOOR_ASYNC_WAIT = '1';
    const asyncTicks = await timerTicksDuring(() => library.waitForReply(state, 7));

    // A timer firing at all is the property: the loop turned, so a health
    // check, a socket event or an Express continuation could have run too.
    expect(asyncTicks).toBeGreaterThan(0);
  }, 20000);

  it('and the sync loop yields nothing while it runs', async () => {
    const { library, state } = libraryUnderTest();

    delete process.env.DOOR_ASYNC_WAIT;
    const syncTicks = await timerTicksDuring(() => library.waitForReply(state, 7));

    // Nothing else ran. Read this precisely: the sync loop is bounded by
    // ITERATIONS, not time, so against these stubs it returns in a couple of
    // milliseconds and zero ticks proves only that it did not yield while it
    // ran. What makes it the outage on a real board is that each iteration
    // does real work (the XIM drain) - the loop then holds the thread for as
    // long as that takes, and still yields nothing. The contrast with the
    // case above is the point: five seconds of async wait let a timer fire
    // throughout; no amount of sync wait lets one fire at all.
    expect(syncTicks).toBe(0);
  }, 20000);
});

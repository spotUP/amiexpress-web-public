/**
 * `waitForReply`'s deadline is a stop for a wedged BOARD. It cannot tell that
 * from a caller who is still typing, and on 2026-09-20 it did not try.
 *
 * What the live board logged, with the door's own E source beside it:
 *
 *   gwall.e:1769  PROC query(...)  res := Prompt(diface, maxlen, promptText)
 *   gwall.e:1785  PROC getChar(...) key := HotKey(diface, '')
 *                                    inBuffer[0] := key
 *   gwall.e:1436  IF StrCmp(inputBuffer,'W') ... WHILE EstrLen(colour)=0
 *
 *   17:54:20  [AEDoorLibrary] No reply for command 5 after 159 iterations
 *             (async wait) - wait ended: budget
 *   17:54:33  [AEDoorLibrary] HotKey() -> char: 0 (' ')     <- 1 ms after the
 *   17:54:34  [AEDoorLibrary] HotKey() -> char: 0 (' ')        prompt, and
 *   17:54:37  [AEDoorLibrary] HotKey() -> char: 0 (' ')        before any key
 *
 * Command 5 is `JH_PM`, which is what `Prompt()` sends. The caller spent
 * thirteen seconds typing a comment, the five-second machine stop expired on
 * him, and the board replied to that message afterwards - onto the same reply
 * port the next wait polls. From then on every command was answered by the
 * previous command's reply: `HotKey()` returned instantly, read an unfilled
 * buffer, and handed the door character 0. `StrCmp` rejected it, the `WHILE`
 * drew the colour menu again, and the door spun - at 100% CPU, which is how
 * the same door took the whole board down for two hours forty-seven minutes
 * earlier that afternoon.
 *
 * Two things had to be true and were not:
 *   1. time spent waiting for a PERSON does not count against the board's
 *      deadline (whatever command carried the prompt - a `(Pause)` inside an
 *      ordinary write is a person too), and
 *   2. a wait that does give up must not leave its reply to be eaten by the
 *      next one.
 */
import { AEDoorLibrary } from '../../src/amiga-emulation/api/AEDoorLibrary';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

/** Enough emulator and exec library for the real wait loop to run. */
function libraryUnderTest(opts: { replies: () => number }) {
  const emulator: any = {
    readMemory: () => 0,
    readMemory32: () => 0,
    writeMemory: () => undefined,
    writeMemory32: () => undefined,
    setRegister: () => undefined,
    getRegister: () => 0,
    readString: () => '',
    writeString: () => undefined,
    pause: () => undefined,
    resume: () => undefined,
  };
  const execLibrary: any = {
    getMsg: () => opts.replies(),
    hasPort: () => true,
    putMsg: () => undefined,
    replyMsg: () => undefined,
  };
  const socket: any = { on: () => undefined, emit: () => undefined };
  const library = new AEDoorLibrary(socket, emulator, execLibrary, {}) as any;
  const state = {
    bbsPortAddr: 0x1000,
    replyPortAddr: 0x2000,
    messageAddr: 0x3000,
    dataPtr: 0x4000,
    stringPtr: 0x5000,
  };
  return { library, state };
}

describe('a deadline that measures the board', () => {
  it('does not expire on a caller who is still typing at a prompt', () => {
    /*
     * The machine stop is five seconds. The caller here is "typing" for
     * seven - the shape of the live failure, where a comment took thirteen -
     * on a command the board normally answers itself, which is the case a
     * list of person-commands cannot cover.
     */
    let parked = true;
    const parkedFor = 7000;
    const { library, state } = libraryUnderTest({ replies: () => 0 });
    library.setCallerWaitProbe(() => parked);
    setTimeout(() => { parked = false; }, parkedFor);

    const startedAt = Date.now();
    const replied = library.waitForReply(state, XIMCommand.JH_SM);
    const waited = Date.now() - startedAt;

    // Nothing ever replied, so the wait still ends - but only after the
    // caller stopped being the thing it was waiting for. Before the fix it
    // ended at 5 s, mid-keystroke, and everything after it was one reply out.
    expect(replied).toBe(false);
    expect(waited).toBeGreaterThan(parkedFor);
  }, 30000);

  it('gives the node back even if nobody ever answers the prompt', () => {
    // Parked for ever is a caller who walked away. The hold is not infinite:
    // HUMAN_WAIT_CEILING_MS ends it. Proved here only as far as "the hold is
    // bounded in code" - ten minutes is too long to sit through in a suite -
    // by reading the ceiling the loop compares against.
    const { HUMAN_WAIT_CEILING_MS } = require('../../src/amiga-emulation/api/wait-budget');
    expect(HUMAN_WAIT_CEILING_MS).toBeGreaterThan(60_000);
    expect(HUMAN_WAIT_CEILING_MS).toBeLessThanOrEqual(60 * 60 * 1000);
  });
});

describe('a reply owed to a wait that gave up', () => {
  // The sync loop (DOOR_ASYNC_WAIT=0) counts iterations rather than
  // milliseconds, so the same code path proves the rule in a few ms instead
  // of the five seconds the live loop would take.
  const previous = process.env.DOOR_ASYNC_WAIT;
  beforeAll(() => { process.env.DOOR_ASYNC_WAIT = '0'; });
  afterAll(() => {
    if (previous === undefined) delete process.env.DOOR_ASYNC_WAIT;
    else process.env.DOOR_ASYNC_WAIT = previous;
  });

  it('is thrown away instead of answering the next command', () => {
    // getMsg CONSUMES: a message is taken off the port once, exactly as
    // exec does. A fake that kept handing the same message back would let a
    // discarded reply be re-taken on the next iteration and hide the bug.
    let messageWaiting = 0;
    const { library, state } = libraryUnderTest({
      replies: () => {
        const addr = messageWaiting;
        messageWaiting = 0;
        return addr;
      },
    });

    // 1. A wait nobody answers. The board still owes this message a reply.
    expect(library.waitForReply(state, XIMCommand.JH_PM)).toBe(false);
    expect(library.hasStaleRepliesOwed()).toBe(true);

    // 2. The late reply arrives while the NEXT command is waiting. It
    //    belongs to the command above; believing it is what made HotKey()
    //    return character 0 to GWall a millisecond after each prompt.
    messageWaiting = 0x126dfe;
    expect(library.waitForReply(state, XIMCommand.JH_HK)).toBe(false);

    // This wait went unanswered in its turn, so one is owed again - the
    // door is told "no key", which is true, instead of being handed the
    // previous command's reply, which is not.
    expect(library.hasStaleRepliesOwed()).toBe(true);
  }, 30000);

  it('does not stand in the way of a reply that is this command\'s own', () => {
    // The control: nothing was abandoned, so the first message on the port
    // is the answer and the wait takes it.
    let messageWaiting = 0x126dfe;
    const { library, state } = libraryUnderTest({
      replies: () => {
        const addr = messageWaiting;
        messageWaiting = 0;
        return addr;
      },
    });

    expect(library.hasStaleRepliesOwed()).toBe(false);
    expect(library.waitForReply(state, XIMCommand.JH_HK)).toBe(true);
  }, 30000);
});

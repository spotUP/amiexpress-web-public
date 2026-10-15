/**
 * The XIM processor leaves its drain to the outer pump instead of starting
 * a second one.
 *
 * `AEDoorLibrary.waitForReply` under `DOOR_ASYNC_WAIT=1` pumps the event loop
 * with `deasync.loopWhile` and calls this processor on every iteration. The
 * processor pumps too, for commands 7, 8, 507, 617 and 618 (JH_SF, JH_SG,
 * DISPLAY_FILE, CHECK_TO_DISPLAY, JH_MCI), so that a file's contents reach
 * the socket before the reply unblocks the door. One inside the other is the
 * hazard that has kept that flag dark since 2026-04-21 - and the starvation
 * it was written to fix took the live board down on 2026-09-13.
 *
 * So: while somebody else owns the pump, the processor registers what it is
 * waiting for and RETURNS. The outer loop advances only when this callback
 * returns, so blocking here would deadlock the very thing being waited for.
 * The door is not replied to, so it stays waiting and the ordering the drain
 * exists for is kept; a later pass finds the promise settled and finishes.
 *
 * Driven through the real installMessageCallbacks with stubs, because the
 * property is about WHEN the callback returns and whether it replied - not
 * about anything a source read could show.
 */

import { installMessageCallbacks } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';
import { ownPump, resetPumpOwner } from '../../src/amiga-emulation/api/pump-owner';

const JH_SF = 7;       // one of the five commands whose handler is drained
const MSG_ADDR = 0x4000;

/** The processor the real installer hands to AEDoorLibrary. */
function buildProcessor(options: {
  settle: Promise<void>;
  replyHandled?: () => boolean;
}) {
  let processor: ((bbsPortAddr: number) => void) | null = null;
  const replies: number[] = [];
  let messagesLeft = 1;

  const ximProtocol: any = {
    parseMessage: () => ({ command: JH_SF, data: 0, msgAddr: MSG_ADDR }),
    handleMessage: () => options.settle,
    wasReplyHandled: options.replyHandled ?? (() => false),
    isWaitingForLineInput: () => false,
    isShuttingDown: () => false,
    hasQueuedInput: () => false,
  };

  const deps: any = {
    libraryManager: {
      aedoorLibrary: { setXIMProcessor: (fn: any) => { processor = fn; } },
      execLibrary: {
        // One message on the port, then nothing - the door is waiting.
        getMsg: () => (messagesLeft-- > 0 ? MSG_ADDR : 0),
        replyMsg: (addr: number) => { replies.push(addr); },
        // installMessageCallbacks also installs path B, which is not what
        // this is about; it needs somewhere to hang its callback.
        setDoorMessageCallback: () => undefined,
      },
    },
    emulator: { pause: () => undefined },
    executionState: {},
    getXimProtocol: () => ximProtocol,
    markUsingDoorMessageCallback: () => undefined,
    incrementMessagesHandled: () => undefined,
    doorMessageCallback: undefined,
  };

  installMessageCallbacks(deps);
  return { call: () => processor!(0x1000), replies, ximProtocol };
}

describe('the XIM processor does not nest a pump', () => {
  afterEach(() => resetPumpOwner());

  it('returns without replying while somebody else owns the pump', () => {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => { settle = resolve; });
    const p = buildProcessor({ settle: promise });

    // What waitForReply does: call the processor from inside its own pump.
    const started = Date.now();
    ownPump(() => p.call());

    // Returned promptly - it did not sit in a second deasync loop waiting
    // out the 5 s handler deadline.
    expect(Date.now() - started).toBeLessThan(500);
    // And the door is still waiting: no reply went out ahead of the file.
    expect(p.replies).toEqual([]);
    settle();
  });

  it('finishes the message on a later pass, once the promise has settled', async () => {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => { settle = resolve; });
    const p = buildProcessor({ settle: promise });

    ownPump(() => p.call());
    expect(p.replies).toEqual([]);

    settle();
    await promise;

    // The outer loop calls the processor again; this pass finds the work done.
    ownPump(() => p.call());
    expect(p.replies).toEqual([MSG_ADDR]);
  });

  it('does not reply twice when the handler already replied itself', () => {
    let settle!: () => void;
    const promise = new Promise<void>((resolve) => { settle = resolve; });
    const p = buildProcessor({ settle: promise, replyHandled: () => true });

    ownPump(() => p.call());
    settle();
    ownPump(() => p.call());

    expect(p.replies).toEqual([]);
  });
});

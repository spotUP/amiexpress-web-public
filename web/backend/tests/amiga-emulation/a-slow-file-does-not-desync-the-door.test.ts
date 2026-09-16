/**
 * A SLOW FILE DOES NOT DESYNC THE DOOR.
 *
 * The sysop's board, 2026-09-16, every time the Bulls door showed the
 * Super-AmiLog (`B 6`): five seconds of nothing, then
 *
 *   doorMessageCallback: async handler for cmd=8 did not resolve within
 *   5000ms - falling through (door may be desynced)
 *
 * and only THEN the bulletin. The file opens with `~f`, so JH_SF takes the
 * MCI path, whose first `await` is a microtask - and the direct-XIM callback
 * runs inside the door's PutMsg trap, inside an emulator batch that is
 * itself a promise continuation under the async wait. V8 does not run
 * microtasks from inside a microtask, so the deasync drain spun out its
 * whole deadline with the handler frozen at its first await, and the
 * fall-through released the door before the file was even read. The pause's
 * own reply later landed on a message the door had already been freed from.
 *
 * Under the async wait the callback must therefore NOT drain: it returns,
 * the batch ends, the handler runs on the event loop and replies when it
 * has emitted, and the door - which sends nothing further until WaitPort
 * hands it that reply - waits the way it waits for anything.
 *
 * The handler here does its work on a TIMER, not a microtask, because jest's
 * sandbox would let a microtask through where the real trap does not; a
 * timer is a thing a spinning drain would have needed the event loop for
 * either way, and it is the drain's absence that is being proved: the
 * callback comes back before the work is done.
 */
import { installMessageCallbacks } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';

const JH_SF = 8;
const WORK_MS = 40;

function build(env: string | undefined) {
  if (env === undefined) delete process.env.DOOR_ASYNC_WAIT;
  else process.env.DOOR_ASYNC_WAIT = env;

  const wire: string[] = [];
  const replyHandled = { value: false };
  const xim = {
    parseMessage: (msgAddr: number) => ({ msgAddr, command: msgAddr }),
    hasQueuedInput: () => false,
    isWaitingForLineInput: () => false,
    isShuttingDown: () => false,
    wasReplyHandled: () => replyHandled.value,
    handleMessage: (_msg: { command: number }) => {
      replyHandled.value = false;
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          wire.push('emit:FILE_BODY');
          replyHandled.value = true;
          wire.push('reply');
          resolve();
        }, WORK_MS);
      });
    },
  };
  let callback: ((portAddr: number, msgAddr: number) => void) | null = null;
  const execLibrary = {
    getMsg: () => 0,
    replyMsg: (msgAddr: number) => { wire.push(`fallback-replyMsg:${msgAddr}`); },
    setDoorMessageCallback: (cb: (portAddr: number, msgAddr: number) => void) => { callback = cb; },
    getPortName: () => 'aedoorport1',
    getDoorPortAddress: () => 0xdead0001,
    removeMessageFromPort: () => {},
  };
  installMessageCallbacks({
    libraryManager: { aedoorLibrary: { setXIMProcessor: () => {} }, execLibrary } as any,
    emulator: { pause: () => {}, readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {} } as any,
    executionState: {} as any,
    getXimProtocol: () => xim as any,
    markUsingDoorMessageCallback: () => {},
    incrementMessagesHandled: () => {},
  });
  if (!callback) throw new Error('doorMessageCallback was not installed');
  return { wire, send: () => callback!(0xdead0001, JH_SF) };
}

const savedEnv = process.env.DOOR_ASYNC_WAIT;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.DOOR_ASYNC_WAIT;
  else process.env.DOOR_ASYNC_WAIT = savedEnv;
});

describe('JH_SF whose handler has real work to await, under the async wait', () => {
  it('returns from the trap at once, with nothing sent and no fall-through reply', () => {
    const h = build(undefined); // the default: the async wait is on
    const started = Date.now();
    h.send();
    expect(Date.now() - started).toBeLessThan(WORK_MS);
    expect(h.wire).toEqual([]);
  });

  it('lets the handler finish on the event loop and reply for itself', async () => {
    const h = build('1');
    h.send();
    await new Promise((r) => setTimeout(r, WORK_MS * 3));
    expect(h.wire).toEqual(['emit:FILE_BODY', 'reply']);
  });
});

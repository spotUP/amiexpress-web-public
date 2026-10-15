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
 * the batch ends, the handler runs on the event loop and replies when it has
 * emitted. And the door must not run on meanwhile: Bulls calls WaitPort
 * ONCE after JH_SF, takes the nothing it gets for the reply and sends
 * JH_SHUTDOWN six milliseconds later - the first deploy of the no-drain
 * callback put the menu prompt on the screen BEFORE the bulletin (live log,
 * 17:36:55). So the emulator is paused until the handler resolves, or, when
 * the handler stopped at a `More(y/n/ns)?` prompt, until the caller answers.
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

function build(env: string | undefined, opts: { pausesAtMore?: boolean } = {}) {
  if (env === undefined) delete process.env.DOOR_ASYNC_WAIT;
  else process.env.DOOR_ASYNC_WAIT = env;

  const wire: string[] = [];
  const replyHandled = { value: false };
  const waitingForPause = { value: false };
  const xim = {
    parseMessage: (msgAddr: number) => ({ msgAddr, command: msgAddr }),
    hasQueuedInput: () => false,
    // io.ts's isWaitingForLineInput is true for the More prompt as well.
    isWaitingForLineInput: () => waitingForPause.value,
    isShuttingDown: () => false,
    wasReplyHandled: () => replyHandled.value,
    handleMessage: (_msg: { command: number }) => {
      replyHandled.value = false;
      return new Promise<void>((resolve) => {
        setTimeout(() => {
          wire.push('emit:FILE_BODY');
          if (opts.pausesAtMore) {
            // checkForPause: the prompt goes up, the reply waits for the answer.
            wire.push('emit:MORE');
            waitingForPause.value = true;
            emulator.pause();
          } else {
            replyHandled.value = true;
            wire.push('reply');
          }
          resolve();
        }, WORK_MS);
      });
    },
  };
  let paused = false;
  const emulator = {
    pause: () => { paused = true; wire.push('emulator:pause'); },
    resume: () => { paused = false; wire.push('emulator:resume'); },
    isPaused: () => paused,
    readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {},
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
    emulator: emulator as any,
    executionState: {} as any,
    getXimProtocol: () => xim as any,
    markUsingDoorMessageCallback: () => {},
    incrementMessagesHandled: () => {},
  });
  if (!callback) throw new Error('doorMessageCallback was not installed');
  return { wire, send: () => callback!(0xdead0001, JH_SF), isPaused: () => paused };
}

const savedEnv = process.env.DOOR_ASYNC_WAIT;
afterEach(() => {
  if (savedEnv === undefined) delete process.env.DOOR_ASYNC_WAIT;
  else process.env.DOOR_ASYNC_WAIT = savedEnv;
});

const later = () => new Promise((r) => setTimeout(r, WORK_MS * 3));

describe('JH_SF whose handler has real work to await, under the async wait', () => {
  it('returns from the trap at once with the door stopped, nothing sent and no fall-through reply', () => {
    const h = build(undefined); // the default: the async wait is on
    const started = Date.now();
    h.send();
    expect(Date.now() - started).toBeLessThan(WORK_MS);
    expect(h.wire).toEqual(['emulator:pause']);
    expect(h.isPaused()).toBe(true);
  });

  it('lets the handler finish on the event loop, reply for itself, and then restarts the door', async () => {
    const h = build('1');
    h.send();
    await later();
    expect(h.wire).toEqual(['emulator:pause', 'emit:FILE_BODY', 'reply', 'emulator:resume']);
    expect(h.isPaused()).toBe(false);
  });

  it('leaves the door stopped when the handler is holding a More prompt', async () => {
    const h = build('1', { pausesAtMore: true });
    h.send();
    await later();
    // The answer to the prompt restarts the door (completePauseInput), not this.
    expect(h.wire).toEqual(['emulator:pause', 'emit:FILE_BODY', 'emit:MORE', 'emulator:pause']);
    expect(h.isPaused()).toBe(true);
  });
});

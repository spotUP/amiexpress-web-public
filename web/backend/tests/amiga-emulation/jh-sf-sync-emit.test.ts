/**
 * Regression: trap-sync XIMProcessor must drain async-output handlers
 * (JH_SF, JH_SG, JH_MCI, DISPLAY_FILE, CHECK_TO_DISPLAY) before checking
 * wasReplyHandled / falling back to replyMsg.
 *
 * Bug history:
 *   AEDoor.library's waitForReply is a tight synchronous loop holding the
 *   JS event loop. It calls our XIMProcessor callback once per iteration.
 *   The callback used to fire-and-forget handleMessage and check
 *   wasReplyHandled() synchronously. For async-output commands the
 *   handler's .then() chain hadn't run, so the fallback execLib.replyMsg()
 *   path unblocked the door's waitForReply BEFORE the file bytes hit the
 *   socket. The door's next JH_WRITE then landed ahead of the file
 *   content, breaking absolute cursor positioning in dRE!Wall, J door,
 *   MultiTop, etc. (See door-message-callbacks.ts ASYNC_OUTPUT_COMMANDS
 *   commentary.)
 *
 * Test strategy:
 *   In production the trap-sync XIMProcessor (and Path B's doorMessageCallback
 *   in the legacy synchronous mode) drains the handler's promise with
 *   deasync.loopWhile. Real deasync cannot drain promise continuations from
 *   inside a Jest test (jest sandboxes promise / immediate scheduling -
 *   verified with a smoke test), so deasync is replaced by a stand-in whose
 *   loopWhile does what the real one exists to do: it lets pending event-loop
 *   work run while the caller waits. The regression is then driven in layers:
 *
 *     (A) Behavioural contract - exercise the real installMessageCallbacks
 *         with a synchronous-resolving stub handler whose effects (emit +
 *         replyHandled flip) land BEFORE the returned promise resolves.
 *         This locks the invariant that "if handleShowFile finishes its
 *         work before its promise resolves, the trap path skips the
 *         fallback replyMsg" - which is what dRE!Wall depends on.
 *
 *     (B) The drain itself, Path A - a GENUINELY async handler (its emit and
 *         reply only land when the event loop runs) for each of the five
 *         async-output commands. The file body must be on the wire and the
 *         fallback replyMsg skipped by the time the processor returns. With
 *         the drain gone, or a command dropped from ASYNC_OUTPUT_COMMANDS,
 *         the fallback reply releases the door before the file body.
 *
 *     (D) The drain itself, Path B (doorMessageCallback) in the legacy
 *         synchronous mode (DOOR_ASYNC_WAIT=0): the same genuinely async
 *         handler's file body must land before the callback returns.
 */

import { installMessageCallbacks } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';

/*
 * deasync stand-in. loopWhile(pred) runs the work a real event loop would
 * run while pred() holds - here, the pending bodies of genuinely async stub
 * handlers - and counts that it was asked to wait at all.
 */
const mockPendingEventLoopWork: Array<() => void> = [];
const mockDrain = { calls: 0 };
jest.mock('deasync', () => ({
  loopWhile: (pred: () => boolean) => {
    mockDrain.calls++;
    while (pred() && mockPendingEventLoopWork.length > 0) mockPendingEventLoopWork.shift()!();
  },
}));

// XIMCommand enum values (web/backend/src/amiga-emulation/xim/types.ts)
const JH_WRITE = 2;             // sync output, NOT async-output
const JH_SG = 7;                // async output (Show GFile)
const JH_SF = 8;                // async output (Show File)
const JH_MCI = 507;             // async output
const DISPLAY_FILE = 617;       // async output (non-stop file display)
const CHECK_TO_DISPLAY = 618;   // async output (non-stop gfile/ACS search)

interface FakeMsg {
  msgAddr: number;
  command: number;
}

/**
 * Stub XIMProtocol. handleMessage is async (returns a Promise) but its
 * effects (emit + replyHandled=true) are applied SYNCHRONOUSLY in the
 * function body — same ordering the real reply() in xim/io.ts uses,
 * which sets state.replyHandled=true BEFORE calling execLib.replyMsg().
 */
function buildStubXim(emitWire: string[]) {
  const replyHandled = { value: false };
  const xim = {
    parseMessage: (msgAddr: number): FakeMsg => ({
      msgAddr,
      command: msgAddr,
    }),
    hasQueuedInput: () => false,
    isWaitingForLineInput: () => false,
    isShuttingDown: () => false,
    wasReplyHandled: () => replyHandled.value,
    handleMessage: async (msg: FakeMsg) => {
      replyHandled.value = false; // mirrors XIMProtocol.handleMessage line 494
      // For async-output commands, the real handler awaits file I/O +
      // parseMciCodes. We model that work as a synchronous emit so the
      // stub's effects are observable BEFORE the returned promise's
      // microtask continuations. This isolates the test from jest's
      // microtask sandbox — see file header.
      if (
        msg.command === JH_SF ||
        msg.command === JH_SG ||
        msg.command === JH_MCI ||
        msg.command === DISPLAY_FILE ||
        msg.command === CHECK_TO_DISPLAY
      ) {
        emitWire.push(`emit:FILE_BODY:${msg.command}`);
      } else if (msg.command === JH_WRITE) {
        emitWire.push(`emit:WRITE`);
      }
      // io.ts reply() sets state.replyHandled=true; mirror that ordering.
      replyHandled.value = true;
    },
  };
  return { xim, replyHandled };
}

function buildHarness(): {
  wire: string[];
  replyHandled: { value: boolean };
  send: (cmd: number) => void;
} {
  const wire: string[] = [];
  const { xim, replyHandled } = buildStubXim(wire);

  let processor: ((bbsPortAddr: number) => void) | null = null;
  const aedoorLibrary = {
    setXIMProcessor: (cb: (bbsPortAddr: number) => void) => {
      processor = cb;
    },
  };

  let nextMsgAddr = 0;
  const execLibrary = {
    getMsg: (_port: number) => {
      const m = nextMsgAddr;
      nextMsgAddr = 0;
      return m;
    },
    replyMsg: (msgAddr: number) => {
      wire.push(`fallback-replyMsg:${msgAddr}`);
    },
    setDoorMessageCallback: () => {},
  };

  installMessageCallbacks({
    libraryManager: { aedoorLibrary, execLibrary } as any,
    emulator: { pause: () => {} } as any,
    executionState: {} as any,
    getXimProtocol: () => xim as any,
    markUsingDoorMessageCallback: () => {},
    incrementMessagesHandled: () => {},
  });

  if (!processor) throw new Error('XIMProcessor was not installed');

  return {
    wire,
    replyHandled,
    send(cmd: number) {
      nextMsgAddr = cmd;
      processor!(0xdead0001);
    },
  };
}

describe('(A) trap-sync XIMProcessor: handler contract', () => {
  // The stub replies synchronously, so the drain is skipped here; (B) is
  // where a handler that has not yet replied is driven through it.
  jest.setTimeout(15000);

  test('JH_SF emit lands and fallback replyMsg is skipped', () => {
    const h = buildHarness();
    h.send(JH_SF);

    expect(h.wire).toContain(`emit:FILE_BODY:${JH_SF}`);
    expect(h.replyHandled.value).toBe(true);
    expect(h.wire.find((e) => e.startsWith('fallback-replyMsg'))).toBeUndefined();
  });

  test('sync JH_WRITE keeps the existing fast path (no drain, no fallback)', () => {
    const h = buildHarness();
    h.send(JH_WRITE);

    expect(h.wire).toContain('emit:WRITE');
    expect(h.replyHandled.value).toBe(true);
    expect(h.wire.find((e) => e.startsWith('fallback-replyMsg'))).toBeUndefined();
  });

  test('handler that fails to reply triggers the fallback replyMsg path', () => {
    // cmd 999 is not in ASYNC_OUTPUT_COMMANDS — no drain — fast path.
    const wire: string[] = [];
    let processor: ((bbsPortAddr: number) => void) | null = null;
    const aedoorLibrary = {
      setXIMProcessor: (cb: any) => { processor = cb; },
    };
    let nextMsgAddr = 0;
    const execLibrary = {
      getMsg: () => { const m = nextMsgAddr; nextMsgAddr = 0; return m; },
      replyMsg: (msgAddr: number) => wire.push(`fallback-replyMsg:${msgAddr}`),
      setDoorMessageCallback: () => {},
    };
    const xim = {
      parseMessage: (a: number) => ({ msgAddr: a, command: a }),
      hasQueuedInput: () => false,
      isWaitingForLineInput: () => false,
      isShuttingDown: () => false,
      wasReplyHandled: () => false,
      handleMessage: async () => { /* never replies */ },
    };

    installMessageCallbacks({
      libraryManager: { aedoorLibrary, execLibrary } as any,
      emulator: { pause: () => {} } as any,
      executionState: {} as any,
      getXimProtocol: () => xim as any,
      markUsingDoorMessageCallback: () => {},
      incrementMessagesHandled: () => {},
    });

    nextMsgAddr = 999;
    processor!(0xdead0002);

    expect(wire.some((e) => e.startsWith('fallback-replyMsg'))).toBe(true);
  });
});

/**
 * A stub XIMProtocol whose async-output handler is GENUINELY async: its emit
 * and reply only happen when the event loop runs (mockPendingEventLoopWork), as
 * the real handler's file read / MCI parse does. Without a drain the
 * processor sees replyHandled=false and releases the door first.
 */
function buildTrulyAsyncXim(wire: string[]) {
  const replyHandled = { value: false };
  const xim = {
    parseMessage: (msgAddr: number): FakeMsg => ({ msgAddr, command: msgAddr }),
    hasQueuedInput: () => false,
    isWaitingForLineInput: () => false,
    isShuttingDown: () => false,
    wasReplyHandled: () => replyHandled.value,
    handleMessage: (msg: FakeMsg) => {
      replyHandled.value = false;
      return new Promise<void>((resolve) => {
        mockPendingEventLoopWork.push(() => {
          wire.push(`emit:FILE_BODY:${msg.command}`);
          replyHandled.value = true;
          resolve();
        });
      });
    },
  };
  return { xim, replyHandled };
}

const ASYNC_OUTPUT = [
  ['JH_SG', JH_SG],
  ['JH_SF', JH_SF],
  ['JH_MCI', JH_MCI],
  ['DISPLAY_FILE', DISPLAY_FILE],
  ['CHECK_TO_DISPLAY', CHECK_TO_DISPLAY],
] as const;

describe('(B) trap-sync XIMProcessor: the drain waits for a genuinely async handler', () => {
  beforeEach(() => {
    mockPendingEventLoopWork.length = 0;
    mockDrain.calls = 0;
  });

  test.each(ASYNC_OUTPUT)('%s: the file body is on the wire before the processor returns, and the door is not released early', (_name, cmd) => {
    const wire: string[] = [];
    const { xim, replyHandled } = buildTrulyAsyncXim(wire);
    let processor: ((bbsPortAddr: number) => void) | null = null;
    let nextMsgAddr = 0;
    installMessageCallbacks({
      libraryManager: {
        aedoorLibrary: { setXIMProcessor: (cb: (a: number) => void) => { processor = cb; } },
        execLibrary: {
          getMsg: () => { const m = nextMsgAddr; nextMsgAddr = 0; return m; },
          replyMsg: (msgAddr: number) => wire.push(`fallback-replyMsg:${msgAddr}`),
          setDoorMessageCallback: () => {},
        },
      } as any,
      emulator: { pause: () => {} } as any,
      executionState: {} as any,
      getXimProtocol: () => xim as any,
      markUsingDoorMessageCallback: () => {},
      incrementMessagesHandled: () => {},
    });

    nextMsgAddr = cmd;
    processor!(0xdead0001);

    expect(mockDrain.calls).toBeGreaterThan(0);
    expect(wire).toEqual([`emit:FILE_BODY:${cmd}`]);
    expect(replyHandled.value).toBe(true);
  });
});

/**
 * (C) Path B (doorMessageCallback / direct-XIM doors). Same race as Path
 * A but at a different boundary: dRE!Wall, Bulls, JoinCnf, RTW, MultiTop
 * PutMsg directly to AEDoorPort via FindPort, so the trap-sync
 * XIMProcessor never runs for them — the door's PutMsg invokes
 * doorMessageCallback. Without the same drain, the .then() chain hadn't
 * run by the time this callback returned, the door's emulator thread
 * issued the next PutMsg (JH_WRITE), and that JH_WRITE landed on the
 * socket BEFORE the JH_SF file body. dRE!Wall's wall design rendered AT
 * TOP and was duplicated AT BOTTOM until this path got the same drain.
 *
 * Strategy mirrors (A): a sync-resolving stub handler proves the
 * behavioural contract that "if handleShowFile finishes its work before
 * its promise resolves, the .then() bookkeeping path is not what we
 * relied on for emit ordering — the deasync drain is".
 */
describe('(C) Path B (doorMessageCallback): drain async-output handlers', () => {
  jest.setTimeout(15000);

  function buildPathBHarness(): {
    wire: string[];
    replyHandled: { value: boolean };
    send: (cmd: number) => void;
    portName: { value: string };
  } {
    const wire: string[] = [];
    const portName = { value: 'aedoorport1' };
    const { xim, replyHandled } = buildStubXim(wire);

    let processor:
      | ((portAddr: number, msgAddr: number) => void)
      | null = null;
    const aedoorLibrary = {
      // Path A still gets installed but we won't drive it.
      setXIMProcessor: () => {},
    };

    const execLibrary = {
      // Path A only — unused in Path B drive but referenced at install.
      getMsg: () => 0,
      replyMsg: (msgAddr: number) => {
        // Path B should NEVER call replyMsg (DOUBLED OUTPUT regression
        // guard). If anything records here it's a real failure.
        wire.push(`fallback-replyMsg:${msgAddr}`);
      },
      setDoorMessageCallback: (
        cb: (portAddr: number, msgAddr: number) => void,
      ) => {
        processor = cb;
      },
      getPortName: (_addr: number) => portName.value,
      getDoorPortAddress: () => 0xdead0001,
      removeMessageFromPort: () => {},
    };

    installMessageCallbacks({
      libraryManager: { aedoorLibrary, execLibrary } as any,
      emulator: {
        pause: () => {},
        readMemory: () => 0,
        readMemory32: () => 0,
        writeMemory: () => {},
      } as any,
      executionState: {} as any,
      getXimProtocol: () => xim as any,
      markUsingDoorMessageCallback: () => {},
      incrementMessagesHandled: () => {},
    });

    if (!processor) {
      throw new Error('doorMessageCallback was not installed');
    }

    return {
      wire,
      replyHandled,
      portName,
      send(cmd: number) {
        // msgAddr doubles as the "command" via the stub parseMessage.
        processor!(0xdead0001, cmd);
      },
    };
  }

  test('JH_SF emit lands and no fallback replyMsg (drain works)', () => {
    const h = buildPathBHarness();
    h.send(JH_SF);

    expect(h.wire).toContain(`emit:FILE_BODY:${JH_SF}`);
    expect(h.replyHandled.value).toBe(true);
    expect(
      h.wire.find((e) => e.startsWith('fallback-replyMsg')),
    ).toBeUndefined();
  });

  test('sync JH_WRITE keeps the existing .then() fast path (no fallback)', () => {
    const h = buildPathBHarness();
    h.send(JH_WRITE);

    // JH_WRITE goes through the else-branch (.then). The synchronous
    // handler body still ran, so the emit is recorded. The fallback
    // replyMsg must remain unset — Path B never falls back.
    expect(h.wire).toContain('emit:WRITE');
    expect(h.replyHandled.value).toBe(true);
    expect(
      h.wire.find((e) => e.startsWith('fallback-replyMsg')),
    ).toBeUndefined();
  });
});

/**
 * (D) Path B's own drain. A regression that drops the drain from
 * installDoorMessageCallback but keeps it in installXIMProcessor
 * reintroduces the dRE!Wall race only for direct-XIM doors, so this drives
 * Path B separately, in the legacy synchronous mode where the drain lives
 * (under DOOR_ASYNC_WAIT the emulator is paused instead).
 */
describe('(D) Path B (doorMessageCallback): the drain waits for a genuinely async handler', () => {
  const savedAsyncWait = process.env.DOOR_ASYNC_WAIT;
  beforeEach(() => {
    process.env.DOOR_ASYNC_WAIT = '0';
    mockPendingEventLoopWork.length = 0;
    mockDrain.calls = 0;
  });
  afterEach(() => {
    if (savedAsyncWait === undefined) delete process.env.DOOR_ASYNC_WAIT;
    else process.env.DOOR_ASYNC_WAIT = savedAsyncWait;
  });

  test.each(ASYNC_OUTPUT)('%s: the file body lands before the callback returns', (_name, cmd) => {
    const wire: string[] = [];
    const { xim, replyHandled } = buildTrulyAsyncXim(wire);
    let processor: ((portAddr: number, msgAddr: number) => void) | null = null;
    installMessageCallbacks({
      libraryManager: {
        aedoorLibrary: { setXIMProcessor: () => {} },
        execLibrary: {
          getMsg: () => 0,
          replyMsg: (msgAddr: number) => wire.push(`fallback-replyMsg:${msgAddr}`),
          setDoorMessageCallback: (cb: (p: number, m: number) => void) => { processor = cb; },
          getPortName: () => 'aedoorport1',
          getDoorPortAddress: () => 0xdead0001,
          removeMessageFromPort: () => {},
        },
      } as any,
      emulator: { pause: () => {}, readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {} } as any,
      executionState: {} as any,
      getXimProtocol: () => xim as any,
      markUsingDoorMessageCallback: () => {},
      incrementMessagesHandled: () => {},
    });

    processor!(0xdead0001, cmd);

    expect(mockDrain.calls).toBeGreaterThan(0);
    expect(wire).toEqual([`emit:FILE_BODY:${cmd}`]);
    expect(replyHandled.value).toBe(true);
  });
});

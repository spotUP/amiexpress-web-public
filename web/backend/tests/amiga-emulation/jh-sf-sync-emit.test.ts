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
 *   In production we use deasync.loopWhile inside the trap-sync XIMProcessor
 *   to drain the handler's promise. Jest's runtime sandboxes promise /
 *   immediate scheduling so deasync.loopWhile cannot drain promise
 *   continuations from inside a Jest test (verified with a smoke test).
 *   We therefore validate the regression in two layers:
 *
 *     (A) Behavioural contract — exercise the real installMessageCallbacks
 *         with a synchronous-resolving stub handler whose effects (emit +
 *         replyHandled flip) land BEFORE the returned promise resolves.
 *         This locks the invariant that "if handleShowFile finishes its
 *         work before its promise resolves, the trap path skips the
 *         fallback replyMsg" — which is what dRE!Wall depends on.
 *
 *     (B) Structural guard — assert the trap-sync source still contains
 *         the deasync drain and lists all five async-output commands.
 *         A future refactor that removes the drain (or drops a command
 *         from the list) without an equivalent guarantee fails here so
 *         we don't silently re-introduce the trap-sync race.
 */

import { installMessageCallbacks } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';

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
  // Each ASYNC_OUTPUT_COMMAND test exercises the deasync drain path. In
  // jest the drain hits its 5s deadline (microtask sandbox), then the
  // sync-flipped replyHandled is observed. Per-test timeout therefore
  // needs >5s. JH_WRITE / fallback tests use sync-only commands and run
  // in <100ms.
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
 * (B) Structural / source-level guard. If a future refactor removes the
 * deasync drain or drops a command from the ASYNC_OUTPUT_COMMANDS list
 * without an equivalent sync emit guarantee, this test fails so we don't
 * silently regress dRE!Wall, J door, MultiTop, etc.
 */
describe('(B) trap-sync XIMProcessor: deasync drain wired in source', () => {
  let src = '';

  beforeAll(() => {
    const fs = require('fs');
    const path = require('path');
    src = fs.readFileSync(
      path.join(
        __dirname,
        '../../src/amiga-emulation/session/lifecycle/door-message-callbacks.ts',
      ),
      'utf8',
    );
  });

  test('source references ASYNC_OUTPUT_COMMANDS, deasync.loopWhile, and handleMessage(parsed)', () => {
    expect(src).toMatch(/ASYNC_OUTPUT_COMMANDS/);
    expect(src).toMatch(/deasync\.loopWhile/);
    expect(src).toMatch(/handleMessage\(parsed\)/);
  });

  test('ASYNC_OUTPUT_COMMANDS contains all five async-emit XIM commands', () => {
    const m = src.match(/ASYNC_OUTPUT_COMMANDS\s*=\s*\[([^\]]+)\]/);
    expect(m).not.toBeNull();
    const numbers = m![1]
      .split(',')
      .map((s: string) => s.trim())
      .filter((s: string) => s.length > 0)
      .map((s: string) => parseInt(s, 10));
    expect(numbers).toEqual(expect.arrayContaining([
      JH_SG,
      JH_SF,
      JH_MCI,
      DISPLAY_FILE,
      CHECK_TO_DISPLAY,
    ]));
  });
});

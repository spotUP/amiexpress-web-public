/**
 * JH_FetchKey must report the same key JH_HK would.
 *
 * express.e answers BOTH with readChar():
 *
 *   CASE JH_FetchKey
 *     IF checkInput()
 *       msg.command:=readChar(doorTimeout)
 *
 * and readChar() converts an arrow to its internal code (2=LEFT, 3=RIGHT,
 * 4=UP, 5=DOWN, express.e:7514-7528). So on a real node a door polling
 * JH_FetchKey never sees a raw escape sequence.
 *
 * This emulator's queue holds TOKENS - an arrow key is the single token
 * "\x1b[B" - and handleFetchKey used to answer with charCodeAt(0), which is
 * ESC, and dropped the rest of the token on the floor. A door that polls
 * JH_FetchKey to find out whether more input is queued then read ESC, went
 * looking for the "[B" that was already gone, and consumed the NEXT arrow as
 * the continuation of the first - so every other cursor key vanished.
 *
 * Caught by DoorRepo coalescing queued cursor keys: five arrows moved the
 * selection one row.
 */
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import { setSdkDoorSession } from '../../src/amiga-emulation/xim/secret-input';

/**
 * handleFetchKey touches only the input queue, the message parser and the
 * reply path, so it is exercised against a hand-built `this` rather than a
 * whole emulator. Anything it reaches for that is not here would fail loudly.
 */
function makeHandler(queue: string[]) {
  const written: number[] = [];
  const replies: Array<{ data: number; str: string }> = [];
  const ctx = {
    inputQueue: queue,
    state: { carrierDropped: false },
    messageParser: {
      writeCommand: (_addr: number, value: number) => { written.push(value); },
    },
    reply: (_msg: unknown, data: number, str = '') => { replies.push({ data, str }); },
    processHotkeyToken: (XIMIOHandler.prototype as any).processHotkeyToken,
  };
  const call = () =>
    (XIMIOHandler.prototype as any).handleFetchKey.call(ctx, { msgAddr: 0x1000 });
  return { call, written, replies, queue };
}

describe('JH_FetchKey arrow reporting', () => {
  test('a down-arrow token is reported as the converted code, not as ESC', () => {
    const h = makeHandler(['\x1b[B']);

    h.call();

    expect(h.written).toEqual([5]);   // DOWNARROW, axconsts.e:75-78
    expect(h.queue).toHaveLength(0);
  });

  test('every arrow converts the way readChar() does', () => {
    const cases: Array<[string, number]> = [
      ['\x1b[D', 2], // LEFT
      ['\x1b[C', 3], // RIGHT
      ['\x1b[A', 4], // UP
      ['\x1b[B', 5], // DOWN
    ];
    for (const [token, code] of cases) {
      const h = makeHandler([token]);
      h.call();
      expect(h.written).toEqual([code]);
    }
  });

  test('consecutive arrows are consumed one per call, none swallowed', () => {
    // The failure this pins: the door polls repeatedly to drain what the
    // user already typed, and must get one arrow per call.
    const h = makeHandler(['\x1b[B', '\x1b[B', '\x1b[B']);

    h.call();
    h.call();
    h.call();

    expect(h.written).toEqual([5, 5, 5]);
    expect(h.queue).toHaveLength(0);
  });

  test('an ordinary character is still reported as itself', () => {
    const h = makeHandler(['Q']);

    h.call();

    expect(h.written).toEqual(['Q'.charCodeAt(0)]);
  });

  test('an empty queue reports no key without blocking', () => {
    const h = makeHandler([]);

    h.call();

    expect(h.written).toEqual([0]);
    expect(h.replies).toEqual([{ data: 1, str: '' }]);
  });

  test('a sequence with no key code reports "nothing", not a zero keypress', () => {
    // An unmapped sequence (Insert, a function key) converts to the empty
    // string. JH_HK waits for the next real key; JH_FetchKey cannot wait - it
    // is defined as never blocking - so it must say "no input" and let the
    // door poll again.
    const h = makeHandler(['\x1b[2~']);

    h.call();

    expect(h.written).toEqual([0]);
    expect(h.replies[0].data).toBe(1);
  });

  test('a dropped carrier is reported as -1', () => {
    const h = makeHandler(['\x1b[B']);
    (h as any).call;
    const ctxFail = {
      inputQueue: ['\x1b[B'],
      state: { carrierDropped: true },
      messageParser: { writeCommand: (_a: number, v: number) => { h.written.push(v); } },
      reply: (_m: unknown, data: number) => { h.replies.push({ data, str: '' }); },
      processHotkeyToken: (XIMIOHandler.prototype as any).processHotkeyToken,
    };
    (XIMIOHandler.prototype as any).handleFetchKey.call(ctxFail, { msgAddr: 0x1000 });

    expect(h.written).toEqual([0]);
    expect(h.replies[0].data).toBe(-1);
  });
});

/**
 * Home, End, Page Up and Page Down reach a door the way the arrows do.
 *
 * Found by the M15 measurements: the C menu door decodes UI_KEY_PGUP/PGDN/
 * HOME/END, but the board converted only the arrows and dropped every other
 * escape sequence, so the page keys were dead on the live board. The keys are
 * driven through the real queueInput (tokenising) and handleFetchKey, the
 * path a caller's keystroke takes; the arrows are the reference form: ONE
 * converted byte, never an escape sequence.
 */
describe('Home, End, Page Up and Page Down reach an SDK door as one converted byte', () => {
  // An SDK door is a session whose door has spoken AEW_MENU or AEW_SCREEN (XIMProtocol sets the flag).
  const sdkSession = {};
  beforeAll(() => { setSdkDoorSession(sdkSession, true); });

  function typeAndFetch(typed: string, session: object | undefined = sdkSession): number[] {
    const written: number[] = [];
    const ctx: any = {
      inputQueue: [] as string[],
      state: { carrierDropped: false },
      bbsSession: session,
      waitingForPause: false,
      waitingForHotkey: false,
      hotkeyMessage: null,
      waitingForExtHotkey: false,
      extHotkeyMessage: null,
      waitingForLineInput: false,
      messageParser: { writeCommand: (_a: number, v: number) => { written.push(v); } },
      reply: () => undefined,
    };
    const proto = XIMIOHandler.prototype as any;
    ctx.processHotkeyToken = proto.processHotkeyToken;
    proto.queueInput.call(ctx, typed);
    while (ctx.inputQueue.length > 0) proto.handleFetchKey.call(ctx, { msgAddr: 0x1000 });
    return written;
  }

  test('PgDn, PgUp, Home and End each arrive as a single byte, in every spelling', () => {
    const cases: Array<[string, number]> = [
      ['\x1b[6~', 0x19], // PgDn
      ['\x1b[5~', 0x1f], // PgUp
      ['\x1b[H', 0x1c], ['\x1b[1~', 0x1c], ['\x1b[7~', 0x1c], // Home
      ['\x1b[F', 0x1d], ['\x1b[4~', 0x1d], ['\x1b[8~', 0x1d], // End
    ];
    for (const [typed, code] of cases) {
      expect(typeAndFetch(typed)).toEqual([code]);
    }
  });

  test('they arrive in the same form the arrows do: one byte below 0x20, not ESC', () => {
    const arrow = typeAndFetch('\x1b[B');
    const page = typeAndFetch('\x1b[6~');
    expect(arrow).toEqual([5]);
    expect(page).toHaveLength(arrow.length);
    expect(page[0]).toBeGreaterThan(0);
    expect(page[0]).toBeLessThan(0x20);
    expect(page[0]).not.toBe(0x1b);
  });

  test('arrows are unchanged and mixed keys keep their order', () => {
    expect(typeAndFetch('\x1b[A\x1b[B\x1b[C\x1b[D')).toEqual([4, 5, 3, 2]);
    expect(typeAndFetch('a\x1b[6~\x1b[Bb')).toEqual([97, 0x19, 5, 98]);
  });

  // K19: Delete and Shift+Left/Right/Home/End were dropped as unknown escape
  // sequences, so the SDK line editor could never select or forward-delete.
  test('Delete, Shift+Left/Right/Home/End and F5-F7 arrive as one C1 byte each', () => {
    const cases: Array<[string, number]> = [
      ['\x1b[3~', 0x80],   // Delete
      ['\x1b[1;2D', 0x81], // Shift+Left
      ['\x1b[1;2C', 0x82], // Shift+Right
      ['\x1b[1;2H', 0x83], // Shift+Home
      ['\x1b[1;2F', 0x84], // Shift+End
      ['\x1b[15~', 0x85],  // F5 (LiveChat's format picker)
      ['\x1b[17~', 0x86],  // F6 (LiveChat's files)
      ['\x1b[18~', 0x87],  // F7 (LiveChat's pinned messages)
    ];
    for (const [typed, code] of cases) {
      expect(typeAndFetch(typed)).toEqual([code]);
      expect(typeAndFetch(typed, {})).toEqual([0]);   // classic door: dropped as before
    }
  });

  test('an unrelated escape sequence is still ignored', () => {
    expect(typeAndFetch('\x1b[2~')).toEqual([0]);   // Insert
    expect(typeAndFetch('\x1b[19~')).toEqual([0]);  // F8
  });
});

describe('a classic door keeps getting nothing for those keys', () => {
  const sdk = {};
  const classic = {};
  const other = {};
  beforeAll(() => { setSdkDoorSession(sdk, true); });
  const fetchFor = (session: object, typed: string): number[] => {
    const written: number[] = [];
    const proto = XIMIOHandler.prototype as any;
    const ctx: any = {
      inputQueue: [] as string[], state: { carrierDropped: false }, bbsSession: session,
      waitingForPause: false, waitingForHotkey: false, hotkeyMessage: null, waitingForExtHotkey: false, extHotkeyMessage: null, waitingForLineInput: false,
      messageParser: { writeCommand: (_a: number, v: number) => { written.push(v); } }, reply: () => undefined,
      processHotkeyToken: proto.processHotkeyToken,
    };
    proto.queueInput.call(ctx, typed);
    while (ctx.inputQueue.length > 0) proto.handleFetchKey.call(ctx, { msgAddr: 0x1000 });
    return written;
  };

  test('PgDn, PgUp, Home and End are dropped for a session that never spoke AEW_*', () => {
    for (const key of ['\x1b[6~', '\x1b[5~', '\x1b[H', '\x1b[F', '\x1b[1~', '\x1b[4~']) {
      expect(fetchFor(classic, key)).toEqual([0]);   // "no input", as before the nav codes existed
    }
  });
  test('the same keys reach an SDK door, arrows are identical for both', () => {
    expect(fetchFor(sdk, '\x1b[6~')).toEqual([0x19]);
    expect(fetchFor(sdk, '\x1b[A\x1b[B')).toEqual([4, 5]);
    expect(fetchFor(classic, '\x1b[A\x1b[B')).toEqual([4, 5]);
  });
  test('the flag is per session and clears', () => {
    expect(fetchFor(other, '\x1b[6~')).toEqual([0]);   // another session beside an SDK one
    setSdkDoorSession(sdk, false);                      // what terminate() does
    expect(fetchFor(sdk, '\x1b[6~')).toEqual([0]);
  });
});

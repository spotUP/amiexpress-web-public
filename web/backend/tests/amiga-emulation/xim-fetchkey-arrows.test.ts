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
    // Home/End/PgUp/PgDn convert to the empty string. JH_HK waits for the
    // next real key; JH_FetchKey cannot wait - it is defined as never
    // blocking - so it must say "no input" and let the door poll again.
    const h = makeHandler(['\x1b[5~']);

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

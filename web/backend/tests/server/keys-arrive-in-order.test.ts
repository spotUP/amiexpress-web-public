/**
 * A caller's keystrokes reach the board in the order he typed them.
 *
 * Both transports handed each key to handleCommand without waiting, so the
 * keys of one packet ran as concurrent async handlers: a client sending
 * `sysop\r` in one write had the board look up `syso` or `sop` (the telnet
 * regression suite, 2026-09-27 - two logins in six). dispatchInOrder is what
 * both transports now call.
 */
import { dispatchInOrder, KEY_ORDER_WAIT_MS } from '../../src/server/terminal-input';

/** A handler that is slow for the first key, the shape the race needed. */
function aBoard() {
  const typed: string[] = [];
  let slowFirst = true;
  const handle = async (piece: string) => {
    if (slowFirst) {
      slowFirst = false;
      await new Promise((r) => setTimeout(r, 30));
    }
    typed.push(piece);
  };
  return { typed, handle };
}

const settle = (ms = 80) => new Promise((r) => setTimeout(r, ms));

describe('keys typed faster than the board takes them', () => {
  it('arrive in order within one packet', async () => {
    const session = {};
    const { typed, handle } = aBoard();
    dispatchInOrder(session, ['s', 'y', 's', 'o', 'p', '\r'], handle, () => {});
    await settle();
    expect(typed.join('')).toBe('sysop\r');
  });

  it('arrive in order across packets', async () => {
    const session = {};
    const { typed, handle } = aBoard();
    dispatchInOrder(session, ['s', 'y', 's'], handle, () => {});
    dispatchInOrder(session, ['o', 'p', '\r'], handle, () => {});
    await settle();
    expect(typed.join('')).toBe('sysop\r');
  });

  it('do not wait for ever behind a key whose handler runs long', async () => {
    // A command that opens a door holds its handleCommand until the door
    // exits; the keys typed meanwhile must still be delivered.
    jest.useFakeTimers();
    try {
      const session = {};
      const typed: string[] = [];
      const handle = async (piece: string) => {
        if (piece === 'D') await new Promise(() => {});   // never returns
        typed.push(piece);
      };
      dispatchInOrder(session, ['D', 'x'], handle, () => {});
      await jest.advanceTimersByTimeAsync(KEY_ORDER_WAIT_MS + 10);
      expect(typed).toEqual(['x']);
    } finally {
      jest.useRealTimers();
    }
  });

  it('keeps going after a key whose handler threw', async () => {
    const session = {};
    const typed: string[] = [];
    const errors: unknown[] = [];
    const handle = async (piece: string) => {
      if (piece === '!') throw new Error('boom');
      typed.push(piece);
    };
    dispatchInOrder(session, ['a', '!', 'b'], handle, (e) => errors.push(e));
    await settle();
    expect(typed).toEqual(['a', 'b']);
    expect(errors).toHaveLength(1);
  });
});

/**
 * The goodbye a ZMODEM client sends after the board's sz has exited - a ZFIN
 * retry, `OO` - is not typing. It reached the menu prompt as commands:
 * "No such command!!" twice after every download (walked over telnet,
 * 2026-09-27). endRawTransfer opens a short window in which input is the
 * protocol's tail and is dropped.
 */
describe('input right after a transfer ends', () => {
  it('drops a ZMODEM goodbye still arriving after the board\'s sz exited', async () => {
    const { endRawTransfer } = require('../../src/utils/raw-transfer-teardown.util');
    const session: any = { connectionType: 'web' };
    endRawTransfer(session);
    const typed: string[] = [];
    // rz's ZFIN retry and the closing OO, a key at a time.
    const zfin = ['*', '*', '\x18', 'B', ...'08000000000022'.split(''), '\r', '\n', '\x11', 'O', 'O'];
    dispatchInOrder(session, zfin, async (p) => { typed.push(p); }, () => {});
    await settle();
    expect(typed).toEqual([]);
  });

  it('still takes what the caller types in that window - an upload description', async () => {
    // The description prompt appears within the window; dropping everything
    // ate a quick caller's description (the regression suite, 2026-09-27).
    const { endRawTransfer } = require('../../src/utils/raw-transfer-teardown.util');
    const session: any = { connectionType: 'web' };
    endRawTransfer(session);
    const typed: string[] = [];
    dispatchInOrder(session, [...'Only One', '\r'], async (p) => { typed.push(p); }, () => {});
    await settle(200);
    expect(typed.join('')).toBe('Only One\r');
  });

  it('is typing again once the window has passed', async () => {
    const session: any = { transferDrainUntil: Date.now() - 1 };
    const typed: string[] = [];
    dispatchInOrder(session, ['G'], async (p) => { typed.push(p); }, () => {});
    await settle();
    expect(typed).toEqual(['G']);
  });
});

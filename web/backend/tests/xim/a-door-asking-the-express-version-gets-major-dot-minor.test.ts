/**
 * express.e getExpressMajorVer (4599-4613), reached through EXPRESS_VERSION
 * (3808-3810): MIMICVER wins; else "v<Val major>.<Val minor>" of expressVer
 * with a leading v/V skipped; no dot gives "v<major>". E Val() reads a
 * non-number as 0 - the port answered the default 'v5.6' / dropped the minor.
 */
process.env.SKIP_DB_INIT = '1';

/* eslint-disable @typescript-eslint/no-var-requires */
const { XIMBBSInfoHandler } = require('../../src/amiga-emulation/xim/bbs-info');
const { XIMMessageParser } = require('../../src/amiga-emulation/xim/messages');
const { DoorConstants } = require('../../src/amiga-emulation/DoorTypes');
/* eslint-enable @typescript-eslint/no-var-requires */

class StubEmulator {
  private mem = new Map<number, number>();
  readMemory(a: number) { return this.mem.get(a) ?? 0; }
  writeMemory(a: number, v: number) { this.mem.set(a, v & 0xff); }
  readMemory16(a: number) { return (this.readMemory(a) << 8) | this.readMemory(a + 1); }
  readMemory32(a: number) { return ((this.readMemory16(a) << 16) | this.readMemory16(a + 2)) >>> 0; }
  writeMemory16(a: number, v: number) { this.writeMemory(a, v >> 8); this.writeMemory(a + 1, v); }
  writeMemory32(a: number, v: number) { this.writeMemory16(a, v >>> 16); this.writeMemory16(a + 2, v & 0xffff); }
}

const MSG = 0x8000;

function ask(session: Record<string, unknown>): string {
  const emulator = new StubEmulator();
  const parser = new XIMMessageParser(emulator as never);
  const handler = new XIMBBSInfoHandler(
    emulator as never,
    { replyMsg: jest.fn() } as never,
    { emit: jest.fn(), on: jest.fn() } as never,
    parser,
    session,
    {} as never,
  );
  handler.handleExpressVersion({ msgAddr: MSG, command: 0, data: 0, replyPort: 0 });
  return parser.readString(MSG + DoorConstants.MESSAGE_STRING_OFFSET, DoorConstants.MESSAGE_STRING_CAPACITY);
}

test.each([
  [{ expressVer: 'v5.6.1' }, 'v5.6'],
  [{ expressVer: 'V6.2' }, 'v6.2'],
  [{ expressVer: '7' }, 'v7'],
  [{ expressVer: 'v5.x' }, 'v5.0'],
  [{ expressVer: 'v5.6', mimicVer: 'v4.9' }, 'v4.9'],
])('%j answers %s', (session, expected) => {
  expect(ask(session)).toBe(expected);
});

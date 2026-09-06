/**
 * A C door asking for the caller's theme is answered.
 *
 * AEW_THEME (10100) is this board's own user field, above express.e's
 * MAX_CMD. It was implemented in xim/data-query.ts and never routed: the
 * only thing that reaches that handler is XIMProtocol's
 * `isDataQueryCommand`, a list of numeric ranges, and 10100 is in none of
 * them. So THEMEC asked on every open, the protocol logged "UNHANDLED
 * COMMAND: 10100" and replied with nothing, and the door drew all seven
 * themes in the classic palette with none of them marked (sysop,
 * 2026-09-06: "themec is not using our themes and i see no selected line").
 *
 * The handler was fine. The route was missing, and a test that drove the
 * handler directly - as tests/xim/dt-querybit.test.ts does - would have
 * passed the whole time. So this one goes through handleMessage, the same
 * entry point AmigaDoorSession calls, and asserts what the DOOR gets back.
 */
process.env.SKIP_DB_INIT = '1';

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

/** Memory the message and its string live in, addressed the way a door does. */
function makeEmulator() {
  const mem = new Map<number, number>();
  return {
    mem,
    readMemory8: (a: number) => mem.get(a) ?? 0,
    writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory: (a: number) => mem.get(a) ?? 0,
    writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: () => 0,
    writeMemory16: () => undefined,
    readMemory32: () => 0,
    writeMemory32: () => undefined,
    readString: (addr: number, max = 64) => {
      let out = '';
      for (let i = 0; i < max; i++) {
        const b = mem.get(addr + i) ?? 0;
        if (b === 0) break;
        out += String.fromCharCode(b);
      }
      return out;
    },
    writeString: (addr: number, text: string) => {
      for (let i = 0; i < text.length; i++) mem.set(addr + i, text.charCodeAt(i));
      mem.set(addr + text.length, 0);
    },
  } as any;
}

function makeProtocol(user: Record<string, unknown>) {
  const emulator = makeEmulator();
  const execLibrary = { replyMsg: jest.fn() } as any;
  const socket = { emit: jest.fn(), on: jest.fn() } as any;
  const protocol = new XIMProtocol(emulator, execLibrary, socket, 1, {
    user, nodeId: 1, doorCommand: 'THEMEC',
  } as any);
  return { protocol, emulator, execLibrary };
}

/** The message a door sends: Data != 0 is a READ, Data == 0 is a WRITE. */
function themeMessage(read: boolean, ask = '') {
  return {
    command: XIMCommand.AEW_THEME,
    data: read ? 1 : 0,
    msgAddr: 0x1000,
    string: ask,
    replyPort: 0x2000,
  } as any;
}

describe('a door asking for the caller\'s theme', () => {
  it('is answered with the theme, not "UNHANDLED COMMAND"', async () => {
    const { protocol, emulator, execLibrary } = makeProtocol({
      id: 7, username: 'SYSOP', themePreference: 'uprough-neon',
    });

    await protocol.handleMessage(themeMessage(true));

    // What the DOOR reads back out of the message it sent: the string sits
    // INSIDE jhMessage at offset 0x14 (DoorConstants.MESSAGE_STRING_OFFSET),
    // it is not a pointer.
    expect(emulator.readString(0x1000 + 0x14, 32)).toBe('uprough-neon');
    expect(execLibrary.replyMsg).toHaveBeenCalled();
  });

  it('stores what the door writes, resolved to a theme this board has', async () => {
    const user: Record<string, unknown> = { id: 7, username: 'SYSOP', themePreference: 'classic' };
    const { protocol, emulator } = makeProtocol(user);

    // The door puts the id it wants in the message's own string buffer, the
    // same place it reads one back from.
    emulator.writeString(0x1000 + 0x14, 'slate-slash');
    await protocol.handleMessage(themeMessage(false, 'slate-slash'));

    expect(user.themePreference).toBe('slate-slash');
  });

  it('is routed as a data query, which is the thing that was missing', () => {
    // The predicate itself, by name: the handler has always been there and
    // this is the only line that reaches it.
    const { protocol } = makeProtocol({ id: 1 });
    const isDataQuery = (protocol as any).isDataQueryCommand.bind(protocol);
    expect(isDataQuery(XIMCommand.AEW_THEME)).toBe(true);
  });
});

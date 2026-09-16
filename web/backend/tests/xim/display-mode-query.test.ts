/**
 * A door can ask what KIND of screen the caller has.
 *
 * The size has had an authority for a while - BB_SCRWIDTH answers 40 for a
 * C64 and 40 for a teletext session alike. That is the problem: a door that
 * writes a teletext escape on the strength of the width writes it into a
 * Commodore byte stream too. AEW_DISPLAYMODE is the kind, not the size.
 */
process.env.SKIP_DB_INIT = '1';

import { displayModeOf } from '../../src/amiga-emulation/xim/display-mode.util';
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

function makeProtocol(session: Record<string, unknown>) {
  const emulator = makeEmulator();
  const execLibrary = { replyMsg: jest.fn() } as any;
  const socket = { emit: jest.fn(), on: jest.fn() } as any;
  const protocol = new XIMProtocol(emulator, execLibrary, socket, 1, {
    user: { id: 1, username: 'SYSOP' }, nodeId: 1, doorCommand: 'TEXTTV',
    ...session,
  } as any);
  return { protocol, emulator, execLibrary };
}

describe('the display mode a door is told', () => {
  it('names each kind of screen', () => {
    expect(displayModeOf({ petsciiMode: true })).toBe('petscii');
    expect(displayModeOf({ texttvMode: true })).toBe('teletext');
    expect(displayModeOf({ ripMode: true })).toBe('rip');
    expect(displayModeOf({})).toBe('ansi');
    expect(displayModeOf(undefined)).toBe('ansi');
    expect(displayModeOf(null)).toBe('ansi');
  });

  it('lets the transducing mode win when two flags disagree', () => {
    // applyGraphicsAnswer sets one and clears the others, so this is a
    // session that has been mishandled somewhere - and the safe answer is
    // the one whose bytes are rewritten on the way out, because that is the
    // caller a stray escape would reach as glyphs.
    expect(displayModeOf({ petsciiMode: true, texttvMode: true })).toBe('petscii');
    expect(displayModeOf({ texttvMode: true, ripMode: true })).toBe('teletext');
  });

  it('is a command number above everything AmiExpress can reach', () => {
    // express.e's MAX_CMD is 1003; this board's own commands live above it,
    // so a classic board answers nothing rather than answering wrongly.
    expect(XIMCommand.AEW_DISPLAYMODE).toBe(10400);
    expect(XIMCommand.AEW_DISPLAYMODE).toBeGreaterThan(1003);
  });

  it('reaches the door through handleMessage, not just through the handler', async () => {
    // AEW_THEME was implemented and left out of the routing predicate, so the
    // C theme picker got "UNHANDLED COMMAND: 10100" on every open and a test
    // that drove the handler directly passed the whole time. This goes in at
    // the entry point AmigaDoorSession calls and reads what the DOOR gets.
    const { protocol, emulator, execLibrary } = makeProtocol({ texttvMode: true });

    await protocol.handleMessage({
      command: XIMCommand.AEW_DISPLAYMODE,
      data: 1,                       // != 0 is a read
      msgAddr: 0x1000,
      string: '',
      replyPort: 0x2000,
    } as any);

    // The string sits INSIDE jhMessage at MESSAGE_STRING_OFFSET (0x14); it is
    // not a pointer.
    expect(emulator.readString(0x1000 + 0x14, 32)).toBe('teletext');
    expect(execLibrary.replyMsg).toHaveBeenCalled();
  });

  it('answers each kind of caller through the same path', async () => {
    for (const [session, expected] of [
      [{ petsciiMode: true }, 'petscii'],
      [{ ripMode: true }, 'rip'],
      [{}, 'ansi'],
    ] as const) {
      const { protocol, emulator } = makeProtocol(session as any);
      await protocol.handleMessage({
        command: XIMCommand.AEW_DISPLAYMODE, data: 1, msgAddr: 0x1000,
        string: '', replyPort: 0x2000,
      } as any);
      expect(emulator.readString(0x1000 + 0x14, 32)).toBe(expected);
    }
  });

  it('gives every board-specific command a number of its own', () => {
    /*
     * A TypeScript enum takes a duplicate value without a word, and the
     * reverse mapping then answers with whichever name was written last -
     * so AEW_DISPLAYMODE at 10300 silently BECAME AEW_SETPOINTER, was
     * claimed by the I/O route before the data-query one could see it, and
     * answered the door with an empty string (caught here, 2026-09-13).
     *
     * Every command in this board's own range, checked against every other.
     */
    const own = Object.entries(XIMCommand).filter(
      ([name, value]) => typeof value === 'number' && name.startsWith('AEW_'),
    ) as Array<[string, number]>;

    // Two is the least that can collide; the count itself is not the
    // property (AEW_MSGQUERY was retired in 6ac4837ad and this pinned four).
    expect(own.length).toBeGreaterThanOrEqual(2);
    const byValue = new Map<number, string>();
    for (const [name, value] of own) {
      expect(byValue.has(value)).toBe(false);
      byValue.set(value, name);
    }
    // And they are all above what a classic AmiExpress can reach, so one
    // answers "unknown command" rather than something else's answer.
    for (const [, value] of own) expect(value).toBeGreaterThan(1003);
  });

  it('is routed as a data query, which is the line that gets forgotten', () => {
    const { protocol } = makeProtocol({});
    const isDataQuery = (protocol as any).isDataQueryCommand.bind(protocol);
    expect(isDataQuery(XIMCommand.AEW_DISPLAYMODE)).toBe(true);
  });
});

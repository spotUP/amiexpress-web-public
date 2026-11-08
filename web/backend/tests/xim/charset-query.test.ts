/**
 * AEW_CHARSET (11100): a door asks the caller's wire charset and may opt its
 * own text into UTF-8. LIVECHAT68 uses it to send emoji reactions to UTF-8
 * callers and ASCII faces to latin1 / Amiga callers.
 *
 * Driven through handleMessage, the entry point AmigaDoorSession calls, so
 * the routing predicate and the JH_SM byte path are part of what is tested.
 */
process.env.SKIP_DB_INIT = '1';

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { isDataQueryCommand } from '../../src/amiga-emulation/xim/command-classes';
import { decodeDoorUtf8 } from '../../src/utils/door-utf8.util';

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
    user: { id: 1, username: 'SYSOP' }, nodeId: 1, doorCommand: 'LIVECHAT68',
    ...session,
  } as any);
  return { protocol, emulator, execLibrary, socket };
}

const MSG = 0x1000;
const STR = MSG + 0x14;

async function send(p: ReturnType<typeof makeProtocol>, command: number, data: number, bytes: number[]) {
  bytes.forEach((b, i) => p.emulator.mem.set(STR + i, b));
  p.emulator.mem.set(STR + bytes.length, 0);
  // The board's message parser hands JH_SM its string as latin1 characters, one per byte.
  const string = String.fromCharCode(...bytes);
  await p.protocol.handleMessage({ command, data, msgAddr: MSG, string, replyPort: 0x2000 } as any);
}

const ascii = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
const THUMBS = [0xf0, 0x9f, 0x91, 0x8d];

function emitted(socket: { emit: jest.Mock }): string {
  return socket.emit.mock.calls
    .flatMap((call: unknown[]) => call.slice(1))
    .filter((a: unknown): a is string => typeof a === 'string')
    .join('');
}

describe('AEW_CHARSET', () => {
  it('reads utf-8 exactly when the TS door would show emoji', async () => {
    for (const [session, want] of [
      [{ connectionType: 'web' }, 'utf-8'],
      [{ connectionType: 'telnet', unicodeCapable: true }, 'utf-8'],
      [{ connectionType: 'telnet' }, 'iso-8859-1'],
      [{ connectionType: 'telnet', wireCharset: 'cp437' }, 'cp437'],
      // Parity with the TS door: unicodeCapable decides, not the wire alone.
      [{ connectionType: 'telnet', wireCharset: 'utf-8' }, 'iso-8859-1'],
      [{ connectionType: 'ssh', wireCharset: 'iso-8859-1', unicodeCapable: true }, 'utf-8'],
    ] as const) {
      const p = makeProtocol(session);
      await send(p, XIMCommand.AEW_CHARSET, 1, []);
      expect(p.execLibrary.replyMsg).toHaveBeenCalled();
      expect(p.emulator.readString(STR, 32)).toBe(want);
    }
  });

  it('is a data query in the board-own range', () => {
    expect(XIMCommand.AEW_CHARSET).toBe(11100);
    expect(isDataQueryCommand(XIMCommand.AEW_CHARSET)).toBe(true);
  });

  it('JH_SM bytes reach the caller as UTF-8 only after the door opts in', async () => {
    const before = makeProtocol({ connectionType: 'web' });
    await send(before, XIMCommand.JH_SM, 0, THUMBS);
    expect(emitted(before.socket)).not.toContain('\u{1F44D}');

    const after = makeProtocol({ connectionType: 'web' });
    await send(after, XIMCommand.AEW_CHARSET, 0, ascii('utf-8'));
    await send(after, XIMCommand.JH_SM, 0, [...ascii('a '), ...THUMBS, ...ascii(' 2')]);
    expect(emitted(after.socket)).toContain('a \u{1F44D} 2');
  });

  it('writing anything else opts back out', async () => {
    const p = makeProtocol({ connectionType: 'web' });
    await send(p, XIMCommand.AEW_CHARSET, 0, ascii('utf-8'));
    await send(p, XIMCommand.AEW_CHARSET, 0, ascii('iso-8859-1'));
    await send(p, XIMCommand.JH_SM, 0, THUMBS);
    expect(emitted(p.socket)).not.toContain('\u{1F44D}');
  });
});

describe('decodeDoorUtf8', () => {
  const b = (...xs: number[]) => String.fromCharCode(...xs);
  it('decodes every reaction glyph of the spec', () => {
    expect(decodeDoorUtf8(b(0xe2, 0x9d, 0xa4, 0xef, 0xb8, 0x8f))).toBe('❤️');
    expect(decodeDoorUtf8(b(0xf0, 0x9f, 0x98, 0x82))).toBe('\u{1F602}');
  });
  it('keeps latin1 bytes, CSI and malformed or truncated sequences as they are', () => {
    expect(decodeDoorUtf8(b(0x9b, 0x31, 0x6d, 0xe9, 0x20))).toBe(b(0x9b, 0x31, 0x6d, 0xe9, 0x20));
    expect(decodeDoorUtf8(b(0xf0, 0x9f, 0x91))).toBe(b(0xf0, 0x9f, 0x91));
    expect(decodeDoorUtf8(b(0xc0, 0x80))).toBe(b(0xc0, 0x80));
  });
});

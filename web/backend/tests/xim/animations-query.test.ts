/**
 * A door can ask whether the caller wants animations (W row 23).
 *
 * AEW_ANIMATIONS answers '1' or '0' from animationsAllowed, the one gate the
 * board's own wipes and slides ask too; a game door always reads '1'. Driven
 * through handleMessage, the entry point AmigaDoorSession calls, so the
 * routing predicate is part of what is tested.
 */
process.env.SKIP_DB_INIT = '1';

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { isDataQueryCommand } from '../../src/amiga-emulation/xim/command-classes';

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
    user: { id: 1, username: 'SYSOP' }, nodeId: 1, doorCommand: 'MENUDOOR',
    ...session,
  } as any);
  return { protocol, emulator, execLibrary };
}

async function ask(session: Record<string, unknown>): Promise<string> {
  const { protocol, emulator, execLibrary } = makeProtocol(session);
  await protocol.handleMessage({
    command: XIMCommand.AEW_ANIMATIONS, data: 1, msgAddr: 0x1000,
    string: '', replyPort: 0x2000,
  } as any);
  expect(execLibrary.replyMsg).toHaveBeenCalled();
  return emulator.readString(0x1000 + 0x14, 32);
}

describe('AEW_ANIMATIONS', () => {
  it('answers 1 by default and 0 when the caller turned animations off', async () => {
    expect(await ask({})).toBe('1');
    expect(await ask({ user: { id: 1, username: 'SYSOP', noAnimations: true } })).toBe('0');
  });

  it('answers 1 inside a game door', async () => {
    expect(await ask({ user: { id: 1, username: 'SYSOP', noAnimations: true }, runningDoorIsGame: true })).toBe('1');
  });

  it('is a data query above what AmiExpress can reach', () => {
    expect(XIMCommand.AEW_ANIMATIONS).toBe(11000);
    expect(isDataQueryCommand(XIMCommand.AEW_ANIMATIONS)).toBe(true);
  });
});

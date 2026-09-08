/**
 * A C door asking for this conference's public feed is answered.
 *
 * AEW_MSGQUERY (10200) is this board's own read command, above express.e's
 * MAX_CMD. Everything about it is additive - it reads, it never writes, and
 * no existing message flow changes - but it is reachable only if XIMProtocol
 * ROUTES it. That is the step this board has forgotten twice: AEW_THEME was
 * implemented in xim/data-query.ts and left out of `isDataQueryCommand`, so
 * THEMEC asked on every open and got "UNHANDLED COMMAND: 10100"; LAST_READ
 * and LAST_SCANNED are implemented only in the dead DoorMessageHandler
 * fallback and are still unreachable in production today.
 *
 * So this test goes through `handleMessage`, the same entry point
 * AmigaDoorSession calls, and asserts what the DOOR reads back out of its own
 * message - not what the handler returns.
 */
process.env.SKIP_DB_INIT = '1';

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

/** Memory the message and its embedded string live in, addressed as a door does. */
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
    nodeId: 1, doorCommand: 'SUBS', ...session,
  } as any);
  return { protocol, emulator, execLibrary };
}

/** The message a door sends. Data != 0 is a READ, Data == 0 is a WRITE. */
function query(text: string, read = true) {
  return {
    command: XIMCommand.AEW_MSGQUERY,
    data: read ? 1 : 0,
    msgAddr: 0x1000,
    string: text,
    replyPort: 0x2000,
  } as any;
}

/** The string lives INSIDE jhMessage at 0x14; it is not a pointer. */
const STRING_AT = 0x1000 + 0x14;

describe("a door asking for the conference's public feed", () => {
  it('is routed, which is the step that gets forgotten', () => {
    const { protocol } = makeProtocol({});
    const isIO = (protocol as any).isIOCommand.bind(protocol);
    expect(isIO(XIMCommand.AEW_MSGQUERY)).toBe(true);
  });

  it('answers STAT with something, not with "UNHANDLED COMMAND"', async () => {
    const { protocol, emulator, execLibrary } = makeProtocol({
      currentConf: 1, conferenceName: 'Amiga Chat',
    });

    await protocol.handleMessage(query('STAT'));

    const answer = emulator.readString(STRING_AT, 198);
    expect(answer.length).toBeGreaterThan(0);
    // total|newForMe|pointer|confName - four fields, always.
    expect(answer.split('|')).toHaveLength(4);
    expect(answer.split('|')[3]).toBe('Amiga Chat');
    expect(execLibrary.replyMsg).toHaveBeenCalled();
  });

  it('refuses a write and changes nothing', async () => {
    const { protocol, emulator } = makeProtocol({ currentConf: 1 });

    emulator.writeString(STRING_AT, 'STAT');
    await protocol.handleMessage(query('STAT', false));

    // The door's own request is still there: nothing was written back, and
    // the reply is 0. There is no write path in this command, ever.
    expect(emulator.readString(STRING_AT, 198)).toBe('STAT');
  });
});

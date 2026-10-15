/**
 * LAST_READ (602) and LAST_SCANNED (603) answer with the caller's message
 * pointers - not with the sentinel the door sent.
 *
 * express.e:3963-3966:
 *
 *     CASE LAST_READ
 *       msg.data:=lastMsgReadConf
 *     CASE LAST_SCANNED
 *       msg.data:=lastNewReadConf
 *
 * Both were implemented only in `session/DoorMessageHandler.processCommand`,
 * which runs solely when `this.ximProtocol` is null (DoorMessageHandler.ts:594)
 * - the live entry point delegates at :590-593, so that 191-case switch is a
 * dead fallback copy. Neither number appeared in ANY of XIMProtocol's routing
 * predicates, so both fell through to the unknown-command default at :748-752,
 * which replies with `msg.data` UNCHANGED. A door that asked for its pointer
 * got back the `1` it sent as the read flag and had no way to know.
 *
 * This is a parity gap, not a divergence, and the fix is additive: route them
 * where MSGBASE_LOC is already routed.
 */
process.env.SKIP_DB_INIT = '1';

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function makeEmulator() {
  const mem = new Map<number, number>();
  const words = new Map<number, number>();
  return {
    mem, words,
    readMemory8: (a: number) => mem.get(a) ?? 0,
    writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory: (a: number) => mem.get(a) ?? 0,
    writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: () => 0,
    writeMemory16: () => undefined,
    readMemory32: (a: number) => words.get(a) ?? 0,
    writeMemory32: (a: number, v: number) => { words.set(a, v >>> 0); },
    readString: () => '',
    writeString: () => undefined,
  } as any;
}

/** msg.data lives at jhMessage + 0xDC. */
const DATA_AT = 0x1000 + 0xdc;

function makeProtocol(session: Record<string, unknown>) {
  const emulator = makeEmulator();
  const execLibrary = { replyMsg: jest.fn() } as any;
  const socket = { emit: jest.fn(), on: jest.fn() } as any;
  const protocol = new XIMProtocol(emulator, execLibrary, socket, 1, {
    nodeId: 1, doorCommand: 'SUBS', ...session,
  } as any);
  return { protocol, emulator };
}

function pointerMessage(command: number) {
  // A door asks with Data = 1, the read flag. If nothing routes the command,
  // that 1 is exactly what comes back - which is the bug.
  return { command, data: 1, msgAddr: 0x1000, string: '', replyPort: 0x2000 } as any;
}

describe('a door asking for its message pointers', () => {
  it('LAST_SCANNED answers with the pointer, not with the request sentinel', async () => {
    const { protocol, emulator } = makeProtocol({ lastNewReadConf: 118, lastMsgReadConf: 42 });

    await protocol.handleMessage(pointerMessage(XIMCommand.LAST_SCANNED));

    expect(emulator.words.get(DATA_AT)).toBe(118);
  });

  it('LAST_READ answers with the last message read', async () => {
    const { protocol, emulator } = makeProtocol({ lastNewReadConf: 118, lastMsgReadConf: 42 });

    await protocol.handleMessage(pointerMessage(XIMCommand.LAST_READ));

    expect(emulator.words.get(DATA_AT)).toBe(42);
  });

  it('answers 0, not the sentinel, for a session that has no pointer yet', async () => {
    const { protocol, emulator } = makeProtocol({});

    await protocol.handleMessage(pointerMessage(XIMCommand.LAST_SCANNED));

    expect(emulator.words.get(DATA_AT)).toBe(0);
  });

  it('is routed - the step that was missing for both of them', () => {
    const { protocol } = makeProtocol({});
    const isBBSInfo = (protocol as any).isBBSInfoCommand.bind(protocol);
    expect(isBBSInfo(XIMCommand.LAST_READ)).toBe(true);
    expect(isBBSInfo(XIMCommand.LAST_SCANNED)).toBe(true);
  });
});

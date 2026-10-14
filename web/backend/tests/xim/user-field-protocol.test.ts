/**
 * AEW_USERFIELD's two routing lists and its failure path. The conversation
 * itself is user-field-command.test.ts; this is the wiring around it.
 */
process.env.SKIP_DB_INIT = '1';
jest.mock('../../src/amiga-emulation/xim/userfield', () => ({
  userFieldAnswer: jest.fn(async () => { throw new Error('boom'); }),
}));

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { isIOCommand } from '../../src/amiga-emulation/xim/command-classes';
import { ASYNC_OUTPUT_COMMANDS } from '../../src/amiga-emulation/session/lifecycle/door-message-callbacks';

test('every board-own command whose handler awaits is both an I/O command and in ASYNC_OUTPUT_COMMANDS', () => {
  for (const c of [XIMCommand.AEW_SETPOINTER, XIMCommand.AEW_POSTMSG, XIMCommand.AEW_USERFIELD]) {
    expect(isIOCommand(c)).toBe(true);
    expect(ASYNC_OUTPUT_COMMANDS).toContain(c);
  }
  expect(ASYNC_OUTPUT_COMMANDS).toContain(10300);
  expect(ASYNC_OUTPUT_COMMANDS).toContain(10500);
  expect(ASYNC_OUTPUT_COMMANDS).toContain(10600);
});

test('a userFieldAnswer that throws is answered empty, so the door never waits forever', async () => {
  const mem = new Map<number, number>();
  const emulator: any = {
    readMemory: (a: number) => mem.get(a) ?? 0, writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory8: (a: number) => mem.get(a) ?? 0, writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: () => 0, writeMemory16: () => undefined, readMemory32: () => 0, writeMemory32: () => undefined,
    readString: () => '', writeString: () => undefined,
  };
  const session: any = { nodeId: 1, doorCommand: 'W', user: { id: 1, username: 'spot', secLevel: 255, securityFlags: 'T'.repeat(128), userFlags: 0 } };
  const protocol: any = new XIMProtocol(emulator, { replyMsg: jest.fn() } as any, { id: 's', emit: jest.fn(), on: jest.fn() } as any, 1, session);
  const sendReply = jest.spyOn(protocol, 'sendReply').mockImplementation(() => undefined);
  await protocol.handleMessage({ command: XIMCommand.AEW_USERFIELD, data: 1, msgAddr: 0x1000, string: 'GET 4', replyPort: 0x2000 });
  expect(sendReply).toHaveBeenCalledWith(expect.anything(), 0);
});

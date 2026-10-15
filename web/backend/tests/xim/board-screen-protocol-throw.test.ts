process.env.SKIP_DB_INIT = '1';
jest.mock('../../src/amiga-emulation/xim/board-screen', () => ({
  boardScreenAnswer: jest.fn(async () => { throw new Error('boom'); }),
}));

import { XIMProtocol } from '../../src/amiga-emulation/XIMProtocol';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function makeProtocol(): any {
  const mem = new Map<number, number>();
  const emulator: any = {
    readMemory: (a: number) => mem.get(a) ?? 0, writeMemory: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory8: (a: number) => mem.get(a) ?? 0, writeMemory8: (a: number, v: number) => { mem.set(a, v & 0xff); },
    readMemory16: () => 0, writeMemory16: () => undefined, readMemory32: () => 0, writeMemory32: () => undefined,
    readString: () => '', writeString: () => undefined, resume: jest.fn(), pause: jest.fn(),
  };
  const socket: any = { id: 's', emit: jest.fn(), on: jest.fn() };
  socket._directEmit = socket.emit;
  const session: any = { nodeId: 1, doorCommand: 'MENU', screenWidth: 80, user: { id: 1, username: 'spot', secLevel: 255, securityFlags: 'T'.repeat(128), userFlags: 0 } };
  const protocol: any = new XIMProtocol(emulator, { replyMsg: jest.fn(), putMsg: jest.fn() } as any, socket, 1, session);
  jest.spyOn(protocol, 'sendReply').mockImplementation(() => undefined);
  return protocol;
}
const ask = (p: any, string: string) => p.handleMessage({ command: XIMCommand.AEW_SCREEN, data: 1, msgAddr: 0x1000, string, replyPort: 0x2000 });

test('a boardScreenAnswer that throws is answered empty and releases a held wipe', async () => {
  const p = makeProtocol();
  p.state.wipeCapture = { kind: 'in', letter: 'H', text: ['x'] };
  await ask(p, 'WIPE END');
  expect(p.sendReply).toHaveBeenCalledWith(expect.anything(), 0);
  expect(p.state.wipeCapture).toBeNull();
});

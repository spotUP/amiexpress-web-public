process.env.SKIP_DB_INIT = '1';

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

test('through the real XIMProtocol: MOUSE ON takes a report out of the key queue and leaves one wake byte; JH_SHUTDOWN lets go', async () => {
  const p = makeProtocol();
  const queue = jest.spyOn(p.ioHandler, 'queueInput').mockImplementation(() => undefined);
  await ask(p, 'MOUSE ON');
  expect(p.sendReply).toHaveBeenLastCalledWith(expect.anything(), 2);   // 'OK'
  p.queueInput('a\x1b[<0;1;1M');
  expect(queue).toHaveBeenCalledWith('a\x1e');
  await ask(p, 'MOUSE?');
  expect(p.sendReply).toHaveBeenLastCalledWith(expect.anything(), 'P\t1\t1'.length);
  await ask(p, 'WIPE IN H');
  expect(p.state.wipeCapture).not.toBeNull();
  await p.handleMessage({ command: XIMCommand.JH_SHUTDOWN, data: 0, msgAddr: 0x1000, string: '', replyPort: 0x2000 });
  expect(p.mouse).toBeNull();
  expect(p.state.wipeCapture).toBeNull();
  queue.mockClear();
  p.queueInput('b\x1b[<0;1;1M');   // no absorber now: the bytes pass as typed
  expect(queue).toHaveBeenCalledWith('b\x1b[<0;1;1M');
});

test('a door that writes while a wipe is held has it held, with the break msg.data asked for', async () => {
  const p = makeProtocol();
  await ask(p, 'WIPE IN H');
  p.ioHandler.emitText('line one', true, false, false);
  p.ioHandler.emitText('a\nb', false, false, false);
  expect(p.state.wipeCapture.text.join('')).toMatch(/^line one\r?\na\r?\nb$/);
  expect(p.socket.emit).not.toHaveBeenCalledWith('ansi-output', expect.stringContaining('line one'), expect.anything());
});

test('through the real XIMProtocol: a lone ESC after MOUSE ON reaches the key queue as Esc after the settle window', async () => {
  jest.useFakeTimers();
  try {
    const p = makeProtocol();
    const queue = jest.spyOn(p.ioHandler, 'queueInput').mockImplementation(() => undefined);
    await ask(p, 'MOUSE ON');
    p.queueInput('\x1b');
    expect(queue).not.toHaveBeenCalled();
    jest.advanceTimersByTime(200);
    expect(queue).toHaveBeenCalledWith('\x1b');
  } finally { jest.useRealTimers(); }
});

test('through the real XIMProtocol: MOUSE OFF right after a lone ESC still delivers the Esc key, and carrier loss drops the timer', async () => {
  jest.useFakeTimers();
  try {
    const p = makeProtocol();
    const queue = jest.spyOn(p.ioHandler, 'queueInput').mockImplementation(() => undefined);
    await ask(p, 'MOUSE ON');
    p.queueInput('\x1b');
    await ask(p, 'MOUSE OFF');
    expect(queue).toHaveBeenCalledWith('\x1b');
    expect(p.mouse).toBeNull();
    await ask(p, 'MOUSE ON');
    queue.mockClear();
    p.queueInput('\x1b');
    p.markCarrierDropped();
    jest.advanceTimersByTime(500);
    expect(queue).not.toHaveBeenCalled();
  } finally { jest.useRealTimers(); }
});

test('through the real XIMProtocol: MOUSE ON B adds the button (2 = right) as a fourth MOUSE? field; plain MOUSE ON keeps three fields', async () => {
  const p = makeProtocol();
  jest.spyOn(p.ioHandler, 'queueInput').mockImplementation(() => undefined);
  await ask(p, 'MOUSE ON B');
  p.queueInput('\x1b[<2;5;6M');
  await ask(p, 'MOUSE?');
  expect(p.sendReply).toHaveBeenLastCalledWith(expect.anything(), 'P\t5\t6\t2'.length);
  await ask(p, 'MOUSE ON');   // an older door's arm: its strict three-field parser must still match
  p.queueInput('\x1b[<2;5;6M');
  await ask(p, 'MOUSE?');
  expect(p.sendReply).toHaveBeenLastCalledWith(expect.anything(), 'P\t5\t6'.length);
});

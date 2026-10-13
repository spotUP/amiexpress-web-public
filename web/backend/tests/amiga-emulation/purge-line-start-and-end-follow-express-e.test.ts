/**
 * BB_PURGELINESTART / BB_PURGELINEEND - express.e:1906-1913, 1889-1905.
 *
 * purgeLineStart: everything is under serialReadIO<>NIL, a web node has none,
 * so typed-ahead keys stay. purgeLineEnd: purgeTelnet() drains what the caller
 * already sent, unless transfering or doorSilent (1892).
 */
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

function make(state: { transfering: boolean; doorSilent: boolean }) {
  const messageParser: any = { writeData: jest.fn(), writeMessageString: jest.fn(), getCommandName: () => 'X' };
  const emulator: any = { readMemory32: () => 0, writeMemory: jest.fn(), resume: jest.fn() };
  const execLibrary: any = { replyMsg: jest.fn(), putMsg: jest.fn() };
  const socket: any = { emit: jest.fn() };
  const h: any = new XIMIOHandler(emulator, execLibrary, socket, messageParser, { carrierDropped: false, ...state } as any, {} as any);
  h.queueInput('ab');
  return h;
}
const msg = (command: number): any => ({ command, msgAddr: 0x1000 });

describe('purge line start and end', () => {
  it('start leaves typed-ahead keys queued (no serial port)', () => {
    const h = make({ transfering: false, doorSilent: false });
    h.handlePurgeLine(msg(XIMCommand.BB_PURGELINESTART));
    expect(h.hasQueuedInput()).toBe(true);
  });
  it('end drains typed-ahead keys', () => {
    const h = make({ transfering: false, doorSilent: false });
    expect(h.hasQueuedInput()).toBe(true);
    h.handlePurgeLine(msg(XIMCommand.BB_PURGELINEEND));
    expect(h.hasQueuedInput()).toBe(false);
  });
  it('end leaves keys alone during a transfer or a silent door', () => {
    for (const st of [{ transfering: true, doorSilent: false }, { transfering: false, doorSilent: true }]) {
      const h = make(st);
      h.handlePurgeLine(msg(XIMCommand.BB_PURGELINEEND));
      expect(h.hasQueuedInput()).toBe(true);
    }
  });
});

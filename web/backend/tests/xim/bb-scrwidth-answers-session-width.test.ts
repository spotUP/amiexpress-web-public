/**
 * BB_SCRWIDTH (express.e:3865-3866 msg.data:=screen.width) through the LIVE
 * handler: XIMProtocol.ts:1130-1134 dispatches it to
 * XIMBBSInfoHandler.handleScreenDimensions. A C64 caller is told 40 (the
 * session width); every ANSI caller is told 80 exactly as before.
 */
import { XIMBBSInfoHandler } from '../../src/amiga-emulation/xim/bbs-info';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { XIMCommand, BBSSessionData, XIMState } from '../../src/amiga-emulation/xim/types';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { MemStub } from '../amiga-emulation/helpers/mem-stub';

function build(bbsSession: BBSSessionData) {
  const emulator = new MemStub() as any;
  const messageParser = new XIMMessageParser(emulator);
  const msgAddr = 0x1000;
  emulator.writeMemory16(msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, DoorConstants.MESSAGE_TOTAL_LENGTH);
  const state = { registered: true, lineWrap: 80, pauseLines: 24 } as unknown as XIMState;
  const execLibrary = { replyMsg: jest.fn(), putMsg: jest.fn() } as any;
  const socket = { emit: jest.fn() } as any;
  const handler = new XIMBBSInfoHandler(emulator, execLibrary, socket, messageParser, bbsSession, state);
  const ask = (command: number) => {
    handler.handleScreenDimensions({ msgAddr, command, data: 0, replyPort: 0xdead0000, messageLength: DoorConstants.MESSAGE_TOTAL_LENGTH, string: '' } as any);
    return emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
  };
  return { ask, execLibrary };
}

describe('BB_SCRWIDTH answers the session width', () => {
  it('tells a PETSCII session it has 40 columns', () => {
    expect(build({ nodeId: 1, petsciiMode: true, screenWidth: 40 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(40);
  });

  it('tells a PETSCII session with no width recorded 40 columns', () => {
    expect(build({ nodeId: 1, petsciiMode: true }).ask(XIMCommand.BB_SCRWIDTH)).toBe(40);
  });

  it('tells every ANSI session 80 columns - even a 40-wide one that is not PETSCII', () => {
    expect(build({ nodeId: 1 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(80);
    expect(build({ nodeId: 1, petsciiMode: false, screenWidth: 40 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(80);
    expect(build({ nodeId: 1, screenWidth: 132 }).ask(XIMCommand.BB_SCRWIDTH)).toBe(80);
  });

  it('leaves BB_SCRLEFT / BB_SCRTOP at 0 and still replies to the door', () => {
    const b = build({ nodeId: 1, petsciiMode: true, screenWidth: 40 });
    expect(b.ask(XIMCommand.BB_SCRLEFT)).toBe(0);
    expect(b.ask(XIMCommand.BB_SCRTOP)).toBe(0);
    expect(b.execLibrary.replyMsg).toHaveBeenCalled();
  });
});

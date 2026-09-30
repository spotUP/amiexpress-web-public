/**
 * JH_EF: a door asks the board to edit a text file (express.e:3477-3485):
 *
 *   fileattach:=FALSE; loadMsg(path)
 *   IF edit()=RESULT_SUCCESS THEN saveMsg(path); data:=1 ELSE data:=-1
 *
 * The handler used to answer data=1 at once - "saved" - with nothing edited
 * and nothing written. Now the door waits, paused, while the caller uses the
 * board's line editor, and hears 1 after S or -1 after an abort.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import { XIMSystemCommandsHandler } from '../../src/amiga-emulation/xim/system-commands';
import { XIMMessageParser } from '../../src/amiga-emulation/xim/messages';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { DoorConstants } from '../../src/amiga-emulation/DoorTypes';
import { LoggedOnSubState } from '../../src/constants/bbs-states';
import {
  handleMessageBodyInput,
  handleMessageOptionsInput,
  handleMessageAbortConfirm,
} from '../../src/handlers/message/message-entry.handler';
import { loadMsgLines, saveMsgText } from '../../src/handlers/message/door-edit-file';

class StubEmulator {
  mem = new Uint8Array(0x10000);
  pause = jest.fn();
  resume = jest.fn();
  readMemory(a: number): number { return this.mem[a & 0xffff] ?? 0; }
  writeMemory(a: number, v: number): void { this.mem[a & 0xffff] = v & 0xff; }
  readMemory16(a: number): number { return ((this.readMemory(a) << 8) | this.readMemory(a + 1)) & 0xffff; }
  writeMemory16(a: number, v: number): void { this.writeMemory(a, v >> 8); this.writeMemory(a + 1, v); }
  readMemory32(a: number): number {
    return ((this.readMemory(a) << 24) >>> 0) + (this.readMemory(a + 1) << 16) + (this.readMemory(a + 2) << 8) + this.readMemory(a + 3);
  }
  writeMemory32(a: number, v: number): void {
    this.writeMemory(a, v >>> 24); this.writeMemory(a + 1, v >>> 16); this.writeMemory(a + 2, v >>> 8); this.writeMemory(a + 3, v);
  }
  readString(a: number, max: number): string {
    let out = '';
    for (let i = 0; i < max; i++) { const b = this.readMemory(a + i); if (b === 0) break; out += String.fromCharCode(b); }
    return out;
  }
  getRegister(): number { return 0; }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 30));

function setUp(fileText: string | null) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'jh-ef-'));
  const file = path.join(dir, 'note.txt');
  if (fileText !== null) fs.writeFileSync(file, fileText, 'latin1');

  const emulator = new StubEmulator();
  const parser = new XIMMessageParser(emulator as any);
  const msgAddr = 0x1000;
  emulator.writeMemory16(msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, 0x150);
  const doorTempData = { door: 'state' };
  const session: any = {
    user: { username: 'spot', secLevel: 255, lineLength: 80 },
    nodeId: 1,
    bbsPath: dir,
    subState: LoggedOnSubState.DOOR_RUNNING,
    tempData: doorTempData,
  };
  const output: string[] = [];
  const socket: any = { emit: (_e: string, text: string) => output.push(String(text)) };
  const state: any = { carrierDropped: false, replyHandled: false };
  const handler = new XIMSystemCommandsHandler(emulator as any, { replyMsg: jest.fn(), putMsg: jest.fn() } as any,
    socket, parser, session, state);
  const msg: any = { msgAddr, command: XIMCommand.JH_EF, data: 0, string: 'BBS:note.txt' };
  const data = () => emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET) | 0;
  return { handler, emulator, msg, session, socket, state, file, output, data, doorTempData };
}

describe('a door asking the board to edit a file (JH_EF)', () => {
  it('waits for the caller, saves what they wrote and answers 1', async () => {
    const t = setUp('first line\r\nsecond line\n\n\n');
    t.handler.handleEditFile(t.msg);
    await flush();

    expect(t.emulator.pause).toHaveBeenCalled();
    expect(t.state.replyHandled).toBe(false);
    expect(t.session.doorLentTerminal).toBe(true);
    expect(t.session.subState).toBe(LoggedOnSubState.POST_MESSAGE_BODY);
    expect(t.output.join('')).toContain('second line');

    await handleMessageBodyInput(t.socket, t.session, 'third line');
    await handleMessageBodyInput(t.socket, t.session, '');
    expect(t.output.join('')).not.toMatch(/\x1b\[33mF\x1b\[36m/); // fileattach:=FALSE
    await handleMessageOptionsInput(t.socket, t.session, 'S');
    await flush();

    expect(fs.readFileSync(t.file, 'latin1')).toBe('first line\nsecond line\nthird line\n');
    expect(t.data()).toBe(1);
    expect(t.state.replyHandled).toBe(true);
    expect(t.emulator.resume).toHaveBeenCalled();
    expect(t.session.doorLentTerminal).toBe(false);
    expect(t.session.subState).toBe(LoggedOnSubState.DOOR_RUNNING);
    expect(t.session.tempData).toBe(t.doorTempData);
  });

  it('answers -1 and leaves the file alone when the caller aborts', async () => {
    const t = setUp('keep me\n');
    t.handler.handleEditFile(t.msg);
    await flush();
    await handleMessageBodyInput(t.socket, t.session, 'thrown away');
    await handleMessageBodyInput(t.socket, t.session, '');
    await handleMessageOptionsInput(t.socket, t.session, 'A');
    await handleMessageAbortConfirm(t.socket, t.session, 'Y');
    await flush();

    expect(fs.readFileSync(t.file, 'latin1')).toBe('keep me\n');
    expect(t.data()).toBe(-1);
    expect(t.session.subState).toBe(LoggedOnSubState.DOOR_RUNNING);
  });
});

describe('loadMsg and saveMsg', () => {
  it('drops trailing blank lines but keeps the first line', () => {
    expect(loadMsgLines('a\r\n\r\nb\n\n\n')).toEqual(['a', '', 'b']);
    expect(loadMsgLines('\n\n')).toEqual(['']);
    expect(loadMsgLines(null)).toEqual([]);
  });

  it('writes nothing for an empty buffer', () => {
    expect(saveMsgText([])).toBeNull();
    expect(saveMsgText(['a', ''])).toBe('a\n\n');
  });
});

/**
 * How a 68K door learns the caller's width.
 *
 * ONE SOURCE PIN AND ONE DRIVEN TEST, and the split is deliberate:
 *
 *  - `launchAmigaDoor` builds the 68K bbsSession's geometry through
 *    `doorSessionGeometry()`, which carries petsciiMode, texttvMode,
 *    screenWidth and lineWrap across as ONE thing. That launch needs a whole
 *    emulator to reach, so the call site stays pinned by source; the function
 *    it must call is driven by tests/xim/teletext-door-geometry.test.ts.
 *
 *  - `DoorMessageHandler`'s fallback BB_SCRWIDTH IS constructible, the header
 *    here said otherwise for months, and nobody checked. It is driven now.
 */
import * as fs from 'fs';
import * as path from 'path';

const read = (p: string) => fs.readFileSync(path.resolve(__dirname, '../../src', p), 'utf8');

describe('door launch hands the 68K session its PETSCII width', () => {
  it('launchAmigaDoor builds the 68K session geometry through doorSessionGeometry', () => {
    const src = read('handlers/door.handler.ts');
    const literal = src.slice(src.indexOf('const amigaSession = new AmigaDoorSession(socket, {'), src.indexOf('[launchAmigaDoor] bbsSession.currentConference='));
    // The three fields now travel together, through doorSessionGeometry -
    // pinned by behaviour in tests/xim/teletext-door-geometry.test.ts. What
    // this still holds is that the LAUNCH SITE goes through it rather than
    // rebuilding the literal by hand, which is how texttvMode was left out.
    expect(literal).toContain('...doorSessionGeometry(session, terminalWidth),');
    expect(literal).not.toContain('lineWrap: terminalWidth,');
    expect(literal).not.toContain('petsciiMode: session.petsciiMode === true,');
  });

  /**
   * What the door is actually TOLD, read out of the memory it would read.
   *
   * BB_SCRWIDTH writes its answer into the message it was handed, so the test
   * watches `writeMemory32` at the data offset. A literal 80 - the bug this
   * guards - shows up as an 80 for a caller who is on forty columns.
   */
  const answeredWidthFor = async (bbsSession: any): Promise<number> => {
    const { DoorMessageHandler } = require('../../src/amiga-emulation/session/DoorMessageHandler');
    const { DoorConstants } = require('../../src/amiga-emulation/DoorTypes');
    const { XIMCommand } = require('../../src/amiga-emulation/XIMProtocol');

    const writes = new Map<number, number>();
    const emulator: any = {
      writeMemory32: (addr: number, value: number) => { writes.set(addr, value); },
      writeMemory16: () => {}, writeMemory: () => {},
      readMemory32: () => 0, readMemory16: () => 0, readMemory: () => 0,
      readString: () => '',
    };
    const socket: any = { emit: () => true, on: () => {}, off: () => {} };
    const execLibrary: any = { replyMessage: () => {}, putMsg: () => {} };

    const handler = new DoorMessageHandler(emulator, socket, execLibrary, {
      executablePath: '/nowhere/door', bbsSession,
    });

    const msgAddr = 0x1000;
    await (handler as any).processCommand(XIMCommand.BB_SCRWIDTH, 0, '', msgAddr, 0);
    return writes.get(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET) as number;
  };

  it('tells a PETSCII door forty columns, not a literal 80', async () => {
    await expect(answeredWidthFor({ petsciiMode: true, screenWidth: 40 })).resolves.toBe(40);
  });

  it('tells an 80-column caller eighty', async () => {
    await expect(answeredWidthFor({ petsciiMode: false, screenWidth: 80 })).resolves.toBe(80);
  });
});

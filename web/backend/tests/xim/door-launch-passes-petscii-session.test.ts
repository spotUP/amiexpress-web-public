/**
 * How a 68K door learns the caller's width.
 *
 * `DoorMessageHandler`'s fallback BB_SCRWIDTH IS constructible - the header
 * here said otherwise for months, and nobody checked - so it is driven: the
 * width the door is told is read back out of the message it was handed.
 *
 * This file also used to pin, by source text, that `launchAmigaDoor` built
 * the 68K session's geometry through `doorSessionGeometry()`. That function
 * has no callers (tests/xim/dead-launch-path.test.ts holds it that way), so
 * the pin guarded nothing a caller can reach and was removed. The live launch,
 * executeAmigaDoor, hands the door the caller's own session object; the
 * geometry helper itself is driven by tests/xim/teletext-door-geometry.test.ts.
 */
describe('door launch hands the 68K session its PETSCII width', () => {
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

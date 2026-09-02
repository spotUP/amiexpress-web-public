/**
 * A 68K door's plain text line wraps at 40 on a PETSCII session through the
 * EXISTING xim/io.ts wrapLine path (io.ts:1457) once state.lineWrap carries
 * doorScreenWidth(); an ANSI session's line is emitted byte-identical.
 */
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';
import { doorScreenWidth } from '../../src/amiga-emulation/xim/screen-width.util';

const STRIP = /\x1b\[[0-9;?]*[A-Za-z]/g;

function buildHandler(lineWrap: number) {
  const emits: string[] = [];
  const socket: any = { emit: (ev: string, payload: string) => { if (ev === 'ansi-output') emits.push(payload); return true; } };
  const emulator: any = { pause: () => {}, resume: () => {}, readMemory: () => 0, readMemory32: () => 0, writeMemory: () => {} };
  const execLibrary: any = { replyMsg: () => {}, putMsg: () => {} };
  const messageParser: any = { writeCommand: () => {}, writeMessageString: () => {}, writeData: () => {}, getCommandName: () => 'JH_SO' };
  const state: any = {
    registered: true, shuttingDown: false, nonStopText: false, autoPauseEnabled: false, lineCount: 0,
    lineWrap, pauseLines: 24, language: '', confAccess: '', carrierDropped: false, rawArrow: false,
    transfering: false, doorSilent: false,
  };
  const handler = new XIMIOHandler(emulator, execLibrary, socket, messageParser, state, { user: { secLevel: 100 } } as any);
  (handler as any).getMessageString = (m: any) => m.string || '';
  return { handler, emits };
}

const PROSE = 'the quick brown fox jumps over the lazy dog and keeps on running past the fence';

function serialOutput(handler: XIMIOHandler, text: string) {
  handler.handleSerialOutput({ msgAddr: 0xdead0000, command: XIMCommand.JH_SO, data: 1, replyPort: 0, string: text } as any);
}

describe('68K door text on a PETSCII session', () => {
  it('wraps a prose line at 40 columns and loses no characters', () => {
    const { handler, emits } = buildHandler(doorScreenWidth({ petsciiMode: true, screenWidth: 40 }, 80));
    serialOutput(handler, PROSE);
    const segments = emits.join('').split(/\r?\n/).filter((s) => s.length > 0).map((s) => s.replace(STRIP, ''));
    expect(segments.length).toBe(2);
    for (const s of segments) expect(s.length).toBeLessThanOrEqual(40);
    expect(segments.join('')).toBe(PROSE);
  });

  it('emits an ANSI session line byte-identical, one segment, whatever the caller width', () => {
    const { handler, emits } = buildHandler(doorScreenWidth({ petsciiMode: false, screenWidth: 40 }, 80));
    serialOutput(handler, PROSE);
    expect(emits.join('').replace(/\r?\n$/, '')).toBe(PROSE);
  });
});

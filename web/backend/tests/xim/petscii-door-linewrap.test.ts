/**
 * A 68K door's plain text line wraps at 40 on a PETSCII session through the
 * EXISTING xim/io.ts wrapLine path (io.ts:1457) once state.lineWrap carries
 * doorScreenWidth(); an ANSI session's line is emitted byte-identical.
 */
import * as fs from 'fs';
import * as path from 'path';
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

/**
 * The live 68K path (command-execution.handler.ts:512 -> executeDoor ->
 * executeAmigaDoor) passes the LIVE session as bbsSession (door.handler.ts:2921).
 * It carries no lineWrap, so XIMProtocol.ts:141's `?? 80` leaves the io.ts
 * safety net at 80 - which is what the adapter needs, because wrapLine
 * (line-wrap.util.ts:61-67) is a hard CHARACTER wrap with no word awareness and
 * at 40 would cut words in half before the reconstructor ever saw the row.
 * BB_SCRWIDTH still answers 40, so a width-aware door still self-adapts.
 */
describe('width consistency ruling: 80-column wrap, 40-column BB_SCRWIDTH', () => {
  it('a PETSCII door on the live path wraps at 80, so words survive to the ladder', () => {
    const { handler, emits } = buildHandler(80);
    serialOutput(handler, PROSE);
    expect(emits.join('').replace(/\r?\n$/, '').replace(STRIP, '')).toBe(PROSE);
  });

  it('BB_SCRWIDTH still answers 40 for a PETSCII session', () => {
    expect(doorScreenWidth({ petsciiMode: true, screenWidth: 40 })).toBe(40);
  });

  it('a live-path bbsSession carries no lineWrap, so the XIM default of 80 applies', () => {
    const src = fs.readFileSync(path.resolve(__dirname, '../../src/handlers/door.handler.ts'), 'utf8');
    const block = src.slice(src.indexOf('async function executeAmigaDoor'), src.indexOf('async function executeMciDoor'));
    expect(block).toContain('bbsSession: session');
    expect(block).not.toContain('lineWrap:');
  });
});

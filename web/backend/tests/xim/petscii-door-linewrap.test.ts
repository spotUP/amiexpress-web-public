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

  /*
   * REWRITTEN 2026-09-16. This used to slice `door.handler.ts` between two
   * function names and assert that the text in between said `bbsSession:
   * session` and did not say `lineWrap:`. That passes or fails on a rename,
   * on a reordering, and on any unrelated `lineWrap:` drifting into range -
   * and it proves nothing about what the door actually wraps at.
   *
   * The consequence is what matters and it is directly observable:
   * `XIMProtocol` resolves its wrap width from the session it is handed
   * (`XIMProtocol.ts:145`, `?? 80`), and the live path hands it a session
   * with no `lineWrap` on it. So ask XIMProtocol.
   */
  const ximWrapWidthFor = (bbsSession: any): number => {
    const { XIMProtocol } = require('../../src/amiga-emulation/XIMProtocol');
    const emulator: any = { writeMemory: () => {}, readString: () => '', allocateMemory: () => 0 };
    const execLibrary: any = {};
    const socket: any = { emit: () => true, on: () => {}, off: () => {} };
    const protocol = new XIMProtocol(emulator, execLibrary, socket, 0, bbsSession);
    return (protocol as any).state.lineWrap;
  };

  it('a session with no lineWrap wraps at 80, so words survive to the ladder', () => {
    // The live 68K path hands executeAmigaDoor's XIM the BBS session itself,
    // which carries a screenWidth but never a lineWrap.
    expect(ximWrapWidthFor({ petsciiMode: true, screenWidth: 40 })).toBe(80);
  });

  it('a session that DOES carry lineWrap is still obeyed', () => {
    // The `?? 80` is a default, not an override - a caller that sets the
    // width on purpose (the probe harness does) must still get it.
    expect(ximWrapWidthFor({ lineWrap: 40 })).toBe(40);
  });
});

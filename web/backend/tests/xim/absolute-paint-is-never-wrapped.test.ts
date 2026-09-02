/**
 * A door painting at absolute cursor positions must never be line-wrapped.
 *
 * Reported 2026-09-01 with a screenshot of DOORREPO's /help screen: every
 * row cut short, its remainder appearing at the START of the next row -
 * "browse a doo" then "r doc ...", "inside the archiv" then "e strip ...".
 *
 * The door was innocent. Its 316 XIM messages were captured and replayed:
 * the bytes it sends render the screen perfectly, and processRawText passes
 * them through byte-identical. The break was inserted afterwards, by the
 * line-wrap in emitTextInternal - each XIM message is treated as a LINE and
 * wrapped at state.lineWrap, so a 198-byte message whose visible text runs
 * past the wrap column gets a newline pushed into the middle of it.
 *
 * looksLikeAsciiArt() was the only thing exempting anything, and it asks
 * whether the text LOOKS like art - punctuation ratios, symbol counts. A
 * help row reading "files   browse a door's own files on disk" is mostly
 * letters, so it does not look like art, so it was wrapped.
 *
 * Looking like art was never the point. The question is whether the door is
 * printing a line or painting a screen. A message that moves the cursor to
 * a row and column is painting: it has no lines to wrap, and breaking it
 * moves everything after the break to somewhere the door never asked for.
 */
import { positionsCursorAbsolutely } from '../../src/utils/ascii-art.util';
import { XIMIOHandler } from '../../src/amiga-emulation/xim/io';
import { XIMCommand } from '../../src/amiga-emulation/xim/types';

describe('recognising a door that paints rather than prints', () => {
  it('spots the cursor-position sequence a screen paint is built from', () => {
    // ESC[<row>;<col>H - what DoorRepo emits before every row it draws.
    expect(positionsCursorAbsolutely('\x1b[9;3Hfiles       browse a door\'s own files')).toBe(true);
    expect(positionsCursorAbsolutely('\x1b[12;40H')).toBe(true);
  });

  it('accepts the other ways of putting the cursor somewhere', () => {
    expect(positionsCursorAbsolutely('\x1b[5;1f-')).toBe(true);   // HVP, the older spelling
    expect(positionsCursorAbsolutely('\x1b[3AX')).toBe(true);     // cursor up
    expect(positionsCursorAbsolutely('\x1b[10CX')).toBe(true);    // cursor right
    expect(positionsCursorAbsolutely('\x1b[HX')).toBe(true);      // home, no parameters
    expect(positionsCursorAbsolutely('\x1b[2Jx')).toBe(true);     // erase display, clearing before a paint
    expect(positionsCursorAbsolutely('\x1b[u')).toBe(true);       // restore cursor, resuming a paint
  });

  it('leaves ordinary door output alone', () => {
    // The teletype doors this wrap exists FOR: a long line with no
    // positioning in it still needs wrapping, or it runs off the screen.
    expect(positionsCursorAbsolutely('Welcome to the BBS, please enter your name:')).toBe(false);
    expect(positionsCursorAbsolutely('')).toBe(false);
  });

  it('is not fooled by colour changes on their own', () => {
    // SGR moves nothing. A coloured but unpositioned line is still a line.
    expect(positionsCursorAbsolutely('\x1b[0;37;40mplain coloured text')).toBe(false);
    expect(positionsCursorAbsolutely('\x1b[1;33mBOLD YELLOW\x1b[0m')).toBe(false);
  });

  it('spots positioning anywhere in the message, not only at the front', () => {
    // The reported case exactly: XIM messages are cut at 198 bytes, so a
    // message routinely begins mid-text and positions later on.
    const midMessage = 'install it as a BBS command      \x1b[8;3Huninstall   remove an installed door';
    expect(positionsCursorAbsolutely(midMessage)).toBe(true);
  });
});

describe('the emitter uses it', () => {
  // A predicate nobody calls would leave the screenshot unchanged.
  const fs = require('fs');
  const path = require('path');
  const source = fs.readFileSync(
    path.resolve(__dirname, '../../src/amiga-emulation/xim/io.ts'), 'utf8'
  );

  it('asks before wrapping', () => {
    expect(source).toContain('positionsCursorAbsolutely');
  });

  it('still wraps the doors the wrap was written for', () => {
    // The exemption must be a condition ON the wrap, not a removal of it.
    expect(source).toContain('wrapLine(');
  });
});

/**
 * positionsCursorAbsolutely gained J/K/s/u (petscii-full-canvas plan,
 * Task 10) so wrap-for-session.util.ts could reuse it as the one
 * cursor-control detector instead of keeping a second, drifted regex. This
 * function has another consumer, though: io.ts's own line-wrap safety net
 * (io.ts:~1455, `(lineLooksLikeArt || positionsCursorAbsolutely(line)) ?
 * [line] : wrapLine(...)`), for EVERY session, ANSI or PETSCII.
 *
 * The widened match set changes that consumer's behavior too: a long line
 * whose only control code is an erase (ESC[K/ESC[J) or a save/restore
 * (ESC[s/ESC[u) - no cursor motion at all - is now exempt from the wrap
 * the same way a positioned line already was. Ruling: correct - a door
 * erasing or saving/restoring cursor state mid-line is composing a screen
 * by the same principle as one that moves the cursor - but it shipped with
 * no test pinning it. Pinned here against the real io.ts path (not just
 * the predicate) using the same XIMIOHandler harness as
 * petscii-door-linewrap.test.ts.
 */
describe('io.ts line-wrap safety net: erase and save/restore also exempt a line', () => {
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

  function serialOutput(handler: XIMIOHandler, text: string) {
    handler.handleSerialOutput({ msgAddr: 0xdead0000, command: XIMCommand.JH_SO, data: 1, replyPort: 0, string: text } as any);
  }

  it('an 80+ column line whose only control code is ESC[K (erase to end of line) is not wrapped', () => {
    const line = 'x'.repeat(90) + '\x1b[K';
    const { handler, emits } = buildHandler(80);
    serialOutput(handler, line);
    // If wrapLine() had run, a newline would land INSIDE the 90-char run;
    // stripping only the trailing newline would then leave a mismatch.
    expect(emits.join('').replace(/\r?\n$/, '')).toBe(line);
  });

  it('an 80+ column line whose only control code is ESC[s (save cursor) is not wrapped', () => {
    const line = 'y'.repeat(90) + '\x1b[s';
    const { handler, emits } = buildHandler(80);
    serialOutput(handler, line);
    expect(emits.join('').replace(/\r?\n$/, '')).toBe(line);
  });
});

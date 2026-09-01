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

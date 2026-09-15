/**
 * The upload prompt must not wear the previous screen's text as a tail.
 *
 * The sysop, 2026-09-15, pressing `u` at the menu:
 *
 *   FileName 1: eb BBS [1:Amiga Demoscene!] Menu (9999 mins. left): u
 *
 * `FileName 1: ` is twelve columns. `The Uptown W` - the first twelve of the
 * menu prompt that was already on that row - is also twelve. So the prompt
 * replaced columns 0-11 and column 12 onward was simply never written, and
 * therefore never replaced.
 *
 * This is NOT the pause collision that `1a5291c4c` fixed, and it is not a
 * missing screen clear: express.e's `uploadDesc` (17656-17665) is plain
 * `aePuts` with no clear and no erase, and real AmiExpress needs neither,
 * because its output scrolls onto rows that are already blank. This board
 * draws over full-screen ANSI art that does not scroll away.
 *
 * So the port erases the rest of the row it writes - and only that.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';

import { eraseRestOfLine, clearTheScreen } from '../../src/utils/output.util';
import { ANSI } from '../../src/constants/ansi-codes';

const aSocket = (session?: Record<string, unknown>) => ({ id: 'x', session } as any);

describe('erasing the rest of a row', () => {
  it('erases for a caller with ANSI', () => {
    expect(eraseRestOfLine(aSocket({ ansiEnabled: true }))).toBe(ANSI.CLEAR_LINE_END);
  });

  it('erases when nothing has said otherwise', () => {
    // Every existing site in this codebase (flag-pause.util, the pause
    // cleanup in screen.handler) erases unconditionally; an absent flag must
    // not silently turn that off.
    expect(eraseRestOfLine(aSocket({}))).toBe(ANSI.CLEAR_LINE_END);
    expect(eraseRestOfLine(aSocket(undefined))).toBe(ANSI.CLEAR_LINE_END);
  });

  it('sends a PETSCII caller no escape sequence at all', () => {
    // It would be printed as glyphs, which is a worse mess than the tail.
    expect(eraseRestOfLine(aSocket({ ansiEnabled: false }))).toBe('');
  });

  it('actually removes the tail it is there to remove', () => {
    // The bug, reproduced as text: writing over a row without erasing keeps
    // whatever was longer than what you wrote.
    const behind = 'The Uptown Web BBS [1:Amiga Demoscene!] Menu (9999 mins. left): ';
    const written = 'FileName 1: ';
    const naive = written + behind.slice(written.length);
    expect(naive).toContain('eb BBS [1:Amiga Demoscene!] Menu');   // what he saw

    const erased = written + eraseRestOfLine(aSocket({ ansiEnabled: true }));
    expect(erased).toBe('FileName 1: ' + ANSI.CLEAR_LINE_END);
    expect(erased).not.toContain('eb BBS');
  });
});

describe('the upload screen starts clean', () => {
  it('clears before it draws anything', () => {
    // The sysop, 2026-09-15: "clear. the. fucking. screen. before. drawing.
    // the. upload. stuff." express.e does not (cleanItUp at 17656 cleans the
    // node work directory), and erasing each row as it was written still left
    // the art between and above the lines.
    expect(clearTheScreen(aSocket({ ansiEnabled: true }))).toBe(ANSI.CLEAR_SCREEN);
  });

  it('clears a PETSCII terminal the way a PETSCII terminal clears', () => {
    // 0x93, not an ANSI sequence it would print as glyphs.
    expect(clearTheScreen(aSocket({ petsciiMode: true }))).toBe('\x93');
  });

  it('is emitted before the first line of the upload block', () => {
    const src = fs.readFileSync(
      path.join(__dirname, '..', '..', 'src/handlers/file/file.handler.ts'), 'utf8');
    const clear = src.indexOf('clearTheScreen(socket)');
    const firstLine = src.indexOf('UPLOADING to ${uploadArea.ulPath}');
    expect(clear).toBeGreaterThan(-1);
    expect(firstLine).toBeGreaterThan(-1);
    expect(clear).toBeLessThan(firstLine);
  });
});

/**
 * The pattern, not one line of it: a prompt that forgets to erase is the
 * defect, and there are nine places that draw this one.
 */
describe('every FileName prompt', () => {
  const sources = [
    'src/handlers/file/file.handler.ts',
    'src/handlers/command.handler.ts',
  ].map((rel) => ({
    rel,
    text: fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'),
  }));

  it('erases the rest of its row, in every file that draws one', () => {
    const offenders: string[] = [];
    for (const { rel, text } of sources) {
      for (const line of text.split('\n')) {
        if (!/emitText\([^)]*FileName /.test(line)) continue;
        if (!line.includes('eraseRestOfLine')) offenders.push(`${rel}: ${line.trim()}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('is actually present in both files, so the check above can fail', () => {
    // A pin that matches nothing passes for the wrong reason.
    for (const { rel, text } of sources) {
      const drawn = text.split('\n').filter((l) => /emitText\([^)]*FileName /.test(l));
      expect({ rel, count: drawn.length }).toEqual({ rel, count: drawn.length });
      expect(drawn.length).toBeGreaterThan(0);
    }
  });
});

/**
 * sendCLS has to reach the terminal the caller actually has.
 *
 * express.e:5224-5228 sends ASCII 12, and a real Amiga terminal clears on it.
 * xterm.js treats 0x0C as a line feed, so every `checkScreenClear()` this port
 * made - at every site express.e calls it, the menu at express.e:28585
 * included - asked for a clear that never happened. That is why the sysop's
 * screen kept its old contents no matter how correct the board's side was.
 */
describe('sendCLS on a web terminal', () => {
  const sources = [
    'src/handlers/commands/display-file-commands.handler.ts',
    'src/handlers/message/messaging.handler.ts',
  ].map((rel) => ({
    rel,
    text: fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8'),
  }));

  it('never puts a bare form feed on the wire as a screen clear', () => {
    const offenders: string[] = [];
    for (const { rel, text } of sources) {
      text.split('\n').forEach((line, i) => {
        if (/socket\.emit\(\s*'ansi-output'\s*,\s*'\\x0c'/.test(line)) {
          offenders.push(`${rel}:${i + 1}`);
        }
      });
    }
    expect(offenders).toEqual([]);
  });

  it('clears through the one mapping that knows about PETSCII', () => {
    for (const { rel, text } of sources) {
      expect({ rel, uses: text.includes('clearTheScreen(socket)') })
        .toEqual({ rel, uses: true });
    }
  });
});

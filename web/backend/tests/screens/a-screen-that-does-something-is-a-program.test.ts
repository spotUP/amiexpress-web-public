/**
 * Telling a picture from a program, because a theme may own one and not the
 * other.
 *
 * "the login sequence should not be theme dependant this explains a lot of our
 * issues in the bbs" (sysop, 2026-09-14). `Node/logon20.txt` carries no art -
 * it says which bulletins show, which doors run and where the pauses fall - so
 * a theme carrying its own copy forks the board's login rather than restyling
 * it. This predicate is what lets the loader refuse that.
 */
import * as fs from 'fs';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { screenIsProgram, SCREEN_EXTENSIONS, SERVED_PATH } from '../../src/screens/screen-blankness';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

describe('a screen that does something', () => {
  it('reads the sysop\'s own logon screen as a program', () => {
    // His, byte for byte - 149 bytes and not one of them is art.
    expect(screenIsProgram([
      '~SS_BBS:bulletins/bull6.txt| ~SP',
      '~CC_gl ~SP',
      '~CC_gwall',
      '~5SR_WORK:bbs/Screens/flt/flt ~SP',
      '~SS_BBS:screens/uprough.txt ~SP',
      '~SS_BBS:screens/quicknew.txt',
    ].join('\n'))).toBe(true);
  });

  it.each([
    ['an include', '~SS_BBS:Screens/art.txt'],
    ['the short include', '~2SBBS:Screens/art.txt'],
    ['a pool recursion', '~5SR_WORK:bbs/Screens/flt/flt'],
    ['a conditional include', '~SX_BBS:Screens/art.txt'],
    ['a command', '~CC_gwall'],
    ['a door', '~XI'],
  ])('counts %s', (_what, text) => {
    expect(screenIsProgram(text)).toBe(true);
  });

  it.each([
    ['plain art', 'THE BOARD\r\n  welcome\r\n'],
    ['colour', '\x1b[31mred\x1b[0m\r\n'],
    ['a clear', '~f|\r\n'],
    ['a pause', 'page one ~SP page two'],
    ['the bare gate', '~\n'],
    ['a literal tilde', '~~SS_ is text, not a code\n'],
    ['nothing at all', ''],
  ])('does not count %s', (_what, text) => {
    expect(screenIsProgram(text)).toBe(false);
  });

  it('counts art that ends in an include, because behaviour wins', () => {
    expect(screenIsProgram('SOME ART\r\n\x1b[31mmore art\x1b[0m\r\n~SS_BBS:Screens/tail.txt\r\n'))
      .toBe(true);
  });

  it('finds the programs this repository actually ships', () => {
    // A number, pinned: the predicate deciding differently is a decision, and
    // this is what makes it a visible one. Not an exact count - files come and
    // go - but the ORDER of magnitude, and that art outnumbers programs.
    const tracked = execFileSync('git', ['ls-files', '-z'], { cwd: REPO, maxBuffer: 64 * 1024 * 1024 })
      .toString('utf8').split('\0').filter(Boolean)
      .filter(p => SCREEN_EXTENSIONS.has(path.extname(p).toLowerCase()) && SERVED_PATH.test(p));

    const programs = tracked.filter(p => {
      try { return screenIsProgram(fs.readFileSync(path.join(REPO, p))); } catch { return false; }
    });

    expect(tracked.length).toBeGreaterThan(400);
    expect(programs.length).toBeGreaterThan(20);
    expect(programs.length).toBeLessThan(tracked.length / 2);
  });
});

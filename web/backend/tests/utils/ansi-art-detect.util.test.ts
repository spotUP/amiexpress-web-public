/**
 * C64 40-col plan, Task 7: "is this SCREEN art?" - the decision that keeps
 * the PETSCII text fallback from smearing an 80-column picture across a
 * 40-column C64.
 *
 * The row-level heuristic is NOT re-implemented here: `isAnsiArtScreen`
 * delegates to the SDK's frozen `looksLikeAsciiArt` /
 * `positionsCursorAbsolutely` (re-exported by
 * web/backend/src/utils/ascii-art.util.ts), the same pair the 80-column
 * line-wrap safety net and `wrapForSession` use. What this module adds is
 * SCREEN-LEVEL POLICY - how many art rows make a screen art - and that
 * policy is what these tests pin, including against the board's own
 * Screens/ files.
 */
import * as path from 'path';
import * as fs from 'fs';

import {
  isAnsiArtScreen,
  petsciiTextScreenPlan,
  ANSI_ART_SKIPPED_NOTICE,
  ART_ROW_SHARE,
  MIN_ART_ROWS,
} from '../../src/utils/ansi-art-detect.util';
import { looksLikeAsciiArt } from '../../src/utils/ascii-art.util';

const REPO_ROOT = path.resolve(__dirname, '../../../..');

const PROSE =
  'Welcome to the board!\r\n' +
  'Today we have new files in the Amiga conference.\r\n' +
  'Enjoy your stay.\r\n';

/** Unicode block elements, as the plan's fixture writes them. */
const BLOCK_ART = (
  String.fromCharCode(0x2588, 0x2584, 0x2580, 0x2591, 0x2592, 0x2593).repeat(40) + '\r\n'
).repeat(10);

/**
 * The same picture as CP437 BYTES (0xDB/0xDC/0xDF/0xB0/0xB1/0xB2), which is
 * what `loadScreenFile` actually hands `displayScreen` for a real .ANS on
 * this board - built with fromCharCode so no editor can UTF-8 round-trip
 * the high bits away.
 */
const CP437_ART = (
  String.fromCharCode(0xdb, 0xdc, 0xdf, 0xb0, 0xb1, 0xb2).repeat(40) + '\r\n'
).repeat(10);

/** One line, five absolute cursor moves: a layout, not a paragraph. */
const POSITIONED =
  '\x1b[1;1H\x1b[44m*\x1b[2;40H*\x1b[10;20H*\x1b[24;79H*\x1b[12;12Hcentered';

describe('isAnsiArtScreen', () => {
  it('prose is not art', () => {
    expect(isAnsiArtScreen(PROSE)).toBe(false);
  });

  it('block-glyph density marks art (Unicode blocks)', () => {
    expect(isAnsiArtScreen(BLOCK_ART)).toBe(true);
  });

  it('block-glyph density marks art (CP437 high bytes, as the loader delivers them)', () => {
    expect(isAnsiArtScreen(CP437_ART)).toBe(true);
  });

  it('cursor-positioned screens are art', () => {
    expect(isAnsiArtScreen(POSITIONED)).toBe(true);
  });

  it('a single cursor-forward column move anywhere makes the screen art (bull7 shape)', () => {
    expect(
      isAnsiArtScreen('SANDMAN\x1b[22C GLOBAL ELITE BBS-LIST\r\nordinary sentence here\r\n')
    ).toBe(true);
  });

  it('a prose screen with one colored heading is still prose', () => {
    expect(isAnsiArtScreen('\x1b[33mBULLETIN 1\x1b[0m\r\n' + PROSE)).toBe(false);
  });

  /**
   * Regression against the naive screen-level rule "ANY art row makes the
   * screen art". `looksLikeAsciiArt` calls a bare `======` divider art (no
   * letters, no digits), and PRIVACY.TXT - the one screen a C64 caller most
   * needs to READ - opens with two of them. One divider is decoration on a
   * page of prose, not a picture.
   */
  it('prose with divider rules is still prose (PRIVACY.TXT shape)', () => {
    const divider = '='.repeat(76);
    // Two dividers over eleven non-blank rows - PRIVACY.TXT's own ratio (0.18).
    const page = divider + '\r\n' + PROSE + divider + '\r\n' + PROSE + PROSE;
    expect(looksLikeAsciiArt(divider)).toBe(true);   // the row IS art...
    expect(isAnsiArtScreen(page)).toBe(false);        // ...the screen is not
  });

  /**
   * The honest limit of a share rule, stated rather than hidden: a screen
   * that is HALF rules is a picture, and gets skipped. Nothing on this
   * board's Screens/ or Bulletins/ sits in that shape without also being
   * real art (the measured census has an empty band from 0.25 to 0.45).
   */
  it('a screen that is half rules IS art once it clears the art-row floor', () => {
    const divider = '='.repeat(76);
    const row = divider + '\r\nsome ordinary prose here\r\n';
    expect(isAnsiArtScreen(row.repeat(4))).toBe(false); // 4 art rows - under the floor
    expect(isAnsiArtScreen(row.repeat(8))).toBe(true);  // 8 art rows, share 0.5
  });

  /**
   * A screen too small to vote on is never called art by density.
   * Screens/LOGON.TXT is two bytes - a bare `~` MCI directive - and
   * `looksLikeAsciiArt` calls that lone row art (no letters, no digits),
   * which at 1-of-1 would be a 100% art screen and would replace the whole
   * logon flow with the skip token.
   */
  it('a screen with fewer art rows than the floor is never art by density (LOGON.TXT shape)', () => {
    expect(MIN_ART_ROWS).toBe(6);
    expect(looksLikeAsciiArt('~')).toBe(true);
    expect(isAnsiArtScreen('~\n')).toBe(false);
    expect(isAnsiArtScreen('Placeholder screen uploadmsg.txt\n')).toBe(false);
  });

  it('but a one-line positioned ANSImation is still art (uprough.txt shape)', () => {
    expect(isAnsiArtScreen('\x0c\x1b[0 p\x1b[8;6H\x1b[0;35;40m \x1b[5;5H_\x1b[1 p\x1b[0m')).toBe(true);
  });

  /**
   * Delegation proof. These rows carry no block glyphs and no box drawing
   * at all - a standalone glyph-density regex would call them prose. They
   * are art only because the SHARED `looksLikeAsciiArt` says a >= 33-column
   * indent is art, so a screen made of them can only come back art if this
   * module is really asking that function.
   */
  it('classifies through the shared row detector, not a private glyph regex', () => {
    const deepIndent = ' '.repeat(34) + 'hello';
    expect(looksLikeAsciiArt(deepIndent)).toBe(true);
    expect(isAnsiArtScreen((deepIndent + '\r\n').repeat(8))).toBe(true);
  });

  it('the art-row share sits in the empty band between this board\'s prose and art screens', () => {
    expect(ART_ROW_SHARE).toBeGreaterThan(0.25); // PRIVACY.TXT (0.25) must reflow
    expect(ART_ROW_SHARE).toBeLessThan(0.45);    // MENU.TXT (0.45) must skip
  });

  /**
   * Reviewer case 1 (short prose flips a bare share cut). A seven-row
   * bulletin with a CENTRED title (`looksLikeAsciiArt` calls a >= 33-column
   * indent art) and two `===` rules scores 3/7 = 0.43 - over ART_ROW_SHARE.
   * Only the absolute art-row floor keeps it readable.
   */
  it('a 7-row bulletin with a centred title and two rules is prose, not art', () => {
    const page = [
      ' '.repeat(34) + 'THE WEEKLY BULLETIN',
      '='.repeat(76),
      'New files landed in the Amiga conference this week, uploaded by',
      'the usual suspects and a couple of new faces from the demo scene.',
      '='.repeat(76),
      'Read the rules before you upload anything at all.',
      'Enjoy your stay on the board.',
    ].join('\r\n');
    expect(page.split('\r\n').filter((l) => looksLikeAsciiArt(l)).length).toBe(3); // 3/7 = 0.43
    expect(isAnsiArtScreen(page)).toBe(false);
  });

  /**
   * Reviewer case 2. Three rows - centred title, a rule, one sentence -
   * scores 2/3 = 0.67 on a bare share cut, and the old three-row minimum
   * did not protect it (three rows is not FEWER than three).
   */
  it('a 3-row screen with a centred title and a rule is prose, not art', () => {
    const page = [
      ' '.repeat(34) + 'NOTICE',
      '-'.repeat(60),
      'The board is down for maintenance on Sunday morning.',
    ].join('\r\n');
    expect(page.split('\r\n').filter((l) => looksLikeAsciiArt(l)).length).toBe(2); // 2/3 = 0.67
    expect(isAnsiArtScreen(page)).toBe(false);
  });

  /**
   * The floor is 6 because Screens/Logon24hrs.txt - the art file on this
   * board with the FEWEST art rows - has exactly 6 of 12. Raising it would
   * start reflowing real pictures.
   */
  it('the art-row floor is the lowest art-row count on the board (Logon24hrs 6/12)', () => {
    const rows = fs
      .readFileSync(path.join(REPO_ROOT, 'Screens/Logon24hrs.txt'), 'latin1')
      .split(/\r\n|\r|\n/)
      .map((l) => l.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, ''))
      .filter((l) => l.trim().length > 0);
    expect(rows.filter((l) => looksLikeAsciiArt(l)).length).toBe(MIN_ART_ROWS);
    expect(isAnsiArtScreen(fs.readFileSync(path.join(REPO_ROOT, 'Screens/Logon24hrs.txt'), 'latin1'))).toBe(true);
  });

  describe('the board\'s own screens', () => {
    const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'latin1');

    it('Screens/PRIVACY.TXT is prose a C64 caller must be able to read', () => {
      expect(isAnsiArtScreen(read('Screens/PRIVACY.TXT'))).toBe(false);
    });

    it('Screens/MENU.TXT is an 80-column picture and must never be reflowed', () => {
      expect(isAnsiArtScreen(read('Screens/MENU.TXT'))).toBe(true);
    });

    it('Screens/Logon24hrs.txt (ASCII logo + boxed banner) is art', () => {
      expect(isAnsiArtScreen(read('Screens/Logon24hrs.txt'))).toBe(true);
    });

    it('Screens/uprough.txt (one-line positioned ANSImation) is art', () => {
      expect(isAnsiArtScreen(read('Screens/uprough.txt'))).toBe(true);
    });
  });
});

describe('petsciiTextScreenPlan', () => {
  const petscii = { petsciiMode: true };

  it('non-petscii sessions always pass through', () => {
    expect(petsciiTextScreenPlan(BLOCK_ART, {})).toBe('passthrough');
    expect(petsciiTextScreenPlan(PROSE, {})).toBe('passthrough');
    expect(petsciiTextScreenPlan(POSITIONED, { petsciiMode: false })).toBe('passthrough');
    expect(petsciiTextScreenPlan(PROSE, undefined as any)).toBe('passthrough');
  });

  it('petscii + art skips; petscii + prose reflows', () => {
    expect(petsciiTextScreenPlan(BLOCK_ART, petscii)).toBe('art-skip');
    expect(petsciiTextScreenPlan(POSITIONED, petscii)).toBe('art-skip');
    expect(petsciiTextScreenPlan(PROSE, petscii)).toBe('reflow');
  });

  /**
   * A MENU is never skipped, however art-heavy it scores. Screens/MENU.TXT
   * (0.45) and MENU250.TXT (0.74) are both art by the vote, no MENU*.seq
   * exists, and MENU is in SCREENS_REQUIRE_CLEAR - so skipping one leaves a
   * C64 caller staring at a cleared screen and a token, with no command
   * list and no way to navigate. A folded menu is navigable; a skipped one
   * is not (strategy plan Phase 2.4).
   */
  it('menus always reflow, even when they score as art', () => {
    const menu = fs.readFileSync(path.join(REPO_ROOT, 'Screens/MENU.TXT'), 'latin1');
    const menu250 = fs.readFileSync(path.join(REPO_ROOT, 'Screens/MENU250.TXT'), 'latin1');

    expect(isAnsiArtScreen(menu)).toBe(true);                       // it IS art...
    expect(isAnsiArtScreen(menu250)).toBe(true);
    expect(petsciiTextScreenPlan(menu, petscii, false)).toBe('art-skip');   // ...and would be skipped
    expect(petsciiTextScreenPlan(menu, petscii, true)).toBe('reflow');      // ...but never as a menu
    expect(petsciiTextScreenPlan(menu250, petscii, true)).toBe('reflow');
  });

  it('the menu override never overrides the session gate', () => {
    expect(petsciiTextScreenPlan(BLOCK_ART, {}, true)).toBe('passthrough');
  });
});

describe('ANSI_ART_SKIPPED_NOTICE', () => {
  it('is the plan-specified ASCII token', () => {
    expect(ANSI_ART_SKIPPED_NOTICE).toBe('[80-COLUMN ANSI SCREEN - SKIPPED]\r\n');
  });
});

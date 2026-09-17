/**
 * A 24-BIT LOGO REACHES AN AMIGA TERMINAL IN COLOUR.
 *
 * "the logos needs to degrade nicely for amiga telnet clients" (the sysop,
 * 2026-09-16).
 *
 * PabloDraw and Moebius write colour as `ESC[0;r;g;bt` for ink and
 * `ESC[1;r;g;bt` for paper. A browser's xterm renders them. An Amiga telnet
 * client swallows them as an unknown CSI and draws on in whatever colour was
 * last set - so a logo whose EVERY colour is written that way arrives almost
 * monochrome. `h7-up_rough_doors.asc` on this board is 337 of them.
 *
 * For a byte transport each one becomes the nearest of the sixteen, emitted as
 * the same `30-37`/`90-97` codes the board's own art already draws with. A web
 * caller keeps the artist's exact colour.
 */
process.env.SKIP_DB_INIT = '1';

import * as fs from 'fs';
import * as path from 'path';
import {
  foldTrueColourToAnsi,
  nearestAnsiColour,
  hasTrueColour,
  foldsLosslessly,
  furthestFromPalette,
  PALETTE_ROUNDING_TOLERANCE,
} from '../../src/utils/true-colour-fold.util';

const REPO = path.resolve(__dirname, '..', '..', '..', '..');

describe('picking the nearest of the sixteen', () => {
  it('lands on the obvious ones', () => {
    expect(nearestAnsiColour(0, 0, 0)).toBe(0);          // black
    expect(nearestAnsiColour(255, 255, 255)).toBe(15);   // bright white
    expect(nearestAnsiColour(0, 0, 160)).toBe(4);        // blue
  });

  it('separates a dim colour from its bright twin', () => {
    expect(nearestAnsiColour(170, 0, 0)).toBe(1);
    expect(nearestAnsiColour(255, 85, 85)).toBe(9);
  });

  /*
   * THE COLOURS THE BOARD'S OWN ART IS MADE OF, and the case that was shipped
   * wrong. The artist never chose a 24-bit colour: Moebius writes its palette
   * out as RGB, so every entry is a VGA colour with a rounding wobble of one
   * or two per channel. Against a palette whose bright half was the PURE set,
   * his bright red `255,87,87` measured nearer to BROWN than to bright red and
   * arrived brown on every Amiga client.
   */
  const H7_PALETTE: ReadonlyArray<[number, number, number, number]> = [
    [0, 0, 0, 0],          // black
    [255, 87, 87, 9],      // bright red
    [171, 0, 171, 5],      // magenta
    [87, 87, 255, 12],     // bright blue
    [171, 171, 171, 7],    // light grey
    [0, 0, 171, 4],        // blue
    [255, 87, 255, 13],    // bright magenta
    [87, 255, 255, 14],    // bright cyan
    [255, 255, 87, 11],    // bright yellow
    [0, 171, 171, 6],      // cyan
    [87, 87, 87, 8],       // dark grey
    [171, 0, 0, 1],        // red
    [0, 171, 0, 2],        // green
  ];

  it.each(H7_PALETTE)('%i,%i,%i is palette entry %i', (r, g, b, expected) => {
    expect(nearestAnsiColour(r, g, b)).toBe(expected);
  });
});

describe('folding a screen for a byte transport', () => {
  it('turns ink and paper into the codes the board already sends', () => {
    // Bright red ink on blue paper, in the values the editors write.
    const art = '\x1b[0;255;85;85tRED\x1b[1;0;0;170tON BLUE';
    const folded = foldTrueColourToAnsi(art);

    expect(folded).toBe('\x1b[91mRED\x1b[44mON BLUE');
    expect(hasTrueColour(folded)).toBe(false);
  });

  it('keeps the drawing itself byte for byte', () => {
    const art = '\x1b[0;255;128;0t/////\x1b[0;0;0;255t|||||';
    const folded = foldTrueColourToAnsi(art);
    expect(folded.replace(/\x1b\[[0-9;]*m/g, '')).toBe('/////|||||');
  });

  it('leaves ordinary sixteen-colour art untouched', () => {
    const plain = '\x1b[0;40;37mplain\x1b[1;33mbright\x1b[0m';
    expect(foldTrueColourToAnsi(plain)).toBe(plain);
  });

  it('drops a window-manipulation CSI rather than translating it', () => {
    // Same final byte, not a colour: a screen file must not be able to ask a
    // terminal to resize itself, and a terminal that ignored it loses nothing.
    expect(foldTrueColourToAnsi('\x1b[8;24;80tart')).toBe('art');
  });

  it('survives a malformed sequence without throwing or mangling the art', () => {
    expect(foldTrueColourToAnsi('\x1b[0;255tart')).toBe('art');
    expect(() => foldTrueColourToAnsi('\x1b[0;255;128')).not.toThrow();
    expect(foldTrueColourToAnsi('\x1b[0;255;128')).toBe('\x1b[0;255;128');
  });

  it('clamps a channel that is out of range instead of picking nothing', () => {
    expect(foldTrueColourToAnsi('\x1b[0;999;999;999tX')).toBe('\x1b[97mX');
  });
});

describe("the sysop's own logo", () => {
  const LOGO = path.join(REPO, '!ASCII-Art', 'ansi', 'H7', 'h7-up_rough_doors.asc');

  it('arrives with no sequence an Amiga terminal would swallow', () => {
    if (!fs.existsSync(LOGO)) return;   // the art is the sysop's, not the repo's
    const art = fs.readFileSync(LOGO, 'latin1');

    // 337 of them as measured on 2026-09-16 - asserted as "many", because the
    // artwork is his to redraw and the property is that NONE survive.
    expect(hasTrueColour(art)).toBe(true);

    const folded = foldTrueColourToAnsi(art);
    expect(hasTrueColour(folded)).toBe(false);
    // And it is still the same drawing: every printable byte survives.
    const ink = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');
    expect(ink(folded)).toBe(ink(art));
  });
});

/**
 * PALETTE ART WRITTEN IN 24-BIT SYNTAX IS NOT 24-BIT ART.
 *
 * "the artist says his art displays fine in moebius and pablodraw and he never
 * actively tried to make it 24-bit" (the sysop, 2026-09-17). He is right. The
 * editors write the document's palette out as explicit RGB, so a perfectly
 * ordinary sixteen-colour drawing arrives full of `ESC[1;r;g;bt`. Counting
 * those sequences says how the file was WRITTEN, never what it holds.
 *
 * The difference decides whether folding costs anything, and whether an editor
 * should refuse to open the file.
 */
describe('telling the syntax apart from the art', () => {
  const LOGO = path.join(REPO, '!ASCII-Art', 'ansi', 'H7', 'h7-up_rough_doors.asc');

  it("the sysop's logo is palette art, so folding it loses nothing", () => {
    if (!fs.existsSync(LOGO)) return;
    const art = fs.readFileSync(LOGO, 'latin1');

    expect(hasTrueColour(art)).toBe(true);        // written that way
    expect(foldsLosslessly(art)).toBe(true);      // but not 24-bit art
    // Every colour is a palette entry with a rounding wobble: 171 for 170,
    // 87 for 85. Twelve is two units on two channels.
    expect(furthestFromPalette(art)).toBeLessThanOrEqual(12);
  });

  it('a colour genuinely off the palette is reported as a loss', () => {
    // A mid-teal nothing in the sixteen can hold.
    const painted = '\x1b[0;40;120;90tX';
    expect(foldsLosslessly(painted)).toBe(false);
    expect(furthestFromPalette(painted)).toBeGreaterThan(PALETTE_ROUNDING_TOLERANCE);
  });

  it('art with no 24-bit syntax at all folds losslessly by definition', () => {
    expect(foldsLosslessly('\x1b[0;40;37mplain\x1b[1;33mbright\x1b[0m')).toBe(true);
    expect(furthestFromPalette('plain text')).toBe(0);
  });
});

/**
 * Amiga ANSI art is Latin-1, not CP437.
 *
 * Reported live 2026-08-31 with a screenshot: Super Qix's level 3 background
 * rendered as a yellow lattice of box-drawing where the piece is a skull
 * drawn in slashed Os.
 *
 * The Amiga had no code page 437. Topaz, mOsOul, MicroKnight and P0T-NOoDLE
 * are ISO-8859-1 fonts, so byte 0xD8 is 'Ø' and not CP437's '╪'. Decoding an
 * Amiga piece as CP437 turns every accented letter into line-drawing, which
 * is exactly the lattice that was reported. SAUCE records the font the
 * artist used, and the loader now reads it.
 */

import {
  latin1ByteToChar,
  cp437ByteToChar,
  isAmigaFont,
  decoderForFont,
} from '../../engines/ui/ansi-editor/core/cp437';
import { loadANSFile } from '../../engines/ui/ansi-editor/core/file-ops';

/** Build a one-line ANSI file with a SAUCE record naming `font`. */
function ansWithFont(bytes: number[], font: string, width = 80, height = 0): Uint8Array {
  const content = Uint8Array.from(bytes);

  const sauce = new Uint8Array(128);
  const put = (offset: number, text: string, length: number) => {
    for (let i = 0; i < length; i++) {
      sauce[offset + i] = i < text.length ? text.charCodeAt(i) : 0x20;
    }
  };

  put(0, 'SAUCE00', 7);
  put(7, '', 35);          // title
  put(42, '', 20);         // author
  put(62, '', 20);         // group
  put(82, '20260831', 8);  // date

  // fileSize: where the art ends and the SAUCE begins. A zero here means
  // the loader has nothing to draw.
  sauce[90] = content.length & 0xff;
  sauce[91] = (content.length >> 8) & 0xff;
  sauce[92] = (content.length >> 16) & 0xff;
  sauce[93] = (content.length >> 24) & 0xff;
  sauce[94] = 1;           // dataType: character
  sauce[95] = 1;           // fileType: ANSi
  sauce[96] = width & 0xff;
  sauce[97] = width >> 8;
  sauce[98] = height & 0xff;   // tInfo2: rows, as the art program counted them
  sauce[99] = height >> 8;
  put(106, font, 22);      // tInfoS: font name

  const out = new Uint8Array(content.length + 1 + sauce.length);
  out.set(content, 0);
  out[content.length] = 0x1a;              // EOF marker
  out.set(sauce, content.length + 1);
  return out;
}

describe('Amiga ANSI art decodes as Latin-1', () => {
  it('maps a byte to its Latin-1 character', () => {
    expect(latin1ByteToChar(0xd8)).toBe('Ø');   // Ø
    expect(latin1ByteToChar(0xe5)).toBe('å');   // å
    expect(latin1ByteToChar(0x41)).toBe('A');
  });

  it('differs from CP437 exactly where the reported bug was', () => {
    // The byte the skull is drawn with.
    expect(cp437ByteToChar(0xd8)).toBe('╪');    // ╪, the lattice
    expect(latin1ByteToChar(0xd8)).toBe('Ø');   // Ø, what it should be
  });

  it('recognises the Amiga fonts by name', () => {
    for (const font of [
      'Amiga Topaz 2+', 'Amiga mOsOul', 'Amiga MicroKnight+',
      'Amiga P0T-NOoDLE', 'amiga topaz 1',
    ]) {
      expect(isAmigaFont(font)).toBe(true);
    }
  });

  it('treats everything else as CP437', () => {
    for (const font of ['IBM VGA', 'IBM VGA50', 'IBM EGA', '', undefined]) {
      expect(isAmigaFont(font)).toBe(false);
    }
    expect(decoderForFont('IBM VGA')).toBe(cp437ByteToChar);
    expect(decoderForFont(undefined)).toBe(cp437ByteToChar);
    expect(decoderForFont('Amiga mOsOul')).toBe(latin1ByteToChar);
  });

  it('loads an Amiga piece with its own characters', async () => {
    const file = ansWithFont([0xd8, 0xd8, 0xd8], 'Amiga mOsOul');
    const { canvas } = await loadANSFile(file);

    const drawn = [canvas[0][0].char, canvas[0][1].char, canvas[0][2].char].join('');
    expect(drawn).toBe('ØØØ');
  });

  it('still loads an IBM piece as CP437', async () => {
    const file = ansWithFont([0xd8, 0xd8, 0xd8], 'IBM VGA');
    const { canvas } = await loadANSFile(file);

    const drawn = [canvas[0][0].char, canvas[0][1].char, canvas[0][2].char].join('');
    expect(drawn).toBe('╪╪╪');
  });

  it('falls back when SAUCE leaves the file size at zero', async () => {
    // Plenty of real files carry a zeroed fileSize; taking it literally
    // means loading nothing at all and rendering a blank screen.
    const file = ansWithFont([0xd8], 'Amiga mOsOul');
    file[file.length - 128 + 90] = 0;
    file[file.length - 128 + 91] = 0;
    file[file.length - 128 + 92] = 0;
    file[file.length - 128 + 93] = 0;

    const { canvas } = await loadANSFile(file);
    expect(canvas[0][0].char).toBe('Ø');
  });

  it('honours the width SAUCE declares, not a fixed 80', async () => {
    // The reported piece is 82 columns wide.
    const file = ansWithFont([0x41], 'Amiga mOsOul', 82);
    const { width } = await loadANSFile(file);

    expect(width).toBe(82);
  });
});

/**
 * A BBS screen is art PLUS the codes the board runs, and the codes sit on
 * lines below the picture. Reported 2026-09-02: a sysop opened a screen in
 * the browser editor and its ~SP / ~f / ~CC_ctop were not on the canvas.
 *
 * SAUCE said 21 rows because that is the height of the drawing; the file had
 * 24 lines. Parsing to the declared height stopped above the codes - and
 * saving wrote back only the rows the canvas held, so opening the screen and
 * pressing Save DELETED them.
 */
describe('SAUCE row count is a hint, not a limit', () => {
  const text = (value: string) => [...value].map(c => c.charCodeAt(0));

  it('keeps lines the art program did not count, where the MCI codes live', async () => {
    // Two rows of picture, one row of code under it, SAUCE declaring two.
    const file = ansWithFont(text('AB\r\nCD\r\n~CC_ctop|'), 'Amiga mOsOul', 80, 2);

    const { canvas, height } = await loadANSFile(file);

    expect(height).toBe(3);
    expect(canvas[2].slice(0, 9).map(cell => cell.char).join('')).toBe('~CC_ctop|');
  });

  it('does not grow a blank row for the newline that ends the file', async () => {
    // Otherwise every open-and-save adds a line, for ever.
    const file = ansWithFont(text('AB\r\n'), 'Amiga mOsOul', 80, 1);

    const { height } = await loadANSFile(file);

    expect(height).toBe(1);
  });

  it('still honours a declared height taller than the lines present', async () => {
    // A 25-row screen whose art stops painting after two lines is 25 rows.
    const file = ansWithFont(text('AB\r\nCD'), 'Amiga mOsOul', 80, 25);

    const { height } = await loadANSFile(file);

    expect(height).toBe(25);
  });
});

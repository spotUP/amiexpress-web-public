/**
 * DECDHL for a terminal that has never had it.
 *
 * Teletext draws headline rows at twice the height, and the DEC escapes for
 * that are older than the BBS: `ESC # 3` says "this line is the TOP half of a
 * double-height line", `ESC # 4` the bottom half, `ESC # 5` back to normal.
 * Every real VT100 understands them. xterm.js 5.5 does not - there is no
 * `ESC #` handler in it at all - so a board that wants teletext headlines has
 * to draw them itself.
 *
 * It draws them with the font. TeletextUPR carries, for every Latin-1
 * printable, the top half and the bottom half of that character stretched
 * over a whole cell (dev/scripts/fonts/build-teletext-font.py). So this
 * translates the ESCAPES the board sends into the CODEPOINTS that draw them,
 * and xterm never learns anything new:
 *
 *     ESC#3 "NEWS"      ->  U+E22E U+E225 U+E237 U+E233
 *     ESC#4 "NEWS"      ->  U+E32E U+E325 U+E337 U+E333
 *
 * The board sends the row twice, once under each escape, exactly as it would
 * to a VT100 - so the wire stays honest, authored `.ttx` screens stay
 * portable, and the day xterm.js implements the escapes this file goes away.
 *
 * Attributes belong to the LINE, like DEC's do: the mode set by an escape
 * holds until the line ends or another escape replaces it, across as many
 * socket writes as it takes. Anything the font has no half for - the mosaics,
 * the block elements, anything above Latin-1 - is passed through untouched
 * rather than mangled into a box.
 */

/**
 * 0xE200 + (cp - 0x20): the top half of a Latin-1 printable.
 *
 * E200/E300 rather than E000/E100 because the PETSCII transducer already owns
 * U+E000-E1FF for the C64 character ROM, and one block cannot mean two things.
 */
export const DH_TOP_BASE = 0xe200;
/** 0xE300 + (cp - 0x20): its bottom half. */
export const DH_BOTTOM_BASE = 0xe300;
/** The range the font carries halves for. */
export const DH_FIRST_SOURCE = 0x20;
export const DH_LAST_SOURCE = 0xff;

export type LineHalf = 'normal' | 'top' | 'bottom';

/**
 * THE OTHER HALF OF A TELETEXT PAGE: block mosaics.
 *
 * Teletext draws its graphics from a second character set, G1, where each
 * code is a 2x3 grid of blocks - the logos, the rules, the weather symbols.
 * A terminal selects it with SO (shift out, 0x0E) and leaves it with SI
 * (shift in, 0x0F), which is how VT terminals have switched character sets
 * since the 1970s, so a `.ttx` screen can carry mosaic art as ordinary
 * bytes and stay a Latin-1 file.
 *
 * Unicode has the same 64 cells as the "block sextants" of Symbols for
 * Legacy Computing, and TeletextUPR draws all of them. The cells are
 * numbered
 *
 *      1 2        bit 0x01 is cell 1, 0x02 cell 2, 0x04 cell 3,
 *      3 4        0x08 cell 4, 0x10 cell 5 - and 0x40 cell 6,
 *      5 6        because 0x20 is the bit that selects the set.
 *
 * and the four patterns Unicode already had (blank, left half, right half,
 * full block) are not in the sextant range, which is why this is a function
 * rather than an offset.
 */
export function mosaicCodepoint(byte: number): number | null {
  const isMosaic = (byte >= 0x20 && byte <= 0x3f) || (byte >= 0x60 && byte <= 0x7f);
  if (!isMosaic) return null;

  const pattern = (byte & 0x1f) | ((byte & 0x40) >> 1);
  if (pattern === 0b000000) return 0x20;       // space
  if (pattern === 0b010101) return 0x258c;     // left half block
  if (pattern === 0b101010) return 0x2590;     // right half block
  if (pattern === 0b111111) return 0x2588;     // full block

  // The sextants run in pattern order with those four taken out.
  let skipped = 0;
  for (const taken of [0b000000, 0b010101, 0b101010, 0b111111]) {
    if (taken < pattern) skipped += 1;
  }
  return 0x1fb00 + pattern - skipped;
}

/** The private-use codepoint drawing one half of `ch`, or null if there is none. */
export function halfCodepoint(ch: string, half: LineHalf): number | null {
  if (half === 'normal') return null;
  const cp = ch.codePointAt(0);
  if (cp === undefined || cp < DH_FIRST_SOURCE || cp > DH_LAST_SOURCE) return null;
  const base = half === 'top' ? DH_TOP_BASE : DH_BOTTOM_BASE;
  return base + (cp - DH_FIRST_SOURCE);
}

/**
 * A transformer with the line's attribute in it.
 *
 * One per terminal: the attribute outlives a single write, because the board
 * may send the escape, the text and the newline in three chunks.
 */
export interface DoubleHeightFilter {
  /** Rewrite one chunk on its way to xterm. */
  write(data: string): string;
  /** Forget the current line's attribute (a clear, a mode change, a logoff). */
  reset(): void;
  /** What the current line is set to - for tests. */
  half(): LineHalf;
  /** Whether the mosaic set is selected right now - for tests. */
  mosaic(): boolean;
}

const ESC = '\x1b';

const SHIFT_OUT = '\x0e';
const SHIFT_IN = '\x0f';

export function createDoubleHeightFilter(): DoubleHeightFilter {
  let half: LineHalf = 'normal';
  let mosaic = false;

  const write = (data: string): string => {
    // Nothing to do for the overwhelmingly common case: no attribute in
    // flight and none in the chunk. Teletext sessions are ordinary sessions
    // most of the time and this runs on every byte the board sends.
    if (half === 'normal' && !mosaic
        && data.indexOf(`${ESC}#`) < 0
        && data.indexOf(SHIFT_OUT) < 0) {
      return data;
    }

    let out = '';
    for (let i = 0; i < data.length; i += 1) {
      const ch = data[i];

      if (ch === ESC && data[i + 1] === '#') {
        const kind = data[i + 2];
        if (kind === '3') { half = 'top'; i += 2; continue; }
        if (kind === '4') { half = 'bottom'; i += 2; continue; }
        if (kind === '5' || kind === '6') { half = 'normal'; i += 2; continue; }
        // ESC # something else (DECALN's 8, say) is not ours: leave it whole.
        out += ch;
        continue;
      }

      // The mosaic set, selected the way a VT terminal has always selected
      // an alternate set. Unlike the line attribute it survives a newline:
      // a block of art is many rows of it.
      if (ch === SHIFT_OUT) { mosaic = true; continue; }
      if (ch === SHIFT_IN) { mosaic = false; continue; }

      // A line attribute dies with its line, the way DEC's does.
      if (ch === '\n') {
        half = 'normal';
        out += ch;
        continue;
      }

      // Escape sequences inside the line - colour, cursor motion - are not
      // text and must reach xterm byte for byte. Skipping to the final byte
      // also stops their digits being redrawn as giant numerals.
      if (ch === ESC) {
        const rest = data.slice(i);
        const csi = /^\x1b\[[0-9;?]*[ -/]*[@-~]/.exec(rest);
        if (csi) { out += csi[0]; i += csi[0].length - 1; continue; }
        const short = /^\x1b[()#][0-9A-Za-z]/.exec(rest);
        if (short) { out += short[0]; i += short[0].length - 1; continue; }
        out += ch;
        continue;
      }

      if (mosaic) {
        // Mosaic art is graphics, not letters: it has no half-height form,
        // and a double-height row of it is not a thing teletext can express.
        const cell = mosaicCodepoint(ch.charCodeAt(0));
        out += cell === null ? ch : String.fromCodePoint(cell);
        continue;
      }

      if (half === 'normal' || ch < ' ') { out += ch; continue; }

      const cp = halfCodepoint(ch, half);
      out += cp === null ? ch : String.fromCodePoint(cp);
    }
    return out;
  };

  return {
    write,
    reset() { half = 'normal'; mosaic = false; },
    half() { return half; },
    mosaic() { return mosaic; },
  };
}

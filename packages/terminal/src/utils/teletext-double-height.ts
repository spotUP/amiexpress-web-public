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
}

const ESC = '\x1b';

export function createDoubleHeightFilter(): DoubleHeightFilter {
  let half: LineHalf = 'normal';

  const write = (data: string): string => {
    // Nothing to do for the overwhelmingly common case: no escape in flight
    // and none in the chunk. Teletext sessions are ordinary sessions most of
    // the time and this runs on every byte the board sends.
    if (half === 'normal' && data.indexOf(`${ESC}#`) < 0) return data;

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

      if (half === 'normal' || ch < ' ') { out += ch; continue; }

      const cp = halfCodepoint(ch, half);
      out += cp === null ? ch : String.fromCodePoint(cp);
    }
    return out;
  };

  return {
    write,
    reset() { half = 'normal'; },
    half() { return half; },
  };
}

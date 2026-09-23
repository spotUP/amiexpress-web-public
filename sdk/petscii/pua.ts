/**
 * PETSCII SCREEN CODES CARRIED IN A STRING, AND HOW EVERYONE ELSE READS THEM.
 *
 * A caller's own PETSCII - typed on a C64 keyboard or on the web canvas -
 * is carried through the board as PetMe64 private-use codepoints, one
 * UTF-16 unit each: `U+E100 + screenCode` for bank 1, bit 7 of the screen
 * code meaning reverse video. That is not a new convention; it is the one
 * the transducer already speaks (`ansi-to-petscii.ts` printPua), which is
 * why a PETSCII reader needs no new code at all.
 *
 * Everyone ELSE needs this file. An eighty-column ANSI caller reading a
 * message somebody wrote on a C64 has no PetMe64 font and no business
 * knowing about screen codes, so the marker is folded to the Unicode glyph
 * the normative table names (`screencode-unicode.ts`, the Unicode
 * Consortium's own C64IPRI/C64IALT), with reverse video spelled as SGR 7.
 *
 * BANK 1 ONLY. The board runs the lowercase charset board-wide - "only
 * lowercase characters are allowed and only black background ... this should
 * apply bbs wide" (the sysop, 2026-09-14, `board-rules.ts`) - and a bank-0
 * glyph would make the transducer emit `$8E`, which reflows every letter
 * already on the caller's screen. Nothing in this board may PRODUCE a
 * `U+E0xx`; this file still READS one, because a file that has sat on the
 * board since before the rule existed is served as it is rather than
 * changing shape on the way out.
 */
import { SCREENCODE_TO_UNICODE } from './screencode-unicode';
import { vicToSgrForeground } from './c64-palette';

/** The first PetMe64 codepoint of each bank. */
export const PUA_BANK0 = 0xe000;
export const PUA_BANK1 = 0xe100;

/** One past the last PetMe64 codepoint. */
const PUA_END = 0xe200;

/**
 * THE PEN, CARRIED THE SAME WAY THE GLYPHS ARE.
 *
 * `U+E200 + vic`, one codepoint per VIC colour. It is not SGR, and that is
 * the whole point: a chat message has every ESC stripped out of it before it
 * is stored (`group-chat.handler.ts`, and that guard stays - chat is
 * broadcast into other callers' terminals), so a form with an ESC in it
 * cannot be the one thing a message and a chat line both carry.
 *
 * Sixteen of them, because a C64 has sixteen. BACKGROUND is not here and
 * will not be: the board is black-background board-wide.
 */
export const PUA_COLOUR = 0xe200;
const PUA_COLOUR_END = 0xe210;

/** The marker that sets the pen to a VIC colour. */
export function colourMarker(vic: number): string {
  return String.fromCodePoint(PUA_COLOUR + (vic & 0x0f));
}

/** The VIC colour this codepoint sets, or null. */
export function colourOfMarker(code: number): number | null {
  if (code < PUA_COLOUR || code >= PUA_COLOUR_END) return null;
  return code - PUA_COLOUR;
}

/** Is this codepoint a PETSCII screen code carried in a string? */
export function isPuaScreenCode(code: number): boolean {
  return code >= PUA_BANK0 && code < PUA_END;
}

/** The codepoint that carries a bank-1 screen code (bit 7 = reverse). */
export function puaForScreenCode(screenCode: number): string {
  return String.fromCodePoint(PUA_BANK1 + (screenCode & 0xff));
}

/**
 * The Unicode glyph a screen code draws, and whether it is reversed.
 *
 * Reverse is the caller's to render - SGR 7 on a terminal, the pen colour on
 * a C64 - so it is reported rather than folded into the glyph.
 */
export function screenCodeGlyph(code: number): { glyph: string; reverse: boolean } | null {
  if (!isPuaScreenCode(code)) return null;
  const bank = code >= PUA_BANK1 ? 1 : 0;
  const sc = code & 0xff;
  const glyph = SCREENCODE_TO_UNICODE[bank][sc & 0x7f];
  return { glyph: glyph ?? ' ', reverse: (sc & 0x80) !== 0 };
}

/**
 * Every PETSCII marker in `text` as the glyph it draws.
 *
 * A run of reversed cells is wrapped in ONE `ESC[7m ... ESC[27m` rather than
 * one pair per cell: a reversed bar is what PETSCII fills with, so it is
 * usually a run, and a pair per cell would be three bytes of escape for
 * every byte of picture on a telnet wire.
 *
 * Text with no marker in it comes back IDENTICAL - the same string object -
 * so this is safe to call on everything the board emits.
 */
export function puaToUnicode(text: string, options: { glyphs?: boolean } = {}): string {
  const glyphs = options.glyphs !== false;
  if (!hasPuaMarker(text)) return text;

  let out = '';
  let reversed = false;
  for (const ch of text) {
    const code = ch.codePointAt(0)!;

    /*
     * The pen, for EVERY caller - including a C64's.
     *
     * A PETSCII session keeps its glyph markers, because its own transducer
     * draws them better than any fold could. Colour is the other way round:
     * the transducer already turns SGR into the PETSCII colour byte, so
     * spelling the pen as SGR here means one path instead of two, and an
     * eighty-column reader gets the same colour for free.
     */
    const pen = colourOfMarker(code);
    if (pen !== null) {
      if (reversed) { out += '\x1b[27m'; reversed = false; }
      out += vicToSgrForeground(pen);
      continue;
    }

    const cell = glyphs ? screenCodeGlyph(code) : null;
    if (!cell) {
      if (reversed) {
        out += '\x1b[27m';
        reversed = false;
      }
      out += ch;
      continue;
    }
    if (cell.reverse !== reversed) {
      out += cell.reverse ? '\x1b[7m' : '\x1b[27m';
      reversed = cell.reverse;
    }
    out += cell.glyph;
  }
  if (reversed) out += '\x1b[27m';
  return out;
}

/** Does this text carry a PETSCII GLYPH marker? */
export function hasPuaScreenCode(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= PUA_BANK0 && code < PUA_END) return true;
  }
  return false;
}

/** Does this text carry any marker at all - a glyph or a pen? */
export function hasPuaMarker(text: string): boolean {
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= PUA_BANK0 && code < PUA_COLOUR_END) return true;
  }
  return false;
}

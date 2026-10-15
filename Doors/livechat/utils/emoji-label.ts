/**
 * How one emoji is written in the picker list.
 *
 * The picker used to list `:smile:  happy` - the shortcode and a keyword,
 * and never the emoji itself. Reported as "the emoji picker shows texts
 * instead of the actual emojis", which is exactly right: on this BBS the
 * emoji IS the ASCII art in the `display` field (`:-)`, `(Y)`, `\(^o^)/`),
 * because Amiga clients and ASCII-strict terminals cannot render Unicode
 * pictographs. A list of names is a list of things you have to already know.
 *
 * The art leads now, in a fixed column so the codes line up beneath each
 * other, with the shortcode after it - you still need that to type the emoji
 * from the keyboard.
 *
 * PICKING one inserts the ART, not the shortcode. Choosing something that
 * looks like `<3` and getting `:heart:` in the input made the picker feel
 * like a lookup table for codes you then had to trust would be converted;
 * the art is plain ASCII that every terminal on this BBS can already show,
 * so there is nothing to convert.
 *
 * Pure, so the column arithmetic is testable without a terminal.
 */

import type { Emoji } from './emojis';

/**
 * Columns reserved for the art.
 *
 * The widest is `:tableflip:` at 14 characters, so 16 leaves a clear gap
 * before the shortcode without ragging the column.
 */
export const GLYPH_COLUMN = 16;

/**
 * The label for one emoji, clipped to `width` columns.
 *
 * Clipping matters: a label wider than the list wraps onto a second line,
 * which knocks every following row out of alignment and silently pushes the
 * last emoji off the bottom of the box.
 */
export function emojiLabel(emoji: Emoji, width: number): string {
  const art = emoji.display;

  // Art alone, when there is not room for both. Better a picker of emojis
  // with no names than of names with no emojis.
  if (width <= GLYPH_COLUMN) return clip(art, width);

  return clip(art.padEnd(GLYPH_COLUMN) + emoji.code, width);
}

function clip(text: string, width: number): string {
  return width > 0 && text.length > width ? text.slice(0, width) : text;
}

/**
 * TEXT ON A COLOURED BACKGROUND IS WHITE OR BLACK. NEVER GREY.
 *
 * "we need an sdk level ui fix, texts drawn on bg colors needs to be white or
 * black to look good never grey like here", and "this goes for menus and list
 * highlights and such" (sysop, 2026-09-16) - the card lobby's menu bar, grey
 * "Views  System" on a pink bar.
 *
 * The reason grey looks wrong there is not taste. A terminal's grey is one
 * fixed value; a background is whatever the theme picked. Put them together
 * and the contrast is an accident - sometimes passable, usually muddy, and on
 * a mid-tone background barely legible. White and black are the two colours
 * that cannot be muddy against ANY background, because one of them is always
 * the furthest away.
 *
 * So: a widget that draws on a coloured background asks `readableOn(bg)` for
 * its text colour, and one that has been GIVEN a colour asks
 * `snapToReadable(fg, bg)` - which leaves a real colour alone (a door's red
 * warning stays red) and only replaces the greys and the unreadable.
 *
 * Pure, and deliberately free of any widget: the whole rule can be asked a
 * question in a test.
 */

import { convert, vcolors } from './colors';

/** A colour as anything the engine accepts: a name, a hex string, a code. */
export type ColorLike = string | number | number[] | undefined | null;

/** The RGB behind a colour, or null when it has none (default/transparent). */
function rgbOf(color: ColorLike): [number, number, number] | null {
  if (color === undefined || color === null || color === '') return null;
  const code = convert(color as string | number | number[]);
  if (typeof code !== 'number' || code < 0) return null;
  const rgb = vcolors[code];
  if (!rgb) return null;
  return [rgb[0], rgb[1], rgb[2]];
}

/**
 * How bright a colour reads, 0 (black) to 1 (white).
 *
 * Rec. 601 luma, which is the weighting that matches how an eye reads a
 * terminal cell: green carries most of the brightness, blue almost none. A
 * plain average calls pure blue as bright as pure green and picks the wrong
 * text colour for both.
 */
export function luminance(color: ColorLike): number {
  const rgb = rgbOf(color);
  if (!rgb) return 0;
  const [r, g, b] = rgb;
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255;
}

/**
 * Is this one of the greys - the colours that have no business on a coloured
 * background?
 *
 * Any colour whose channels are near enough equal, EXCEPT the two ends:
 * black and white are the answer, not the problem.
 */
export function isGrey(color: ColorLike): boolean {
  const rgb = rgbOf(color);
  if (!rgb) return false;
  const [r, g, b] = rgb;
  const spread = Math.max(r, g, b) - Math.min(r, g, b);
  if (spread > 24) return false;              // it has a hue of its own
  /*
   * Not black, not white - and the palette's WHITE is #e5e5e5, not #ffffff.
   * A bound of 231 called xterm's own white a grey and snapped it, which is
   * the one colour that never needed snapping.
   */
  const level = (r + g + b) / 3;
  return level > 24 && level < 200;
}

/** White or black - whichever is further from this background. */
export function readableOn(background: ColorLike): 'white' | 'black' {
  // A background the terminal chooses (default/transparent) is assumed dark,
  // which is what every board here actually runs.
  return luminance(background) > 0.55 ? 'black' : 'white';
}

/**
 * The colour this text should actually be drawn in.
 *
 * A colour with a hue of its own is kept - a door that asks for a red warning
 * on its bar means it, and this rule is about greys, not about overruling
 * theming. A grey, a missing colour, or one too close to the background to
 * read is replaced by whichever of white or black stands out.
 */
export function snapToReadable(foreground: ColorLike, background: ColorLike): string {
  const readable = readableOn(background);
  if (foreground === undefined || foreground === null || foreground === '') return readable;
  if (isGrey(foreground)) return readable;

  /*
   * Only when it is genuinely INVISIBLE, not merely dim.
   *
   * A first cut snapped anything within a quarter of the background's
   * brightness, and that ate colours doors mean: xterm's `red` is #800000,
   * which sits close to black by luminance and is still obviously red on
   * screen. This rule is about grey, not about overruling a theme - so what
   * is left here is the pair no eye can separate at all.
   */
  const gap = Math.abs(luminance(foreground) - luminance(background));
  return gap < 0.06 ? readable : String(foreground);
}

/**
 * 24-BIT ART, FOLDED TO THE SIXTEEN COLOURS AN AMIGA TERMINAL HAS.
 *
 * PabloDraw and Moebius write true colour as `ESC[0;r;g;bt` (foreground) and
 * `ESC[1;r;g;bt` (background). A browser's xterm renders those; an Amiga
 * telnet client does not - it swallows the sequence as an unknown CSI and
 * draws the character in whatever colour was last set. Art whose every colour
 * is written that way therefore arrives essentially monochrome, which is what
 * "the logos need to degrade nicely for amiga telnet clients" is about (the
 * sysop, 2026-09-16).
 *
 * So for a caller that cannot do true colour, each sequence becomes the
 * NEAREST of the sixteen, measured in RGB. The sixteen are emitted as
 * `30-37`/`90-97` and `40-47`/`100-107` - the same codes this board's own art
 * already draws with (`h7`'s logos are full of `[94m` and `[96m`), so nothing
 * here asks a terminal for anything it is not already being sent.
 *
 * Nearest by plain squared distance, not by perceptual weighting: the palette
 * is sixteen far-apart points, the inputs are art rather than photographs, and
 * a weighting would only move the handful of mid-greys between two answers
 * that are both defensible.
 */

/*
 * THE PALETTE LIVES IN THE SDK, because the ANSI editor measures against it
 * too and a second table would drift: a near-miss on one side and not the
 * other means a screen the editor refuses and the wire flattens, or the
 * reverse. The values are the VGA ones rather than the pure set - see
 * engines/ui/ansi-editor/core/file-ops.ts for the bytes that settled it.
 */
import {
  ANSI_16_RGB,
  nearestAnsi16,
  PALETTE_ROUNDING_TOLERANCE as SDK_TOLERANCE,
} from '@amiexpress/bbs-door-sdk/engines/ui/ansi-editor/core/file-ops';

/** Which of the sixteen a colour is closest to. */
export function nearestAnsiColour(r: number, g: number, b: number): number {
  return nearestAnsi16(r, g, b);
}


/**
 * How far `text`'s colours sit from the sixteen, at worst, in squared RGB.
 *
 * Zero means every colour IS a palette entry; a dozen means the file is
 * palette art whose RGB was written with a rounding wobble, which is what
 * every 24-bit-looking file on this board has turned out to be. A large number
 * means somebody really did paint with colours the sixteen cannot hold.
 *
 * This is what tells "24-bit syntax" apart from "24-bit art", and the two need
 * telling apart: the first folds losslessly and the second does not.
 */
export function furthestFromPalette(text: string): number {
  let worst = 0;
  for (const match of text.matchAll(trueColourPattern())) {
    const parts = match[1].split(';').map(p => Number.parseInt(p, 10));
    if (parts.length < 4 || parts.slice(0, 4).some(n => !Number.isFinite(n))) continue;
    const [, r, g, b] = parts;
    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    const [cr, cg, cb] = [clamp(r), clamp(g), clamp(b)];
    const [pr, pg, pb] = ANSI_16_RGB[nearestAnsiColour(cr, cg, cb)];
    worst = Math.max(worst, (pr - cr) ** 2 + (pg - cg) ** 2 + (pb - cb) ** 2);
  }
  return worst;
}

/**
 * The most a colour may miss the palette by and still count as palette art.
 *
 * The board's own files miss by at most 12 (`171` for `170`, `87` for `85`).
 * 64 is eight units on one channel: comfortably past any rounding an editor
 * does, comfortably short of a colour chosen off the palette.
 */
export const PALETTE_ROUNDING_TOLERANCE = SDK_TOLERANCE;

/** Whether folding `text` would lose an artist anything. */
export function foldsLosslessly(text: string): boolean {
  return furthestFromPalette(text) <= PALETTE_ROUNDING_TOLERANCE;
}

/** The SGR parameter that paints `index` as ink (30-37, then 90-97). */
function foregroundSgr(index: number): number {
  return index < 8 ? 30 + index : 90 + (index - 8);
}

/** The SGR parameter that paints `index` as paper (40-47, then 100-107). */
function backgroundSgr(index: number): number {
  return index < 8 ? 40 + index : 100 + (index - 8);
}

/**
 * A CSI ending in `t`, which is how both true-colour forms are written.
 *
 * Built per call, never shared: a module-level `/g` regex carries `lastIndex`
 * between callers, and this board has lost an afternoon to exactly that once
 * already (the MCI tokenizer, 2026-08).
 */
const trueColourPattern = () => /\x1b\[([0-9;]*)t/g;

/**
 * Every 24-bit colour sequence in `text` replaced by its nearest SGR.
 *
 * A sequence that is not one of the two colour forms - the same final byte is
 * xterm's window-manipulation CSI - is DROPPED rather than translated or left
 * in place: a terminal that would have ignored it loses nothing, and one that
 * would have acted on it is not asked to resize itself by a screen file.
 */
export function foldTrueColourToAnsi(text: string): string {
  if (!text.includes('\x1b[')) return text;

  return text.replace(trueColourPattern(), (_whole, params: string) => {
    const parts = params.split(';').map(p => Number.parseInt(p, 10));
    if (parts.length < 4 || parts.slice(0, 4).some(n => !Number.isFinite(n))) return '';

    const [mode, r, g, b] = parts;
    const clamp = (n: number) => Math.max(0, Math.min(255, n));
    const index = nearestAnsiColour(clamp(r), clamp(g), clamp(b));

    if (mode === 0) return `\x1b[${foregroundSgr(index)}m`;
    if (mode === 1) return `\x1b[${backgroundSgr(index)}m`;
    return '';
  });
}

/** Whether `text` carries anything this fold would act on. */
export function hasTrueColour(text: string): boolean {
  return trueColourPattern().test(text);
}

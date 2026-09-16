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

/**
 * The sixteen ANSI colours as RGB, in SGR order: 0-7 normal, 8-15 bright.
 *
 * The BRIGHT half is the pure set (`#ff0000`, `#00ff00`...), not the VGA
 * hardware values (`#ff5555`, `#55ff55`...). That is a deliberate choice about
 * what an artist MEANT rather than what one particular adapter emitted: a
 * drawing that says `#ff0000` is asking for bright red, and against the VGA
 * table plain distance answers DARK red - 170,0,0 is nearer to 255,0,0 than
 * 255,85,85 is - so every saturated colour in a logo came out muddy. Matching
 * the pure set puts `#ff0000` on bright red and leaves `#aa0000` on dark red,
 * which is what both were drawn as.
 */
const ANSI_RGB: ReadonlyArray<readonly [number, number, number]> = [
  [0, 0, 0], [170, 0, 0], [0, 170, 0], [170, 85, 0],
  [0, 0, 170], [170, 0, 170], [0, 170, 170], [170, 170, 170],
  [85, 85, 85], [255, 0, 0], [0, 255, 0], [255, 255, 0],
  [0, 0, 255], [255, 0, 255], [0, 255, 255], [255, 255, 255],
];

/** Which of the sixteen a colour is closest to. */
export function nearestAnsiColour(r: number, g: number, b: number): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < ANSI_RGB.length; i++) {
    const [pr, pg, pb] = ANSI_RGB[i];
    const distance = (pr - r) ** 2 + (pg - g) ** 2 + (pb - b) ** 2;
    // A TIE GOES TO THE BRIGHT HALF. `#ff5555` - VGA's own bright red - sits
    // exactly as far from brown as from bright red, and taking the first match
    // painted it brown. These are art colours: the brighter reading is the one
    // the artist meant.
    const better = distance < bestDistance || (distance === bestDistance && i >= 8 && best < 8);
    if (better) {
      bestDistance = distance;
      best = i;
    }
  }
  return best;
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

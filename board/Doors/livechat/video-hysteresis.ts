/**
 * Stopping camera noise from shredding the frame.
 *
 * Measured on a 59x17 tile with synthetic sensor noise (2026-08-26):
 *
 *                    bytes/cell   cells starting a colour run   rows changed
 *   noisy camera        7.1                84%                  16.6 of 17
 *   noiseless           2.1                15%                  11.0 of 17
 *
 * Noise is roughly seventy percent of the payload. A pixel sitting between
 * two palette entries flips between them every frame, which ends the
 * current colour run and starts a new one - so a picture that looks static
 * to a human is re-encoded from scratch sixty times a second, and every
 * frame is a full frame because nearly every row differs.
 *
 * The cure is hysteresis, in two directions:
 *
 *   - TEMPORAL: keep the colour this cell had last frame unless the pixel
 *     has moved clearly closer to a different one.
 *   - SPATIAL: keep the colour the current run is already using, on the
 *     same "clearly closer" test, so runs get longer.
 *
 * Both are the same rule - prefer the incumbent unless the challenger wins
 * by a margin - and both are pure given the previous state, which is what
 * makes this testable without a camera.
 */

/** Palette entries as [name, r, g, b]. */
export type PaletteEntry = [string, number, number, number];

/**
 * How much closer a different colour must be before a cell changes.
 *
 * Squared RGB distance. Measured, not guessed - a 59x17 tile, thirty
 * frames, synthetic sensor noise of +/-24 per channel, fidelity judged
 * against the same scene rendered noiselessly:
 *
 *   threshold   bytes/frame   subpixels wrong
 *          0        7157          16.8%        <- what shipped
 *       8000        5387           6.7%
 *      12000        3520           3.7%        <- chosen
 *      15000        3018          14.2%        <- cliff
 *      40000        1385          42.2%        <- picture frozen
 *
 * 12000 halves the payload AND is four times more faithful than no
 * hysteresis at all, because most of the detail the encoder was carefully
 * reproducing was noise. Past 15000 a cell stops tracking real motion and
 * the picture smears, then freezes outright - so this is not a knob to
 * raise for extra savings.
 *
 * Scale check: palette neighbours (white/gray) sit 21675 apart, so a pixel
 * on the boundary is ~5400 from each, and noise swings that difference by
 * around 12000 - which is exactly why smaller values did nothing.
 */
export const STICKINESS = 12000;

/**
 * Per-cell colour memory for one video stream.
 *
 * Two planes because half-block packs two pixels into a cell: `fg` is the
 * top half, `bg` the bottom. Values are palette indices; -1 means "nothing
 * remembered yet".
 */
export interface ColorMemory {
  fg: Int16Array;
  bg: Int16Array;
  width: number;
  height: number;
  /** How hard a cell resists changing colour. See STICKINESS. */
  stickiness: number;
}

export function createColorMemory(
  width: number,
  height: number,
  stickiness: number = STICKINESS
): ColorMemory {
  const size = Math.max(0, width * height);
  return {
    fg: new Int16Array(size).fill(-1),
    bg: new Int16Array(size).fill(-1),
    width,
    height,
    stickiness,
  };
}

/**
 * Resize the memory when the tile changes shape, forgetting its contents.
 *
 * Returns the same object when the shape already matches, so the caller can
 * call this every frame.
 */
export function fitColorMemory(memory: ColorMemory, width: number, height: number): ColorMemory {
  if (memory.width === width && memory.height === height) return memory;
  return createColorMemory(width, height, memory.stickiness);
}

/** Squared RGB distance between a pixel and a palette entry. */
function distance(entry: PaletteEntry, r: number, g: number, b: number): number {
  const dr = r - entry[1];
  const dg = g - entry[2];
  const db = b - entry[3];
  return dr * dr + dg * dg + db * db;
}

/**
 * Pick a palette index for a pixel, preferring what is already on screen.
 *
 * `incumbents` are the indices worth keeping - typically the colour this
 * cell had last frame and the colour the current run is using. The first
 * one that is within STICKINESS of the best match wins; otherwise the best
 * match does.
 */
export function pickColor(
  palette: PaletteEntry[],
  r: number,
  g: number,
  b: number,
  incumbents: number[],
  stickiness: number = STICKINESS
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distance(palette[i], r, g, b);
    if (d < bestDist) { bestDist = d; best = i; }
  }

  for (const incumbent of incumbents) {
    if (incumbent < 0 || incumbent >= palette.length) continue;
    if (incumbent === best) return best;
    if (distance(palette[incumbent], r, g, b) - bestDist <= stickiness) return incumbent;
  }

  return best;
}


/**
 * Ordered dithering, so sixteen colours look like more than sixteen.
 *
 * A webcam scene is mostly low-saturation - skin, walls, hair - and the
 * only low-saturation entries in the palette are black, gray, white and
 * lightwhite. Nearest-neighbour matching therefore collapses nearly
 * everything to grey, and a saturated colour appears only where a pixel is
 * strongly saturated. Skin sits right on the boundary between `white` and
 * `lightred`, so faces came out grey with arbitrary red patches, and the
 * other twelve colours were essentially never used.
 *
 * Nudging each pixel by a fixed amount that depends on its POSITION makes
 * neighbouring cells round to different palette entries, and the eye mixes
 * them: skin becomes a white/lightred weave rather than a flat grey with
 * blotches.
 *
 * The pattern is a function of position only, never of time, so a still
 * picture still encodes as a still picture - which matters, because the
 * frame is sent as a delta against the last one.
 */
const BAYER_4X4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

/**
 * How far a pixel may be nudged, in RGB units.
 *
 * The palette's entries are about 85 apart per channel, so this is roughly
 * two thirds of the gap: enough for neighbouring cells to land on different
 * entries through a transition, not so much that flat areas break up into
 * confetti.
 */
export const DITHER_STRENGTH = 56;

/**
 * How much better a blend must be than the nearest colour to be worth it.
 *
 * A blend is used only when its error is below this fraction of the flat
 * colour's error. Requiring a CLEAR improvement - not merely any
 * improvement - stops near-flat areas dithering over rounding noise, which
 * is what turned a grey wall into a brown checkerboard.
 */
export const DITHER_BENEFIT = 0.7;

/** The offset applied at a given position, in RGB units, -0.5..+0.5 scaled. */
export function ditherOffset(x: number, y: number, strength: number = DITHER_STRENGTH): number {
  const cell = BAYER_4X4[y & 3][x & 3];
  return ((cell + 0.5) / 16 - 0.5) * strength;
}


/**
 * Choose between the two nearest palette entries, by position.
 *
 * Nudging a pixel's brightness before matching - the obvious way to dither
 * - only ever moves it along the grey axis, so a face mixed white with
 * lightred and never reached the other fourteen colours. Measured on a
 * synthetic face: six entries of sixteen.
 *
 * Mixing along the line between the two nearest entries is what a small
 * palette actually needs. The pixel's position between them gives the
 * proportion, and the ordered pattern turns that proportion into a spatial
 * weave: a colour 30% of the way from grey to red comes out as roughly
 * three cells of grey to one of red, and the eye does the rest.
 *
 * Deterministic in position and independent of time, so a still picture
 * still encodes as a still picture.
 */
export function pickColorDithered(
  palette: PaletteEntry[],
  r: number,
  g: number,
  b: number,
  x: number,
  y: number,
  incumbents: number[],
  stickiness: number = STICKINESS
): number {
  let best = 0;
  let bestDist = Infinity;
  for (let i = 0; i < palette.length; i++) {
    const d = distance(palette[i], r, g, b);
    if (d < bestDist) { bestDist = d; best = i; }
  }

  // Find the partner whose BLEND with `best` lands closest to the real
  // colour - not simply the second-nearest entry.
  //
  // Mixing with the second-nearest was the first attempt and it speckled
  // everything. A mid-grey pixel's second-nearest is `yellow` (170,85,0),
  // nearer than black, so grey walls came out woven with brown, and skin
  // landed near a 50/50 red/yellow checkerboard. Blending two colours only
  // helps when the result is closer to the truth than either alone; the
  // test is cheap and it is the whole difference between dithering and
  // noise.
  const bx = palette[best][1], by = palette[best][2], bz = palette[best][3];
  let partner = -1;
  let partnerMix = 0;
  let partnerDist = bestDist;

  for (let i = 0; i < palette.length; i++) {
    if (i === best) continue;

    const dx = palette[i][1] - bx;
    const dy = palette[i][2] - by;
    const dz = palette[i][3] - bz;
    const lengthSquared = dx * dx + dy * dy + dz * dz;
    if (lengthSquared === 0) continue;

    // Where along best->candidate the pixel projects.
    let mix = ((r - bx) * dx + (g - by) * dy + (b - bz) * dz) / lengthSquared;
    if (mix <= 0) continue;          // the pixel is not toward this colour
    if (mix > 1) mix = 1;

    // How close the blend actually gets.
    const ex = r - (bx + dx * mix);
    const ey = g - (by + dy * mix);
    const ez = b - (bz + dz * mix);
    const blendDist = ex * ex + ey * ey + ez * ez;

    if (blendDist < partnerDist) {
      partnerDist = blendDist;
      partner = i;
      partnerMix = mix;
    }
  }

  // No blend beat the single nearest colour by enough: draw it flat. This
  // is what keeps a wall a wall instead of a field of speckles.
  let chosen = best;
  if (partner >= 0 && partnerDist < bestDist * DITHER_BENEFIT) {
    const threshold = (BAYER_4X4[y & 3][x & 3] + 0.5) / 16;
    chosen = partnerMix > threshold ? partner : best;
  }

  // Temporal stickiness still applies, so a cell does not flicker between
  // the two when the pixel barely moves.
  for (const incumbent of incumbents) {
    if (incumbent < 0 || incumbent >= palette.length) continue;
    if (incumbent === chosen) return chosen;
    if (distance(palette[incumbent], r, g, b) - bestDist <= stickiness) return incumbent;
  }

  return chosen;
}


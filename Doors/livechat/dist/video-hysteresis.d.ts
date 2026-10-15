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
export declare const STICKINESS = 12000;
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
export declare function createColorMemory(width: number, height: number, stickiness?: number): ColorMemory;
/**
 * Resize the memory when the tile changes shape, forgetting its contents.
 *
 * Returns the same object when the shape already matches, so the caller can
 * call this every frame.
 */
export declare function fitColorMemory(memory: ColorMemory, width: number, height: number): ColorMemory;
/**
 * Pick a palette index for a pixel, preferring what is already on screen.
 *
 * `incumbents` are the indices worth keeping - typically the colour this
 * cell had last frame and the colour the current run is using. The first
 * one that is within STICKINESS of the best match wins; otherwise the best
 * match does.
 */
export declare function pickColor(palette: PaletteEntry[], r: number, g: number, b: number, incumbents: number[], stickiness?: number): number;
/**
 * How far a pixel may be nudged, in RGB units.
 *
 * The palette's entries are about 85 apart per channel, so this is roughly
 * two thirds of the gap: enough for neighbouring cells to land on different
 * entries through a transition, not so much that flat areas break up into
 * confetti.
 */
export declare const DITHER_STRENGTH = 56;
/**
 * How much better a blend must be than the nearest colour to be worth it.
 *
 * A blend is used only when its error is below this fraction of the flat
 * colour's error. Requiring a CLEAR improvement - not merely any
 * improvement - stops near-flat areas dithering over rounding noise, which
 * is what turned a grey wall into a brown checkerboard.
 */
export declare const DITHER_BENEFIT = 0.7;
/** The offset applied at a given position, in RGB units, -0.5..+0.5 scaled. */
export declare function ditherOffset(x: number, y: number, strength?: number): number;
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
export declare function pickColorDithered(palette: PaletteEntry[], r: number, g: number, b: number, x: number, y: number, incumbents: number[], stickiness?: number): number;

/**
 * A video frame as CELLS, before it is anything else.
 *
 * The encoders used to go straight from pixels to blessed markup, so the
 * thing that travelled over the wire was text like
 * `{lightgreen-fg}{gray-bg}▀▀▀{/}` - twenty-four bytes every time the
 * colour changed, for a picture whose entire vocabulary is sixteen colours.
 * A 146x46 tile came to 21 KB a frame, and since the client paces itself
 * against a byte budget, that was two frames a second.
 *
 * A cell needs one byte. Half-block is two palette indices, four bits each;
 * coloured ASCII is a ramp index and a palette index; braille is eight dots.
 * Markup is a rendering detail, and belongs where the rendering happens -
 * in the door, next to the terminal - not on the wire.
 *
 * Pure: pixels in, bytes out, and bytes back to markup. Testable without a
 * camera or a terminal.
 */
import { pixelsPerChar, type PixelBuffer } from './video-encoders';
import { type ColorMemory } from './video-hysteresis';
import type { CellFrame, RichFrame } from '@amiexpress/bbs-door-sdk/media/ascii';
export type { CellFrame, RichFrame };
export declare const MODE_HALFBLOCK = 0;
export declare const MODE_ASCII = 1;
export declare const MODE_ASCII_COLOR = 2;
export declare const MODE_BRAILLE = 3;
/** The render modes the door offers, in the order its button cycles them. */
export type RenderMode = 'ascii' | 'color' | 'halfblock' | 'braille';
/**
 * What a caller gets before choosing anything.
 *
 * Coloured ASCII, on the sysop's judgement after using all four: halfblock is
 * the least nice of them and was the default for no better reason than being
 * written first.
 *
 * This is the door's single answer to that question. Both places that used to
 * carry their own `'halfblock'` literal - the server's header text and the
 * voice UX's own mode - read it from here, because when those two disagreed
 * the header announced one mode while another was being rendered.
 */
export declare const DEFAULT_RENDER_MODE: RenderMode;
/** The ramp the ASCII modes quantise brightness to. Ten steps fit four bits. */
export declare const ASCII_RAMP = " .:-=+*#%@";
/** Map a render mode name to its wire code. */
export declare function modeCode(mode: string, colored: boolean): number;
/**
 * Half-block cells: the top pixel in the high nibble, the bottom in the low.
 *
 * One character covers two vertically stacked pixels, which is why the
 * source buffer is twice as tall as the cell grid.
 */
export declare function halfblockCells(img: PixelBuffer, w: number, h: number, memory?: ColorMemory): CellFrame;
/** ASCII cells: ramp index in the high nibble, colour in the low. */
export declare function asciiCells(img: PixelBuffer, w: number, h: number, colored: boolean, memory?: ColorMemory): CellFrame;
/** Braille cells: the eight dots of one character, as bits. */
export declare function brailleCells(img: PixelBuffer, w: number, h: number): CellFrame;
/**
 * Cells back to blessed markup, for the terminal that finally draws them.
 *
 * Colour tags are emitted only where the colour changes, so a run of one
 * colour costs one tag however long it is - the same run-length trick the
 * old encoders used, now applied at the point of rendering instead of on
 * the wire.
 */
export declare function cellsToTags(cells: CellFrame, w: number, h: number, mode: number): string;
/** Source pixels per cell, re-exported so callers need one import. */
export { pixelsPerChar };
/**
 * Scale a cell picture to fill a tile, keeping its shape, centred.
 *
 * One encode is broadcast to every viewer, and their tiles are all
 * different sizes, so the sender picks a size from its byte budget rather
 * than from anybody's furniture. That left the picture sitting small in the
 * top-left corner of a larger tile.
 *
 * Cells scale where markup could not. "ASCII cannot be rescaled" was true
 * of tagged text - half of `{lightgreen-fg}` is nothing - but a cell is a
 * number, and nearest-neighbour sampling of numbers is exact and cheap.
 * The picture is enlarged by whole-pixel sampling, keeps its aspect ratio,
 * and is centred in whatever is left.
 *
 * A picture LARGER than the tile is scaled down the same way, which beats
 * clipping somebody's head off.
 */
export declare function fitCellsToTile(cells: CellFrame, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): CellFrame;
/**
 * Build both planes from one pass over the pixels.
 *
 * The source must be at braille resolution - two pixels across and four
 * down per cell - since that is the finest any mode needs. The colour
 * plane samples the top and bottom halves of the same block.
 */
export declare function richCells(img: PixelBuffer, w: number, h: number, memory?: ColorMemory): RichFrame;
/**
 * Draw a rich frame in whichever mode the VIEWER has chosen.
 *
 * Every mode is derived from the same two planes, so changing mode redraws
 * the picture already in hand - no round trip, and no effect on anybody
 * else's view.
 */
export declare function richToTags(frame: RichFrame, w: number, h: number, mode: number): string;
/** Scale both planes of a rich frame to a tile, keeping shape and centring. */
export declare function fitRichToTile(frame: RichFrame, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): RichFrame;
/**
 * Shrink a rich frame by averaging, rather than by picking one cell in each
 * group and throwing the rest away.
 *
 * Nearest-neighbour sampling is fine when enlarging - a cell simply repeats
 * - but destructive when shrinking a DITHERED picture. The dither is a 4x4
 * pattern, so point-sampling it lands on whichever phase of that pattern
 * happens to line up and aliases into noise: an 80x25 BBS terminal showing
 * a frame encoded for a 146x46 window came out distorted rather than
 * merely coarse (2026-08-26).
 *
 * Averaging is what the dither asked for in the first place - it exists to
 * be blended by eye - so the dots are averaged as brightness and the
 * colours resolved by majority. The result is a smaller picture that still
 * looks like the scene.
 */
export declare function shrinkRich(frame: RichFrame, srcWidth: number, srcHeight: number, dstWidth: number, dstHeight: number): RichFrame;

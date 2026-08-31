/**
 * The board as cells: pure in (data, sheet, tick).
 *
 * Layer order is meaning: terrain first, then eggs, then Sno-Bees, then
 * the penguin - the player is never hidden by scenery. Everything the
 * previous glyph renderer decided by matching characters in a string is
 * decided here by which sprite was blitted, which is why the "colour
 * chosen after drawing" class of bug cannot recur.
 */
import { CellBuffer, Sprite } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { PengoData } from './types';
export declare function buildBoard(data: PengoData, sheet: Record<string, Sprite>, tick: number): CellBuffer;
//# sourceMappingURL=render.d.ts.map
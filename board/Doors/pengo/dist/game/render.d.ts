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
/**
 * The whole maze, as drawn - before the camera crops it to what fits the
 * screen. Exported so a test (or the HUD) can reason about the world
 * independently of the viewport `buildBoard` returns.
 */
export declare function buildWorld(data: PengoData, sheet: Record<string, Sprite>, tick: number): CellBuffer;
/**
 * What the player actually sees: the world, cropped to the camera's
 * window on Pengo's row. Pure in (data, sheet, tick), same as the world
 * builder it wraps - the camera itself is stateless, recomputed fresh
 * from `data.pengo.y` every call, so there is nothing here that can drift
 * out of sync with a previous frame.
 */
export declare function buildBoard(data: PengoData, sheet: Record<string, Sprite>, tick: number): CellBuffer;
//# sourceMappingURL=render.d.ts.map
/**
 * Cell art: coloured character cells, sprites animated on the game tick,
 * and the tag renderer that puts them on a blessed screen.
 *
 * The shared foundation for the arcade sprite work; plan 3 adds 9-slice
 * borders on the same Cell. See
 * thoughts/shared/plans/2026-08-31-sprite-engine-asset-studio-theming-design.md
 */

export {
  PALETTE,
  createBuffer,
  blitCells,
  flipCellsH,
  flipCellsV,
  rowToTags,
  bufferToTags,
} from './cells';
export type { Cell, CellRow, CellBuffer } from './cells';

export { parseSprite, serializeSprite, frameAt, blitSprite } from './sprite';
export type { Sprite, SpriteAnimation } from './sprite';

export { loadSpriteSheet } from './load';

export { compilePixels, decompilePixels } from './halfblock';
export type { PixelGrid } from './halfblock';

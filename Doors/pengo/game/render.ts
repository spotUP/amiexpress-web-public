/**
 * The board as cells: pure in (data, sheet, tick).
 *
 * Layer order is meaning: terrain first, then eggs, then Sno-Bees, then
 * the penguin - the player is never hidden by scenery. Everything the
 * previous glyph renderer decided by matching characters in a string is
 * decided here by which sprite was blitted, which is why the "colour
 * chosen after drawing" class of bug cannot recur.
 */

import {
  CellBuffer, Sprite, createBuffer, blitSprite, cropBuffer,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { PengoData } from './types';
import {
  GRID_WIDTH, GRID_HEIGHT, WORLD_COLS, WORLD_ROWS, CRUSH_FRAMES,
} from './constants';
import { cameraWindowChars } from './camera';

/** How long a pushed block keeps its slide flash, in ticks. */
const SLIDE_FLASH_TICKS = 5;
/** How long the walls rattle after a shake. */
const WALL_SHAKE_TICKS = 6;
/** An egg this close to hatching cracks visibly. */
const HATCH_WARNING = 30;

/**
 * The whole maze, as drawn - before the camera crops it to what fits the
 * screen. Exported so a test (or the HUD) can reason about the world
 * independently of the viewport `buildBoard` returns.
 */
export function buildWorld(
  data: PengoData,
  sheet: Record<string, Sprite>,
  tick: number
): CellBuffer {
  const board = createBuffer(WORLD_COLS, WORLD_ROWS);

  const sliding = (x: number, y: number): boolean =>
    !!data.lastSlide && data.lastSlide.x === x && data.lastSlide.y === y &&
    tick - data.lastSlide.tick <= SLIDE_FLASH_TICKS;
  const wallsShaking =
    !!data.wallShake && tick - data.wallShake.tick <= WALL_SHAKE_TICKS;

  // Terrain
  for (let y = 0; y < GRID_HEIGHT; y++) {
    for (let x = 0; x < GRID_WIDTH; x++) {
      switch (data.grid[y]?.[x]) {
        case 'wall':
          blitSprite(board, sheet['wall'], wallsShaking ? 'shake' : 'idle', tick, x, y);
          break;
        case 'ice':
          blitSprite(board, sheet['ice'], sliding(x, y) ? 'sliding' : 'idle', tick, x, y);
          break;
        case 'diamond':
          blitSprite(board, sheet['diamond'], 'sparkle', tick, x, y);
          break;
        // 'empty': transparent floor; the fallback paints it black.
      }
    }
  }

  // Eggs
  for (const egg of data.eggs) {
    const anim = egg.hatchTimer <= HATCH_WARNING ? 'hatching' : 'idle';
    const sprite = anim === 'hatching' ? sheet['sno-bee'] : sheet['egg'];
    blitSprite(board, sprite, anim === 'hatching' ? 'hatching' : 'idle', tick, egg.x, egg.y);
  }

  // Sno-Bees
  for (const enemy of data.enemies) {
    if (enemy.state === 'dead') continue;
    // A crushed Sno-Bee plays its squash from its OWN timer, not the board
    // tick, so the animation runs once at its own pace rather than being
    // sampled wherever the shared clock happens to be.
    if (enemy.state === 'crushed') {
      blitSprite(board, sheet['sno-bee'], 'crushed',
        CRUSH_FRAMES - enemy.crushTimer, enemy.x, enemy.y);
      continue;
    }
    blitSprite(board, sheet['sno-bee'],
      enemy.state === 'stunned' ? 'stunned' : 'crawl', tick, enemy.x, enemy.y);
  }

  // The penguin, last and on top.
  const p = data.pengo;
  if (p.isDead) {
    blitSprite(board, sheet['pengo'], 'death', p.deathFrame, p.x, p.y);
  } else if (p.isPushing) {
    blitSprite(board, sheet['pengo'], 'push', p.pushFrame, p.x, p.y);
  } else {
    blitSprite(board, sheet['pengo'], `walk-${p.direction}`, tick, p.x, p.y);
  }

  return board;
}

/**
 * What the player actually sees: the world, cropped to the camera's
 * window on Pengo's row. Pure in (data, sheet, tick), same as the world
 * builder it wraps - the camera itself is stateless, recomputed fresh
 * from `data.pengo.y` every call, so there is nothing here that can drift
 * out of sync with a previous frame.
 */
export function buildBoard(
  data: PengoData,
  sheet: Record<string, Sprite>,
  tick: number
): CellBuffer {
  const world = buildWorld(data, sheet, tick);
  const window = cameraWindowChars(data.pengo.y);
  return cropBuffer(world, window);
}

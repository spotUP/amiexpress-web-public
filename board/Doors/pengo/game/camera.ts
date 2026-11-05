/**
 * The camera that follows Pengo through a maze taller than the terminal.
 *
 * Thin, pure wrapper around the cell-art engine's `cameraView`/
 * `offScreenMarkers` (`@amiexpress/bbs-door-sdk/engines/graphics/cell-art`,
 * source `sdk/engines/graphics/cell-art/camera.ts`), specialised to this
 * door's grid so both the renderer (which needs the window in CHARACTERS,
 * to crop the rendered world buffer) and the HUD (which needs it in
 * CELLS, to compare against enemy grid positions) compute the exact same
 * window from the exact same rule: centred on Pengo's row, clamped to the
 * maze, recomputed fresh every call - no camera state to drift out of
 * sync between the two call sites.
 */

import {
  cameraView, offScreenMarkers, Rect, OffScreenMarker,
} from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Enemy, PengoData } from './types';
import { GRID_WIDTH, GRID_HEIGHT, VIEW_GRID_ROWS, CELL_W, CELL_H } from './constants';

/**
 * The camera window, in GRID CELLS - what a door module comparing against
 * entity x/y positions (the HUD's off-screen indicator) wants.
 *
 * The world is exactly as wide as the view (GRID_WIDTH both times), so
 * this only ever scrolls vertically; `cameraView` already knows an axis
 * the world doesn't overflow never moves, so no special case is needed
 * here for that.
 */
export function cameraWindowCells(focusY: number): Rect {
  return cameraView(
    { width: GRID_WIDTH, height: GRID_HEIGHT },
    { width: GRID_WIDTH, height: VIEW_GRID_ROWS },
    { x: Math.floor(GRID_WIDTH / 2), y: focusY },
  );
}

/**
 * The same window, in CHARACTERS - what `buildBoard` wants to crop the
 * rendered world buffer. A straight cell-to-character scale of
 * `cameraWindowCells`, so the two can never disagree about where the
 * window sits.
 */
export function cameraWindowChars(focusY: number): Rect {
  const cells = cameraWindowCells(focusY);
  return {
    x: cells.x * CELL_W,
    y: cells.y * CELL_H,
    width: cells.width * CELL_W,
    height: cells.height * CELL_H,
  };
}

/**
 * Every living Sno-Bee the camera window is currently hiding, and which
 * way it lies - for the HUD. A camera that hides the enemy about to kill
 * you makes the game worse than no camera at all, so this is not optional
 * (see the cell-art camera module's own doc comment).
 */
export function offscreenEnemyMarkers(data: PengoData): Array<OffScreenMarker<Enemy>> {
  const window = cameraWindowCells(data.pengo.y);
  const alive = data.enemies.filter(e => e.state !== 'dead');
  return offScreenMarkers(window, alive);
}

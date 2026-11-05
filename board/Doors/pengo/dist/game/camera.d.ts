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
import { Rect, OffScreenMarker } from '@amiexpress/bbs-door-sdk/engines/graphics/cell-art';
import { Enemy, PengoData } from './types';
/**
 * The camera window, in GRID CELLS - what a door module comparing against
 * entity x/y positions (the HUD's off-screen indicator) wants.
 *
 * The world is exactly as wide as the view (GRID_WIDTH both times), so
 * this only ever scrolls vertically; `cameraView` already knows an axis
 * the world doesn't overflow never moves, so no special case is needed
 * here for that.
 */
export declare function cameraWindowCells(focusY: number): Rect;
/**
 * The same window, in CHARACTERS - what `buildBoard` wants to crop the
 * rendered world buffer. A straight cell-to-character scale of
 * `cameraWindowCells`, so the two can never disagree about where the
 * window sits.
 */
export declare function cameraWindowChars(focusY: number): Rect;
/**
 * Every living Sno-Bee the camera window is currently hiding, and which
 * way it lies - for the HUD. A camera that hides the enemy about to kill
 * you makes the game worse than no camera at all, so this is not optional
 * (see the cell-art camera module's own doc comment).
 */
export declare function offscreenEnemyMarkers(data: PengoData): Array<OffScreenMarker<Enemy>>;
//# sourceMappingURL=camera.d.ts.map
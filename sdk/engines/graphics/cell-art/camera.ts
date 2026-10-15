/**
 * A camera over a board bigger than the screen.
 *
 * Doors draw into a CellBuffer the size of their WORLD; the terminal only
 * ever shows a window onto it. Pengo's arcade grid is 13x15 cells, which at
 * the engine's 5x2 cell is 65x30 characters - taller than any terminal this
 * BBS serves - and Frogger's board only fits because it was re-laid to. A
 * game whose board outgrows 80x25 needs a camera, and it belongs here
 * rather than in each door, because every door that grows past the screen
 * needs the same one.
 *
 * Two pieces, deliberately separate:
 *
 *   `cameraView`  decides WHERE to look - pure arithmetic, no buffers
 *   `cropBuffer`  takes that window out of a rendered world
 *
 * and one that pays for what the camera hides:
 *
 *   `offScreenMarkers`  says which edge each hidden thing lies past
 *
 * A camera that silently hides the enemy about to kill you is a worse game
 * than no camera, so the markers are part of the capability rather than an
 * optional extra a door might forget.
 */

import { CellBuffer, createBuffer } from './cells';

/** A rectangle, in whatever unit the caller is working in. */
export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CameraOptions {
  /**
   * How far the focus may drift from the centre before the camera moves,
   * as a count of units in each direction. Zero keeps the focus pinned to
   * the middle, which is steady but slides the whole board under every
   * step; a deadzone lets small movements happen without the world
   * lurching, which is what most arcade cameras do.
   */
  deadzone?: number;
  /** The window's previous position, needed for a deadzone to mean anything. */
  previous?: { x: number; y: number };
}

/**
 * Where the window should sit so that `focus` is visible.
 *
 * Clamped so the window never leaves the world: a camera that runs off the
 * edge shows a band of nothing and makes the player think the board ended.
 * When the world is no bigger than the window on an axis, that axis does
 * not scroll at all and the window sits at 0 - which is what makes this
 * safe to use unconditionally, including for boards that already fit.
 */
export function cameraView(
  world: { width: number; height: number },
  view: { width: number; height: number },
  focus: { x: number; y: number },
  options: CameraOptions = {}
): Rect {
  const width = Math.min(view.width, world.width);
  const height = Math.min(view.height, world.height);

  const place = (
    focusOn: number,
    worldSize: number,
    viewSize: number,
    previous: number | undefined
  ): number => {
    if (worldSize <= viewSize) return 0;

    // Half the window to the left of the focus. A window of even width
    // cannot centre a cell exactly, so it leans left rather than rounding
    // - the alternative rounds .5 upward and puts the focus one cell left
    // of centre, which is the classic camera off-by-one.
    const centred = focusOn - Math.floor(viewSize / 2);
    const max = worldSize - viewSize;

    const deadzone = options.deadzone ?? 0;
    if (deadzone > 0 && previous !== undefined) {
      // Only move once the focus has drifted past the deadzone, then move
      // just far enough to bring it back to the edge of it - not all the
      // way to centre, which would jerk.
      const low = previous + deadzone;
      const high = previous + viewSize - 1 - deadzone;
      let next = previous;
      if (focusOn < low) next = focusOn - deadzone;
      else if (focusOn > high) next = focusOn - viewSize + 1 + deadzone;
      return Math.max(0, Math.min(max, Math.round(next)));
    }

    return Math.max(0, Math.min(max, centred));
  };

  return {
    x: place(focus.x, world.width, width, options.previous?.x),
    y: place(focus.y, world.height, height, options.previous?.y),
    width,
    height,
  };
}

/**
 * The window's worth of cells, as its own buffer.
 *
 * Anything outside the source is left transparent rather than invented, so
 * a window that overhangs the world (which `cameraView` will not produce,
 * but a caller may ask for directly) shows through to whatever the door
 * paints underneath instead of a wall of black.
 */
export function cropBuffer(source: CellBuffer, window: Rect): CellBuffer {
  const out = createBuffer(window.width, window.height);

  for (let y = 0; y < window.height; y++) {
    const srcRow = source[window.y + y];
    if (!srcRow) continue;
    for (let x = 0; x < window.width; x++) {
      const cell = srcRow[window.x + x];
      out[y][x] = cell ? { ...cell } : null;
    }
  }

  return out;
}

/** Which way something off-screen lies, for a HUD indicator. */
export interface OffScreenMarker<T> {
  /** Whatever the caller passed in - an enemy, a pickup, a rival player. */
  item: T;
  /** The compass direction from the window's centre, in eight-way terms. */
  direction: 'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';
  /** How far outside the window it is, in units, along the dominant axis. */
  distance: number;
}

/**
 * Everything the window is hiding, and which way it lies.
 *
 * The cost of a camera is that the thing about to kill you may be off
 * screen. Pair this with a HUD row of arrows and the player can still read
 * the board; leave it out and the camera makes the game worse, not bigger.
 */
export function offScreenMarkers<T extends { x: number; y: number }>(
  window: Rect,
  items: readonly T[]
): Array<OffScreenMarker<T>> {
  const markers: Array<OffScreenMarker<T>> = [];

  for (const item of items) {
    const left = item.x < window.x;
    const right = item.x >= window.x + window.width;
    const above = item.y < window.y;
    const below = item.y >= window.y + window.height;

    if (!left && !right && !above && !below) continue;

    const vertical = above ? 'n' : below ? 's' : '';
    const horizontal = left ? 'w' : right ? 'e' : '';
    const direction = `${vertical}${horizontal}` as OffScreenMarker<T>['direction'];

    const dx = left ? window.x - item.x
      : right ? item.x - (window.x + window.width - 1)
        : 0;
    const dy = above ? window.y - item.y
      : below ? item.y - (window.y + window.height - 1)
        : 0;

    markers.push({ item, direction, distance: Math.max(dx, dy) });
  }

  return markers;
}

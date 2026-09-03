/**
 * Terminal zoom - the one owner of "how big is a cell".
 *
 * The sysop asked for a real zoom on the fixed 80x25 screen: not a CSS
 * transform (which blurs a bitmap face and leaves xterm measuring the
 * unscaled cell), but the CELL SIZE itself, so the grid stays 80x25 - or
 * 40x25 on the PETSCII canvas - and the bezelled box grows or shrinks
 * around its centre.
 *
 * The invariant this module exists to protect: there is exactly ONE
 * producer of a cell size. The page already owns the BASE size - the
 * desktop 16px, or the handheld calibration `refit()` measures
 * (web/frontend/src/pages/TerminalPage.tsx). So zoom is a FACTOR, never a
 * second size:
 *
 *     effective cell size = zoomedFontSize(base, zoom)
 *
 * Multiply once, in one place, and the picker and the zoom can never
 * become two sources of truth. A stored zoom of 1 (or no stored zoom at
 * all) reproduces today's board exactly - `zoomedFontSize(16, 1)` is 16
 * and `zoomedBoxMaxWidth(1)` is the string `'960px'`.
 *
 * Everything here is pure: no React, no DOM lookups, only numbers and
 * plain rectangles. The wiring - which element the listeners hang off, the
 * rAF coalescing, the corner marks - lives in BBSTerminal, which owns the
 * box these rules describe.
 */

/** Where a viewer's zoom is remembered. Per browser, never sent to the board. */
export const ZOOM_STORAGE_KEY = 'bbs_terminal_zoom';

/**
 * The sane range. Below half the picker size the 80-column grid stops being
 * readable on any display the board is used on; above 4x a single cell is
 * bigger than a phone. Both ends are hard stops, not hints.
 */
export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;

/** The one unzoomed factor: the picker's own size, and the default. */
export const DEFAULT_ZOOM = 1;

/**
 * The preset ladder a double-click on the bezel walks. 1x is the picker's
 * size, so the cycle always comes home to the board's default look.
 */
export const ZOOM_PRESETS: readonly number[] = [1, 1.5, 2];

/** How close to a corner the pointer counts as "on the corner", in CSS px. */
export const CORNER_HIT_PX = 16;

/**
 * The fixed-mode box's unzoomed width cap (BBSTerminal's `maxWidth`).
 *
 * It exists because the box is `width: 100%`: without a cap the BLACK
 * terminal box - and everything bounded by it, the RIP overlay and the
 * PETSCII canvas - would stretch across an ultrawide viewport and the page
 * ground would never show. Zoom scales the cap rather than removing it, so
 * the default look is bit-for-bit what it was.
 */
export const BOX_MAX_WIDTH_PX = 960;

/**
 * Smallest cell size worth rendering. Guards a pathological base size; the
 * MIN_ZOOM stop is what a viewer actually reaches.
 */
const MIN_FONT_PX = 4;

/**
 * Wheel sensitivity, in factor-exponent per pixel of `deltaY`.
 *
 * Exponential rather than additive so a step feels the same at 0.6x as at
 * 3x. A mouse notch (about 100px of deltaY in Chrome) is roughly a 28%
 * step; a trackpad pinch, which arrives as a stream of small ctrl-wheel
 * deltas, moves smoothly through the same curve.
 */
const WHEEL_EXPONENT_PER_PX = 0.0025;

/** Corners of the bezelled box, in the order they are painted. */
export const ZOOM_CORNERS = ['nw', 'ne', 'sw', 'se'] as const;
export type ZoomCorner = (typeof ZOOM_CORNERS)[number];

/** A point in viewport coordinates. */
export interface ZoomPoint {
  x: number;
  y: number;
}

/** The part of a DOMRect this module reads. */
export interface ZoomRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
}

/** A rendered or available footprint, in CSS px. */
export interface ZoomSize {
  width: number;
  height: number;
}

/** Everything a wheel event has to say about whether it is a zoom gesture. */
export interface ZoomWheelLike {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaY: number;
}

/** Hold `zoom` inside the sane range. */
export function clampZoom(zoom: number): number {
  if (!Number.isFinite(zoom)) return DEFAULT_ZOOM;
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * The effective cell size: the page's base size scaled by the factor.
 *
 * Rounded to a whole pixel because that is the step the board zooms in -
 * every BBS font is a TTF, so a 1px change is a real, smooth change of
 * cell size rather than the multi-pixel jumps a bitmap face would force.
 */
export function zoomedFontSize(baseFontSize: number, zoom: number): number {
  const size = Math.round(baseFontSize * clampZoom(zoom));
  return Math.max(MIN_FONT_PX, size);
}

/**
 * The fixed box's width cap at this zoom, as a CSS length.
 *
 * `zoomedBoxMaxWidth(1)` is exactly `'960px'` - the string the box has
 * always carried - so an unzoomed session is byte-identical to today.
 */
export function zoomedBoxMaxWidth(zoom: number): string {
  return `${Math.round(BOX_MAX_WIDTH_PX * clampZoom(zoom))}px`;
}

/**
 * Is this wheel event a zoom gesture?
 *
 * Ctrl+wheel is the platform-independent zoom chord, and - the reason this
 * predicate is not just `ctrlKey` in disguise - every browser delivers a
 * TRACKPAD PINCH as a wheel event with `ctrlKey` synthesised true, with no
 * key held. Cmd+wheel is the macOS habit, so it is honoured too.
 */
export function isZoomWheel(event: ZoomWheelLike): boolean {
  return event.ctrlKey || event.metaKey;
}

/**
 * The zoom a wheel gesture of `deltaY` leads to. Scrolling up (negative
 * deltaY, or pinching apart) zooms in.
 */
export function wheelZoom(zoom: number, deltaY: number): number {
  if (!Number.isFinite(deltaY)) return clampZoom(zoom);
  return clampZoom(zoom * Math.exp(-deltaY * WHEEL_EXPONENT_PER_PX));
}

/**
 * The next preset up the ladder, wrapping back to 1x.
 *
 * "Next" is the first preset strictly above the current zoom, so a viewer
 * who has wheel-zoomed to 1.2x lands on 1.5x rather than jumping home.
 */
export function nextPreset(zoom: number): number {
  const current = clampZoom(zoom);
  for (const preset of ZOOM_PRESETS) {
    // A hair of tolerance: 1.5 reached by wheel is not bit-identical to the
    // literal, and must still advance to 2x rather than re-selecting itself.
    if (preset > current + 1e-6) return preset;
  }
  return ZOOM_PRESETS[0];
}

/** Which corner of `rect` the point is on, or null for anywhere else. */
export function cornerAt(
  point: ZoomPoint,
  rect: ZoomRect,
  tolerance: number = CORNER_HIT_PX,
): ZoomCorner | null {
  const nearLeft = Math.abs(point.x - rect.left) <= tolerance;
  const nearRight = Math.abs(point.x - rect.right) <= tolerance;
  const nearTop = Math.abs(point.y - rect.top) <= tolerance;
  const nearBottom = Math.abs(point.y - rect.bottom) <= tolerance;
  // Outside the box entirely is not a corner, however close the pointer is
  // to the corner's coordinates.
  const inside =
    point.x >= rect.left - tolerance && point.x <= rect.right + tolerance &&
    point.y >= rect.top - tolerance && point.y <= rect.bottom + tolerance;
  if (!inside) return null;
  if (nearTop && nearLeft) return 'nw';
  if (nearTop && nearRight) return 'ne';
  if (nearBottom && nearLeft) return 'sw';
  if (nearBottom && nearRight) return 'se';
  return null;
}

/** The diagonal resize cursor that matches a corner. */
export function cursorForCorner(corner: ZoomCorner): string {
  return corner === 'nw' || corner === 'se' ? 'nwse-resize' : 'nesw-resize';
}

/**
 * Is the point on the BEZEL - the padding ring - rather than on the screen?
 *
 * The double-click preset cycle is a bezel gesture on purpose: a
 * double-click on the screen itself belongs to the BBS (word select, a
 * door's mouse handling), and must not be stolen.
 */
export function isBezelPoint(point: ZoomPoint, rect: ZoomRect, bezelPx: number): boolean {
  const insideBox =
    point.x >= rect.left && point.x <= rect.right &&
    point.y >= rect.top && point.y <= rect.bottom;
  if (!insideBox) return false;
  const onScreen =
    point.x > rect.left + bezelPx && point.x < rect.right - bezelPx &&
    point.y > rect.top + bezelPx && point.y < rect.bottom - bezelPx;
  return !onScreen;
}

/**
 * The zoom a corner drag has reached.
 *
 * Measured as the ratio of the pointer's distance from the box CENTRE now
 * to its distance when the drag began. That is what makes the box grow
 * about its centre: the gesture describes a radius, and the box - which the
 * page centres - keeps its middle wherever it already was. Dragging a
 * corner outward enlarges, inward shrinks, and which corner was grabbed
 * changes only the cursor, never the arithmetic.
 */
export function dragZoom(
  startZoom: number,
  rect: ZoomRect,
  start: ZoomPoint,
  current: ZoomPoint,
): number {
  const centreX = (rect.left + rect.right) / 2;
  const centreY = (rect.top + rect.bottom) / 2;
  const startRadius = Math.hypot(start.x - centreX, start.y - centreY);
  // A grab exactly on the centre carries no radius to scale; leave the zoom
  // where it was rather than dividing by zero.
  if (!(startRadius > 0)) return clampZoom(startZoom);
  const currentRadius = Math.hypot(current.x - centreX, current.y - centreY);
  return clampZoom(startZoom * (currentRadius / startRadius));
}

/**
 * Pull the zoom back down until the rendered box fits the viewport.
 *
 * This is a CAP, not a fit search. The handheld calibration
 * (web/frontend/src/components/mobile/terminal-fit.ts) has to MAXIMISE a
 * size across xterm's per-device-pixel staircase, which needs a bisect to
 * stop it oscillating; here the only requirement is never to exceed what
 * fits, and a single proportional shrink from the measured overflow ratio
 * is monotone and correct by construction - it can leave under a cell of
 * slack, it can never overflow.
 *
 * `floor` (1x, the picker's own size) is never crossed by the clamp: a
 * viewport too small for the DEFAULT look is today's behaviour, not
 * something zoom is allowed to change. A session already below the floor
 * keeps its own size as the lower bound.
 *
 * Returns `zoom` untouched when nothing can be measured (jsdom, a detached
 * tree, a box that has not been laid out yet).
 */
export function fitZoomToViewport(
  zoom: number,
  rendered: ZoomSize,
  available: ZoomSize,
  floor: number = DEFAULT_ZOOM,
): number {
  if (!(rendered.width > 0) || !(rendered.height > 0)) return zoom;
  if (!(available.width > 0) || !(available.height > 0)) return zoom;
  const ratio = Math.min(available.width / rendered.width, available.height / rendered.height);
  if (ratio >= 1) return zoom;
  const lowerBound = Math.min(zoom, floor);
  return Math.max(lowerBound, clampZoom(zoom * ratio));
}

/**
 * The zoom this browser last used, or null when there is none to use.
 *
 * localStorage may be unavailable (private mode, storage disabled) and the
 * value may have been hand-edited; neither is an error, and both mean the
 * session runs at the picker's size.
 */
export function readStoredZoom(): number | null {
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return null;
    if (value < MIN_ZOOM || value > MAX_ZOOM) return null;
    return value;
  } catch {
    return null;
  }
}

/** Remember the zoom for this viewer's next session. */
export function writeStoredZoom(zoom: number): void {
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(clampZoom(zoom)));
  } catch {
    /* storage unavailable - the session still zooms, it just forgets */
  }
}

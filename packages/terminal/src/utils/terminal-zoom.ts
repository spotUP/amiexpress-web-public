/**
 * Terminal zoom - the viewer's override on top of fit-to-window.
 *
 * "The zoom is great but it makes more sense if it follows the browser window
 * and i can override and scale it down" (sysop, 2026-09-03). So the DEFAULT
 * cell size is no longer a constant: it is the FIT - the largest cell size at
 * which the whole 80x25 grid (40x25 on the PETSCII canvas) plus its bezel
 * still fits the viewport on both axes, recomputed whenever the window
 * changes. That fit is computed by the ONE fit function the board already
 * had, `fitFontSize` (web/frontend/src/components/mobile/terminal-fit.ts),
 * which the handheld calibration has always used; the desktop now calls the
 * same function against the page's own content box.
 *
 * This module owns the other half: the viewer's OVERRIDE, expressed as a
 * FRACTION OF THE FIT rather than an absolute size.
 *
 *     effective cell size = zoomedFontSize(fit, fraction)
 *
 * A fraction rather than a size is what makes the override survive a window
 * resize: the viewer who chose "three quarters" keeps three quarters of
 * whatever the window can now hold, instead of being pinned to the pixel
 * count that meant three quarters an hour ago. It is also why there is no
 * separate viewport clamp any more - the fit IS the clamp.
 *
 * NOTHING GOES ABOVE THE FIT. An earlier version let a deliberate gesture
 * push a quarter past it, on the reasoning that a viewer who asks for a
 * bigger screen than the window should get one. That was wrong, and the
 * sysop found out how: "i managed to accidentally resize the term so it's
 * bigger than the browser window and can't get it back" (2026-09-03). Once
 * the box overflows, the bezel ring you double-click to go home is off the
 * screen, the corner you would drag is off the screen, and the fraction is
 * persisted - so the next load comes back just as stuck. A gesture that can
 * put the only way out beyond reach is not a feature. `clampFraction` is the
 * single gate every input path already went through, so the cap is one
 * constant and there is no path around it.
 *
 * `FIT_TO_WINDOW` (1.0) is the default, the way home, AND the ceiling: it
 * means "follow the window", and the double-click ladder always returns to
 * it.
 *
 * Everything here is pure: no React, no DOM lookups, only numbers and plain
 * rectangles. The wiring - which element the listeners hang off, the rAF
 * coalescing, the corner marks - lives in BBSTerminal, which owns the box
 * these rules describe.
 */

/** Where a viewer's override is remembered. Per browser, never sent to the board. */
export const ZOOM_STORAGE_KEY = 'bbs_terminal_zoom';

/**
 * The fraction that means "follow the browser window": the cell size the fit
 * computed, unmodified. The default, and the home step of the preset ladder.
 */
export const FIT_TO_WINDOW = 1;

/**
 * How far the override may travel: down to a quarter of the fit - a
 * deliberately small screen on a big display - and never up past the fit
 * itself.
 *
 * The ceiling IS `FIT_TO_WINDOW`. Above it the grid is by definition larger
 * than the window can hold, the page clips it, and the gestures that would
 * undo it are clipped with it. See the module header for the day that cost.
 */
export const MIN_ZOOM_FRACTION = 0.25;
export const MAX_ZOOM_FRACTION = FIT_TO_WINDOW;

/**
 * The ladder a double-click on the bezel walks: fit, three quarters, half,
 * home to fit.
 *
 * DESCENDING, and this is the point: the fit is already the largest size the
 * window can hold, so every useful preset is a smaller one - an ascending
 * ladder would only offer sizes that overflow. It walks down and wraps to
 * `FIT_TO_WINDOW`, which makes the last step of the cycle the one obvious way
 * back to "follow the window" without a menu, a key or a reset button.
 */
export const ZOOM_PRESETS: readonly number[] = [1, 0.75, 0.5];

/** How close to a corner the pointer counts as "on the corner", in CSS px. */
export const CORNER_HIT_PX = 16;

/**
 * The bezel width the fit has to leave room for, when the page cannot read
 * the `--bbs-terminal-bezel` token (no stylesheet, as under a test runner).
 * The token in web/frontend/src/index.css is the real source.
 */
export const TERMINAL_BEZEL_PX = 16;

/**
 * Smallest cell size worth rendering. Guards a pathological fit; the
 * MIN_ZOOM_FRACTION stop is what a viewer actually reaches.
 */
const MIN_FONT_PX = 4;

/**
 * Wheel sensitivity, in fraction-exponent per pixel of `deltaY`.
 *
 * Exponential rather than additive so a step feels the same at 0.4 of the fit
 * as at 1.0. A mouse notch (about 100px of deltaY in Chrome) is roughly a 28%
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

/** Everything a wheel event has to say about whether it is a zoom gesture. */
export interface ZoomWheelLike {
  ctrlKey: boolean;
  metaKey: boolean;
  deltaY: number;
}

/**
 * Hold a fraction inside the range a viewer may reach.
 *
 * The one gate. Every input path runs through it - `wheelZoom` (Cmd/Ctrl
 * wheel and trackpad pinch), `dragZoom` (a bezel-corner drag), `nextPreset`
 * (the double-click ladder), `readStoredZoom` (the remembered value) and
 * `zoomedFontSize` (the size actually rendered) - so "never larger than the
 * window" is enforced in exactly one place.
 */
export function clampFraction(fraction: number): number {
  if (!Number.isFinite(fraction)) return FIT_TO_WINDOW;
  return Math.min(MAX_ZOOM_FRACTION, Math.max(MIN_ZOOM_FRACTION, fraction));
}

/** True when the viewer has not overridden anything - the window decides. */
export function isFollowingWindow(fraction: number): boolean {
  return clampFraction(fraction) === FIT_TO_WINDOW;
}

/**
 * The effective cell size: the fit, scaled by the viewer's fraction.
 *
 * NOT rounded to a whole pixel. Every BBS font is a TTF and xterm takes a
 * fractional `fontSize`, and rounding is what put a gap back around the
 * screen: the fit search works on a 0.05px grid, so `Math.round` threw away
 * up to half a pixel of cell - eighty cells' worth across the grid - and the
 * box stopped touching the window edge ("it needs to scale flush - it has
 * padding now", sysop, 2026-09-03). At FIT_TO_WINDOW this returns the fit
 * itself, unchanged, which is what makes flush mean flush.
 */
export function zoomedFontSize(fitFontSize: number, fraction: number): number {
  return Math.max(MIN_FONT_PX, fitFontSize * clampFraction(fraction));
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
 * The fraction a wheel gesture of `deltaY` leads to. Scrolling up (negative
 * deltaY, or pinching apart) grows the screen back towards the fit, and stops
 * there.
 */
export function wheelZoom(fraction: number, deltaY: number): number {
  if (!Number.isFinite(deltaY)) return clampFraction(fraction);
  return clampFraction(fraction * Math.exp(-deltaY * WHEEL_EXPONENT_PER_PX));
}

/**
 * The fraction a two-finger pinch leads to.
 *
 * `ratio` is the finger distance now over the distance when the pinch began,
 * so it is 1:1 with the gesture: spread your fingers to twice the distance and
 * the screen doubles, up to the fit.
 *
 * This exists because the BROWSER's pinch is the wrong tool on a phone. Its
 * zoom scales the whole page, and the on-screen keyboard is `position: fixed`
 * - anchored to the LAYOUT viewport - so a pinch slides it off the screen
 * entirely ("zooming on phones zooms the keyboard away", 2026-09-06). The
 * terminal has its own zoom, which is a font size and touches nothing else;
 * routing the pinch here is what lets the screen grow while the keys stay put.
 */
export function pinchZoom(startFraction: number, ratio: number): number {
  if (!Number.isFinite(ratio) || ratio <= 0) return clampFraction(startFraction);
  return clampFraction(startFraction * ratio);
}

/** Distance between two touch points, for a pinch. */
export function pinchDistance(
  a: { clientX: number; clientY: number },
  b: { clientX: number; clientY: number },
): number {
  return Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
}

/**
 * The next step down the preset ladder, wrapping home to fit-to-window.
 *
 * "Next" is the first preset strictly below the current fraction, so a viewer
 * who has wheel-zoomed to 0.9 lands on 0.75 rather than jumping home, and one
 * who is already on the fit steps down to three quarters.
 */
export function nextPreset(fraction: number): number {
  const current = clampFraction(fraction);
  for (const preset of ZOOM_PRESETS) {
    // A hair of tolerance: 0.75 reached by wheel is not bit-identical to the
    // literal, and must still step to 0.5 rather than re-selecting itself.
    if (preset < current - 1e-6) return preset;
  }
  return FIT_TO_WINDOW;
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
 * The double-click preset cycle is a bezel gesture on purpose: a double-click
 * on the screen itself belongs to the BBS (word select, a door's mouse
 * handling), and must not be stolen.
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
 * The fraction a corner drag has reached.
 *
 * Measured as the ratio of the pointer's distance from the box CENTRE now to
 * its distance when the drag began. That is what makes the box shrink and
 * grow about its centre: the gesture describes a radius, and the box - which
 * the page centres - keeps its middle wherever it already was. Dragging a
 * corner inward scales the screen down below the fit, outward brings it back
 * back towards the fit, and no further. Which corner was grabbed changes only
 * the cursor, never the arithmetic.
 *
 * Dragging outward once the screen is already on the fit does NOTHING: the
 * clamp holds the result at 1.0, the caller sees no change, and the box
 * cannot be pulled past the window edge.
 */
export function dragZoom(
  startFraction: number,
  rect: ZoomRect,
  start: ZoomPoint,
  current: ZoomPoint,
): number {
  const centreX = (rect.left + rect.right) / 2;
  const centreY = (rect.top + rect.bottom) / 2;
  const startRadius = Math.hypot(start.x - centreX, start.y - centreY);
  // A grab exactly on the centre carries no radius to scale; leave the
  // fraction where it was rather than dividing by zero.
  if (!(startRadius > 0)) return clampFraction(startFraction);
  const currentRadius = Math.hypot(current.x - centreX, current.y - centreY);
  return clampFraction(startFraction * (currentRadius / startRadius));
}

/**
 * The override this browser last used, or null when there is none to use.
 *
 * localStorage may be unavailable (private mode, storage disabled) and the
 * value may have been hand-edited; neither is an error, and both mean the
 * session follows the window.
 *
 * A value ABOVE the fit is repaired rather than merely ignored: it is written
 * back as `FIT_TO_WINDOW`. Ignoring it would be enough for this load, but the
 * stale number would sit in storage waiting for a build that trusted it -
 * and it only got there because a version of this module once allowed it. The
 * board it stranded ("can't get it back", sysop, 2026-09-03) is the reason
 * the repair is worth a write on read.
 */
export function readStoredZoom(): number | null {
  try {
    const raw = window.localStorage.getItem(ZOOM_STORAGE_KEY);
    if (raw === null) return null;
    const value = Number.parseFloat(raw);
    if (!Number.isFinite(value)) return null;
    if (value > MAX_ZOOM_FRACTION) {
      writeStoredZoom(FIT_TO_WINDOW);
      return FIT_TO_WINDOW;
    }
    if (value < MIN_ZOOM_FRACTION) return null;
    return value;
  } catch {
    return null;
  }
}

/**
 * Remember the viewer's override for their next session.
 *
 * Only ever called for a change the viewer actually made: a mount that
 * changed nothing must not write, or every visit would stamp the default over
 * a value the viewer chose on another day.
 */
export function writeStoredZoom(fraction: number): void {
  try {
    window.localStorage.setItem(ZOOM_STORAGE_KEY, String(clampFraction(fraction)));
  } catch {
    /* storage unavailable - the session still zooms, it just forgets */
  }
}

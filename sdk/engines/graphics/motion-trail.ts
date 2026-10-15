/**
 * Motion trails - the streak a fast-moving object leaves behind.
 *
 * GRANDMASTER grew this for its hard drop and it is the single thing players
 * say makes the movement feel good, so ARKANOID wants it for the paddle and
 * the ball. What the two doors CANNOT share is the drawing: Grandmaster
 * speaks blessed tags, Arkanoid writes raw ANSI into a cell buffer. So the
 * shared part is the MODEL - where the streak is, how long each cell lives,
 * and how bright it should be - and each renderer maps an intensity tier to
 * whatever it can draw.
 *
 * Pure and clock-injected: pass `now` in, so a test can age a trail without
 * waiting for real time.
 */

/** One cell of a fading streak. */
export interface TrailCell {
  x: number;
  y: number;
  /** 0..1 at birth - the nearer the object, the brighter the streak starts. */
  strength: number;
  /** Timestamp the cell was created, in the caller's clock. */
  createdAt: number;
}

/** How solid a trail cell should look right now. */
export type TrailTier = 'solid' | 'mid' | 'faint';

/** Default lifetime, tuned on GRANDMASTER's hard drop. */
export const TRAIL_LIFETIME_MS = 160;

/**
 * Lay a streak along a straight path, brightest at the destination.
 *
 * `from` and `to` are inclusive cell coordinates on one axis; the other
 * coordinate is fixed. A hard drop is vertical, a paddle dash horizontal.
 */
export function buildTrail(options: {
  axis: 'horizontal' | 'vertical';
  /** The fixed coordinate - the row for a horizontal streak. */
  fixed: number;
  from: number;
  to: number;
  now: number;
  /** Cells nearer the destination than this fraction stay at full strength. */
  maxCells?: number;
}): TrailCell[] {
  const { axis, fixed, from, to, now, maxCells = 24 } = options;

  const start = Math.round(from);
  const end = Math.round(to);
  const distance = Math.abs(end - start);
  if (distance === 0) return [];

  const step = end > start ? 1 : -1;
  const cells: TrailCell[] = [];

  for (let i = 0; i < distance && i < maxCells; i++) {
    const along = start + i * step;
    // Brightest nearest the destination: the object was there most recently.
    const strength = (i + 1) / distance;
    cells.push({
      x: axis === 'horizontal' ? along : fixed,
      y: axis === 'horizontal' ? fixed : along,
      strength,
      createdAt: now,
    });
  }

  return cells;
}

/** Drop cells that have outlived the trail. */
export function expireTrails(
  cells: TrailCell[],
  now: number,
  lifetimeMs: number = TRAIL_LIFETIME_MS
): TrailCell[] {
  return cells.filter(cell => now - cell.createdAt < lifetimeMs);
}

/**
 * How bright a cell is now: its birth strength, faded by its age.
 * Returns 0 once it has expired.
 */
export function trailIntensity(
  cell: TrailCell,
  now: number,
  lifetimeMs: number = TRAIL_LIFETIME_MS
): number {
  const age = now - cell.createdAt;
  if (age >= lifetimeMs || age < 0) return 0;
  return cell.strength * (1 - age / lifetimeMs);
}

/**
 * The tier a renderer draws. Three steps rather than a continuous ramp,
 * because a terminal only has a few densities to spend: a solid block, a
 * dimmer block, and a stipple.
 */
export function trailTier(intensity: number): TrailTier | null {
  if (intensity <= 0) return null;
  if (intensity > 0.66) return 'solid';
  if (intensity > 0.33) return 'mid';
  return 'faint';
}

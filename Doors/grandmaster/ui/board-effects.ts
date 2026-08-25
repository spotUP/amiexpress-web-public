/**
 * Shared playfield effects
 *
 * The landing shadow and the hard-drop motion blur belong to GRANDMASTER's
 * look, not to one screen: the main modes had them, TetriNET grew a
 * lookalike ghost of its own ('::' in grey) and no blur at all. Both screens
 * now draw them from here, so they cannot drift apart again.
 *
 * Kept deliberately free of engine types - it takes a shape and a colour and
 * returns characters, so the TGM engine and the TetriNET engine can both
 * feed it.
 */

/** One cell of the fading streak a hard drop leaves behind. */
export interface HardDropTrail {
  x: number;
  y: number;
  color: string;
  /** 0..1 - how solid this cell starts out, brightest nearest the landing. */
  strength: number;
  createdAt: number;
}

/** How long a trail cell stays on screen. */
export const TRAIL_LIFETIME_MS = 160;

/** The landing shadow. */
export const GHOST_CHAR = '{gray-fg}░░{/gray-fg}';

const BRIGHT: Record<string, string> = {
  red: 'lightred',
  green: 'lightgreen',
  yellow: 'lightyellow',
  blue: 'lightblue',
  magenta: 'lightmagenta',
  cyan: 'lightcyan',
  white: 'lightwhite',
  orange: 'yellow',
};

export function brightColor(color: string): string {
  return BRIGHT[color] || color;
}

/**
 * A trail cell, solid while fresh and thinning as it fades.
 */
export function hardDropTrailChar(color: string, strength: number): string {
  if (strength > 0.66) {
    const bright = brightColor(color);
    return `{${bright}-bg}  {/${bright}-bg}`;
  }
  if (strength > 0.33) {
    return `{${color}-bg}  {/${color}-bg}`;
  }
  return `{${color}-fg}░░{/${color}-fg}`;
}

/**
 * The streak a piece leaves when it is slammed down.
 *
 * @param shape        piece shape, rows of 0/1
 * @param pieceX       piece column before the drop
 * @param pieceY       piece row before the drop
 * @param dropDistance rows travelled
 * @param color        colour name to fade out
 * @param bounds       rows outside [minY, maxY) are not drawn (the TGM board
 *                     hides its four spawn rows; TetriNET shows everything)
 */
export function buildHardDropTrail(
  shape: number[][],
  pieceX: number,
  pieceY: number,
  dropDistance: number,
  color: string,
  bounds: { minY: number; maxY: number },
  now: number
): HardDropTrail[] {
  if (dropDistance <= 0) return [];

  const trails: HardDropTrail[] = [];
  const maxSteps = Math.max(1, dropDistance);

  for (let py = 0; py < shape.length; py++) {
    for (let px = 0; px < shape[py].length; px++) {
      if (!shape[py][px]) continue;
      const x = pieceX + px;
      for (let step = 0; step < dropDistance; step++) {
        const y = pieceY + step + py;
        if (y < bounds.minY || y >= bounds.maxY) continue;
        trails.push({ x, y, color, strength: (step + 1) / maxSteps, createdAt: now });
      }
    }
  }

  return trails;
}

/** Drop trail cells that have finished fading. */
export function expireTrails(trails: HardDropTrail[], now: number): HardDropTrail[] {
  return trails.filter(trail => now - trail.createdAt < TRAIL_LIFETIME_MS);
}

/** The character for a trail cell at this moment, or null once it is gone. */
export function trailCharAt(
  trails: HardDropTrail[],
  x: number,
  y: number,
  now: number
): string | null {
  const trail = trails.find(t => t.x === x && t.y === y);
  if (!trail) return null;

  const fade = Math.max(0, 1 - (now - trail.createdAt) / TRAIL_LIFETIME_MS);
  if (fade <= 0) return null;

  return hardDropTrailChar(trail.color, trail.strength * fade);
}

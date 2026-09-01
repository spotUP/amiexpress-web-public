/**
 * Loads one of the sixteen original Pengo mazes onto the door's own grid.
 *
 * The raw transcription (`original-levels.ts`) is just characters; this is
 * where it becomes the same `CellType[][]` + egg-spawn shape
 * `PengoGame.initLevel()` already builds procedurally, so the caller does
 * not need to know or care which source a level came from.
 */

import { CellType, Position } from '../game/types';
import { GRID_WIDTH, GRID_HEIGHT } from '../game/constants';
import { ORIGINAL_LEVELS, ORIGINAL_LEVEL_LEGEND } from './original-levels';

export interface ParsedLevel {
  /** GRID_HEIGHT x GRID_WIDTH, border wall already filled in. */
  grid: CellType[][];
  /** Where an Egg entity should be created at level start. */
  eggSpawns: Position[];
}

/** How many original levels are transcribed - 1..originalLevelCount() are valid `loadOriginalLevel` arguments. */
export function originalLevelCount(): number {
  return ORIGINAL_LEVELS.length;
}

/**
 * Parses level `levelNumber` (1-based) onto a fresh grid, or returns null
 * if there is no transcription for it - the caller's cue to fall back to
 * the procedural generator.
 *
 * The border ring (row 0, row GRID_HEIGHT-1, column 0, column
 * GRID_WIDTH-1) is always wall, regardless of what character the source
 * transcription has there - see the provenance note atop
 * `original-levels.ts` for why a handful of source cells land there and
 * what happens to them.
 */
export function loadOriginalLevel(levelNumber: number): ParsedLevel | null {
  const rows = ORIGINAL_LEVELS[levelNumber - 1];
  if (!rows) return null;

  const grid: CellType[][] = [];
  const eggSpawns: Position[] = [];

  for (let y = 0; y < GRID_HEIGHT; y++) {
    grid[y] = [];
    const row = rows[y] ?? '';
    for (let x = 0; x < GRID_WIDTH; x++) {
      const isBorder = x === 0 || x === GRID_WIDTH - 1 || y === 0 || y === GRID_HEIGHT - 1;
      if (isBorder) {
        grid[y][x] = 'wall';
        continue;
      }

      const ch = row[x] ?? ORIGINAL_LEVEL_LEGEND.empty;
      switch (ch) {
        case ORIGINAL_LEVEL_LEGEND.ice:
          grid[y][x] = 'ice';
          break;
        case ORIGINAL_LEVEL_LEGEND.diamond:
          grid[y][x] = 'diamond';
          break;
        case ORIGINAL_LEVEL_LEGEND.egg:
          // Eggs are entities, not terrain, in this door's model (see
          // Stage 3's ruling to leave the egg model alone) - the cell
          // itself is walkable floor, and the spawn point is reported
          // separately for the caller to create an Egg at.
          grid[y][x] = 'empty';
          eggSpawns.push({ x, y });
          break;
        default:
          grid[y][x] = 'empty';
      }
    }
  }

  return { grid, eggSpawns };
}

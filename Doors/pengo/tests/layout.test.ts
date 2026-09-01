/**
 * The board fits the terminal, and the world it scrolls through is
 * exactly the arcade's 13x15.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. That fix (a 16x11 world sized to fill 80x22 exactly)
 * was superseded 2026-09-01 when the grid became the arcade's real 13x15
 * - taller than the terminal can show at once, so a camera scrolls it
 * instead of the world being sized to fit. These are the two different
 * invariants that replaces: the WORLD is the arcade's real size, and the
 * VIEW (what buildBoard actually returns, and what index.ts draws) is a
 * cropped window that fits the screen - a drive-by constant change to
 * either fails here first.
 */

import assert from 'assert';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, GRID_WIDTH, GRID_HEIGHT,
  CELL_W, CELL_H, WORLD_COLS, WORLD_ROWS, VIEW_GRID_ROWS,
  BOARD_COLS, BOARD_ROWS, getLevelConfig,
} from '../game/constants';

/** The world is the arcade's real 13x15, not a shape picked to fit the screen. */
export async function theWorldIsTheArcadesRealSize(): Promise<void> {
  assert.strictEqual(GRID_WIDTH, 13, 'both independent reference clones agree on 13 columns');
  assert.strictEqual(GRID_HEIGHT, 15, 'both independent reference clones agree on 15 rows');
  assert.strictEqual(WORLD_COLS, GRID_WIDTH * CELL_W);
  assert.strictEqual(WORLD_ROWS, GRID_HEIGHT * CELL_H);
}

/** The world fits the screen horizontally - no camera needed on that axis. */
export async function theWorldFitsTheScreenWidthWithNoScrolling(): Promise<void> {
  assert.ok(WORLD_COLS <= SCREEN_WIDTH, `${WORLD_COLS} world columns on an ${SCREEN_WIDTH}-column screen`);
  assert.strictEqual(BOARD_COLS, WORLD_COLS, 'the view is exactly the world width - nothing to crop horizontally');
}

/**
 * The world does NOT fit the screen vertically - proof a camera is
 * actually earning its place here, not decoration over a board that
 * would have fit anyway.
 */
export async function theWorldOutgrowsTheScreenVertically(): Promise<void> {
  assert.ok(WORLD_ROWS > BOARD_ROWS, `world is ${WORLD_ROWS} rows; a camera is pointless if the view (${BOARD_ROWS}) already covers it`);
  assert.strictEqual(BOARD_ROWS, VIEW_GRID_ROWS * CELL_H);
}

/** The ON-SCREEN board - the camera's view, not the scrollable world - fits the row budget. */
export async function theViewFitsTheRowBudget(): Promise<void> {
  assert.ok(1 + BOARD_ROWS + 1 <= SCREEN_HEIGHT,
    `HUD + ${BOARD_ROWS} view rows + hint do not fit ${SCREEN_HEIGHT} rows`);
}

export async function theLevelStillFitsItsBoard(): Promise<void> {
  // 60 ice blocks was 42% of the old 13x11 interior. The interior is now
  // 13x8 = 104 cells; the counts scale to keep the density, or level one
  // is a solid wall of ice.
  for (let level = 1; level <= 8; level++) {
    const config = getLevelConfig(level);
    const interior = (GRID_WIDTH - 2) * (GRID_HEIGHT - 2);
    const occupied = config.iceBlocks + 3 /* diamonds */ + config.enemies + config.eggs + 1;
    assert.ok(occupied < interior * 0.7,
      `level ${level}: ${occupied} things in ${interior} interior cells`);
  }
}

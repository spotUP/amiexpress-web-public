/**
 * The board fills the terminal.
 *
 * Reported 2026-08-31 with a screenshot: the board used ~30 of 80 columns
 * and 13 of 24 rows. The whole point of the sprite work is a 75x20 board;
 * these are the numbers that hold it, measured from the door's constants
 * so a drive-by constant change fails here first.
 *
 * The row budget: HUD 1 (row 0) + board 20 (rows 1-20) + hint 1 (row 23).
 * Anything taller than 20 board rows overflows the way Frogger's menu box
 * climbed onto its HUD.
 */

import assert from 'assert';
import {
  SCREEN_WIDTH, SCREEN_HEIGHT, GRID_WIDTH, GRID_HEIGHT,
  CELL_W, CELL_H, BOARD_COLS, BOARD_ROWS, getLevelConfig,
} from '../game/constants';

export async function theBoardFillsTheScreenWidth(): Promise<void> {
  assert.strictEqual(BOARD_COLS, GRID_WIDTH * CELL_W);
  assert.ok(BOARD_COLS <= SCREEN_WIDTH, `${BOARD_COLS} columns on an ${SCREEN_WIDTH}-column screen`);
  assert.ok(BOARD_COLS >= SCREEN_WIDTH - 6, `${BOARD_COLS} columns is not "the full terminal"`);
}

export async function theBoardFitsTheRowBudget(): Promise<void> {
  assert.strictEqual(BOARD_ROWS, GRID_HEIGHT * CELL_H);
  assert.ok(1 + BOARD_ROWS + 1 <= SCREEN_HEIGHT,
    `HUD + ${BOARD_ROWS} board rows + hint do not fit ${SCREEN_HEIGHT} rows`);
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

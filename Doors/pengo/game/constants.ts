/**
 * Pengo - Game Constants
 */

import { LevelConfig, HighScore } from './types';

export const SCREEN_WIDTH = 80;
/**
 * A door owns the whole 80x25 terminal. The BBS proper keeps to 80x23
 * because it needs rows for its prompt, but that constraint is the BBS's,
 * not a game's - designing the board to 24 rows wasted a row that was
 * always there.
 */
export const SCREEN_HEIGHT = 25;
export const GRID_WIDTH = 16;
export const GRID_HEIGHT = 11;

/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters, so the 16x11 maze is an 80x22 board - the full terminal
 * width, edge to edge, with the HUD above and the hint on the bottom row.
 *
 * The row budget: HUD 1 + board 22 + hint 1 = 24 of the 25 rows a door
 * gets; a twelfth maze row would need 26. The maze dropped from 13 rows to
 * buy the second sprite row (13 x 2 = 26). It holds 11, not the 10 the
 * first pass shipped - that pass budgeted 24 rows and wasted one.
 */
export const CELL_W = 5;
export const CELL_H = 2;
export const BOARD_COLS = GRID_WIDTH * CELL_W;
export const BOARD_ROWS = GRID_HEIGHT * CELL_H;

export const GAME_TICK_MS = 100;

export const STARTING_LIVES = 3;
export const INITIAL_TIME = 180;

export const SCORES = {
  crushEnemy: 400,
  stunEnemy: 100,
  pushBlock: 10,
  diamondAlign2: 1000,
  diamondAlign3: 5000,
  clearLevel: 500,
  timeBonus: 10,
  eggDestroy: 500,
};

export const STUN_DURATION = 50;
export const HATCH_TIME = 100;
export const ENEMY_MOVE_DELAY = 8;

export const LEVEL_CONFIGS: LevelConfig[] = [
  { enemies: 3, eggs: 0, iceBlocks: 53, enemySpeed: 10, timeLimit: 180 },
  { enemies: 4, eggs: 1, iceBlocks: 48, enemySpeed: 9, timeLimit: 160 },
  { enemies: 4, eggs: 2, iceBlocks: 44, enemySpeed: 8, timeLimit: 150 },
  { enemies: 5, eggs: 2, iceBlocks: 40, enemySpeed: 7, timeLimit: 140 },
  { enemies: 5, eggs: 3, iceBlocks: 35, enemySpeed: 6, timeLimit: 120 },
];

export function getLevelConfig(level: number): LevelConfig {
  const index = Math.min(level - 1, LEVEL_CONFIGS.length - 1);
  const config = { ...LEVEL_CONFIGS[index] };

  if (level > 5) {
    const scale = 1 + (level - 5) * 0.1;
    config.enemies = Math.min(8, config.enemies + Math.floor((level - 5) / 2));
    config.enemySpeed = Math.max(4, config.enemySpeed - Math.floor((level - 5) / 2));
    config.timeLimit = Math.max(90, config.timeLimit - (level - 5) * 5);
  }

  return config;
}

export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'ACE', score: 20000, level: 5, date: '2024-01-01' },
  { name: 'BOB', score: 15000, level: 4, date: '2024-01-01' },
  { name: 'CAT', score: 10000, level: 3, date: '2024-01-01' },
  { name: 'DAN', score: 5000, level: 2, date: '2024-01-01' },
  { name: 'EVE', score: 2500, level: 1, date: '2024-01-01' },
];

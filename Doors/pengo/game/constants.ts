/**
 * Pengo - Game Constants
 */

import { LevelConfig, HighScore } from './types';

export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GRID_WIDTH = 15;
export const GRID_HEIGHT = 13;
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

export const COLORS = {
  pengo: 'cyan',
  enemy: 'red',
  ice: 'white',
  diamond: 'yellow',
  wall: 'blue',
  floor: 'black',
};

export const SPRITES = {
  pengo: ['P'],
  enemy: ['S'],
  ice: ['#'],
  diamond: ['*'],
  wall: ['+'],
  egg: ['o'],
};

export const STUN_DURATION = 50;
export const HATCH_TIME = 100;
export const ENEMY_MOVE_DELAY = 8;

export const LEVEL_CONFIGS: LevelConfig[] = [
  { enemies: 3, eggs: 0, iceBlocks: 60, enemySpeed: 10, timeLimit: 180 },
  { enemies: 4, eggs: 1, iceBlocks: 55, enemySpeed: 9, timeLimit: 160 },
  { enemies: 4, eggs: 2, iceBlocks: 50, enemySpeed: 8, timeLimit: 150 },
  { enemies: 5, eggs: 2, iceBlocks: 45, enemySpeed: 7, timeLimit: 140 },
  { enemies: 5, eggs: 3, iceBlocks: 40, enemySpeed: 6, timeLimit: 120 },
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

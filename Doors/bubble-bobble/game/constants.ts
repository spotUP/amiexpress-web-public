/**
 * Bubble Bobble - Game Constants
 */

import { LevelData, HighScore, EnemyType, ItemType } from './types';

export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GAME_WIDTH = 32;
export const GAME_HEIGHT = 20;
export const GAME_TICK_MS = 50;

export const STARTING_LIVES = 3;

// Physics
export const GRAVITY = 0.25;
export const JUMP_POWER = -1.2;
export const PLAYER_SPEED = 0.5;
export const PLAYER_SPEED_SHOES = 0.7;
export const MAX_FALL_SPEED = 1.0;
export const BUBBLE_SHOOT_SPEED = 1.2;
export const BUBBLE_FLOAT_SPEED = -0.15;
export const BUBBLE_RANGE = 8;
export const BUBBLE_RANGE_CANDY = 12;

// Timing
export const BUBBLE_SHOOT_TIME = 15;
export const BUBBLE_FLOAT_TIME = 300;
export const BUBBLE_POP_TIME = 10;
export const ENEMY_BUBBLE_TIME = 180;
export const ENEMY_ANGRY_TIME = 120;
export const HURRY_UP_TIME = 600;
export const LEVEL_COMPLETE_DELAY = 60;
export const INVINCIBLE_TIME = 90;
export const RESPAWN_TIME = 60;
export const ITEM_LIFETIME = 300;
export const COMBO_WINDOW = 30;

// Scoring
export const SCORES: Record<string, number> = {
  zenChan: 100,
  mighta: 200,
  monsta: 300,
  banebou: 400,
  pulpul: 500,
  drunk: 600,
  invader: 700,
  superDrunk: 10000,
  // Items
  apple: 100,
  orange: 200,
  cherry: 300,
  grape: 500,
  watermelon: 800,
  diamond: 10000,
  crown: 5000,
  // Combo multipliers
  combo2: 1000,
  combo3: 2000,
  combo4: 4000,
  combo5: 8000,
  combo6: 16000,
  combo7: 32000,
  combo8: 64000,
};

// Sprites
export const SPRITES = {
  player: 'B',
  playerLeft: 'B',
  playerRight: 'd',
  bubble: 'o',
  bubbleFull: 'O',
  wall: '#',
  platform: '=',
  enemy: {
    zenChan: 'Z',
    mighta: 'M',
    monsta: 'G',
    banebou: 'W',
    pulpul: 'P',
    drunk: 'D',
    invader: 'V',
    superDrunk: 'S',
  },
  item: {
    apple: 'a',
    orange: 'o',
    cherry: 'c',
    grape: 'g',
    watermelon: 'w',
    diamond: '*',
    crown: 'k',
    shoe: 's',
    candy: 'y',
    umbrella: 'u',
    ring: 'r',
    cross: '+',
    bomb: 'b',
    thunder: 't',
    fire: 'f',
    water: '~',
  },
};

// Enemy colors
export const ENEMY_COLORS: Record<EnemyType, string> = {
  zenChan: 'green',
  mighta: 'cyan',
  monsta: 'white',
  banebou: 'yellow',
  pulpul: 'magenta',
  drunk: 'blue',
  invader: 'gray',
  superDrunk: 'red',
};

// Item colors
export const ITEM_COLORS: Record<ItemType, string> = {
  apple: 'red',
  orange: 'yellow',
  cherry: 'red',
  grape: 'magenta',
  watermelon: 'green',
  diamond: 'cyan',
  crown: 'yellow',
  shoe: 'white',
  candy: 'magenta',
  umbrella: 'cyan',
  ring: 'yellow',
  cross: 'white',
  bomb: 'gray',
  thunder: 'yellow',
  fire: 'red',
  water: 'blue',
};

// Level layouts (simplified - 10 levels)
export const LEVELS: LevelData[] = [
  // Level 1 - Simple platforms
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 4, y: 14, width: 10, passThrough: true },
      { x: 18, y: 14, width: 10, passThrough: true },
      { x: 8, y: 10, width: 16, passThrough: true },
      { x: 4, y: 6, width: 10, passThrough: true },
      { x: 18, y: 6, width: 10, passThrough: true },
    ],
    enemySpawns: [
      { type: 'zenChan', x: 6, y: 13 },
      { type: 'zenChan', x: 24, y: 13 },
      { type: 'zenChan', x: 15, y: 9 },
    ],
    walls: [],
  },
  // Level 2 - More enemies
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 0, y: 14, width: 8, passThrough: true },
      { x: 24, y: 14, width: 8, passThrough: true },
      { x: 10, y: 12, width: 12, passThrough: true },
      { x: 0, y: 8, width: 12, passThrough: true },
      { x: 20, y: 8, width: 12, passThrough: true },
      { x: 8, y: 4, width: 16, passThrough: true },
    ],
    enemySpawns: [
      { type: 'zenChan', x: 4, y: 13 },
      { type: 'zenChan', x: 26, y: 13 },
      { type: 'mighta', x: 15, y: 11 },
      { type: 'zenChan', x: 12, y: 3 },
    ],
    walls: [],
  },
  // Level 3 - Walls
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 0, y: 14, width: 14, passThrough: true },
      { x: 18, y: 14, width: 14, passThrough: true },
      { x: 6, y: 10, width: 20, passThrough: true },
      { x: 0, y: 6, width: 10, passThrough: true },
      { x: 22, y: 6, width: 10, passThrough: true },
    ],
    enemySpawns: [
      { type: 'mighta', x: 4, y: 13 },
      { type: 'mighta', x: 26, y: 13 },
      { type: 'zenChan', x: 15, y: 9 },
      { type: 'monsta', x: 5, y: 5 },
    ],
    walls: [{ x: 15, y: 14 }, { x: 16, y: 14 }, { x: 15, y: 15 }, { x: 16, y: 15 }],
  },
  // Level 4
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 4, y: 15, width: 6, passThrough: true },
      { x: 22, y: 15, width: 6, passThrough: true },
      { x: 12, y: 13, width: 8, passThrough: true },
      { x: 2, y: 10, width: 8, passThrough: true },
      { x: 22, y: 10, width: 8, passThrough: true },
      { x: 10, y: 7, width: 12, passThrough: true },
      { x: 6, y: 4, width: 8, passThrough: true },
      { x: 18, y: 4, width: 8, passThrough: true },
    ],
    enemySpawns: [
      { type: 'banebou', x: 6, y: 14 },
      { type: 'banebou', x: 24, y: 14 },
      { type: 'mighta', x: 15, y: 12 },
      { type: 'zenChan', x: 14, y: 6 },
      { type: 'monsta', x: 8, y: 3 },
    ],
    walls: [],
  },
  // Level 5 - Boss-like
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 0, y: 14, width: 12, passThrough: true },
      { x: 20, y: 14, width: 12, passThrough: true },
      { x: 8, y: 11, width: 16, passThrough: true },
      { x: 0, y: 8, width: 8, passThrough: true },
      { x: 24, y: 8, width: 8, passThrough: true },
      { x: 12, y: 5, width: 8, passThrough: true },
    ],
    enemySpawns: [
      { type: 'drunk', x: 15, y: 10 },
      { type: 'pulpul', x: 5, y: 13 },
      { type: 'pulpul', x: 25, y: 13 },
      { type: 'banebou', x: 3, y: 7 },
      { type: 'banebou', x: 27, y: 7 },
    ],
    walls: [{ x: 14, y: 14 }, { x: 17, y: 14 }],
  },
  // Levels 6-10 get progressively harder
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 2, y: 15, width: 8, passThrough: true },
      { x: 22, y: 15, width: 8, passThrough: true },
      { x: 10, y: 12, width: 12, passThrough: true },
      { x: 0, y: 9, width: 10, passThrough: true },
      { x: 22, y: 9, width: 10, passThrough: true },
      { x: 8, y: 6, width: 16, passThrough: true },
      { x: 4, y: 3, width: 8, passThrough: true },
      { x: 20, y: 3, width: 8, passThrough: true },
    ],
    enemySpawns: [
      { type: 'invader', x: 15, y: 11 },
      { type: 'drunk', x: 5, y: 14 },
      { type: 'drunk', x: 25, y: 14 },
      { type: 'pulpul', x: 12, y: 5 },
      { type: 'monsta', x: 6, y: 2 },
      { type: 'monsta', x: 22, y: 2 },
    ],
    walls: [],
  },
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 0, y: 15, width: 6, passThrough: true },
      { x: 26, y: 15, width: 6, passThrough: true },
      { x: 8, y: 14, width: 16, passThrough: true },
      { x: 4, y: 11, width: 8, passThrough: true },
      { x: 20, y: 11, width: 8, passThrough: true },
      { x: 10, y: 8, width: 12, passThrough: true },
      { x: 0, y: 5, width: 10, passThrough: true },
      { x: 22, y: 5, width: 10, passThrough: true },
    ],
    enemySpawns: [
      { type: 'invader', x: 3, y: 14 },
      { type: 'invader', x: 28, y: 14 },
      { type: 'drunk', x: 15, y: 13 },
      { type: 'pulpul', x: 6, y: 10 },
      { type: 'pulpul', x: 24, y: 10 },
      { type: 'banebou', x: 14, y: 7 },
    ],
    walls: [{ x: 15, y: 11 }, { x: 16, y: 11 }],
  },
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 4, y: 15, width: 10, passThrough: true },
      { x: 18, y: 15, width: 10, passThrough: true },
      { x: 0, y: 12, width: 8, passThrough: true },
      { x: 24, y: 12, width: 8, passThrough: true },
      { x: 10, y: 10, width: 12, passThrough: true },
      { x: 4, y: 7, width: 10, passThrough: true },
      { x: 18, y: 7, width: 10, passThrough: true },
      { x: 12, y: 4, width: 8, passThrough: true },
    ],
    enemySpawns: [
      { type: 'drunk', x: 8, y: 14 },
      { type: 'drunk', x: 22, y: 14 },
      { type: 'invader', x: 4, y: 11 },
      { type: 'invader', x: 26, y: 11 },
      { type: 'pulpul', x: 14, y: 9 },
      { type: 'banebou', x: 7, y: 6 },
      { type: 'banebou', x: 23, y: 6 },
    ],
    walls: [],
  },
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 2, y: 15, width: 6, passThrough: true },
      { x: 24, y: 15, width: 6, passThrough: true },
      { x: 10, y: 14, width: 12, passThrough: true },
      { x: 0, y: 11, width: 10, passThrough: true },
      { x: 22, y: 11, width: 10, passThrough: true },
      { x: 6, y: 8, width: 20, passThrough: true },
      { x: 2, y: 5, width: 8, passThrough: true },
      { x: 22, y: 5, width: 8, passThrough: true },
      { x: 12, y: 3, width: 8, passThrough: true },
    ],
    enemySpawns: [
      { type: 'invader', x: 4, y: 14 },
      { type: 'invader', x: 26, y: 14 },
      { type: 'drunk', x: 14, y: 13 },
      { type: 'pulpul', x: 4, y: 10 },
      { type: 'pulpul', x: 26, y: 10 },
      { type: 'banebou', x: 12, y: 7 },
      { type: 'monsta', x: 4, y: 4 },
      { type: 'monsta', x: 24, y: 4 },
    ],
    walls: [{ x: 15, y: 11 }, { x: 16, y: 11 }, { x: 15, y: 12 }, { x: 16, y: 12 }],
  },
  // Level 10 - Super Drunk boss
  {
    platforms: [
      { x: 0, y: 18, width: 32, passThrough: false },
      { x: 0, y: 14, width: 10, passThrough: true },
      { x: 22, y: 14, width: 10, passThrough: true },
      { x: 6, y: 10, width: 20, passThrough: true },
      { x: 0, y: 6, width: 12, passThrough: true },
      { x: 20, y: 6, width: 12, passThrough: true },
    ],
    enemySpawns: [
      { type: 'superDrunk', x: 15, y: 9 },
      { type: 'drunk', x: 4, y: 13 },
      { type: 'drunk', x: 26, y: 13 },
    ],
    walls: [],
  },
];

export function getLevelData(level: number): LevelData {
  const index = (level - 1) % LEVELS.length;
  const data = LEVELS[index];

  // Scale difficulty for higher loops
  const loop = Math.floor((level - 1) / LEVELS.length);
  if (loop > 0) {
    const scaled = { ...data, enemySpawns: [...data.enemySpawns] };
    // Add extra enemies in higher loops
    const extraEnemies = Math.min(loop * 2, 4);
    for (let i = 0; i < extraEnemies; i++) {
      const spawn = data.enemySpawns[i % data.enemySpawns.length];
      scaled.enemySpawns.push({
        type: getHarderEnemy(spawn.type, loop),
        x: (spawn.x + 8 + i * 4) % 28 + 2,
        y: spawn.y,
      });
    }
    return scaled;
  }

  return data;
}

function getHarderEnemy(base: EnemyType, loop: number): EnemyType {
  const progression: EnemyType[] = ['zenChan', 'mighta', 'monsta', 'banebou', 'pulpul', 'drunk', 'invader'];
  const baseIndex = progression.indexOf(base);
  if (baseIndex === -1) return base;
  const newIndex = Math.min(baseIndex + loop, progression.length - 1);
  return progression[newIndex];
}

export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'BUB', score: 100000, level: 10, date: '2024-01-01' },
  { name: 'BOB', score: 75000, level: 8, date: '2024-01-01' },
  { name: 'ACE', score: 50000, level: 6, date: '2024-01-01' },
  { name: 'ZAP', score: 25000, level: 4, date: '2024-01-01' },
  { name: 'POP', score: 10000, level: 2, date: '2024-01-01' },
];

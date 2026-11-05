/**
 * Galaga - Game Constants
 */

import { StageConfig, HighScore, AlienType } from './types';

// Screen dimensions
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GAME_AREA_WIDTH = 60;
export const GAME_AREA_HEIGHT = 20;

// Game timing
export const GAME_TICK_MS = 33;  // ~30 FPS

// Player settings
export const STARTING_LIVES = 3;
export const PLAYER_Y = GAME_AREA_HEIGHT - 2;
export const PLAYER_SPEED = 2;
export const MAX_PLAYER_BULLETS = 2;

// Formation settings
export const FORMATION_ROWS = 5;
export const FORMATION_COLS = 10;
export const FORMATION_START_Y = 3;
export const FORMATION_SPACING_X = 4;
export const FORMATION_SPACING_Y = 2;
export const FORMATION_SWAY_SPEED = 0.5;
export const FORMATION_SWAY_AMOUNT = 5;

// Bullet settings
export const PLAYER_BULLET_SPEED = -2;
export const ENEMY_BULLET_SPEED = 1;

// Alien settings
export const ALIEN_DIVE_SPEED = 0.8;
export const ALIEN_DIVE_FREQUENCY = 2000;  // ms between dive attempts

// Scoring
export const SCORES = {
  bee: 50,           // Bee in formation
  beeSwoop: 100,     // Bee while diving
  butterfly: 80,     // Butterfly in formation
  butterflySwoop: 160, // Butterfly while diving
  boss: 150,         // Boss first hit
  bossKill: 400,     // Boss killed (no capture)
  bossKillWithFighter: 1600,  // Boss killed that captured your ship
  dualFighter: 1000, // Bonus for getting dual fighter
  challengingPerfect: 10000,  // All 40 enemies in challenging stage
  challengingBonus: 100,  // Per enemy in challenging stage
};

// Colors
export const COLORS = {
  player: 'cyan',
  playerBullet: 'white',
  bee: 'yellow',
  butterfly: 'red',
  boss: 'green',
  bossWing: 'blue',
  captured: 'cyan',
  tractorBeam: 'yellow',
  explosion: 'yellow',
  star: 'white',
};

// Sprites (ASCII)
export const SPRITES = {
  player: ['^', 'A'],
  dualPlayer: ['^A^'],
  bee: ['w'],
  butterfly: ['M'],
  boss: ['@'],
  bossWithCaptured: ['@A'],
  bullet: ['|'],
  enemyBullet: ['.'],
  explosion: ['*', '+', 'o', '.'],
  star: ['.', '*', '+'],
};

// Formation layout (which alien types in each row)
export const FORMATION_LAYOUT: (AlienType | null)[][] = [
  // Row 0: Bosses (4 in center)
  [null, null, null, 'boss', 'boss', 'boss', 'boss', null, null, null],
  // Row 1: Butterflies
  ['butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly'],
  // Row 2: Butterflies
  ['butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly', 'butterfly'],
  // Row 3: Bees
  ['bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee'],
  // Row 4: Bees
  ['bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee', 'bee'],
];

// Stage configurations
export const STAGE_CONFIGS: StageConfig[] = [
  // Stage 1
  {
    bees: 20,
    butterflies: 16,
    bosses: 4,
    diveFrequency: 3000,
    alienSpeed: 0.5,
    bulletSpeed: 0.8,
    isChallengingStage: false,
  },
  // Stage 2
  {
    bees: 20,
    butterflies: 16,
    bosses: 4,
    diveFrequency: 2500,
    alienSpeed: 0.6,
    bulletSpeed: 0.9,
    isChallengingStage: false,
  },
  // Stage 3 - Challenging
  {
    bees: 20,
    butterflies: 16,
    bosses: 4,
    diveFrequency: 0,
    alienSpeed: 0.8,
    bulletSpeed: 0,
    isChallengingStage: true,
  },
  // Stage 4
  {
    bees: 20,
    butterflies: 16,
    bosses: 4,
    diveFrequency: 2000,
    alienSpeed: 0.7,
    bulletSpeed: 1.0,
    isChallengingStage: false,
  },
  // Stage 5+
  {
    bees: 20,
    butterflies: 16,
    bosses: 4,
    diveFrequency: 1500,
    alienSpeed: 0.8,
    bulletSpeed: 1.2,
    isChallengingStage: false,
  },
];

/**
 * Get stage configuration
 */
export function getStageConfig(stage: number): StageConfig {
  // Every 3rd stage is challenging
  if (stage % 3 === 0) {
    return {
      ...STAGE_CONFIGS[2],  // Challenging template
      alienSpeed: 0.6 + (Math.floor(stage / 3) * 0.1),
    };
  }

  const index = Math.min(stage - 1, STAGE_CONFIGS.length - 1);
  const config = { ...STAGE_CONFIGS[index] };

  // Scale difficulty for higher stages
  if (stage > 5) {
    const scaleFactor = 1 + (stage - 5) * 0.1;
    config.diveFrequency = Math.max(800, config.diveFrequency / scaleFactor);
    config.alienSpeed = Math.min(1.5, config.alienSpeed * scaleFactor);
    config.bulletSpeed = Math.min(2.0, config.bulletSpeed * scaleFactor);
  }

  return config;
}

// Menu options
export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

// Default high scores
export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'ACE', score: 50000, stage: 10, date: '2024-01-01' },
  { name: 'BOB', score: 40000, stage: 8, date: '2024-01-01' },
  { name: 'CAT', score: 30000, stage: 6, date: '2024-01-01' },
  { name: 'DAN', score: 20000, stage: 4, date: '2024-01-01' },
  { name: 'EVE', score: 10000, stage: 2, date: '2024-01-01' },
];

// Dive paths (predefined attack patterns)
export const DIVE_PATHS = {
  swoopLeft: [
    { x: 0, y: 1 }, { x: -2, y: 2 }, { x: -4, y: 4 },
    { x: -3, y: 6 }, { x: 0, y: 8 }, { x: 3, y: 10 },
    { x: 5, y: 12 }, { x: 3, y: 14 }, { x: 0, y: 16 },
  ],
  swoopRight: [
    { x: 0, y: 1 }, { x: 2, y: 2 }, { x: 4, y: 4 },
    { x: 3, y: 6 }, { x: 0, y: 8 }, { x: -3, y: 10 },
    { x: -5, y: 12 }, { x: -3, y: 14 }, { x: 0, y: 16 },
  ],
  captureRun: [
    { x: 0, y: 2 }, { x: 0, y: 4 }, { x: 0, y: 6 },
    { x: 0, y: 8 }, { x: 0, y: 10 }, { x: 0, y: 12 },
  ],
};

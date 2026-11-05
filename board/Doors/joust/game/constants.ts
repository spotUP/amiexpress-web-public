/**
 * Joust - Game Constants
 */

import { WaveConfig, HighScore, Platform, LavaPit } from './types';

export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GAME_WIDTH = 78;
export const GAME_HEIGHT = 20;
export const GAME_TICK_MS = 50;

export const STARTING_LIVES = 5;

// Physics
export const GRAVITY = 0.15;
export const FLAP_POWER = -0.8;
export const MAX_FALL_SPEED = 1.5;
export const MAX_RISE_SPEED = -2.0;
export const HORIZONTAL_SPEED = 0.5;
export const HORIZONTAL_DRAG = 0.98;
export const GROUND_FRICTION = 0.85;
export const WALK_SPEED = 0.3;

// Combat
export const LANCE_HEIGHT_ADVANTAGE = 0.5;
export const COLLISION_DISTANCE = 2.5;

// Scoring
export const SCORES = {
  bounder: 500,
  hunter: 750,
  shadowLord: 1500,
  pterodactyl: 1000,
  egg: 250,
  survivalBonus: 3000,
  teamBonus: 1000,
};

// Timing
export const RESPAWN_TIME = 60;
export const INVINCIBLE_TIME = 90;
export const EGG_HATCH_BASE = 150;
export const EGG_FALL_TIME = 30;
export const PTERODACTYL_WARNING = 300;
export const WAVE_COMPLETE_DELAY = 60;

// Enemy types with their colors
export const ENEMY_COLORS: Record<string, string> = {
  bounder: 'red',
  hunter: 'gray',
  shadowLord: 'blue',
};

// Characters
export const SPRITES = {
  playerRight: '>',
  playerLeft: '<',
  playerFlap: '^',
  enemyRight: '}',
  enemyLeft: '{',
  egg: 'o',
  eggHatching: 'O',
  pterodactyl: 'W',
  platform: '=',
  lava: '~',
  lavaHand: '\\',
};

// Platform layout for each wave type
export const STANDARD_PLATFORMS: Platform[] = [
  // Bottom platforms
  { x: 0, y: 18, width: 15, type: 'solid' },
  { x: 63, y: 18, width: 15, type: 'solid' },

  // Middle platforms
  { x: 10, y: 14, width: 12, type: 'floating' },
  { x: 35, y: 13, width: 8, type: 'floating' },
  { x: 56, y: 14, width: 12, type: 'floating' },

  // Upper platforms
  { x: 5, y: 9, width: 10, type: 'floating' },
  { x: 30, y: 8, width: 18, type: 'floating' },
  { x: 63, y: 9, width: 10, type: 'floating' },

  // Top platforms
  { x: 20, y: 4, width: 12, type: 'floating' },
  { x: 46, y: 4, width: 12, type: 'floating' },
];

export const LAVA_PITS: LavaPit[] = [
  { x: 15, width: 48 },
];

// Wave configurations
export const WAVE_CONFIGS: WaveConfig[] = [
  { bounders: 3, hunters: 0, shadowLords: 0, eggHatchTime: 200, enemySpeed: 0.3, pterodactylTimer: 600 },
  { bounders: 4, hunters: 0, shadowLords: 0, eggHatchTime: 180, enemySpeed: 0.35, pterodactylTimer: 550 },
  { bounders: 3, hunters: 2, shadowLords: 0, eggHatchTime: 160, enemySpeed: 0.4, pterodactylTimer: 500 },
  { bounders: 2, hunters: 3, shadowLords: 0, eggHatchTime: 150, enemySpeed: 0.45, pterodactylTimer: 450 },
  { bounders: 2, hunters: 2, shadowLords: 1, eggHatchTime: 140, enemySpeed: 0.5, pterodactylTimer: 400 },
  { bounders: 1, hunters: 3, shadowLords: 2, eggHatchTime: 130, enemySpeed: 0.55, pterodactylTimer: 350 },
];

export function getWaveConfig(wave: number): WaveConfig {
  const index = Math.min(wave - 1, WAVE_CONFIGS.length - 1);
  const config = { ...WAVE_CONFIGS[index] };

  if (wave > WAVE_CONFIGS.length) {
    const extraWaves = wave - WAVE_CONFIGS.length;
    config.bounders += Math.floor(extraWaves / 3);
    config.hunters += Math.floor(extraWaves / 2);
    config.shadowLords += Math.floor(extraWaves / 4);
    config.enemySpeed = Math.min(0.8, config.enemySpeed + extraWaves * 0.02);
    config.eggHatchTime = Math.max(80, config.eggHatchTime - extraWaves * 5);
    config.pterodactylTimer = Math.max(200, config.pterodactylTimer - extraWaves * 20);
  }

  return config;
}

export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'ACE', score: 50000, wave: 8, date: '2024-01-01' },
  { name: 'BOB', score: 35000, wave: 6, date: '2024-01-01' },
  { name: 'CAT', score: 20000, wave: 4, date: '2024-01-01' },
  { name: 'DAN', score: 10000, wave: 3, date: '2024-01-01' },
  { name: 'EVE', score: 5000, wave: 2, date: '2024-01-01' },
];

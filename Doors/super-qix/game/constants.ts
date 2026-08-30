/**
 * Super Qix - Game Constants
 * All game parameters based on original 1987 Taito arcade specifications
 */

import { LevelConfig, PowerUpType } from './types';

// Display dimensions (neo-blessed terminal)
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;

// Playfield dimensions (inside borders)
//
// A terminal character cell is about twice as tall as it is wide, so a
// playfield measured in single characters is not square: one step up or
// down covers roughly twice the visual distance of one step left or right,
// which made horizontal movement feel half-speed.
//
// The fix is geometric, not a speed tweak: every logical cell is drawn
// CELL_WIDTH characters wide, so one cell is ~2 units wide by ~2 units
// tall on screen - square. The grid is therefore 38 logical columns
// rendered as 76 characters, which still fits SCREEN_WIDTH (80).
// All game logic works in logical cells and needs no aspect correction.
export const CELL_WIDTH = 2;
export const FIELD_WIDTH = 38;
export const FIELD_HEIGHT = 18;
export const FIELD_OFFSET_X = 2;
export const FIELD_OFFSET_Y = 2;

// Game timing
export const GAME_TICK_MS = 33;  // ~30 FPS
export const MARKER_MOVE_DELAY = 50;  // ms between moves
export const SLOW_DRAW_DELAY = 100;  // Slower when drawing slow
export const FAST_DRAW_DELAY = 50;   // Faster when drawing fast

// Lives
export const STARTING_LIVES = 3;
export const EXTRA_LIFE_PERCENT = 98;  // Claim 98%+ for extra life
export const EXTRA_LIFE_SCORE = 50000;

// Claiming thresholds
export const DEFAULT_TARGET_PERCENT = 75;
export const BONUS_PERCENT_START = 76;  // Points start here
export const POINTS_PER_BONUS_PERCENT = 1000;

// Scoring
export const FAST_DRAW_BASE_POINTS = 10;  // Per % claimed
export const SLOW_DRAW_BASE_POINTS = 20;  // 2x for slow draw
export const LETTER_POINTS = 1000;
export const WORD_COMPLETE_POINTS = 10000;
export const SPLIT_QIX_MULTIPLIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9];  // Based on separation

// Enemy parameters
export const QIX_BASE_SPEED = 2;
export const QIX_SEGMENT_COUNT = 5;
export const SPARX_BASE_SPEED = 1.5;
export const SUPER_SPARX_SPEED_MULT = 1.5;
export const SUPER_SPARX_DEFAULT_TIME = 30000;  // 30 seconds
export const FUSE_BASE_SPEED = 2;
export const FUSE_START_DELAY = 500;  // ms before fuse starts

// Power-up parameters
export const POWERUP_SPAWN_CHANCE = 0.25;  // 25% chance on area claim
export const SPEED_BOOST_DURATION = 10000;  // 10 seconds
export const FREEZE_DURATION = 5000;  // 5 seconds
export const SHIELD_DURATION = 0;  // Instant use on hit

// Visual characters
export const CHARS = {
  marker: '@',
  markerDrawing: '@',
  qix: '*',
  qixAlt: '%',
  sparx: '+',
  superSparx: 'X',
  fuse: '~',
  fuseHead: '*',
  powerUp: '?',
  letter: '',  // Dynamic A-Z
  border: '#',
  unclaimed: '.',
  claimed: ' ',
  stixFast: '-',
  stixSlow: '=',
  stixVertFast: '|',
  stixVertSlow: '|'
};

// Colors
export const COLORS = {
  marker: 'cyan',
  markerDrawing: 'yellow',
  qix: 'magenta',
  sparx: 'red',
  superSparx: 'red',
  fuse: 'yellow',
  powerUp: 'green',
  letter: 'green',
  border: 'white',
  unclaimed: 'gray',
  claimed: 'blue',
  stixFast: 'blue',
  stixSlow: 'red',
  hud: 'white',
  score: 'yellow',
  lives: 'red',
  level: 'cyan',
  percent: 'green'
};

// Background-block colors for the playfield. A space glyph colored with
// -fg is invisible (fg has no effect on a blank char) - the field must be
// painted with -bg so claimed/border/stix area actually shows as filled
// color blocks, the way the arcade original renders them.
export const BG_COLORS = {
  border: 'white',
  unclaimed: 'black',
  claimed: 'blue',
  stixFast: 'cyan',
  stixSlow: 'red',
  qix: 'magenta',
  sparx: 'red',
  superSparx: 'red',
  fuse: 'yellow',
  powerUp: 'green',
  marker: 'cyan',
  markerDrawing: 'yellow'
};

// Level configurations (16 levels)
export const LEVEL_CONFIGS: LevelConfig[] = [
  // Level 1-4: Easy
  {
    number: 1,
    qixCount: 1,
    qixSpeed: 1.0,
    sparxCount: 2,
    sparxSpeed: 1.0,
    superSparxTime: 45000,
    fuseSpeed: 1.5,
    targetPercent: 75,
    word: 'CAT',
    backgroundPattern: 'stripes'
  },
  {
    number: 2,
    qixCount: 1,
    qixSpeed: 1.1,
    sparxCount: 2,
    sparxSpeed: 1.1,
    superSparxTime: 40000,
    fuseSpeed: 1.6,
    targetPercent: 75,
    word: 'DOG',
    backgroundPattern: 'dots'
  },
  {
    number: 3,
    qixCount: 1,
    qixSpeed: 1.2,
    sparxCount: 3,
    sparxSpeed: 1.2,
    superSparxTime: 35000,
    fuseSpeed: 1.7,
    targetPercent: 75,
    word: 'FISH',
    backgroundPattern: 'checker'
  },
  {
    number: 4,
    qixCount: 1,
    qixSpeed: 1.3,
    sparxCount: 3,
    sparxSpeed: 1.3,
    superSparxTime: 30000,
    fuseSpeed: 1.8,
    targetPercent: 75,
    word: 'BIRD',
    backgroundPattern: 'waves'
  },
  // Level 5-8: Medium
  {
    number: 5,
    qixCount: 1,
    qixSpeed: 1.5,
    sparxCount: 4,
    sparxSpeed: 1.4,
    superSparxTime: 25000,
    fuseSpeed: 2.0,
    targetPercent: 75,
    word: 'LION',
    backgroundPattern: 'cross'
  },
  {
    number: 6,
    qixCount: 1,
    qixSpeed: 1.6,
    sparxCount: 4,
    sparxSpeed: 1.5,
    superSparxTime: 22000,
    fuseSpeed: 2.1,
    targetPercent: 75,
    word: 'TIGER',
    backgroundPattern: 'spiral'
  },
  {
    number: 7,
    qixCount: 2,
    qixSpeed: 1.4,
    sparxCount: 4,
    sparxSpeed: 1.5,
    superSparxTime: 20000,
    fuseSpeed: 2.2,
    targetPercent: 75,
    word: 'BEAR',
    backgroundPattern: 'diamond'
  },
  {
    number: 8,
    qixCount: 2,
    qixSpeed: 1.5,
    sparxCount: 5,
    sparxSpeed: 1.6,
    superSparxTime: 18000,
    fuseSpeed: 2.3,
    targetPercent: 75,
    word: 'WOLF',
    backgroundPattern: 'zigzag'
  },
  // Level 9-12: Hard
  {
    number: 9,
    qixCount: 2,
    qixSpeed: 1.7,
    sparxCount: 5,
    sparxSpeed: 1.7,
    superSparxTime: 15000,
    fuseSpeed: 2.5,
    targetPercent: 75,
    word: 'EAGLE',
    backgroundPattern: 'grid'
  },
  {
    number: 10,
    qixCount: 2,
    qixSpeed: 1.8,
    sparxCount: 6,
    sparxSpeed: 1.8,
    superSparxTime: 12000,
    fuseSpeed: 2.6,
    targetPercent: 75,
    word: 'SHARK',
    backgroundPattern: 'brick'
  },
  {
    number: 11,
    qixCount: 2,
    qixSpeed: 1.9,
    sparxCount: 6,
    sparxSpeed: 1.9,
    superSparxTime: 10000,
    fuseSpeed: 2.7,
    targetPercent: 75,
    word: 'WHALE',
    backgroundPattern: 'star'
  },
  {
    number: 12,
    qixCount: 3,
    qixSpeed: 1.8,
    sparxCount: 6,
    sparxSpeed: 2.0,
    superSparxTime: 8000,
    fuseSpeed: 2.8,
    targetPercent: 75,
    word: 'SNAKE',
    backgroundPattern: 'flower'
  },
  // Level 13-16: Expert
  {
    number: 13,
    qixCount: 3,
    qixSpeed: 2.0,
    sparxCount: 7,
    sparxSpeed: 2.1,
    superSparxTime: 6000,
    fuseSpeed: 3.0,
    targetPercent: 75,
    word: 'FROG',
    backgroundPattern: 'maze'
  },
  {
    number: 14,
    qixCount: 3,
    qixSpeed: 2.2,
    sparxCount: 7,
    sparxSpeed: 2.2,
    superSparxTime: 5000,
    fuseSpeed: 3.2,
    targetPercent: 75,
    word: 'DEER',
    backgroundPattern: 'celtic'
  },
  {
    number: 15,
    qixCount: 3,
    qixSpeed: 2.4,
    sparxCount: 8,
    sparxSpeed: 2.3,
    superSparxTime: 4000,
    fuseSpeed: 3.4,
    targetPercent: 75,
    word: 'SEAL',
    backgroundPattern: 'tribal'
  },
  {
    number: 16,
    qixCount: 4,
    qixSpeed: 2.5,
    sparxCount: 8,
    sparxSpeed: 2.5,
    superSparxTime: 3000,
    fuseSpeed: 3.5,
    targetPercent: 75,
    word: 'PANDA',
    backgroundPattern: 'final'
  }
];

/**
 * Get level config (loops after 16 with increased difficulty)
 */
export function getLevelConfig(level: number): LevelConfig {
  const baseLevel = ((level - 1) % 16);
  const loopCount = Math.floor((level - 1) / 16);

  const config = { ...LEVEL_CONFIGS[baseLevel] };
  config.number = level;

  // Increase difficulty on each loop
  if (loopCount > 0) {
    config.qixSpeed *= 1 + (loopCount * 0.2);
    config.sparxSpeed *= 1 + (loopCount * 0.2);
    config.fuseSpeed *= 1 + (loopCount * 0.15);
    config.superSparxTime = Math.max(2000, config.superSparxTime - (loopCount * 1000));
  }

  return config;
}

// Power-up types and their effects
export const POWERUP_EFFECTS: Record<PowerUpType, {
  duration: number;
  description: string;
  char: string;
  color: string;
}> = {
  speed: {
    duration: SPEED_BOOST_DURATION,
    description: 'Double speed',
    char: 'S',
    color: 'yellow'
  },
  shield: {
    duration: 0,
    description: 'One-time protection',
    char: 'H',
    color: 'cyan'
  },
  freeze: {
    duration: FREEZE_DURATION,
    description: 'Freeze enemies',
    char: 'F',
    color: 'blue'
  },
  warp: {
    duration: 0,
    description: 'Skip level',
    char: 'W',
    color: 'magenta'
  },
  letter: {
    duration: 0,
    description: 'Collect letter',
    char: '?',
    color: 'green'
  }
};

// Menu options
export const MENU_OPTIONS = [
  'Start Game',
  'High Scores',
  'Help',
  'Quit'
];

// Default high scores
export const DEFAULT_HIGHSCORES = [
  { name: 'QIX', score: 100000, level: 10, maxPercent: 95, date: '1987-01-01' },
  { name: 'TAI', score: 80000, level: 8, maxPercent: 90, date: '1987-01-01' },
  { name: 'TOE', score: 60000, level: 6, maxPercent: 85, date: '1987-01-01' },
  { name: 'AAA', score: 40000, level: 4, maxPercent: 80, date: '1987-01-01' },
  { name: 'BBB', score: 20000, level: 2, maxPercent: 78, date: '1987-01-01' }
];

// Max high scores
export const MAX_HIGHSCORES = 10;

// Name entry max length
export const MAX_NAME_LENGTH = 3;

// Background patterns for level completion
export const BACKGROUND_PATTERNS: Record<string, (x: number, y: number) => string> = {
  stripes: (x, y) => y % 2 === 0 ? '#' : ' ',
  dots: (x, y) => (x + y) % 3 === 0 ? '*' : ' ',
  checker: (x, y) => (x + y) % 2 === 0 ? '#' : ' ',
  waves: (x, y) => Math.sin(x * 0.5) * 2 > y % 4 ? '~' : ' ',
  cross: (x, y) => x === FIELD_WIDTH / 2 || y === FIELD_HEIGHT / 2 ? '+' : ' ',
  spiral: (x, y) => ((x + y) % 5 === 0) ? '@' : ' ',
  diamond: (x, y) => Math.abs(x - FIELD_WIDTH / 2) + Math.abs(y - FIELD_HEIGHT / 2) < 8 ? '<>' : ' ',
  zigzag: (x, y) => (x + (y % 2) * 2) % 4 === 0 ? '/' : ' ',
  grid: (x, y) => x % 4 === 0 || y % 3 === 0 ? '+' : ' ',
  brick: (x, y) => y % 2 === 0 ? (x % 6 === 0 ? '|' : '-') : ((x + 3) % 6 === 0 ? '|' : '-'),
  star: (x, y) => (x === FIELD_WIDTH / 2 && y === FIELD_HEIGHT / 2) ? '*' : ' ',
  flower: (x, y) => (x + y) % 7 === 0 ? '@' : ' ',
  maze: (x, y) => (x % 3 === 0 || y % 3 === 0) && !((x % 6 < 3) === (y % 6 < 3)) ? '#' : ' ',
  celtic: (x, y) => ((x + y) % 4 === 0 || (x - y + 100) % 4 === 0) ? '0' : ' ',
  tribal: (x, y) => (x * y) % 7 === 0 ? '^' : ' ',
  final: (x, y) => (x + y) % 2 === 0 ? '#' : '*'
};

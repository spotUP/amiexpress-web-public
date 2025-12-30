/**
 * Puzzle Bobble (Bust-A-Move) - Game Constants
 */

import { LevelConfig, HighScore, BubbleColor } from './types';

export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GRID_WIDTH = 8;
export const GRID_HEIGHT = 12;
export const GAME_TICK_MS = 50;

// Bubble physics
export const BUBBLE_RADIUS = 1;
export const BUBBLE_SPEED = 1.0;
export const ANGLE_INCREMENT = 5;
export const MIN_ANGLE = 15;
export const MAX_ANGLE = 165;
export const SHOOTER_Y = GRID_HEIGHT + 2;

// Ceiling mechanics
export const BASE_CEILING_INTERVAL = 150;
export const CEILING_DROP_SPEED = 0.5;

// Match mechanics
export const MIN_MATCH = 3;  // Minimum bubbles to pop
export const COMBO_WINDOW = 30;

// Scoring
export const SCORES = {
  bubblePop: 10,
  bubbleDrop: 20,
  combo2: 100,
  combo3: 200,
  combo4: 400,
  combo5: 800,
  levelClear: 1000,
  perfectClear: 5000,
};

// Colors available
export const ALL_COLORS: BubbleColor[] = ['red', 'blue', 'green', 'yellow', 'purple', 'orange'];

// Color display characters
export const BUBBLE_CHARS: Record<BubbleColor, string> = {
  red: 'R',
  blue: 'B',
  green: 'G',
  yellow: 'Y',
  purple: 'P',
  orange: 'O',
  gray: 'X',
  special: '*',
};

// Terminal colors for bubbles
export const BUBBLE_TERM_COLORS: Record<BubbleColor, string> = {
  red: 'red',
  blue: 'blue',
  green: 'green',
  yellow: 'yellow',
  purple: 'magenta',
  orange: 'yellow',  // No orange, use yellow
  gray: 'gray',
  special: 'white',
};

// Level configurations
export const LEVEL_CONFIGS: LevelConfig[] = [
  { gridRows: 5, colorsUsed: 3, ceilingDropInterval: 200, ceilingDropAmount: 1, hasSpecialBubbles: false },
  { gridRows: 5, colorsUsed: 4, ceilingDropInterval: 180, ceilingDropAmount: 1, hasSpecialBubbles: false },
  { gridRows: 6, colorsUsed: 4, ceilingDropInterval: 160, ceilingDropAmount: 1, hasSpecialBubbles: false },
  { gridRows: 6, colorsUsed: 5, ceilingDropInterval: 150, ceilingDropAmount: 1, hasSpecialBubbles: true },
  { gridRows: 7, colorsUsed: 5, ceilingDropInterval: 140, ceilingDropAmount: 1, hasSpecialBubbles: true },
  { gridRows: 7, colorsUsed: 6, ceilingDropInterval: 130, ceilingDropAmount: 1, hasSpecialBubbles: true },
  { gridRows: 8, colorsUsed: 6, ceilingDropInterval: 120, ceilingDropAmount: 1, hasSpecialBubbles: true },
];

export function getLevelConfig(level: number): LevelConfig {
  const index = Math.min(level - 1, LEVEL_CONFIGS.length - 1);
  const config = { ...LEVEL_CONFIGS[index] };

  // Scale for higher levels
  if (level > LEVEL_CONFIGS.length) {
    const extra = level - LEVEL_CONFIGS.length;
    config.ceilingDropInterval = Math.max(80, config.ceilingDropInterval - extra * 5);
    config.gridRows = Math.min(10, config.gridRows + Math.floor(extra / 2));
  }

  return config;
}

export function getColorsForLevel(level: number): BubbleColor[] {
  const config = getLevelConfig(level);
  return ALL_COLORS.slice(0, config.colorsUsed);
}

// Initial bubble patterns for each level
export function generateLevelPattern(level: number): (BubbleColor | null)[][] {
  const config = getLevelConfig(level);
  const colors = getColorsForLevel(level);
  const pattern: (BubbleColor | null)[][] = [];

  for (let row = 0; row < config.gridRows; row++) {
    pattern[row] = [];
    const isOffset = row % 2 === 1;
    const width = isOffset ? GRID_WIDTH - 1 : GRID_WIDTH;

    for (let col = 0; col < GRID_WIDTH; col++) {
      if (isOffset && col === GRID_WIDTH - 1) {
        pattern[row][col] = null;
      } else if (Math.random() < 0.7) {
        pattern[row][col] = colors[Math.floor(Math.random() * colors.length)];
      } else {
        pattern[row][col] = null;
      }
    }
  }

  // Ensure at least some bubbles exist
  let bubbleCount = 0;
  for (const row of pattern) {
    bubbleCount += row.filter(c => c !== null).length;
  }

  if (bubbleCount < 10) {
    // Add some guaranteed bubbles
    for (let i = 0; i < 10 - bubbleCount; i++) {
      const row = Math.floor(Math.random() * config.gridRows);
      const col = Math.floor(Math.random() * (row % 2 === 1 ? GRID_WIDTH - 1 : GRID_WIDTH));
      if (pattern[row][col] === null) {
        pattern[row][col] = colors[Math.floor(Math.random() * colors.length)];
      }
    }
  }

  return pattern;
}

export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'BUB', score: 50000, level: 8, date: '2024-01-01' },
  { name: 'BOB', score: 35000, level: 6, date: '2024-01-01' },
  { name: 'POP', score: 20000, level: 4, date: '2024-01-01' },
  { name: 'AIM', score: 10000, level: 3, date: '2024-01-01' },
  { name: 'ZAP', score: 5000, level: 2, date: '2024-01-01' },
];

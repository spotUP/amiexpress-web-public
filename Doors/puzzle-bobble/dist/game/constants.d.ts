/**
 * Puzzle Bobble (Bust-A-Move) - Game Constants
 */
import { LevelConfig, HighScore, BubbleColor } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GRID_WIDTH = 8;
export declare const GRID_HEIGHT = 12;
export declare const GAME_TICK_MS = 50;
export declare const BUBBLE_RADIUS = 1;
export declare const BUBBLE_SPEED = 1;
export declare const ANGLE_INCREMENT = 5;
export declare const MIN_ANGLE = 15;
export declare const MAX_ANGLE = 165;
export declare const SHOOTER_Y: number;
export declare const BASE_CEILING_INTERVAL = 150;
export declare const CEILING_DROP_SPEED = 0.5;
export declare const MIN_MATCH = 3;
export declare const COMBO_WINDOW = 30;
export declare const SCORES: {
    bubblePop: number;
    bubbleDrop: number;
    combo2: number;
    combo3: number;
    combo4: number;
    combo5: number;
    levelClear: number;
    perfectClear: number;
};
export declare const ALL_COLORS: BubbleColor[];
export declare const BUBBLE_CHARS: Record<BubbleColor, string>;
export declare const BUBBLE_TERM_COLORS: Record<BubbleColor, string>;
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare function getColorsForLevel(level: number): BubbleColor[];
export declare function generateLevelPattern(level: number): (BubbleColor | null)[][];
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];

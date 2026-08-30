/**
 * Super Qix - Game Constants
 * All game parameters based on original 1987 Taito arcade specifications
 */
import { LevelConfig, PowerUpType } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const CELL_WIDTH = 2;
export declare const FIELD_WIDTH = 40;
export declare const FIELD_HEIGHT = 20;
export declare const ART_WIDTH: number;
export declare const ART_HEIGHT = 20;
export declare const FIELD_OFFSET_X = 2;
export declare const FIELD_OFFSET_Y = 2;
export declare const GAME_TICK_MS = 33;
export declare const MARKER_MOVE_DELAY = 50;
export declare const SLOW_DRAW_DELAY = 100;
export declare const FAST_DRAW_DELAY = 50;
export declare const STARTING_LIVES = 3;
export declare const EXTRA_LIFE_PERCENT = 98;
export declare const EXTRA_LIFE_SCORE = 50000;
export declare const DEFAULT_TARGET_PERCENT = 75;
export declare const BONUS_PERCENT_START = 76;
export declare const POINTS_PER_BONUS_PERCENT = 1000;
export declare const DRAW_BASE_POINTS = 10;
export declare const FILL_ANIMATION_FRAMES = 12;
export declare const LETTER_POINTS = 1000;
export declare const WORD_COMPLETE_POINTS = 10000;
export declare const SPLIT_QIX_MULTIPLIERS: number[];
export declare const QIX_BASE_SPEED = 2;
export declare const QIX_SEGMENT_COUNT = 5;
export declare const SPARX_BASE_SPEED = 1.5;
export declare const SUPER_SPARX_SPEED_MULT = 1.5;
export declare const SUPER_SPARX_DEFAULT_TIME = 30000;
export declare const FUSE_BASE_SPEED = 2;
export declare const FUSE_START_DELAY = 500;
export declare const POWERUP_SPAWN_CHANCE = 0.25;
export declare const SPEED_BOOST_DURATION = 10000;
export declare const FREEZE_DURATION = 5000;
export declare const SHIELD_DURATION = 0;
export declare const CHARS: {
    marker: string;
    markerDrawing: string;
    qix: string;
    qixAlt: string;
    sparx: string;
    superSparx: string;
    fuse: string;
    fuseHead: string;
    powerUp: string;
    letter: string;
    border: string;
    unclaimed: string;
    claimed: string;
    stixFast: string;
    stixSlow: string;
    stixVertFast: string;
    stixVertSlow: string;
};
export declare const COLORS: {
    marker: string;
    markerDrawing: string;
    qix: string;
    sparx: string;
    superSparx: string;
    fuse: string;
    powerUp: string;
    letter: string;
    border: string;
    unclaimed: string;
    claimed: string;
    stixFast: string;
    stixSlow: string;
    hud: string;
    score: string;
    lives: string;
    level: string;
    percent: string;
};
/**
 * The 16 ANSI colours, indexed the way ANSI art indexes them, named the way
 * blessed tags name them. Art cells carry fg/bg as 0-15, so this is the
 * translation used when a claimed cell reveals the picture behind it.
 *
 * Same names and order as the palette in the LiveChat door, so the two agree
 * on what "colour 9" is called.
 */
export declare const ART_PALETTE: string[];
export declare const BG_COLORS: {
    border: string;
    unclaimed: string;
    claimed: string;
    stix: string;
    stixSafe: string;
    qix: string;
    sparx: string;
    superSparx: string;
    fuse: string;
    powerUp: string;
    marker: string;
    markerDrawing: string;
};
export declare const LEVEL_CONFIGS: LevelConfig[];
/**
 * Get level config (loops after 16 with increased difficulty)
 */
export declare function getLevelConfig(level: number): LevelConfig;
export declare const POWERUP_EFFECTS: Record<PowerUpType, {
    duration: number;
    description: string;
    char: string;
    color: string;
}>;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: {
    name: string;
    score: number;
    level: number;
    maxPercent: number;
    date: string;
}[];
export declare const MAX_HIGHSCORES = 10;
export declare const MAX_NAME_LENGTH = 3;
export declare const BACKGROUND_PATTERNS: Record<string, (x: number, y: number) => string>;
//# sourceMappingURL=constants.d.ts.map
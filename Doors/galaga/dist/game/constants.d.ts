/**
 * Galaga - Game Constants
 */
import { StageConfig, HighScore, AlienType } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GAME_AREA_WIDTH = 60;
export declare const GAME_AREA_HEIGHT = 20;
export declare const GAME_TICK_MS = 33;
export declare const STARTING_LIVES = 3;
export declare const PLAYER_Y: number;
export declare const PLAYER_SPEED = 2;
export declare const MAX_PLAYER_BULLETS = 2;
export declare const FORMATION_ROWS = 5;
export declare const FORMATION_COLS = 10;
export declare const FORMATION_START_Y = 3;
export declare const FORMATION_SPACING_X = 4;
export declare const FORMATION_SPACING_Y = 2;
export declare const FORMATION_SWAY_SPEED = 0.5;
export declare const FORMATION_SWAY_AMOUNT = 5;
export declare const PLAYER_BULLET_SPEED = -2;
export declare const ENEMY_BULLET_SPEED = 1;
export declare const ALIEN_DIVE_SPEED = 0.8;
export declare const ALIEN_DIVE_FREQUENCY = 2000;
export declare const SCORES: {
    bee: number;
    beeSwoop: number;
    butterfly: number;
    butterflySwoop: number;
    boss: number;
    bossKill: number;
    bossKillWithFighter: number;
    dualFighter: number;
    challengingPerfect: number;
    challengingBonus: number;
};
export declare const COLORS: {
    player: string;
    playerBullet: string;
    bee: string;
    butterfly: string;
    boss: string;
    bossWing: string;
    captured: string;
    tractorBeam: string;
    explosion: string;
    star: string;
};
export declare const SPRITES: {
    player: string[];
    dualPlayer: string[];
    bee: string[];
    butterfly: string[];
    boss: string[];
    bossWithCaptured: string[];
    bullet: string[];
    enemyBullet: string[];
    explosion: string[];
    star: string[];
};
export declare const FORMATION_LAYOUT: (AlienType | null)[][];
export declare const STAGE_CONFIGS: StageConfig[];
/**
 * Get stage configuration
 */
export declare function getStageConfig(stage: number): StageConfig;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];
export declare const DIVE_PATHS: {
    swoopLeft: {
        x: number;
        y: number;
    }[];
    swoopRight: {
        x: number;
        y: number;
    }[];
    captureRun: {
        x: number;
        y: number;
    }[];
};
//# sourceMappingURL=constants.d.ts.map
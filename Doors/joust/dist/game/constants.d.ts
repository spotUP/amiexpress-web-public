/**
 * Joust - Game Constants
 */
import { WaveConfig, HighScore, Platform, LavaPit } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GAME_WIDTH = 78;
export declare const GAME_HEIGHT = 20;
export declare const GAME_TICK_MS = 50;
export declare const STARTING_LIVES = 5;
export declare const GRAVITY = 0.15;
export declare const FLAP_POWER = -0.8;
export declare const MAX_FALL_SPEED = 1.5;
export declare const MAX_RISE_SPEED = -2;
export declare const HORIZONTAL_SPEED = 0.5;
export declare const HORIZONTAL_DRAG = 0.98;
export declare const GROUND_FRICTION = 0.85;
export declare const WALK_SPEED = 0.3;
export declare const LANCE_HEIGHT_ADVANTAGE = 0.5;
export declare const COLLISION_DISTANCE = 2.5;
export declare const SCORES: {
    bounder: number;
    hunter: number;
    shadowLord: number;
    pterodactyl: number;
    egg: number;
    survivalBonus: number;
    teamBonus: number;
};
export declare const RESPAWN_TIME = 60;
export declare const INVINCIBLE_TIME = 90;
export declare const EGG_HATCH_BASE = 150;
export declare const EGG_FALL_TIME = 30;
export declare const PTERODACTYL_WARNING = 300;
export declare const WAVE_COMPLETE_DELAY = 60;
export declare const ENEMY_COLORS: Record<string, string>;
export declare const SPRITES: {
    playerRight: string;
    playerLeft: string;
    playerFlap: string;
    enemyRight: string;
    enemyLeft: string;
    egg: string;
    eggHatching: string;
    pterodactyl: string;
    platform: string;
    lava: string;
    lavaHand: string;
};
export declare const STANDARD_PLATFORMS: Platform[];
export declare const LAVA_PITS: LavaPit[];
export declare const WAVE_CONFIGS: WaveConfig[];
export declare function getWaveConfig(wave: number): WaveConfig;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];

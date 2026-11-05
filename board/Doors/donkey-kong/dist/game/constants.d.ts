/**
 * Donkey Kong - Game Constants
 */
import { StageData, HighScore, StageType } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GAME_WIDTH = 32;
export declare const GAME_HEIGHT = 22;
export declare const GAME_TICK_MS = 50;
export declare const STARTING_LIVES = 3;
export declare const GRAVITY = 0.2;
export declare const JUMP_POWER = -1;
export declare const PLAYER_SPEED = 0.4;
export declare const CLIMB_SPEED = 0.3;
export declare const MAX_FALL_SPEED = 1;
export declare const BARREL_SPEED = 0.35;
export declare const FIREBALL_SPEED = 0.25;
export declare const HAMMER_DURATION = 180;
export declare const BARREL_SPAWN_RATE = 120;
export declare const SPRING_SPAWN_RATE = 150;
export declare const FIREBALL_SPAWN_RATE = 200;
export declare const BONUS_START = 5000;
export declare const BONUS_DECREMENT = 100;
export declare const BONUS_INTERVAL = 30;
export declare const RESPAWN_TIME = 60;
export declare const INVINCIBLE_TIME = 90;
export declare const SCORES: {
    barrel: number;
    fireball: number;
    spring: number;
    hammer: number;
    rivet: number;
    pauline: number;
    bonus: number;
    jump: number;
};
export declare const STAGE_ORDER: StageType[];
export declare const SPRITES: {
    player: string;
    playerClimb: string;
    playerHammer: string;
    barrel: string;
    blueBarrel: string;
    fireball: string;
    spring: string;
    dk: string;
    pauline: string;
    girder: string;
    ladder: string;
    ladderBroken: string;
    rivet: string;
    hammer: string;
    elevator: string;
    conveyor: string;
};
export declare const STAGES: Record<StageType, StageData>;
export declare function getStageData(level: number, stageIndex: number): {
    stage: StageType;
    data: StageData;
};
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];

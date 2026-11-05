/**
 * Zoo Keeper - Game Constants
 * All game parameters based on original 1982 Taito arcade specifications
 */
import { AnimalType, BonusItemType, LevelConfig } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GAME_AREA: {
    top: number;
    left: number;
    width: number;
    height: number;
    bottom: number;
};
export declare const ZOO_PERIMETER: {
    outerTop: number;
    outerLeft: number;
    outerRight: number;
    outerBottom: number;
    innerTop: number;
    innerLeft: number;
    innerRight: number;
    innerBottom: number;
};
export declare const GAME_TICK_MS = 33;
export declare const ZEKE_MOVE_DELAY = 100;
export declare const ANIMAL_MOVE_DELAY = 150;
export declare const JUMP_DURATION = 300;
export declare const DEATH_ANIMATION_FRAMES = 10;
export declare const TRANSITION_DURATION = 2000;
export declare const STARTING_LIVES = 3;
export declare const EXTRA_LIFE_SCORE = 50000;
export declare const BASE_TIMER_SECONDS = 60;
export declare const TIMER_REDUCTION_PER_LEVEL = 2;
export declare const MIN_TIMER_SECONDS = 30;
export declare const ANIMAL_STATS: Record<AnimalType, {
    capturePoints: number;
    speed: number;
    strength: number;
    char: string;
    color: string;
}>;
export declare const JUMP_SCORES: Record<number, number>;
export declare const BONUS_ITEMS: Record<BonusItemType, {
    points: number;
    char: string;
    color: string;
    isNet: boolean;
}>;
export declare const NET_DURATION_TICKS = 300;
export declare const WALL_CHARS: Record<number, string>;
export declare const WALL_COLORS: Record<number, string>;
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare const PLATFORM_STAGE: {
    platformCount: number;
    platformWidth: number;
    platformSpacing: number;
    platformSpeed: number;
    coconutSpeed: number;
    coconutGravity: number;
    maxCoconuts: number;
    throwInterval: number;
    zeldaY: number;
    monkeyY: number;
};
export declare const STAMPEDE_STAGE: {
    escalatorSpeed: number;
    animalWaveInterval: number;
    animalsPerWave: number;
    escalatorHeight: number;
    extraLifeAtTop: boolean;
};
export declare const CHARS: {
    zeke: string;
    zekeWithNet: string;
    zelda: string;
    monkey: string;
    coconut: string;
    fuse: string;
    fuseEnd: string;
    corner: string;
    horizontal: string;
    vertical: string;
    empty: string;
};
export declare const COLORS: {
    zeke: string;
    zekeWithNet: string;
    zelda: string;
    monkey: string;
    coconut: string;
    fuse: string;
    fuseEnd: string;
    hud: string;
    score: string;
    lives: string;
    level: string;
    timer: string;
    menuTitle: string;
    menuItem: string;
    menuSelected: string;
    gameOver: string;
    highScore: string;
};
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: {
    name: string;
    score: number;
    level: number;
    date: string;
}[];
export declare const MAX_HIGHSCORES = 10;
export declare const MAX_NAME_LENGTH = 3;
//# sourceMappingURL=constants.d.ts.map
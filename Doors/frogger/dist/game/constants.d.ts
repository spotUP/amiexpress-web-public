/**
 * Frogger - Game Constants
 */
import { LevelConfig, HighScore } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GAME_AREA_HEIGHT = 18;
export declare const GAME_TICK_MS = 50;
export declare const INITIAL_TIME = 60;
export declare const STARTING_LIVES = 3;
export declare const EXTRA_LIFE_SCORE = 10000;
export declare const GRID_WIDTH = 40;
export declare const GRID_HEIGHT = 13;
export declare const LANE_CONFIG: readonly [{
    readonly type: "safe";
    readonly y: 12;
}, {
    readonly type: "road";
    readonly y: 11;
    readonly dir: -1;
    readonly speed: 1.5;
}, {
    readonly type: "road";
    readonly y: 10;
    readonly dir: 1;
    readonly speed: 2;
}, {
    readonly type: "road";
    readonly y: 9;
    readonly dir: -1;
    readonly speed: 1;
}, {
    readonly type: "road";
    readonly y: 8;
    readonly dir: 1;
    readonly speed: 2.5;
}, {
    readonly type: "road";
    readonly y: 7;
    readonly dir: -1;
    readonly speed: 3;
}, {
    readonly type: "safe";
    readonly y: 6;
}, {
    readonly type: "water";
    readonly y: 5;
    readonly dir: 1;
    readonly speed: 1;
}, {
    readonly type: "water";
    readonly y: 4;
    readonly dir: -1;
    readonly speed: 2;
}, {
    readonly type: "water";
    readonly y: 3;
    readonly dir: 1;
    readonly speed: 1.5;
}, {
    readonly type: "water";
    readonly y: 2;
    readonly dir: -1;
    readonly speed: 2.5;
}, {
    readonly type: "water";
    readonly y: 1;
    readonly dir: 1;
    readonly speed: 1;
}, {
    readonly type: "home";
    readonly y: 0;
}];
export declare const HOME_POSITIONS: number[];
export declare const VEHICLE_SPAWN_INTERVAL = 3000;
export declare const RIVER_OBJECT_SPAWN_INTERVAL = 2500;
export declare const TURTLE_DIVE_DURATION = 2000;
export declare const TURTLE_SURFACE_DURATION = 4000;
export declare const OBJECT_WIDTHS: {
    car: number;
    truck: number;
    racecar: number;
    log: number;
    turtle: number;
    alligator: number;
    snake: number;
};
export declare const SCORES: {
    hop: number;
    home: number;
    fly: number;
    levelComplete: number;
    timeBonus: number;
};
export declare const COLORS: {
    frog: string;
    car: string;
    truck: string;
    racecar: string;
    log: string;
    turtle: string;
    water: string;
    road: string;
    safe: string;
    home: string;
};
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];
export declare const SPRITES: {
    frog: {
        idle: string[];
        hop: string[];
    };
    car: string[];
    truck: string[];
    log: string[];
    turtle: string[];
    home: string[];
    homeOccupied: string[];
    fly: string[];
    water: string[];
    road: string[];
};
//# sourceMappingURL=constants.d.ts.map
/**
 * Pengo - Game Constants
 */
import { LevelConfig, HighScore } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GRID_WIDTH = 15;
export declare const GRID_HEIGHT = 10;
/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters, so the 15x10 maze is a 75x20 board - the full terminal, with
 * the HUD above and the hint below.
 *
 * GRID_HEIGHT dropped from 13 to 10 to buy the second sprite row: 13 cells
 * x 2 rows was 26 rows on a 24-row screen. Approved in the design doc.
 */
export declare const CELL_W = 5;
export declare const CELL_H = 2;
export declare const BOARD_COLS: number;
export declare const BOARD_ROWS: number;
export declare const GAME_TICK_MS = 100;
export declare const STARTING_LIVES = 3;
export declare const INITIAL_TIME = 180;
export declare const SCORES: {
    crushEnemy: number;
    stunEnemy: number;
    pushBlock: number;
    diamondAlign2: number;
    diamondAlign3: number;
    clearLevel: number;
    timeBonus: number;
    eggDestroy: number;
};
export declare const COLORS: {
    pengo: string;
    enemy: string;
    ice: string;
    diamond: string;
    wall: string;
    floor: string;
};
export declare const SPRITES: {
    pengo: string[];
    enemy: string[];
    ice: string[];
    diamond: string[];
    wall: string[];
    egg: string[];
};
export declare const STUN_DURATION = 50;
export declare const HATCH_TIME = 100;
export declare const ENEMY_MOVE_DELAY = 8;
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];
//# sourceMappingURL=constants.d.ts.map
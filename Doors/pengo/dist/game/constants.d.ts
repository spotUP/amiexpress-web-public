/**
 * Pengo - Game Constants
 */
import { LevelConfig, HighScore } from './types';
export declare const SCREEN_WIDTH = 80;
/**
 * A door owns the whole 80x25 terminal. The BBS proper keeps to 80x23
 * because it needs rows for its prompt, but that constraint is the BBS's,
 * not a game's - designing the board to 24 rows wasted a row that was
 * always there.
 */
export declare const SCREEN_HEIGHT = 25;
export declare const GRID_WIDTH = 16;
export declare const GRID_HEIGHT = 11;
/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters, so the 16x11 maze is an 80x22 board - the full terminal
 * width, edge to edge, with the HUD above and the hint on the bottom row.
 *
 * The row budget: HUD 1 + board 22 + hint 1 = 24 of the 25 rows a door
 * gets; a twelfth maze row would need 26. The maze dropped from 13 rows to
 * buy the second sprite row (13 x 2 = 26). It holds 11, not the 10 the
 * first pass shipped - that pass budgeted 24 rows and wasted one.
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
/**
 * How long a squashed Sno-Bee stays on the board, in ticks.
 *
 * Long enough to read as a squash rather than a disappearance - the crush
 * is the point of the whole game, and it used to happen invisibly.
 */
export declare const CRUSH_FRAMES = 12;
export declare const STUN_DURATION = 50;
export declare const HATCH_TIME = 100;
export declare const ENEMY_MOVE_DELAY = 8;
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];
//# sourceMappingURL=constants.d.ts.map
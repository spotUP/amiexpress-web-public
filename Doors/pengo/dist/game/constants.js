"use strict";
/**
 * Pengo - Game Constants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HIGHSCORES = exports.MENU_OPTIONS = exports.LEVEL_CONFIGS = exports.ENEMY_MOVE_DELAY = exports.HATCH_TIME = exports.STUN_DURATION = exports.SCORES = exports.INITIAL_TIME = exports.STARTING_LIVES = exports.GAME_TICK_MS = exports.BOARD_ROWS = exports.BOARD_COLS = exports.CELL_H = exports.CELL_W = exports.GRID_HEIGHT = exports.GRID_WIDTH = exports.SCREEN_HEIGHT = exports.SCREEN_WIDTH = void 0;
exports.getLevelConfig = getLevelConfig;
exports.SCREEN_WIDTH = 80;
exports.SCREEN_HEIGHT = 24;
exports.GRID_WIDTH = 15;
exports.GRID_HEIGHT = 10;
/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters, so the 15x10 maze is a 75x20 board - the full terminal, with
 * the HUD above and the hint below.
 *
 * GRID_HEIGHT dropped from 13 to 10 to buy the second sprite row: 13 cells
 * x 2 rows was 26 rows on a 24-row screen. Approved in the design doc.
 */
exports.CELL_W = 5;
exports.CELL_H = 2;
exports.BOARD_COLS = exports.GRID_WIDTH * exports.CELL_W;
exports.BOARD_ROWS = exports.GRID_HEIGHT * exports.CELL_H;
exports.GAME_TICK_MS = 100;
exports.STARTING_LIVES = 3;
exports.INITIAL_TIME = 180;
exports.SCORES = {
    crushEnemy: 400,
    stunEnemy: 100,
    pushBlock: 10,
    diamondAlign2: 1000,
    diamondAlign3: 5000,
    clearLevel: 500,
    timeBonus: 10,
    eggDestroy: 500,
};
exports.STUN_DURATION = 50;
exports.HATCH_TIME = 100;
exports.ENEMY_MOVE_DELAY = 8;
exports.LEVEL_CONFIGS = [
    { enemies: 3, eggs: 0, iceBlocks: 44, enemySpeed: 10, timeLimit: 180 },
    { enemies: 4, eggs: 1, iceBlocks: 40, enemySpeed: 9, timeLimit: 160 },
    { enemies: 4, eggs: 2, iceBlocks: 37, enemySpeed: 8, timeLimit: 150 },
    { enemies: 5, eggs: 2, iceBlocks: 33, enemySpeed: 7, timeLimit: 140 },
    { enemies: 5, eggs: 3, iceBlocks: 29, enemySpeed: 6, timeLimit: 120 },
];
function getLevelConfig(level) {
    const index = Math.min(level - 1, exports.LEVEL_CONFIGS.length - 1);
    const config = { ...exports.LEVEL_CONFIGS[index] };
    if (level > 5) {
        const scale = 1 + (level - 5) * 0.1;
        config.enemies = Math.min(8, config.enemies + Math.floor((level - 5) / 2));
        config.enemySpeed = Math.max(4, config.enemySpeed - Math.floor((level - 5) / 2));
        config.timeLimit = Math.max(90, config.timeLimit - (level - 5) * 5);
    }
    return config;
}
exports.MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];
exports.DEFAULT_HIGHSCORES = [
    { name: 'ACE', score: 20000, level: 5, date: '2024-01-01' },
    { name: 'BOB', score: 15000, level: 4, date: '2024-01-01' },
    { name: 'CAT', score: 10000, level: 3, date: '2024-01-01' },
    { name: 'DAN', score: 5000, level: 2, date: '2024-01-01' },
    { name: 'EVE', score: 2500, level: 1, date: '2024-01-01' },
];
//# sourceMappingURL=constants.js.map
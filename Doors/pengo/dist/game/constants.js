"use strict";
/**
 * Pengo - Game Constants
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.DEFAULT_HIGHSCORES = exports.MENU_OPTIONS = exports.LEVEL_CONFIGS = exports.ENEMY_BREAK_BLOCK_CHANCE = exports.AI_TARGET_SIGMA = exports.MAX_LIVING_ENEMIES = exports.ENEMY_MOVE_DELAY = exports.HATCH_TIME = exports.STUN_DURATION = exports.CRUSH_FRAMES = exports.MAX_SCORE = exports.CRUSH_COMBO = exports.SCORES = exports.INITIAL_TIME = exports.STARTING_LIVES = exports.GAME_TICK_MS = exports.BOARD_ROWS = exports.BOARD_COLS = exports.VIEW_ROWS = exports.VIEW_COLS = exports.VIEW_GRID_ROWS = exports.WORLD_ROWS = exports.WORLD_COLS = exports.CELL_H = exports.CELL_W = exports.GRID_HEIGHT = exports.GRID_WIDTH = exports.SCREEN_HEIGHT = exports.SCREEN_WIDTH = void 0;
exports.crushComboScore = crushComboScore;
exports.getLevelConfig = getLevelConfig;
exports.SCREEN_WIDTH = 80;
/**
 * A door owns the whole 80x25 terminal. The BBS proper keeps to 80x23
 * because it needs rows for its prompt, but that constraint is the BBS's,
 * not a game's - designing the board to 24 rows wasted a row that was
 * always there.
 */
exports.SCREEN_HEIGHT = 25;
/**
 * The world grid, in cells - the door's TOTAL maze, border wall included
 * (same convention this door has always used: row/column 0 and the last
 * are wall, the interior is GRID_WIDTH-2 x GRID_HEIGHT-2).
 *
 * 13x15 because both independent arcade-mechanics reference clones
 * (PenguBruh-Pengo and cpp-pengo) use it, which is strong evidence it is
 * the real arcade size - see
 * thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md
 * section 4. It replaces the door's old 16x11, which was sized for the
 * terminal's sprite budget, not derived from the original.
 */
exports.GRID_WIDTH = 13;
exports.GRID_HEIGHT = 15;
/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters. The 13x15 world is 65x30 characters - wider than it is
 * tall relative to the 80x25 terminal, the opposite problem the old 16x11
 * board had. It fits horizontally (65 <= 80) with room to spare, but at
 * 30 rows it is taller than the terminal has ever had room for; only 11
 * of the 15 maze rows (22 of the 30 character rows) can be shown at once
 * (row budget: HUD 1 + board 22 + hint 1 = 24 of 25 screen rows). The
 * `cameraView`/`cropBuffer` pair from the cell-art engine's camera module
 * makes up that difference by following Pengo up and down through the
 * maze - see game/camera.ts.
 */
exports.CELL_W = 5;
exports.CELL_H = 2;
/** The full maze, in characters - what buildBoard's world buffer covers. */
exports.WORLD_COLS = exports.GRID_WIDTH * exports.CELL_W;
exports.WORLD_ROWS = exports.GRID_HEIGHT * exports.CELL_H;
/** How many maze rows the camera window shows at once. */
exports.VIEW_GRID_ROWS = 11;
/**
 * What actually reaches the screen, in characters - the camera's window.
 * The world already fits the terminal horizontally (13 == 13, no column
 * to spare), so the view is exactly as wide as the world and only ever
 * scrolls vertically.
 */
exports.VIEW_COLS = exports.WORLD_COLS;
exports.VIEW_ROWS = exports.VIEW_GRID_ROWS * exports.CELL_H;
/**
 * The rendered board's size, in characters - an alias for VIEW_COLS/ROWS.
 * Kept under the old names because everything that lays out the screen
 * (index.ts's gameArea box, the layout tests) only cares what's ON
 * screen, never the full scrollable world.
 */
exports.BOARD_COLS = exports.VIEW_COLS;
exports.BOARD_ROWS = exports.VIEW_ROWS;
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
    /** Touch-killing an already-stunned Sno-Bee - both reference clones
     *  agree this is a kill, distinct from (and smaller than) a crush. */
    touchKillStunned: 100,
};
/**
 * Chain-kill combo, keyed by how many Sno-Bees ONE continuous block push
 * caught. Ref1's table (`Block.cpp:209-234`); ours used to break at the
 * first enemy hit, so only the n=1 entry ever fired.
 */
exports.CRUSH_COMBO = [400, 1600, 3200, 6400];
function crushComboScore(chainLength) {
    const index = Math.min(chainLength, exports.CRUSH_COMBO.length) - 1;
    return exports.CRUSH_COMBO[Math.max(0, index)];
}
/** Five-digit arcade display; ref1 hard-caps the score here. */
exports.MAX_SCORE = 99999;
/**
 * How long a squashed Sno-Bee stays on the board, in ticks.
 *
 * Long enough to read as a squash rather than a disappearance - the crush
 * is the point of the whole game, and it used to happen invisibly.
 */
exports.CRUSH_FRAMES = 12;
exports.STUN_DURATION = 50;
exports.HATCH_TIME = 100;
exports.ENEMY_MOVE_DELAY = 8;
/**
 * Concurrent-enemy population cap. Ref2's `MAX_ENEMIES = 3`
 * (`GameManager.h:45`); ours was the only one of the three references with
 * no cap at all - eggs hatched on top of the initial spawn without limit.
 * 4 rather than ref2's 3: our initial spawns already reach 5-8 at higher
 * levels (`LEVEL_CONFIGS`/`getLevelConfig`), so a cap of 3 would make an
 * egg on the board something that can never hatch for most of the game.
 */
exports.MAX_LIVING_ENEMIES = 4;
/**
 * Enemy AI target selection (ref1's model, `Enemy.cpp:379-397`): a random
 * point drawn from a Gaussian centred on Pengo, not Pengo's exact cell.
 * Re-picked once the enemy arrives at (or is blocked approaching) its
 * current target.
 */
exports.AI_TARGET_SIGMA = 3;
/**
 * Odds an enemy blocked by an ice block breaks it rather than trying
 * another direction (ref2's `SnobeeChaseState.cpp:54-71`: a 50/50
 * coinflip per blocked direction).
 */
exports.ENEMY_BREAK_BLOCK_CHANCE = 0.5;
exports.LEVEL_CONFIGS = [
    { enemies: 3, eggs: 0, iceBlocks: 53, enemySpeed: 10, timeLimit: 180 },
    { enemies: 4, eggs: 1, iceBlocks: 48, enemySpeed: 9, timeLimit: 160 },
    { enemies: 4, eggs: 2, iceBlocks: 44, enemySpeed: 8, timeLimit: 150 },
    { enemies: 5, eggs: 2, iceBlocks: 40, enemySpeed: 7, timeLimit: 140 },
    { enemies: 5, eggs: 3, iceBlocks: 35, enemySpeed: 6, timeLimit: 120 },
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
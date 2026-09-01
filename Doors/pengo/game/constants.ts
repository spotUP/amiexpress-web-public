/**
 * Pengo - Game Constants
 */

import { LevelConfig, HighScore } from './types';

export const SCREEN_WIDTH = 80;
/**
 * A door owns the whole 80x25 terminal. The BBS proper keeps to 80x23
 * because it needs rows for its prompt, but that constraint is the BBS's,
 * not a game's - designing the board to 24 rows wasted a row that was
 * always there.
 */
export const SCREEN_HEIGHT = 25;

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
export const GRID_WIDTH = 13;
export const GRID_HEIGHT = 15;

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
export const CELL_W = 5;
export const CELL_H = 2;

/** The full maze, in characters - what buildBoard's world buffer covers. */
export const WORLD_COLS = GRID_WIDTH * CELL_W;
export const WORLD_ROWS = GRID_HEIGHT * CELL_H;

/** How many maze rows the camera window shows at once. */
export const VIEW_GRID_ROWS = 11;

/**
 * What actually reaches the screen, in characters - the camera's window.
 * The world already fits the terminal horizontally (13 == 13, no column
 * to spare), so the view is exactly as wide as the world and only ever
 * scrolls vertically.
 */
export const VIEW_COLS = WORLD_COLS;
export const VIEW_ROWS = VIEW_GRID_ROWS * CELL_H;

/**
 * The rendered board's size, in characters - an alias for VIEW_COLS/ROWS.
 * Kept under the old names because everything that lays out the screen
 * (index.ts's gameArea box, the layout tests) only cares what's ON
 * screen, never the full scrollable world.
 */
export const BOARD_COLS = VIEW_COLS;
export const BOARD_ROWS = VIEW_ROWS;

export const GAME_TICK_MS = 100;

export const STARTING_LIVES = 3;
export const INITIAL_TIME = 180;

export const SCORES = {
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
export const CRUSH_COMBO = [400, 1600, 3200, 6400];
export function crushComboScore(chainLength: number): number {
  const index = Math.min(chainLength, CRUSH_COMBO.length) - 1;
  return CRUSH_COMBO[Math.max(0, index)];
}

/** Five-digit arcade display; ref1 hard-caps the score here. */
export const MAX_SCORE = 99999;

/**
 * How long a squashed Sno-Bee stays on the board, in ticks.
 *
 * Long enough to read as a squash rather than a disappearance - the crush
 * is the point of the whole game, and it used to happen invisibly.
 */
export const CRUSH_FRAMES = 12;

/**
 * Ticks a pushed block takes to travel one cell.
 *
 * The push used to resolve entirely inside one keypress - the block went
 * from its old cell to wherever it stopped in a single frame, which read
 * as it vanishing. At 100ms a tick this is a visible slide the player can
 * watch, and short enough that it still feels like a shove rather than a
 * drift.
 */
export const SLIDE_TICKS_PER_CELL = 2;

export const STUN_DURATION = 50;
export const HATCH_TIME = 100;
export const ENEMY_MOVE_DELAY = 8;

/**
 * Concurrent-enemy population cap. Ref2's `MAX_ENEMIES = 3`
 * (`GameManager.h:45`); ours was the only one of the three references with
 * no cap at all - eggs hatched on top of the initial spawn without limit.
 * 4 rather than ref2's 3: our initial spawns already reach 5-8 at higher
 * levels (`LEVEL_CONFIGS`/`getLevelConfig`), so a cap of 3 would make an
 * egg on the board something that can never hatch for most of the game.
 */
export const MAX_LIVING_ENEMIES = 4;

/**
 * Enemy AI target selection (ref1's model, `Enemy.cpp:379-397`): a random
 * point drawn from a Gaussian centred on Pengo, not Pengo's exact cell.
 * Re-picked once the enemy arrives at (or is blocked approaching) its
 * current target.
 */
/**
 * How far a Sno-Bee's chosen target strays from Pengo, in cells.
 *
 * Reference 1 uses 3 on this same 13x15 grid, but that is nearly a random
 * point on a board this small - a target can land six cells off, and the
 * enemy walks all the way there while Pengo goes somewhere else. Reported
 * in play: "the enemies are super stupid". Reference 2 is worse still: a
 * pure random walk that never reads the player's position at all.
 *
 * Neither clone is the benchmark - the ARCADE is, and its Sno-Bees hunt.
 * A tight spread keeps them heading at Pengo while still leaving them
 * beatable, which a perfect chase toward his exact cell does not.
 */
export const AI_TARGET_SIGMA = 1.2;

/**
 * How many moves a Sno-Bee commits to a target before re-aiming.
 *
 * Re-picking ONLY on arrival - which is what both references do - means an
 * enemy walks to where Pengo used to be and only then looks up. On a board
 * this size that reads as wandering rather than hunting.
 */
export const AI_RETARGET_MOVES = 6;

/**
 * Odds an enemy blocked by an ice block breaks it rather than trying
 * another direction (ref2's `SnobeeChaseState.cpp:54-71`: a 50/50
 * coinflip per blocked direction).
 */
export const ENEMY_BREAK_BLOCK_CHANCE = 0.5;

export const LEVEL_CONFIGS: LevelConfig[] = [
  { enemies: 3, eggs: 0, iceBlocks: 53, enemySpeed: 10, timeLimit: 180 },
  { enemies: 4, eggs: 1, iceBlocks: 48, enemySpeed: 9, timeLimit: 160 },
  { enemies: 4, eggs: 2, iceBlocks: 44, enemySpeed: 8, timeLimit: 150 },
  { enemies: 5, eggs: 2, iceBlocks: 40, enemySpeed: 7, timeLimit: 140 },
  { enemies: 5, eggs: 3, iceBlocks: 35, enemySpeed: 6, timeLimit: 120 },
];

export function getLevelConfig(level: number): LevelConfig {
  const index = Math.min(level - 1, LEVEL_CONFIGS.length - 1);
  const config = { ...LEVEL_CONFIGS[index] };

  if (level > 5) {
    const scale = 1 + (level - 5) * 0.1;
    config.enemies = Math.min(8, config.enemies + Math.floor((level - 5) / 2));
    config.enemySpeed = Math.max(4, config.enemySpeed - Math.floor((level - 5) / 2));
    config.timeLimit = Math.max(90, config.timeLimit - (level - 5) * 5);
  }

  return config;
}

export const MENU_OPTIONS = ['Start Game', 'High Scores', 'Help', 'Quit'];

export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'ACE', score: 20000, level: 5, date: '2024-01-01' },
  { name: 'BOB', score: 15000, level: 4, date: '2024-01-01' },
  { name: 'CAT', score: 10000, level: 3, date: '2024-01-01' },
  { name: 'DAN', score: 5000, level: 2, date: '2024-01-01' },
  { name: 'EVE', score: 2500, level: 1, date: '2024-01-01' },
];

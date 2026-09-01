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
/**
 * The arcade's PLAYABLE maze, in cells - the addressable space the original
 * level data indexes, and the size both independent reference clones agree
 * on (PenguBruh-Pengo and cpp-pengo; see
 * thoughts/shared/research/2026-09-01_pengo-arcade-mechanics-gap.md
 * section 4). Neither stores a wall: cpp-pengo's GridManager draws a fixed
 * border OUTSIDE this space.
 */
export declare const ARCADE_COLS = 13;
export declare const ARCADE_ROWS = 15;
/**
 * The world grid, in cells - the door's TOTAL maze, border wall included
 * (same convention this door has always used: row/column 0 and the last
 * are wall, the interior is GRID_WIDTH-2 x GRID_HEIGHT-2).
 *
 * It was 13x15 TOTAL until 2026-09-01, which put the arcade's 13x15
 * addressable space and our wall ring in the same cells: the ring
 * overwrote whatever the source had there - 3 to 15 ice blocks per level,
 * and one egg (so one fewer Sno-Bee) on seven of the sixteen. Giving the
 * ring its own cells outside the arcade's space costs two cells in each
 * dimension and loses nothing: 75x34 characters still fits the terminal's
 * 80 columns, and the camera was already scrolling vertically because 30
 * rows never fit 25 either.
 */
export declare const GRID_WIDTH: number;
export declare const GRID_HEIGHT: number;
/**
 * Cell geometry for the sprite renderer: every maze cell is a 5x2 block of
 * characters. The 15x17 world is 75x34 characters - wider than it is
 * tall relative to the 80x25 terminal, the opposite problem the old 16x11
 * board had. It fits horizontally (75 <= 80) with room to spare, but at
 * 34 rows it is taller than the terminal has ever had room for; only 11
 * of the 17 maze rows (22 of the 34 character rows) can be shown at once
 * (row budget: HUD 1 + board 22 + hint 1 = 24 of 25 screen rows). The
 * `cameraView`/`cropBuffer` pair from the cell-art engine's camera module
 * makes up that difference by following Pengo up and down through the
 * maze - see game/camera.ts.
 */
export declare const CELL_W = 5;
export declare const CELL_H = 2;
/** The full maze, in characters - what buildBoard's world buffer covers. */
export declare const WORLD_COLS: number;
export declare const WORLD_ROWS: number;
/** How many maze rows the camera window shows at once. */
export declare const VIEW_GRID_ROWS = 11;
/**
 * What actually reaches the screen, in characters - the camera's window.
 * The world already fits the terminal horizontally (75 <= 80), so the view
 * is exactly as wide as the world and only ever scrolls vertically.
 */
export declare const VIEW_COLS: number;
export declare const VIEW_ROWS: number;
/**
 * The rendered board's size, in characters - an alias for VIEW_COLS/ROWS.
 * Kept under the old names because everything that lays out the screen
 * (index.ts's gameArea box, the layout tests) only cares what's ON
 * screen, never the full scrollable world.
 */
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
    /** Touch-killing an already-stunned Sno-Bee - both reference clones
     *  agree this is a kill, distinct from (and smaller than) a crush. */
    touchKillStunned: number;
};
/**
 * Chain-kill combo, keyed by how many Sno-Bees ONE continuous block push
 * caught. Ref1's table (`Block.cpp:209-234`); ours used to break at the
 * first enemy hit, so only the n=1 entry ever fired.
 */
export declare const CRUSH_COMBO: number[];
export declare function crushComboScore(chainLength: number): number;
/** Five-digit arcade display; ref1 hard-caps the score here. */
export declare const MAX_SCORE = 99999;
/**
 * How long a squashed Sno-Bee stays on the board, in ticks.
 *
 * Long enough to read as a squash rather than a disappearance - the crush
 * is the point of the whole game, and it used to happen invisibly.
 */
export declare const CRUSH_FRAMES = 12;
/**
 * Ticks a pushed block takes to travel one cell.
 *
 * The push used to resolve entirely inside one keypress - the block went
 * from its old cell to wherever it stopped in a single frame, which read
 * as it vanishing. At 100ms a tick this is a visible slide the player can
 * watch, and short enough that it still feels like a shove rather than a
 * drift.
 */
export declare const SLIDE_TICKS_PER_CELL = 2;
export declare const STUN_DURATION = 50;
export declare const HATCH_TIME = 100;
export declare const ENEMY_MOVE_DELAY = 8;
/**
 * Concurrent-enemy population cap. Ref2's `MAX_ENEMIES = 3`
 * (`GameManager.h:45`); ours was the only one of the three references with
 * no cap at all - eggs hatched on top of the initial spawn without limit.
 * 4 rather than ref2's 3: our initial spawns already reach 5-8 at higher
 * levels (`LEVEL_CONFIGS`/`getLevelConfig`), so a cap of 3 would make an
 * egg on the board something that can never hatch for most of the game.
 */
export declare const MAX_LIVING_ENEMIES = 4;
/**
 * Enemy AI target selection (ref1's model, `Enemy.cpp:379-397`): a random
 * point drawn from a Gaussian centred on Pengo, not Pengo's exact cell.
 * Re-picked once the enemy arrives at (or is blocked approaching) its
 * current target.
 */
/**
 * How far a Sno-Bee's chosen target strays from Pengo, in cells.
 *
 * Reference 1 uses 3 on this same 13x15 maze, but that is nearly a random
 * point on a board this small - a target can land six cells off, and the
 * enemy walks all the way there while Pengo goes somewhere else. Reported
 * in play: "the enemies are super stupid". Reference 2 is worse still: a
 * pure random walk that never reads the player's position at all.
 *
 * Neither clone is the benchmark - the ARCADE is, and its Sno-Bees hunt.
 * A tight spread keeps them heading at Pengo while still leaving them
 * beatable, which a perfect chase toward his exact cell does not.
 */
export declare const AI_TARGET_SIGMA = 1.2;
/**
 * How many moves a Sno-Bee commits to a target before re-aiming.
 *
 * Re-picking ONLY on arrival - which is what both references do - means an
 * enemy walks to where Pengo used to be and only then looks up. On a board
 * this size that reads as wandering rather than hunting.
 */
export declare const AI_RETARGET_MOVES = 6;
/**
 * Odds an enemy blocked by an ice block breaks it rather than trying
 * another direction (ref2's `SnobeeChaseState.cpp:54-71`: a 50/50
 * coinflip per blocked direction).
 */
export declare const ENEMY_BREAK_BLOCK_CHANCE = 0.5;
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];
//# sourceMappingURL=constants.d.ts.map
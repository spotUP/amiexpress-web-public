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
export declare const GRID_WIDTH = 13;
export declare const GRID_HEIGHT = 15;
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
export declare const CELL_W = 5;
export declare const CELL_H = 2;
/** The full maze, in characters - what buildBoard's world buffer covers. */
export declare const WORLD_COLS: number;
export declare const WORLD_ROWS: number;
/** How many maze rows the camera window shows at once. */
export declare const VIEW_GRID_ROWS = 11;
/**
 * What actually reaches the screen, in characters - the camera's window.
 * The world already fits the terminal horizontally (13 == 13, no column
 * to spare), so the view is exactly as wide as the world and only ever
 * scrolls vertically.
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
export declare const AI_TARGET_SIGMA = 3;
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
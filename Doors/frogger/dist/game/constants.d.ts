/**
 * Frogger - Game Constants
 *
 * The level table is FAQ 6.4 transcribed. The FAQ gives, per level, how
 * many cars sit in each road lane, whether lane 4 is running fast or slow,
 * and what each water lane is made of; the notes column adds the crocodiles
 * and snakes. Everything the door used to guess at is read from here.
 */
import { LevelConfig, HighScore } from './types';
export declare const SCREEN_WIDTH = 80;
/**
/**
 * A game door owns the full 80x25 terminal; only the BBS proper is limited
 * to 23 rows. The door asks its blessed screen for all 25 explicitly -
 * without that it takes a 24-row default, and a 24-row board loses its
 * bottom lane, which is the row the player starts on.
 */
export declare const SCREEN_HEIGHT = 25;
export declare const GAME_TICK_MS = 50;
/**
 * Seconds on the clock for one frog (FAQ 7: "You will have 60 seconds to
 * move your frog up ten spaces and successfully put it in their home").
 *
 * It does NOT shrink with the level - the FAQ's difficulty comes from the
 * level table's traffic and its dwindling footing, not from a shorter
 * clock. The door used to take two seconds off per level past five.
 */
export declare const INITIAL_TIME = 60;
/**
 * How many lives a game starts with (FAQ 6.3: "You start the game with 3,
 * 5, 7, or 256 lives") - the cabinet's operator setting.
 */
export declare const LIVES_OPTIONS: number[];
export declare const STARTING_LIVES = 3;
/** FAQ 6.3: "you get one free frog at 20,000 points". */
export declare const EXTRA_LIFE_SCORE = 20000;
export declare const GRID_WIDTH = 16;
export declare const GRID_HEIGHT = 13;
/**
 * How tall each lane is drawn, in terminal rows, keyed by the lane's `y`.
 *
 * Animated sprites need Pengo's cell: 5 characters by 2 rows. The screen is
 * 25 rows, one goes to the score line and one to the status line, so the
 * board has 23 - and thirteen lanes at two rows each would want 26.
 *
 * The ten lanes that carry moving things get their two rows; the three that
 * are standing ground - the start bank, the median, the home row - keep one
 * each. Nothing that animates was cut:
 *
 *   10 moving lanes x 2 = 20
 *   the median x 2       =  2
 *   home row, start bank =  2
 *                        = 24
 *
 * Twenty-four plus the score line is 25, the whole terminal a game door
 * owns. The median is two rows because the frog stands there halfway
 * across and deserves the room; the home row and the start bank stay thin
 * and the frog uses a squat one-row sprite on them. Drawing the TALL frog
 * in a thin lane caused two earlier faults - leaning into the lane above
 * put it in the water while it stood on land, and clipping cut its legs
 * off - so a sprite that FITS is the only version that neither lies nor
 * truncates.
 */
export declare const LANE_HEIGHTS: Record<number, number>;
/**
 * The top terminal row of each lane, keyed by the lane's `y`.
 *
 * Derived from LANE_HEIGHTS rather than written out, so the two can never
 * drift apart: y counts from the home row (0) at the top of the screen down
 * to the start bank (12) at the bottom, which is the order the rows run in.
 */
export declare const LANE_ROWS: Record<number, number>;
/**
 * The board is exactly as tall as it is: no spare rows underneath it.
 *
 * The clock used to have a row of its own below the board, with blank rows
 * after that; it is a number in the status line now.
 */
export declare const GAME_AREA_HEIGHT: number;
/**
 * The lanes, bottom to top.
 *
 * Water directions are FAQ 7: "the logs, turtles, crocodiles, etc. travel on
 * the water lanes in the following direction: Lanes #1, #3, and #5 go from
 * right to left. Lanes #2 and #4 go from left to right." Every water lane
 * here was once running the opposite way.
 *
 * The ROAD is a deliberate departure from that same sentence. The FAQ claims
 * "the cars travel on the roadway from left to right", and the road was built
 * that way - but the arcade alternates its road lanes, and the FAQ itself
 * gives the game away two paragraphs later when it advises "try to find
 * 'lanes' in between the vehicles" and warns about being trapped. Traffic
 * running one way makes every gap line up into a single moving column, so
 * there is nothing to thread. Reported 2026-08-31: "all car lanes drive in
 * the same direction thats not how it should be, the original frogger has
 * different directions."
 *
 * So the road takes the FAQ's own water rule - odd lanes right to left, even
 * lanes left to right - which is what the arcade does. Lane 1 is the row
 * nearest the start bank and runs right to left, matching the arcade's first
 * row of cars.
 *
 * `lane` is the FAQ's own numbering, counting away from the median in each
 * direction, which is how the level table addresses them.
 */
/**
 * Speeds are in CELLS per step, and a cell is now five characters wide
 * rather than two. Every speed below is therefore its old value times
 * 16/40 = 0.4, which leaves the apparent speed - characters crossed per
 * second, the only thing a player can see - exactly as it was. A lane that
 * visibly sped up or slowed down here would pass every test in the suite,
 * so the arithmetic is written out rather than eyeballed:
 *
 *   1.5 -> 0.60    2.0 -> 0.80    1.0 -> 0.40
 *   2.5 -> 1.00    3.0 -> 1.20
 */
export declare const LANE_CONFIG: readonly [{
    readonly type: "safe";
    readonly y: 12;
}, {
    readonly type: "road";
    readonly y: 11;
    readonly lane: 1;
    readonly dir: -1;
    readonly speed: 0.6;
}, {
    readonly type: "road";
    readonly y: 10;
    readonly lane: 2;
    readonly dir: 1;
    readonly speed: 0.8;
}, {
    readonly type: "road";
    readonly y: 9;
    readonly lane: 3;
    readonly dir: -1;
    readonly speed: 0.4;
}, {
    readonly type: "road";
    readonly y: 8;
    readonly lane: 4;
    readonly dir: 1;
    readonly speed: 1;
}, {
    readonly type: "road";
    readonly y: 7;
    readonly lane: 5;
    readonly dir: -1;
    readonly speed: 1.2;
}, {
    readonly type: "safe";
    readonly y: 6;
}, {
    readonly type: "water";
    readonly y: 5;
    readonly lane: 1;
    readonly dir: -1;
    readonly speed: 0.4;
}, {
    readonly type: "water";
    readonly y: 4;
    readonly lane: 2;
    readonly dir: 1;
    readonly speed: 0.8;
}, {
    readonly type: "water";
    readonly y: 3;
    readonly lane: 3;
    readonly dir: -1;
    readonly speed: 0.6;
}, {
    readonly type: "water";
    readonly y: 2;
    readonly lane: 4;
    readonly dir: 1;
    readonly speed: 1;
}, {
    readonly type: "water";
    readonly y: 1;
    readonly lane: 5;
    readonly dir: -1;
    readonly speed: 0.4;
}, {
    readonly type: "home";
    readonly y: 0;
}];
/** Where the five homes sit, and how wide the opening is. */
/**
 * Where the five homes sit, and how wide the opening is.
 *
 * In the old 40-column board the homes sat at 4/12/20/28/36, three cells
 * wide, with the middle cell as the target. Scaling those positions by
 * 16/40 gives 1.6, 4.8, 8, 11.2 and 14.4 - only one of which is a column
 * the frog can stand on, and a home whose centre is unreachable makes the
 * FAQ's "exact center" rule unsatisfiable.
 *
 * So the homes are re-laid rather than rescaled: five single cells, evenly
 * spaced three apart. One cell is five characters, which is about what
 * three old two-character cells were, so the opening is the same size on
 * screen and the centre is now the cell itself.
 */
export declare const HOME_POSITIONS: number[];
export declare const HOME_WIDTH = 1;
/**
 * Where in a home a frog has to land.
 *
 * FAQ 7: "You must hit exact center or your frog will die." The door used
 * to accept anything within two cells of the home, which made the row
 * forgiving in a way the arcade is famous for not being.
 */
export declare const HOME_CENTRE_OFFSET = 0;
/**
 * Turtle dive timing.
 *
 * A set does not vanish from under the frog without warning: it spends
 * TURTLE_WARNING_MS half-submerged first, still solid, which is the
 * player's cue to hop off. The arcade animates the same tell.
 */
export declare const TURTLE_SURFACE_DURATION = 4000;
export declare const TURTLE_WARNING_MS = 1200;
export declare const TURTLE_DIVE_DURATION = 2000;
/** How fast the GAME OVER prompt blinks, in ticks per state. */
export declare const GAME_OVER_BLINK_FRAMES = 12;
/** A turtle on its way down, drawn lower than one riding high. */
/** The same turtle going under: the shell dips below its flippers. */
export declare const TURTLE_SINKING_GLYPH = "(-)";
/**
 * Widths in grid cells.
 *
 * The FAQ's water lanes are made of specific things: short logs in lane 2,
 * long logs in lane 3, medium logs in lane 5, and sets of turtles in lanes
 * 1 and 4 (its diagram draws a set as "( )( )( )").
 */
/**
 * Widths in grid cells, re-derived for the 16-column board.
 *
 * A cell went from two characters to five, so a width chosen to look right
 * at 40 columns cannot simply be scaled by 16/40 - that lands most of these
 * between one and two cells and collapses the distinctions the FAQ draws
 * (a truck is bigger than a car; lane 3 carries LONG logs and lane 2 short
 * ones). These are chosen to keep the ORDER and to stay near the old width
 * in characters, which is what a player actually sees:
 *
 *   old cells (chars)      new cells (chars)
 *   car        2 (4)   ->  1 (5)
 *   truck      3 (6)   ->  2 (10)
 *   shortLog   3 (6)   ->  2 (10)
 *   mediumLog  4 (8)   ->  3 (15)
 *   longLog    6 (12)  ->  4 (20)
 *   turtle     3 (6)   ->  2 (10)
 *
 * Where a width had to round up, the object covers slightly more of its
 * lane than it did - the river in particular is a little more forgiving,
 * because logs are the thing that grew most. If it plays too easy, the fix
 * is fewer objects per lane in the level table, not narrower sprites: a log
 * under two cells cannot show a sprite that reads as a log.
 */
export declare const OBJECT_WIDTHS: {
    car: number;
    truck: number;
    racecar: number;
    shortLog: number;
    mediumLog: number;
    longLog: number;
    log: number;
    turtle: number;
    crocodile: number;
    otter: number;
    alligator: number;
    snake: number;
};
/**
 * Scoring (FAQ 6.3).
 *
 * `hop` is per forward hop and `maxHopPerHome` caps what one trip can earn
 * from hopping: "Forward Hop: 10 points (max points per home is 100)". A
 * row therefore pays once - hopping up and down the same row does not farm
 * points, which it used to.
 */
export declare const SCORES: {
    hop: number;
    maxHopPerHome: number;
    home: number;
    fly: number;
    ladyFrog: number;
    levelComplete: number;
    timeBonus: number;
};
/**
 * How wide one grid cell is drawn, in characters.
 *
 * A terminal cell is about twice as tall as it is wide, so a logical cell
 * two characters across comes out roughly square - the same trick Super Qix
 * and Grandmaster use. Forty cells at two characters fills the 80-column
 * screen exactly.
 */
export declare const CELL_WIDTH = 5;
/**
 * How tall one grid cell is drawn, in terminal rows.
 *
 * Two, matching every Pengo sprite, so a sprite authored for one door reads
 * the same in the other and the half-block pixel grid is the same shape.
 */
export declare const CELL_HEIGHT = 2;
/**
 * The board is drawn as blocks of background colour rather than as ASCII
 * sprites. A '#' for a car and an '=' for a log read as text; a solid red
 * block and a solid brown one read as a car and a log.
 */
export declare const BG_COLORS: {
    road: string;
    water: string;
    bank: string;
    hedge: string;
    car: string;
    truck: string;
    racecar: string;
    log: string;
    turtle: string;
    turtleDiving: string;
    crocodile: string;
    crocodileMouth: string;
    otter: string;
    otterMouth: string;
    snake: string;
    ladyFrog: string;
    frog: string;
    frogDying: string;
    homeEmpty: string;
    homeOccupied: string;
    homeFly: string;
    homeCrocodile: string;
};
/**
 * The characters the board is drawn with.
 *
 * Adapted from the style of Philippe Majerus's Frogger ANSI: coloured lanes
 * with character sprites laid over them, rather than the solid blocks this
 * door drew before. A log with rounded ends and a grain along it reads as a
 * log; a brown rectangle reads as a brown rectangle.
 *
 * Every sprite is built to exactly `width * CELL_WIDTH` characters, so it
 * covers its cells and no more.
 */
export declare const SPRITE_FG: {
    log: string;
    turtle: string;
    turtleSinking: string;
    crocodile: string;
    crocodileMouth: string;
    otter: string;
    otterMouth: string;
    car: string;
    truck: string;
    racecar: string;
    snake: string;
    ladyFrog: string;
    frog: string;
    frogDying: string;
    hedge: string;
    home: string;
    homeFrog: string;
    homeFly: string;
    homeCrocodile: string;
    bank: string;
};
/**
 * The opposite of each of the sixteen colours, for the frog.
 *
 * The frog is drawn on whatever it is standing on - road, water, a log, a
 * turtle, the bank, a home - and a fixed colour is bound to collide with
 * one of them; it was invisible on the green banks until those went
 * magenta. Rather than pick a colour and hope, the frog takes the opposite
 * of the ground under it for its background, and the opposite of THAT for
 * itself, so it stands out wherever it is.
 *
 * Opposite here means the far side of the sixteen-colour wheel: red against
 * cyan, green against magenta, blue against yellow, black against white,
 * and the bright half mirrored onto the dark.
 */
export declare const COLOR_COMPLEMENT: Record<string, string>;
/** The opposite of `colour`, falling back to white on anything unknown. */
export declare function complementOf(colour: string): string;
/** The frog, and the frog you carry home. */
export declare const FROG_GLYPH = "@";
/** The grain along a log, and the ends that round it off. */
export declare const LOG_GRAIN = "-.";
export declare const LOG_END_LEFT = "(";
export declare const LOG_END_RIGHT = ")";
/** One turtle of a set. */
/**
 * One turtle of a set, seen from above: a shell between two flippers.
 *
 * ':O:' was the reference art's, and at this size it reads as punctuation
 * rather than as an animal - reported live as "the turtles dont look like
 * turtles at all".
 */
export declare const TURTLE_GLYPH = "(o)";
/** The jaws of a crocodile or an otter, and the bodies behind them. */
export declare const MOUTH_GLYPH = "><";
export declare const CROCODILE_BODY = "=";
export declare const OTTER_BODY = "~";
/** The snake, riding a log or patrolling the median. */
export declare const SNAKE_GLYPH = "S";
/** The texture of the banks and the median, and of the hedge up top. */
export declare const BANK_TEXTURE = ".:";
export declare const HEDGE_TEXTURE = "#";
/** The sides of a home, and what can be sitting in one. */
export declare const HOME_LEFT = "[";
export declare const HOME_RIGHT = "]";
export declare const FLY_GLYPH = "*";
export declare const COLORS: {
    frog: string;
    ladyFrog: string;
    car: string;
    truck: string;
    racecar: string;
    log: string;
    turtle: string;
    crocodile: string;
    otter: string;
    snake: string;
    water: string;
    road: string;
    safe: string;
    home: string;
};
/**
 * FAQ 6.4, transcribed row for row.
 *
 *   cars          - how many vehicles sit in road lanes 1..5
 *   lane4Fast     - the table's F/S for lane 4
 *   turtleSets    - the #D figures for water lanes 1 and 4
 *   shortLogs     - the #S figure for water lane 2
 *   longLogs      - the #L figure for water lane 3
 *   mediumLogs    - the #M figure for water lane 5
 *   lane5Crocodile- the table's C: lane 5 is a crocodile, not logs
 *   crocEveryNth  - "every Nth log in lane #5 a crocodile"
 *   snakes        - one added at level 3, a second at level 7
 *   crocInHome    - "CROC IN HOME MAKES APPEARANCE" from level 2
 */
/**
 * Counts re-derived for the 16-column board, preserving OCCUPANCY.
 *
 * These numbers were chosen for a 40-column board. Carrying them over
 * unchanged does not keep the difficulty - it multiplies it, because the
 * board lost 60% of its columns while the objects on it only got about 40%
 * narrower. Level 1's river lane went from three long logs covering 18 of
 * 40 cells (45%) to covering 12 of 16 (75%): lanes so full that spawns
 * overlapped and the frog could start under traffic. It showed up as a
 * flaky hop test - one run in five - which is the only reason it was caught
 * before the user saw it.
 *
 * So each count is `round(oldCount * oldWidth / newWidth * 16/40)`, which
 * holds the fraction of each lane that is covered roughly where it was:
 *
 *   cars       3 x 2 / 40 = 15%  ->  2 x 1 / 16 = 13%
 *   turtles    4 x 3 / 40 = 30%  ->  2 x 2 / 16 = 25%
 *   long logs  3 x 6 / 40 = 45%  ->  2 x 4 / 16 = 50%
 *
 * One real cost, stated rather than hidden: sixteen columns cannot express
 * the same gradations as forty. Counts that used to run 1..5 across the ten
 * levels now run 1..4, so the level-to-level ramp is slightly coarser. The
 * FAQ's "cars become more numerous as levels progress" still holds - lane 1
 * goes 2, 3, 3, 3, 4 - but with fewer distinct steps than the arcade had.
 */
export declare const LEVEL_TABLE: LevelConfig[];
/** How many crocodiles fill water lane 5 when the table's C says it does. */
export declare const LANE5_CROCODILE_COUNT = 3;
/** The first level of the repeating block (FAQ 6.4). */
export declare const BLOCK_START = 6;
export declare const BLOCK_LENGTH = 5;
/**
 * The configuration for a level.
 *
 * FAQ 6.4: "All levels after Level 6 repeat in five level blocks. This
 * means that levels 6-10, 11-15, 16-20, etc. are all the same." So level 11
 * is level 6 exactly, with no scaling on top - the door used to multiply
 * the speeds by a factor that grew without limit.
 */
export declare function getLevelConfig(level: number): LevelConfig;
/**
 * How much faster lane 4 runs once it has picked up (FAQ 6.4: "cars in
 * Lane 4 will travel fast after a specific period of time if they aren't
 * traveling fast already").
 */
export declare const LANE4_FAST_MULTIPLIER = 1.8;
export declare const LANE4_SPEEDUP_AFTER_MS = 20000;
/**
 * How much quicker the river runs when the player dawdles (FAQ 7: "if you
 * waste too much time, the things on the river will move quicker").
 */
export declare const RIVER_HURRY_AFTER_SECONDS = 30;
export declare const RIVER_HURRY_MULTIPLIER = 1.35;
/** How often a fly shows up in an empty home, and how long it stays. */
export declare const FLY_SPAWN_INTERVAL_MS = 8000;
export declare const FLY_DURATION_MS = 5000;
/** How often the crocodile tries a home, and how long it sits there. */
export declare const HOME_CROCODILE_INTERVAL_MS = 10000;
export declare const HOME_CROCODILE_DURATION_MS = 4000;
/** The lady frog rides a lane 2 log; this is how often one appears. */
export declare const LADY_FROG_INTERVAL_MS = 12000;
/** The otter turns up on a water lane at random (FAQ 6.4 note). */
export declare const OTTER_INTERVAL_MS = 15000;
/**
 * How long a name in the score table may be.
 *
 * The arcade took three initials because that is what a coin-op with a
 * joystick can ask for. A BBS knows its caller's handle, so the table holds
 * a handle - and when one has to be typed, it can be a whole one.
 */
export declare const MAX_NAME_LENGTH = 16;
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
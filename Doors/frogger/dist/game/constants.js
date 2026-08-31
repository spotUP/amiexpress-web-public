"use strict";
/**
 * Frogger - Game Constants
 *
 * The level table is FAQ 6.4 transcribed. The FAQ gives, per level, how
 * many cars sit in each road lane, whether lane 4 is running fast or slow,
 * and what each water lane is made of; the notes column adds the crocodiles
 * and snakes. Everything the door used to guess at is read from here.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SPRITES = exports.DEFAULT_HIGHSCORES = exports.MENU_OPTIONS = exports.OTTER_INTERVAL_MS = exports.LADY_FROG_INTERVAL_MS = exports.HOME_CROCODILE_DURATION_MS = exports.HOME_CROCODILE_INTERVAL_MS = exports.FLY_DURATION_MS = exports.FLY_SPAWN_INTERVAL_MS = exports.RIVER_HURRY_MULTIPLIER = exports.RIVER_HURRY_AFTER_SECONDS = exports.LANE4_SPEEDUP_AFTER_MS = exports.LANE4_FAST_MULTIPLIER = exports.BLOCK_LENGTH = exports.BLOCK_START = exports.LANE5_CROCODILE_COUNT = exports.LEVEL_TABLE = exports.COLORS = exports.HEDGE_TEXTURE = exports.BANK_TEXTURE = exports.FROG_GLYPH = exports.SPRITE_FG = exports.BG_COLORS = exports.CELL_WIDTH = exports.SCORES = exports.OBJECT_WIDTHS = exports.TURTLE_SURFACE_DURATION = exports.TURTLE_DIVE_DURATION = exports.HOME_CENTRE_OFFSET = exports.HOME_WIDTH = exports.HOME_POSITIONS = exports.LANE_CONFIG = exports.GRID_HEIGHT = exports.GRID_WIDTH = exports.EXTRA_LIFE_SCORE = exports.STARTING_LIVES = exports.LIVES_OPTIONS = exports.INITIAL_TIME = exports.GAME_TICK_MS = exports.GAME_AREA_HEIGHT = exports.SCREEN_HEIGHT = exports.SCREEN_WIDTH = void 0;
exports.getLevelConfig = getLevelConfig;
// Screen dimensions
exports.SCREEN_WIDTH = 80;
exports.SCREEN_HEIGHT = 24;
exports.GAME_AREA_HEIGHT = 18;
// Game timing
exports.GAME_TICK_MS = 50; // 20 FPS
/**
 * Seconds on the clock for one frog (FAQ 7: "You will have 60 seconds to
 * move your frog up ten spaces and successfully put it in their home").
 *
 * It does NOT shrink with the level - the FAQ's difficulty comes from the
 * level table's traffic and its dwindling footing, not from a shorter
 * clock. The door used to take two seconds off per level past five.
 */
exports.INITIAL_TIME = 60;
/**
 * How many lives a game starts with (FAQ 6.3: "You start the game with 3,
 * 5, 7, or 256 lives") - the cabinet's operator setting.
 */
exports.LIVES_OPTIONS = [3, 5, 7, 256];
exports.STARTING_LIVES = 3;
/** FAQ 6.3: "you get one free frog at 20,000 points". */
exports.EXTRA_LIFE_SCORE = 20000;
// Grid settings (logical grid, not screen)
exports.GRID_WIDTH = 40; // 2 chars per cell
exports.GRID_HEIGHT = 13; // Total lanes including safe zones
/**
 * The lanes, bottom to top.
 *
 * Directions are FAQ 7: "the cars travel on the roadway from left to right
 * while the logs, turtles, crocodiles, etc. travel on the water lanes in
 * the following direction: Lanes #1, #3, and #5 go from right to left.
 * Lanes #2 and #4 go from left to right." Every water lane here was running
 * the opposite way, and the road lanes alternated.
 *
 * `lane` is the FAQ's own numbering, counting away from the median in each
 * direction, which is how the level table addresses them.
 */
exports.LANE_CONFIG = [
    { type: 'safe', y: 12 }, // Start bank
    { type: 'road', y: 11, lane: 1, dir: 1, speed: 1.5 },
    { type: 'road', y: 10, lane: 2, dir: 1, speed: 2.0 },
    { type: 'road', y: 9, lane: 3, dir: 1, speed: 1.0 },
    { type: 'road', y: 8, lane: 4, dir: 1, speed: 2.5 }, // The fast lane
    { type: 'road', y: 7, lane: 5, dir: 1, speed: 3.0 },
    { type: 'safe', y: 6 }, // Median
    { type: 'water', y: 5, lane: 1, dir: -1, speed: 1.0 },
    { type: 'water', y: 4, lane: 2, dir: 1, speed: 2.0 },
    { type: 'water', y: 3, lane: 3, dir: -1, speed: 1.5 },
    { type: 'water', y: 2, lane: 4, dir: 1, speed: 2.5 },
    { type: 'water', y: 1, lane: 5, dir: -1, speed: 1.0 },
    { type: 'home', y: 0 },
];
/** Where the five homes sit, and how wide the opening is. */
exports.HOME_POSITIONS = [4, 12, 20, 28, 36];
exports.HOME_WIDTH = 3;
/**
 * Where in a home a frog has to land.
 *
 * FAQ 7: "You must hit exact center or your frog will die." The door used
 * to accept anything within two cells of the home, which made the row
 * forgiving in a way the arcade is famous for not being.
 */
exports.HOME_CENTRE_OFFSET = 1;
// Turtle dive timing
exports.TURTLE_DIVE_DURATION = 2000; // ms underwater
exports.TURTLE_SURFACE_DURATION = 4000; // ms above water
/**
 * Widths in grid cells.
 *
 * The FAQ's water lanes are made of specific things: short logs in lane 2,
 * long logs in lane 3, medium logs in lane 5, and sets of turtles in lanes
 * 1 and 4 (its diagram draws a set as "( )( )( )").
 */
exports.OBJECT_WIDTHS = {
    car: 2,
    truck: 3,
    racecar: 2,
    shortLog: 3,
    mediumLog: 4,
    longLog: 6,
    log: 4,
    turtle: 3,
    crocodile: 4,
    otter: 3,
    alligator: 4,
    snake: 2,
};
/**
 * Scoring (FAQ 6.3).
 *
 * `hop` is per forward hop and `maxHopPerHome` caps what one trip can earn
 * from hopping: "Forward Hop: 10 points (max points per home is 100)". A
 * row therefore pays once - hopping up and down the same row does not farm
 * points, which it used to.
 */
exports.SCORES = {
    hop: 10,
    maxHopPerHome: 100,
    home: 50,
    fly: 200,
    ladyFrog: 200,
    levelComplete: 1000,
    timeBonus: 10,
};
/**
 * How wide one grid cell is drawn, in characters.
 *
 * A terminal cell is about twice as tall as it is wide, so a logical cell
 * two characters across comes out roughly square - the same trick Super Qix
 * and Grandmaster use. Forty cells at two characters fills the 80-column
 * screen exactly.
 */
exports.CELL_WIDTH = 2;
/**
 * The board is drawn as blocks of background colour rather than as ASCII
 * sprites. A '#' for a car and an '=' for a log read as text; a solid red
 * block and a solid brown one read as a car and a log.
 */
exports.BG_COLORS = {
    road: 'black',
    water: 'blue',
    bank: 'green',
    hedge: 'green',
    car: 'red',
    truck: 'white',
    racecar: 'magenta',
    log: 'yellow', // dark yellow reads as wood
    turtle: 'green',
    turtleDiving: 'blue',
    crocodile: 'cyan', // told apart from the turtles by colour and mouth
    crocodileMouth: 'lightred',
    otter: 'lightcyan',
    otterMouth: 'lightred',
    snake: 'lightmagenta',
    ladyFrog: 'lightmagenta',
    frog: 'lightgreen',
    frogDying: 'lightred',
    homeEmpty: 'black',
    homeOccupied: 'lightgreen',
    homeFly: 'lightyellow',
    homeCrocodile: 'lightred',
};
/**
 * The sprites the board is drawn with.
 *
 * Adapted from the style of Philippe Majerus's Frogger ANSI: coloured lane
 * backgrounds with character sprites laid over them, rather than the solid
 * blocks this door drew before. A log with rounded ends and a grain reads as
 * a log; a brown rectangle reads as a brown rectangle.
 *
 * Every sprite is built to exactly `width * CELL_WIDTH` characters so it
 * fills its cells and no more.
 */
exports.SPRITE_FG = {
    log: 'gray',
    logEnd: 'black',
    turtle: 'lightgreen',
    crocodile: 'lightgreen',
    crocodileMouth: 'lightred',
    otter: 'lightcyan',
    otterMouth: 'lightred',
    car: 'lightred',
    truck: 'white',
    racecar: 'lightcyan',
    snake: 'lightmagenta',
    ladyFrog: 'lightmagenta',
    frog: 'lightgreen',
    frogDying: 'lightred',
    hedge: 'green',
    homeFrame: 'blue',
    homeFrog: 'lightgreen',
    homeFly: 'lightyellow',
    homeCrocodile: 'lightred',
    bank: 'red',
};
/** The frog, and the frog riding home on your back. */
exports.FROG_GLYPH = '\u03a9';
/** The texture along the banks and the median. */
exports.BANK_TEXTURE = '\u00b7:';
/** The texture of the hedge between the homes. */
exports.HEDGE_TEXTURE = '\u2591';
// Colors for rendering
exports.COLORS = {
    frog: 'green',
    ladyFrog: 'magenta',
    car: 'red',
    truck: 'yellow',
    racecar: 'magenta',
    log: 'yellow',
    turtle: 'green',
    crocodile: 'lightgreen',
    otter: 'brown',
    snake: 'lightmagenta',
    water: 'blue',
    road: 'black',
    safe: 'green',
    home: 'cyan',
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
exports.LEVEL_TABLE = [
    { level: 1, cars: [3, 3, 3, 1, 2], lane4Fast: true, turtleSets: [4, 4], shortLogs: 3, longLogs: 3, mediumLogs: 3, lane5Crocodile: false, crocEveryNth: null, snakes: 0, crocInHome: false },
    { level: 2, cars: [4, 4, 3, 2, 3], lane4Fast: true, turtleSets: [3, 4], shortLogs: 3, longLogs: 1, mediumLogs: 3, lane5Crocodile: false, crocEveryNth: 5, snakes: 0, crocInHome: true },
    { level: 3, cars: [4, 4, 5, 2, 3], lane4Fast: false, turtleSets: [3, 4], shortLogs: 3, longLogs: 1, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 3, snakes: 1, crocInHome: true },
    { level: 4, cars: [4, 4, 4, 3, 4], lane4Fast: true, turtleSets: [3, 3], shortLogs: 2, longLogs: 1, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 2, snakes: 1, crocInHome: true },
    { level: 5, cars: [5, 4, 5, 4, 3], lane4Fast: false, turtleSets: [2, 3], shortLogs: 2, longLogs: 1, mediumLogs: 0, lane5Crocodile: true, crocEveryNth: null, snakes: 1, crocInHome: true },
    { level: 6, cars: [3, 3, 3, 1, 2], lane4Fast: false, turtleSets: [4, 4], shortLogs: 3, longLogs: 3, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 2, snakes: 1, crocInHome: true },
    { level: 7, cars: [4, 4, 4, 2, 3], lane4Fast: true, turtleSets: [3, 5], shortLogs: 3, longLogs: 1, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 2, snakes: 2, crocInHome: true },
    { level: 8, cars: [4, 4, 5, 2, 3], lane4Fast: true, turtleSets: [3, 4], shortLogs: 3, longLogs: 1, mediumLogs: 1, lane5Crocodile: false, crocEveryNth: 2, snakes: 2, crocInHome: true },
    { level: 9, cars: [4, 4, 4, 3, 4], lane4Fast: true, turtleSets: [3, 3], shortLogs: 2, longLogs: 1, mediumLogs: 1, lane5Crocodile: false, crocEveryNth: 2, snakes: 2, crocInHome: true },
    { level: 10, cars: [5, 4, 5, 4, 4], lane4Fast: false, turtleSets: [2, 3], shortLogs: 2, longLogs: 1, mediumLogs: 0, lane5Crocodile: true, crocEveryNth: null, snakes: 2, crocInHome: true },
];
/** How many crocodiles fill water lane 5 when the table's C says it does. */
exports.LANE5_CROCODILE_COUNT = 3;
/** The first level of the repeating block (FAQ 6.4). */
exports.BLOCK_START = 6;
exports.BLOCK_LENGTH = 5;
/**
 * The configuration for a level.
 *
 * FAQ 6.4: "All levels after Level 6 repeat in five level blocks. This
 * means that levels 6-10, 11-15, 16-20, etc. are all the same." So level 11
 * is level 6 exactly, with no scaling on top - the door used to multiply
 * the speeds by a factor that grew without limit.
 */
function getLevelConfig(level) {
    if (level <= exports.BLOCK_START - 1) {
        return { ...exports.LEVEL_TABLE[Math.max(0, level - 1)] };
    }
    const intoBlock = (level - exports.BLOCK_START) % exports.BLOCK_LENGTH;
    return { ...exports.LEVEL_TABLE[exports.BLOCK_START - 1 + intoBlock] };
}
/**
 * How much faster lane 4 runs once it has picked up (FAQ 6.4: "cars in
 * Lane 4 will travel fast after a specific period of time if they aren't
 * traveling fast already").
 */
exports.LANE4_FAST_MULTIPLIER = 1.8;
exports.LANE4_SPEEDUP_AFTER_MS = 20000;
/**
 * How much quicker the river runs when the player dawdles (FAQ 7: "if you
 * waste too much time, the things on the river will move quicker").
 */
exports.RIVER_HURRY_AFTER_SECONDS = 30;
exports.RIVER_HURRY_MULTIPLIER = 1.35;
/** How often a fly shows up in an empty home, and how long it stays. */
exports.FLY_SPAWN_INTERVAL_MS = 8000;
exports.FLY_DURATION_MS = 5000;
/** How often the crocodile tries a home, and how long it sits there. */
exports.HOME_CROCODILE_INTERVAL_MS = 10000;
exports.HOME_CROCODILE_DURATION_MS = 4000;
/** The lady frog rides a lane 2 log; this is how often one appears. */
exports.LADY_FROG_INTERVAL_MS = 12000;
/** The otter turns up on a water lane at random (FAQ 6.4 note). */
exports.OTTER_INTERVAL_MS = 15000;
// Menu options
exports.MENU_OPTIONS = ['Start Game', 'Lives', 'High Scores', 'Help', 'Quit'];
// Default high scores
exports.DEFAULT_HIGHSCORES = [
    { name: 'ACE', score: 10000, level: 5, date: '2024-01-01' },
    { name: 'BOB', score: 8000, level: 4, date: '2024-01-01' },
    { name: 'CAT', score: 6000, level: 3, date: '2024-01-01' },
    { name: 'DAN', score: 4000, level: 2, date: '2024-01-01' },
    { name: 'EVE', score: 2000, level: 1, date: '2024-01-01' },
];
// Character sprites (using block sprite patterns)
exports.SPRITES = {
    frog: {
        idle: ['@'],
        hop: ['^', '@'],
    },
    car: ['##'],
    truck: ['###'],
    log: ['===='],
    turtle: ['oo'],
    home: ['[ ]'],
    homeOccupied: ['[*]'],
    fly: ['*'],
    water: ['~~'],
    road: ['..'],
};
//# sourceMappingURL=constants.js.map
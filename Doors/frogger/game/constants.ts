/**
 * Frogger - Game Constants
 *
 * The level table is FAQ 6.4 transcribed. The FAQ gives, per level, how
 * many cars sit in each road lane, whether lane 4 is running fast or slow,
 * and what each water lane is made of; the notes column adds the crocodiles
 * and snakes. Everything the door used to guess at is read from here.
 */

import { LevelConfig, HighScore } from './types';

// Screen dimensions
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
export const GAME_AREA_HEIGHT = 18;

// Game timing
export const GAME_TICK_MS = 50;  // 20 FPS

/**
 * Seconds on the clock for one frog (FAQ 7: "You will have 60 seconds to
 * move your frog up ten spaces and successfully put it in their home").
 *
 * It does NOT shrink with the level - the FAQ's difficulty comes from the
 * level table's traffic and its dwindling footing, not from a shorter
 * clock. The door used to take two seconds off per level past five.
 */
export const INITIAL_TIME = 60;

/**
 * How many lives a game starts with (FAQ 6.3: "You start the game with 3,
 * 5, 7, or 256 lives") - the cabinet's operator setting.
 */
export const LIVES_OPTIONS = [3, 5, 7, 256];
export const STARTING_LIVES = 3;

/** FAQ 6.3: "you get one free frog at 20,000 points". */
export const EXTRA_LIFE_SCORE = 20000;

// Grid settings (logical grid, not screen)
export const GRID_WIDTH = 40;   // 2 chars per cell
export const GRID_HEIGHT = 13;  // Total lanes including safe zones

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
export const LANE_CONFIG = [
  { type: 'safe',  y: 12 },                                  // Start bank
  { type: 'road',  y: 11, lane: 1, dir: 1,  speed: 1.5 },
  { type: 'road',  y: 10, lane: 2, dir: 1,  speed: 2.0 },
  { type: 'road',  y: 9,  lane: 3, dir: 1,  speed: 1.0 },
  { type: 'road',  y: 8,  lane: 4, dir: 1,  speed: 2.5 },     // The fast lane
  { type: 'road',  y: 7,  lane: 5, dir: 1,  speed: 3.0 },
  { type: 'safe',  y: 6 },                                    // Median
  { type: 'water', y: 5,  lane: 1, dir: -1, speed: 1.0 },
  { type: 'water', y: 4,  lane: 2, dir: 1,  speed: 2.0 },
  { type: 'water', y: 3,  lane: 3, dir: -1, speed: 1.5 },
  { type: 'water', y: 2,  lane: 4, dir: 1,  speed: 2.5 },
  { type: 'water', y: 1,  lane: 5, dir: -1, speed: 1.0 },
  { type: 'home',  y: 0 },
] as const;

/** Where the five homes sit, and how wide the opening is. */
export const HOME_POSITIONS = [4, 12, 20, 28, 36];
export const HOME_WIDTH = 3;

/**
 * Where in a home a frog has to land.
 *
 * FAQ 7: "You must hit exact center or your frog will die." The door used
 * to accept anything within two cells of the home, which made the row
 * forgiving in a way the arcade is famous for not being.
 */
export const HOME_CENTRE_OFFSET = 1;

// Turtle dive timing
export const TURTLE_DIVE_DURATION = 2000;    // ms underwater
export const TURTLE_SURFACE_DURATION = 4000; // ms above water

/**
 * Widths in grid cells.
 *
 * The FAQ's water lanes are made of specific things: short logs in lane 2,
 * long logs in lane 3, medium logs in lane 5, and sets of turtles in lanes
 * 1 and 4 (its diagram draws a set as "( )( )( )").
 */
export const OBJECT_WIDTHS = {
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
export const SCORES = {
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
export const CELL_WIDTH = 2;

/**
 * The board is drawn as blocks of background colour rather than as ASCII
 * sprites. A '#' for a car and an '=' for a log read as text; a solid red
 * block and a solid brown one read as a car and a log.
 */
export const BG_COLORS = {
  road: 'black',
  water: 'blue',
  // The banks and the median are magenta, as they are in the reference
  // ANSI. They used to be green, and the frog is green: a frog standing on
  // the bank was invisible, which is exactly what was reported.
  bank: 'magenta',
  hedge: 'green',

  car: 'red',
  truck: 'white',
  racecar: 'magenta',

  log: 'yellow',          // dark yellow reads as wood
  turtle: 'green',
  turtleDiving: 'blue',
  crocodile: 'cyan',     // told apart from the turtles by colour and mouth
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
export const SPRITE_FG = {
  log: 'gray',
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
  home: 'blue',
  homeFrog: 'lightgreen',
  homeFly: 'lightyellow',
  homeCrocodile: 'lightred',
  bank: 'red',
};

/** The frog, and the frog you carry home. */
// ASCII only, everywhere in this door. The board is drawn through blessed
// with fullUnicode off, so anything outside 7-bit ASCII arrives mangled or
// not at all - which is why the sprites showed as nothing.
export const FROG_GLYPH = '@';

/** The grain along a log, and the ends that round it off. */
export const LOG_GRAIN = '-.';
export const LOG_END_LEFT = '(';
export const LOG_END_RIGHT = ')';

/** One turtle of a set. */
export const TURTLE_GLYPH = ':O:';

/** The jaws of a crocodile or an otter, and the bodies behind them. */
export const MOUTH_GLYPH = '><';
export const CROCODILE_BODY = '=';
export const OTTER_BODY = '~';

/** The snake, riding a log or patrolling the median. */
export const SNAKE_GLYPH = 'S';

/** The texture of the banks and the median, and of the hedge up top. */
export const BANK_TEXTURE = '.:';
export const HEDGE_TEXTURE = '#';

/** The sides of a home, and what can be sitting in one. */
export const HOME_LEFT = '[';
export const HOME_RIGHT = ']';
export const FLY_GLYPH = '*';

// Colors for rendering
export const COLORS = {
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
export const LEVEL_TABLE: LevelConfig[] = [
  { level: 1,  cars: [3, 3, 3, 1, 2], lane4Fast: true,  turtleSets: [4, 4], shortLogs: 3, longLogs: 3, mediumLogs: 3, lane5Crocodile: false, crocEveryNth: null, snakes: 0, crocInHome: false },
  { level: 2,  cars: [4, 4, 3, 2, 3], lane4Fast: true,  turtleSets: [3, 4], shortLogs: 3, longLogs: 1, mediumLogs: 3, lane5Crocodile: false, crocEveryNth: 5,    snakes: 0, crocInHome: true  },
  { level: 3,  cars: [4, 4, 5, 2, 3], lane4Fast: false, turtleSets: [3, 4], shortLogs: 3, longLogs: 1, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 3,    snakes: 1, crocInHome: true  },
  { level: 4,  cars: [4, 4, 4, 3, 4], lane4Fast: true,  turtleSets: [3, 3], shortLogs: 2, longLogs: 1, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 2,    snakes: 1, crocInHome: true  },
  { level: 5,  cars: [5, 4, 5, 4, 3], lane4Fast: false, turtleSets: [2, 3], shortLogs: 2, longLogs: 1, mediumLogs: 0, lane5Crocodile: true,  crocEveryNth: null, snakes: 1, crocInHome: true  },
  { level: 6,  cars: [3, 3, 3, 1, 2], lane4Fast: false, turtleSets: [4, 4], shortLogs: 3, longLogs: 3, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 2,    snakes: 1, crocInHome: true  },
  { level: 7,  cars: [4, 4, 4, 2, 3], lane4Fast: true,  turtleSets: [3, 5], shortLogs: 3, longLogs: 1, mediumLogs: 2, lane5Crocodile: false, crocEveryNth: 2,    snakes: 2, crocInHome: true  },
  { level: 8,  cars: [4, 4, 5, 2, 3], lane4Fast: true,  turtleSets: [3, 4], shortLogs: 3, longLogs: 1, mediumLogs: 1, lane5Crocodile: false, crocEveryNth: 2,    snakes: 2, crocInHome: true  },
  { level: 9,  cars: [4, 4, 4, 3, 4], lane4Fast: true,  turtleSets: [3, 3], shortLogs: 2, longLogs: 1, mediumLogs: 1, lane5Crocodile: false, crocEveryNth: 2,    snakes: 2, crocInHome: true  },
  { level: 10, cars: [5, 4, 5, 4, 4], lane4Fast: false, turtleSets: [2, 3], shortLogs: 2, longLogs: 1, mediumLogs: 0, lane5Crocodile: true,  crocEveryNth: null, snakes: 2, crocInHome: true  },
];

/** How many crocodiles fill water lane 5 when the table's C says it does. */
export const LANE5_CROCODILE_COUNT = 3;

/** The first level of the repeating block (FAQ 6.4). */
export const BLOCK_START = 6;
export const BLOCK_LENGTH = 5;

/**
 * The configuration for a level.
 *
 * FAQ 6.4: "All levels after Level 6 repeat in five level blocks. This
 * means that levels 6-10, 11-15, 16-20, etc. are all the same." So level 11
 * is level 6 exactly, with no scaling on top - the door used to multiply
 * the speeds by a factor that grew without limit.
 */
export function getLevelConfig(level: number): LevelConfig {
  if (level <= BLOCK_START - 1) {
    return { ...LEVEL_TABLE[Math.max(0, level - 1)] };
  }

  const intoBlock = (level - BLOCK_START) % BLOCK_LENGTH;
  return { ...LEVEL_TABLE[BLOCK_START - 1 + intoBlock] };
}

/**
 * How much faster lane 4 runs once it has picked up (FAQ 6.4: "cars in
 * Lane 4 will travel fast after a specific period of time if they aren't
 * traveling fast already").
 */
export const LANE4_FAST_MULTIPLIER = 1.8;
export const LANE4_SPEEDUP_AFTER_MS = 20000;

/**
 * How much quicker the river runs when the player dawdles (FAQ 7: "if you
 * waste too much time, the things on the river will move quicker").
 */
export const RIVER_HURRY_AFTER_SECONDS = 30;
export const RIVER_HURRY_MULTIPLIER = 1.35;

/** How often a fly shows up in an empty home, and how long it stays. */
export const FLY_SPAWN_INTERVAL_MS = 8000;
export const FLY_DURATION_MS = 5000;

/** How often the crocodile tries a home, and how long it sits there. */
export const HOME_CROCODILE_INTERVAL_MS = 10000;
export const HOME_CROCODILE_DURATION_MS = 4000;

/** The lady frog rides a lane 2 log; this is how often one appears. */
export const LADY_FROG_INTERVAL_MS = 12000;

/** The otter turns up on a water lane at random (FAQ 6.4 note). */
export const OTTER_INTERVAL_MS = 15000;

/**
 * How long a name in the score table may be.
 *
 * The arcade took three initials because that is what a coin-op with a
 * joystick can ask for. A BBS knows its caller's handle, so the table holds
 * a handle - and when one has to be typed, it can be a whole one.
 */
export const MAX_NAME_LENGTH = 16;

// Menu options
export const MENU_OPTIONS = ['Start Game', 'Lives', 'High Scores', 'Help', 'Quit'];

// Default high scores
export const DEFAULT_HIGHSCORES: HighScore[] = [
  { name: 'ACE', score: 10000, level: 5, date: '2024-01-01' },
  { name: 'BOB', score: 8000, level: 4, date: '2024-01-01' },
  { name: 'CAT', score: 6000, level: 3, date: '2024-01-01' },
  { name: 'DAN', score: 4000, level: 2, date: '2024-01-01' },
  { name: 'EVE', score: 2000, level: 1, date: '2024-01-01' },
];

// Character sprites (using block sprite patterns)
export const SPRITES = {
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

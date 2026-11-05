/**
 * Super Qix - Game Constants
 * All game parameters based on original 1987 Taito arcade specifications
 */
// Display dimensions (neo-blessed terminal)
export const SCREEN_WIDTH = 80;
export const SCREEN_HEIGHT = 24;
// Playfield dimensions (inside borders)
//
// A terminal character cell is about twice as tall as it is wide, so a
// playfield measured in single characters is not square: one step up or
// down covers roughly twice the visual distance of one step left or right,
// which made horizontal movement feel half-speed.
//
// The fix is geometric, not a speed tweak: every logical cell is drawn
// CELL_WIDTH characters wide, so one cell is ~2 units wide by ~2 units
// tall on screen - square. The grid is therefore 38 logical columns
// rendered as 76 characters, which still fits SCREEN_WIDTH (80).
// All game logic works in logical cells and needs no aspect correction.
// The grid is also sized to the background art: a piece is 80 columns wide,
// and at CELL_WIDTH characters per cell that is exactly FIELD_WIDTH cells,
// so the art is revealed at its native resolution with nothing squashed.
// FIELD_HEIGHT matches the game area (SCREEN_HEIGHT less the HUD and the
// footer), and the art's remaining rows are cropped.
export const CELL_WIDTH = 2;
export const FIELD_WIDTH = 40;
export const FIELD_HEIGHT = 20;
// Background art dimensions. Every piece in backgrounds/ is 80x25 (SAUCE
// says so for all of them); the field shows the top FIELD_HEIGHT rows.
export const ART_WIDTH = FIELD_WIDTH * CELL_WIDTH; // 80
export const ART_HEIGHT = FIELD_HEIGHT; // 20 of the art's 25 rows
export const FIELD_OFFSET_X = 2;
export const FIELD_OFFSET_Y = 2;
// Game timing
export const GAME_TICK_MS = 33; // ~30 FPS
export const MARKER_MOVE_DELAY = 50; // ms between moves
export const SLOW_DRAW_DELAY = 100; // Slower when drawing slow
export const FAST_DRAW_DELAY = 50; // Faster when drawing fast
// Lives
export const STARTING_LIVES = 3;
export const EXTRA_LIFE_PERCENT = 98; // Claim 98%+ for extra life
export const EXTRA_LIFE_SCORE = 50000;
/**
 * The most lives the marker can hold at once (QUIX's MAXMEN).
 *
 * The HUD has room for a fixed row of markers, and a player sitting on
 * twenty lives is not playing the same game any more.
 */
export const MAX_LIVES = 8;
/**
 * Award one life, up to the ceiling.
 *
 * Lives arrive from three unrelated places - the 98% claim, the skill level's
 * score thresholds and the 1-UP power-up - and a ceiling honoured by two of
 * the three is not a ceiling. Every award goes through here.
 */
export function grantLife(d) {
    if (d.lives < MAX_LIVES)
        d.lives++;
}
// Claiming thresholds
export const DEFAULT_TARGET_PERCENT = 75;
export const BONUS_PERCENT_START = 76; // Points start here
export const POINTS_PER_BONUS_PERCENT = 1000;
// Scoring
// Super Qix has no slow/fast draw (FAQ 2.5.3), so a claim has one rate.
export const DRAW_BASE_POINTS = 10; // Per % claimed
/**
 * What sealing a Gremlin into claimed ground is worth (QUIX's quix.c:299).
 *
 * A recorded DEPARTURE from the FAQ. FAQ 2.2, on trapping half of a divided
 * Gremlin: "I don't think this gets you any bonus points, unfortunately."
 * Agreed with the user against the FAQ, because the same section calls
 * trapping the most spectacular play in the game, and the reference pays for
 * it. Paid once per Gremlin at the end of the level, not per claim.
 */
export const CAPTURE_POINTS = 250;
// A completed claim is painted in over several frames, sweeping right
// to left, rather than appearing all at once.
export const FILL_ANIMATION_FRAMES = 12;
// Clearing a level wipes the picture in from the right, taking the
// player's lines with it. Columns uncovered per frame.
export const LEVEL_CLEAR_WIPE_COLUMNS = 1;
// How long each panel of the level-clear sequence stays up, in frames.
export const BONUS_PANEL_FRAMES = 75; // ~2.5s
export const INTRO_PANEL_FRAMES = 60; // ~2s
// The arcade marker is an animated sprite rather than a flat dot. It cycles
// through these so it stands out against both the blue field and whatever
// picture has been uncovered.
export const MARKER_CYCLE = [
    'lightred', 'lightyellow', 'lightgreen', 'lightcyan', 'lightblue', 'lightmagenta',
];
export const MARKER_CYCLE_FRAMES = 3;
// Frames per Skull chew frame - they alternate an open and closed mouth.
export const SKULL_CHEW_FRAMES = 6;
// How fast the GAME OVER prompt blinks, in frames.
export const GAME_OVER_BLINK_FRAMES = 15;
// Letters (FAQ 2.3 / 2.4.2). A letter you NEED scores nothing when picked
// up - it pays at the end of the level. A letter you do not need pays at once.
export const LETTER_END_OF_LEVEL_POINTS = 1000; // per letter, word unfinished
export const LETTER_WORD_COMPLETE_POINTS = 10000; // per letter, word finished
export const SPARE_LETTER_POINTS = 500; // duplicate or not in the word
// FAQ 2.3.1: the 1-UP is "an extremely rare bonus".
export const ONE_UP_CHANCE = 0.02;
export const LETTER_POINTS = 1000;
export const WORD_COMPLETE_POINTS = 10000;
export const SPLIT_QIX_MULTIPLIERS = [1, 2, 3, 4, 5, 6, 7, 8, 9]; // Based on separation
// Enemy parameters
// How strongly the Gremlin steers towards the marker (FAQ 2.2: its bounce is
// "weighted somewhat towards your marker", and on later levels it will "zoom
// towards you every time you detach from a wall").
/*
 * How hard the Gremlin steers towards the marker.
 *
 * This, not speed, is what makes it a threat. Measured over ten seconds on
 * level 1: at the old 0.03 lean its path was 62 cells long but its NET drift
 * only 13, and it never came closer than 6.7 cells to the marker - a local
 * random walk that read exactly as reported, "he circles himself all the
 * time the gremlin he is no threat at all". Raising the lean does not change
 * how far it travels; it changes where it ends up. At 0.18 the closest
 * approach is 1.4 cells, at 0.25 it is 0.6 - touching distance.
 *
 * Speed was raised first and was the wrong lever on its own: it made the
 * Gremlin cover ground faster while still wandering nowhere near the player.
 */
export const QIX_BASE_PULL = 0.15; // a real lean, even on level 1
export const QIX_LEVEL_PULL = 0.15; // added by level 16
export const QIX_DRAWING_PULL = 0.08; // added while the player is exposed
export const QIX_MAX_PULL = 0.40; // never a perfect homing missile
/**
 * How far a Gremlin travels per tick, per unit of its speed.
 *
 * This was an unnamed 0.1 buried in updateQix, and it silently divided the
 * whole speed system: the level table ramps qixSpeed 1.0 -> 2.5, but at 0.1
 * that came out as 3.3 -> 8.3 cells per second against a marker that moves
 * 20 (one cell per MARKER_MOVE_DELAY). The Gremlin could not catch a moving
 * player at ANY level, so the ramp was cosmetic and circling it cleared
 * level after level. Reported 2026-08-31: "the main enemy moves too slow,
 * too little and is very predictive, i completed 5 levels by just circling
 * him".
 *
 * Sized so the fastest Gremlin (level 16, speed 2.75) reaches ~16 cells per
 * second - four fifths of the marker's 20. It closes on a careless player
 * and punishes a long draw, and it still cannot outrun one who is paying
 * attention. theGremlinNeverOutrunsTheMarker pins that ceiling.
 */
export const QIX_STEP_SCALE = 0.19;
/**
 * Chance per tick that a Gremlin re-aims.
 *
 * At the old 0.05 it held one heading for twenty ticks - two thirds of a
 * second of dead straight line - which is what made it read as "very
 * predictive". Re-aiming about four times a second keeps the wander the FAQ
 * describes without turning it into a jitter that cancels its own progress.
 */
export const QIX_NUDGE_CHANCE = 0.12;
// The Gremlin divides on later levels, rarely, and never without limit
// (FAQ 2.2 / 2.5.3: usually one, sometimes two or more).
export const QIX_SPLIT_FROM_LEVEL = 7;
export const QIX_SPLIT_CHANCE_PER_TICK = 0.0015;
export const QIX_MAX_COPIES = 3;
export const QIX_BASE_SPEED = 1.1;
export const QIX_SEGMENT_COUNT = 5;
export const SPARX_BASE_SPEED = 0.55;
// FAQ 2.5.3: "There are no Super Skulls capable of chasing your marker
// up an unfinished line." Skulls never promote.
//
// FAQ 1: the outer border is a Time Meter. When it fills, two more
// Skulls are released and the counter resets. Later levels count down
// more quickly.
export const SKULLS_PER_RELEASE = 2;
export const SKULLS_AT_LEVEL_START = 2;
// FAQ 2.2: a Skull never instantly reverses on a line, so a turn is
// refused while the last one is still fresh.
export const SKULL_REVERSE_COOLDOWN_MS = 1000;
export const FUSE_BASE_SPEED = 1.2;
export const FUSE_START_DELAY = 3000; // ms before fuse starts
// Power-up parameters
export const POWERUP_SPAWN_CHANCE = 0.25; // 25% chance on area claim
export const SPEED_BOOST_DURATION = 10000; // 10 seconds
export const FREEZE_DURATION = 5000; // 5 seconds
export const SHIELD_DURATION = 0; // Instant use on hit
// Visual characters
export const CHARS = {
    marker: '@',
    markerDrawing: '@',
    qix: '*',
    qixAlt: '%',
    // The Skulls chew: alternating these two reads as a mouth opening and
    // closing, the way the arcade sprite animates.
    sparx: '8',
    sparxChew: 'O',
    superSparx: 'X',
    fuse: '~',
    fuseHead: '*',
    powerUp: '?',
    letter: '', // Dynamic A-Z
    border: '#',
    unclaimed: '.',
    claimed: ' ',
    stixFast: '-',
    stixSlow: '=',
    stixVertFast: '|',
    stixVertSlow: '|'
};
// Colors
export const COLORS = {
    marker: 'cyan',
    markerDrawing: 'yellow',
    qix: 'magenta',
    sparx: 'red',
    superSparx: 'red',
    fuse: 'yellow',
    powerUp: 'green',
    letter: 'green',
    border: 'white',
    unclaimed: 'gray',
    claimed: 'blue',
    stixFast: 'blue',
    stixSlow: 'red',
    hud: 'white',
    score: 'yellow',
    lives: 'red',
    level: 'cyan',
    percent: 'green'
};
/**
 * The 16 ANSI colours, indexed the way ANSI art indexes them, named the way
 * blessed tags name them. Art cells carry fg/bg as 0-15, so this is the
 * translation used when a claimed cell reveals the picture behind it.
 *
 * Same names and order as the palette in the LiveChat door, so the two agree
 * on what "colour 9" is called.
 */
export const ART_PALETTE = [
    'black', 'red', 'green', 'yellow',
    'blue', 'magenta', 'cyan', 'white',
    'gray', 'lightred', 'lightgreen', 'lightyellow',
    'lightblue', 'lightmagenta', 'lightcyan', 'lightwhite',
];
// Background-block colors for the playfield. A space glyph colored with
// -fg is invisible (fg has no effect on a blank char) - the field must be
// painted with -bg so claimed/border/stix area actually shows as filled
// color blocks, the way the arcade original renders them.
export const BG_COLORS = {
    border: 'white',
    // The border doubles as the Time Meter: squares turn red as it fills
    // (FAQ 1), and when the whole border is red two more Skulls arrive.
    borderMeter: 'red',
    unclaimed: 'blue',
    claimed: 'blue',
    // FAQ 2.1: the line you are drawing is YELLOW, and turns BLUE once it
    // reconnects and becomes safe. There is no slow/fast draw in Super
    // Qix, so there is one drawing colour, not two.
    // The line being drawn is BRIGHT yellow, not the dark yellow the arcade's
    // palette calls yellow. Most of the ANSI backgrounds are drawn in browns
    // and dark yellows - level 3's skull is almost entirely colour 3 - and a
    // dark yellow line laid over one is invisible.
    stix: 'lightyellow',
    // A line that has been closed off stays drawn. FAQ 2.1: the line you are
    // drawing is yellow, and "turns blue and becomes 'Safe' if you can connect
    // the other end". LIGHT blue, because plain blue is the unclaimed field.
    stixSafe: 'lightblue',
    qix: 'magenta',
    sparx: 'red',
    superSparx: 'red',
    fuse: 'yellow',
    powerUp: 'green',
    marker: 'cyan',
    markerDrawing: 'yellow'
};
// Level configurations (16 levels)
export const LEVEL_CONFIGS = [
    // Level 1-4: Easy
    {
        number: 1,
        qixCount: 1,
        qixSpeed: 1.0,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.0,
        timeMeterMs: 45000,
        fuseSpeed: 1.5,
        targetPercent: 75,
        word: 'CASTLE',
        backgroundPattern: 'stripes'
    },
    {
        number: 2,
        qixCount: 1,
        qixSpeed: 1.1,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.1,
        timeMeterMs: 40000,
        fuseSpeed: 1.6,
        targetPercent: 75,
        word: 'THUNDER',
        backgroundPattern: 'dots'
    },
    {
        number: 3,
        qixCount: 1,
        qixSpeed: 1.2,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.2,
        timeMeterMs: 35000,
        fuseSpeed: 1.7,
        targetPercent: 75,
        word: 'ROCKMAN',
        backgroundPattern: 'checker'
    },
    {
        number: 4,
        qixCount: 1,
        qixSpeed: 1.3,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.3,
        timeMeterMs: 30000,
        fuseSpeed: 1.8,
        targetPercent: 75,
        word: 'DRAGON',
        backgroundPattern: 'waves'
    },
    // Level 5-8: Medium
    {
        number: 5,
        qixCount: 1,
        qixSpeed: 1.5,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.4,
        timeMeterMs: 25000,
        fuseSpeed: 2.0,
        targetPercent: 75,
        word: 'FANFARE',
        backgroundPattern: 'cross'
    },
    {
        number: 6,
        qixCount: 1,
        qixSpeed: 1.6,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.5,
        timeMeterMs: 22000,
        fuseSpeed: 2.1,
        targetPercent: 75,
        word: 'PLANET',
        backgroundPattern: 'spiral'
    },
    {
        number: 7,
        qixCount: 2,
        qixSpeed: 1.4,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.5,
        timeMeterMs: 20000,
        fuseSpeed: 2.2,
        targetPercent: 75,
        word: 'GERDEN',
        backgroundPattern: 'diamond'
    },
    {
        number: 8,
        qixCount: 2,
        qixSpeed: 1.5,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.6,
        timeMeterMs: 18000,
        fuseSpeed: 2.3,
        targetPercent: 75,
        word: 'JUNGLE',
        backgroundPattern: 'zigzag'
    },
    // Level 9-12: Hard
    {
        number: 9,
        qixCount: 2,
        qixSpeed: 1.7,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.7,
        timeMeterMs: 15000,
        fuseSpeed: 2.5,
        targetPercent: 75,
        word: 'TOYBOX',
        backgroundPattern: 'grid'
    },
    {
        number: 10,
        qixCount: 2,
        qixSpeed: 1.8,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.8,
        timeMeterMs: 12000,
        fuseSpeed: 2.6,
        targetPercent: 75,
        word: 'FOUNTAIN',
        backgroundPattern: 'brick'
    },
    {
        number: 11,
        qixCount: 2,
        qixSpeed: 1.9,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 1.9,
        timeMeterMs: 10000,
        fuseSpeed: 2.7,
        targetPercent: 75,
        word: 'MERMAID',
        backgroundPattern: 'star'
    },
    {
        number: 12,
        qixCount: 3,
        qixSpeed: 1.8,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 2.0,
        timeMeterMs: 8000,
        fuseSpeed: 2.8,
        targetPercent: 75,
        word: 'CARP',
        backgroundPattern: 'flower'
    },
    // Level 13-16: Expert
    {
        number: 13,
        qixCount: 3,
        qixSpeed: 2.0,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 2.1,
        timeMeterMs: 6000,
        fuseSpeed: 3.0,
        targetPercent: 75,
        word: 'FLOWER',
        backgroundPattern: 'maze'
    },
    {
        number: 14,
        qixCount: 3,
        qixSpeed: 2.2,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 2.2,
        timeMeterMs: 5000,
        fuseSpeed: 3.2,
        targetPercent: 75,
        word: 'TENGU',
        backgroundPattern: 'celtic'
    },
    {
        number: 15,
        qixCount: 3,
        qixSpeed: 2.4,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 2.3,
        timeMeterMs: 4000,
        fuseSpeed: 3.4,
        targetPercent: 75,
        word: 'ROCKET',
        backgroundPattern: 'tribal'
    },
    {
        number: 16,
        qixCount: 4,
        qixSpeed: 2.5,
        sparxCount: SKULLS_AT_LEVEL_START,
        sparxSpeed: 2.5,
        timeMeterMs: 3000,
        fuseSpeed: 3.5,
        targetPercent: 75,
        word: 'REDCATS',
        backgroundPattern: 'final'
    }
];
/** How many levels make up one lap of the game (FAQ 3). */
export const LEVELS_PER_LAP = 16;
/** The most Gremlins that can share a board at once. */
export const MAX_GREMLINS = 4;
/** One more Gremlin every this many levels, until the cap. */
export const GREMLIN_ADDED_EVERY = 4;
/**
 * How many Gremlins a level starts with.
 *
 * QUIX scales its whole game by this figure - `quixnum++` per screen, up to
 * ten - and pays the fill by it (qarea.c:192). We take the axis but not the
 * numbers: ten Gremlins on a 38x18 field leaves nowhere to draw, so the cap
 * is four and one arrives every fourth level, which puts a 16-level lap at
 * the cap exactly as it ends.
 *
 * Unlike everything else in a level's configuration, this does NOT reset when
 * a lap does. QUIX never resets it either, and the count is the difficulty
 * axis the whole scheme rests on - handing back three Gremlins at level 17
 * would undo the lap the player just finished.
 */
export function gremlinsForLevel(level) {
    return Math.min(MAX_GREMLINS, 1 + Math.floor((level - 1) / GREMLIN_ADDED_EVERY));
}
/**
 * The configuration for a level.
 *
 * FAQ 3: "There are no changes that I can detect between the initial L.1 and
 * the L.1 you come back to after finishing L.16. Even the enemy speeds are
 * the same, which, after you've gotten used to the craziness of the upper
 * levels, almost makes for a relaxing vacation!" - so a lap is a lap, and the
 * enemy SPEEDS and timings do not scale with how many of them you have
 * played. The skill level is what moves the speeds (FAQ 4).
 *
 * The Gremlin COUNT is the one exception, and a deliberate one: see
 * gremlinsForLevel. The table's own qixCount column is the floor the formula
 * grew out of and no longer decides anything by itself, so that a second lap
 * does not hand back the Gremlins the first one earned.
 */
export function getLevelConfig(level) {
    const config = { ...LEVEL_CONFIGS[(level - 1) % LEVELS_PER_LAP] };
    config.number = level;
    config.qixCount = gremlinsForLevel(level);
    return config;
}
/**
 * The three skill levels the arcade operator could set (FAQ 4).
 *
 * "Difficulty" in the FAQ's table "refers mainly to how quickly/
 * unpredictably and aggressively the Gremlin and Skulls move, and how often
 * new Skulls appear", so it is carried here as a straight speed scale over
 * the level's own figures. Continues are not modelled: a BBS door has no
 * coin slot, so there is nothing to continue with.
 */
export const SKILL_LEVELS = {
    easy: { label: 'Easy', lives: 5, bonusLives: [20000, 50000], targetPercent: 70, difficulty: 0.8 },
    medium: { label: 'Medium', lives: 3, bonusLives: [30000, 100000], targetPercent: 75, difficulty: 1.0 },
    hard: { label: 'Hard', lives: 2, bonusLives: [], targetPercent: 85, difficulty: 1.3 },
};
/**
 * What the game says when you finish a lap (FAQ 3.1), spoken by the girl in
 * the convertible and every one of the cats.
 */
export const FINAL_LAP_MESSAGE = [
    'WE CAN NOT FIGHT ANY MORE',
    'BUT WE ARE NOT LOSE YET',
    'WE NEVER LOSE NEXT',
];
/**
 * The rejoin multiplier (FAQ 2.4.1).
 *
 * "Multipliers occur when the point where you finish outlining an area is as
 * close as possible (within about 2 pixels) to the point where you began.
 * Achieving a multiplier will give you 20x normal points ... If you manage
 * another multiplier within a second or two of the last one, it increases to
 * 30x". The arcade's "2 pixels" is 2 cells here - a cell is the smallest
 * thing that can be drawn in a terminal.
 */
export const MULTIPLIER_REJOIN_CELLS = 2;
export const MULTIPLIER_FIRST = 20;
export const MULTIPLIER_CHAINED = 30;
export const MULTIPLIER_CHAIN_MS = 2000;
/**
 * The Warp doorway (FAQ 2.3.1): it "takes a second or two to open, remains
 * open for another second or so, then closes".
 */
export const WARP_OPENING_MS = 1500;
export const WARP_OPEN_MS = 1000;
/**
 * What one Hurry multiplies the pace of the game by (FAQ 2.3.1).
 *
 * They stack, so two Hurries square it. Kept modest because a BBS terminal
 * redraws a whole frame per tick - the arcade's "unmanageably fast" is
 * unplayable rather than funny at this frame rate.
 */
export const HURRY_SPEED_SCALE = 1.4;
/**
 * How fast a released Letter or Power-up travels, in cells per tick.
 *
 * FAQ 2.2 sets the pecking order: the Skulls "move slightly more quickly
 * than do Power-ups and Letters, but slightly slower than your marker".
 */
export const POWERUP_DRIFT_SPEED = 0.25;
/**
 * How long the marker cannot be killed again after losing a life.
 *
 * Without this, the enemy that killed you is still touching you on the
 * very next frame, and every life you have goes in as many frames - three
 * lives in a tenth of a second. The arcade gives you a moment to get clear;
 * so does this.
 */
export const RESPAWN_INVULNERABLE_MS = 1500;
/** How fast the marker blinks while it cannot be hurt. */
export const INVULNERABLE_BLINK_FRAMES = 2;
/** How long a Shield stuns the Skull it stopped (FAQ 2.3.1). */
export const SKULL_STUN_MS = 1000;
// Power-up types and their effects
export const POWERUP_EFFECTS = {
    speed: {
        duration: SPEED_BOOST_DURATION,
        description: 'Double speed',
        char: 'S',
        color: 'yellow'
    },
    shield: {
        duration: 0,
        description: 'One-time protection',
        char: 'H',
        color: 'cyan'
    },
    freeze: {
        duration: FREEZE_DURATION,
        description: 'Freeze enemies',
        char: 'F',
        color: 'blue'
    },
    warp: {
        duration: 0,
        description: 'Skip level',
        char: 'W',
        color: 'magenta'
    },
    oneUp: {
        duration: 0,
        description: 'Extra life',
        char: '1',
        color: 'lightred'
    },
    letter: {
        duration: 0,
        description: 'Collect letter',
        char: '?',
        color: 'green'
    }
};
// Menu options
export const MENU_OPTIONS = [
    'Start Game',
    'Skill',
    'High Scores',
    'Keys',
    'Help',
    'Quit'
];
/**
 * The machine's factory high score table (FAQ 2.5.1), the same for all three
 * pre-set difficulty levels.
 */
export const DEFAULT_HIGHSCORES = [
    { name: 'CAS', score: 32750, level: 6, maxPercent: 95, date: '1987-01-01' },
    { name: 'THU', score: 30010, level: 5, maxPercent: 90, date: '1987-01-01' },
    { name: 'ROC', score: 28200, level: 5, maxPercent: 85, date: '1987-01-01' },
    { name: 'DRA', score: 21280, level: 4, maxPercent: 80, date: '1987-01-01' },
    { name: 'FAN', score: 20570, level: 3, maxPercent: 78, date: '1987-01-01' },
];
// Max high scores
export const MAX_HIGHSCORES = 10;
/**
 * The longest name the high score table records.
 *
 * The arcade takes three initials. A BBS handle is not three characters, and
 * the save RPC used to REJECT anything longer outright - so a player called
 * SPOTUP could not get on the board at all, which is the same fault Frogger
 * had. Ten, matching Arkanoid.
 *
 * This constant already existed at 3 and was ignored: index.ts and server.ts
 * both hardcoded the figure, so raising it here alone would have changed
 * nothing. Both now read it.
 */
export const MAX_NAME_LENGTH = 10;
// Background patterns for level completion
export const BACKGROUND_PATTERNS = {
    stripes: (x, y) => y % 2 === 0 ? '#' : ' ',
    dots: (x, y) => (x + y) % 3 === 0 ? '*' : ' ',
    checker: (x, y) => (x + y) % 2 === 0 ? '#' : ' ',
    waves: (x, y) => Math.sin(x * 0.5) * 2 > y % 4 ? '~' : ' ',
    cross: (x, y) => x === FIELD_WIDTH / 2 || y === FIELD_HEIGHT / 2 ? '+' : ' ',
    spiral: (x, y) => ((x + y) % 5 === 0) ? '@' : ' ',
    diamond: (x, y) => Math.abs(x - FIELD_WIDTH / 2) + Math.abs(y - FIELD_HEIGHT / 2) < 8 ? '<>' : ' ',
    zigzag: (x, y) => (x + (y % 2) * 2) % 4 === 0 ? '/' : ' ',
    grid: (x, y) => x % 4 === 0 || y % 3 === 0 ? '+' : ' ',
    brick: (x, y) => y % 2 === 0 ? (x % 6 === 0 ? '|' : '-') : ((x + 3) % 6 === 0 ? '|' : '-'),
    star: (x, y) => (x === FIELD_WIDTH / 2 && y === FIELD_HEIGHT / 2) ? '*' : ' ',
    flower: (x, y) => (x + y) % 7 === 0 ? '@' : ' ',
    maze: (x, y) => (x % 3 === 0 || y % 3 === 0) && !((x % 6 < 3) === (y % 6 < 3)) ? '#' : ' ',
    celtic: (x, y) => ((x + y) % 4 === 0 || (x - y + 100) % 4 === 0) ? '0' : ' ',
    tribal: (x, y) => (x * y) % 7 === 0 ? '^' : ' ',
    final: (x, y) => (x + y) % 2 === 0 ? '#' : '*'
};
/**
 * The default movement bindings. Defined by the key layer, re-exported here
 * because the door imports its constants from one place.
 */
export { DEFAULT_KEY_MAP, REDRAW_KEY } from './controls';

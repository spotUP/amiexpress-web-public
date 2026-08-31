/**
 * Super Qix - Game Constants
 * All game parameters based on original 1987 Taito arcade specifications
 */
import { LevelConfig, PowerUpType, SkillLevel } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const CELL_WIDTH = 2;
export declare const FIELD_WIDTH = 40;
export declare const FIELD_HEIGHT = 20;
export declare const ART_WIDTH: number;
export declare const ART_HEIGHT = 20;
export declare const FIELD_OFFSET_X = 2;
export declare const FIELD_OFFSET_Y = 2;
export declare const GAME_TICK_MS = 33;
export declare const MARKER_MOVE_DELAY = 50;
export declare const SLOW_DRAW_DELAY = 100;
export declare const FAST_DRAW_DELAY = 50;
export declare const STARTING_LIVES = 3;
export declare const EXTRA_LIFE_PERCENT = 98;
export declare const EXTRA_LIFE_SCORE = 50000;
/**
 * The most lives the marker can hold at once (QUIX's MAXMEN).
 *
 * The HUD has room for a fixed row of markers, and a player sitting on
 * twenty lives is not playing the same game any more.
 */
export declare const MAX_LIVES = 8;
/**
 * Award one life, up to the ceiling.
 *
 * Lives arrive from three unrelated places - the 98% claim, the skill level's
 * score thresholds and the 1-UP power-up - and a ceiling honoured by two of
 * the three is not a ceiling. Every award goes through here.
 */
export declare function grantLife(d: {
    lives: number;
}): void;
export declare const DEFAULT_TARGET_PERCENT = 75;
export declare const BONUS_PERCENT_START = 76;
export declare const POINTS_PER_BONUS_PERCENT = 1000;
export declare const DRAW_BASE_POINTS = 10;
/**
 * What sealing a Gremlin into claimed ground is worth (QUIX's quix.c:299).
 *
 * A recorded DEPARTURE from the FAQ. FAQ 2.2, on trapping half of a divided
 * Gremlin: "I don't think this gets you any bonus points, unfortunately."
 * Agreed with the user against the FAQ, because the same section calls
 * trapping the most spectacular play in the game, and the reference pays for
 * it. Paid once per Gremlin at the end of the level, not per claim.
 */
export declare const CAPTURE_POINTS = 250;
export declare const FILL_ANIMATION_FRAMES = 12;
export declare const LEVEL_CLEAR_WIPE_COLUMNS = 1;
export declare const BONUS_PANEL_FRAMES = 75;
export declare const INTRO_PANEL_FRAMES = 60;
export declare const MARKER_CYCLE: string[];
export declare const MARKER_CYCLE_FRAMES = 3;
export declare const SKULL_CHEW_FRAMES = 6;
export declare const GAME_OVER_BLINK_FRAMES = 15;
export declare const LETTER_END_OF_LEVEL_POINTS = 1000;
export declare const LETTER_WORD_COMPLETE_POINTS = 10000;
export declare const SPARE_LETTER_POINTS = 500;
export declare const ONE_UP_CHANCE = 0.02;
export declare const LETTER_POINTS = 1000;
export declare const WORD_COMPLETE_POINTS = 10000;
export declare const SPLIT_QIX_MULTIPLIERS: number[];
export declare const QIX_BASE_PULL = 0.03;
export declare const QIX_LEVEL_PULL = 0.09;
export declare const QIX_DRAWING_PULL = 0.08;
export declare const QIX_MAX_PULL = 0.25;
export declare const QIX_SPLIT_FROM_LEVEL = 7;
export declare const QIX_SPLIT_CHANCE_PER_TICK = 0.0015;
export declare const QIX_MAX_COPIES = 3;
export declare const QIX_BASE_SPEED = 1.1;
export declare const QIX_SEGMENT_COUNT = 5;
export declare const SPARX_BASE_SPEED = 0.55;
export declare const SKULLS_PER_RELEASE = 2;
export declare const SKULLS_AT_LEVEL_START = 2;
export declare const SKULL_REVERSE_COOLDOWN_MS = 1000;
export declare const FUSE_BASE_SPEED = 1.2;
export declare const FUSE_START_DELAY = 3000;
export declare const POWERUP_SPAWN_CHANCE = 0.25;
export declare const SPEED_BOOST_DURATION = 10000;
export declare const FREEZE_DURATION = 5000;
export declare const SHIELD_DURATION = 0;
export declare const CHARS: {
    marker: string;
    markerDrawing: string;
    qix: string;
    qixAlt: string;
    sparx: string;
    sparxChew: string;
    superSparx: string;
    fuse: string;
    fuseHead: string;
    powerUp: string;
    letter: string;
    border: string;
    unclaimed: string;
    claimed: string;
    stixFast: string;
    stixSlow: string;
    stixVertFast: string;
    stixVertSlow: string;
};
export declare const COLORS: {
    marker: string;
    markerDrawing: string;
    qix: string;
    sparx: string;
    superSparx: string;
    fuse: string;
    powerUp: string;
    letter: string;
    border: string;
    unclaimed: string;
    claimed: string;
    stixFast: string;
    stixSlow: string;
    hud: string;
    score: string;
    lives: string;
    level: string;
    percent: string;
};
/**
 * The 16 ANSI colours, indexed the way ANSI art indexes them, named the way
 * blessed tags name them. Art cells carry fg/bg as 0-15, so this is the
 * translation used when a claimed cell reveals the picture behind it.
 *
 * Same names and order as the palette in the LiveChat door, so the two agree
 * on what "colour 9" is called.
 */
export declare const ART_PALETTE: string[];
export declare const BG_COLORS: {
    border: string;
    borderMeter: string;
    unclaimed: string;
    claimed: string;
    stix: string;
    stixSafe: string;
    qix: string;
    sparx: string;
    superSparx: string;
    fuse: string;
    powerUp: string;
    marker: string;
    markerDrawing: string;
};
export declare const LEVEL_CONFIGS: LevelConfig[];
/** How many levels make up one lap of the game (FAQ 3). */
export declare const LEVELS_PER_LAP = 16;
/** The most Gremlins that can share a board at once. */
export declare const MAX_GREMLINS = 4;
/** One more Gremlin every this many levels, until the cap. */
export declare const GREMLIN_ADDED_EVERY = 4;
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
export declare function gremlinsForLevel(level: number): number;
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
export declare function getLevelConfig(level: number): LevelConfig;
/**
 * The three skill levels the arcade operator could set (FAQ 4).
 *
 * "Difficulty" in the FAQ's table "refers mainly to how quickly/
 * unpredictably and aggressively the Gremlin and Skulls move, and how often
 * new Skulls appear", so it is carried here as a straight speed scale over
 * the level's own figures. Continues are not modelled: a BBS door has no
 * coin slot, so there is nothing to continue with.
 */
export declare const SKILL_LEVELS: Record<SkillLevel, {
    label: string;
    lives: number;
    bonusLives: number[];
    targetPercent: number;
    difficulty: number;
}>;
/**
 * What the game says when you finish a lap (FAQ 3.1), spoken by the girl in
 * the convertible and every one of the cats.
 */
export declare const FINAL_LAP_MESSAGE: string[];
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
export declare const MULTIPLIER_REJOIN_CELLS = 2;
export declare const MULTIPLIER_FIRST = 20;
export declare const MULTIPLIER_CHAINED = 30;
export declare const MULTIPLIER_CHAIN_MS = 2000;
/**
 * The Warp doorway (FAQ 2.3.1): it "takes a second or two to open, remains
 * open for another second or so, then closes".
 */
export declare const WARP_OPENING_MS = 1500;
export declare const WARP_OPEN_MS = 1000;
/**
 * What one Hurry multiplies the pace of the game by (FAQ 2.3.1).
 *
 * They stack, so two Hurries square it. Kept modest because a BBS terminal
 * redraws a whole frame per tick - the arcade's "unmanageably fast" is
 * unplayable rather than funny at this frame rate.
 */
export declare const HURRY_SPEED_SCALE = 1.4;
/**
 * How fast a released Letter or Power-up travels, in cells per tick.
 *
 * FAQ 2.2 sets the pecking order: the Skulls "move slightly more quickly
 * than do Power-ups and Letters, but slightly slower than your marker".
 */
export declare const POWERUP_DRIFT_SPEED = 0.25;
/**
 * How long the marker cannot be killed again after losing a life.
 *
 * Without this, the enemy that killed you is still touching you on the
 * very next frame, and every life you have goes in as many frames - three
 * lives in a tenth of a second. The arcade gives you a moment to get clear;
 * so does this.
 */
export declare const RESPAWN_INVULNERABLE_MS = 1500;
/** How fast the marker blinks while it cannot be hurt. */
export declare const INVULNERABLE_BLINK_FRAMES = 2;
/** How long a Shield stuns the Skull it stopped (FAQ 2.3.1). */
export declare const SKULL_STUN_MS = 1000;
export declare const POWERUP_EFFECTS: Record<PowerUpType, {
    duration: number;
    description: string;
    char: string;
    color: string;
}>;
export declare const MENU_OPTIONS: string[];
/**
 * The machine's factory high score table (FAQ 2.5.1), the same for all three
 * pre-set difficulty levels.
 */
export declare const DEFAULT_HIGHSCORES: {
    name: string;
    score: number;
    level: number;
    maxPercent: number;
    date: string;
}[];
export declare const MAX_HIGHSCORES = 10;
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
export declare const MAX_NAME_LENGTH = 10;
export declare const BACKGROUND_PATTERNS: Record<string, (x: number, y: number) => string>;
/**
 * The default movement bindings. Defined by the key layer, re-exported here
 * because the door imports its constants from one place.
 */
export { DEFAULT_KEY_MAP, REDRAW_KEY } from './controls';
//# sourceMappingURL=constants.d.ts.map
/**
 * Frogger - Game Types
 * 1981 Konami arcade game port
 */

// Game states
export type GameState =
  | "attract"
  | "menu"
  | "playing"
  | "dying"
  | "levelComplete"
  | "gameover"
  | "highscores"
  | "enterName"
  | "paused";

// Direction for frog movement
export type Direction = "up" | "down" | "left" | "right";

// Lane types
export type LaneType =
  | "safe" // Starting area, median
  | "road" // Cars and trucks
  | "water" // Logs and turtles
  | "home"; // Goal areas

// Vehicle types on road
export type VehicleType = "car" | "truck" | "racecar";

// River object types
export type RiverObjectType =
  | "log"
  | "turtle"
  | "crocodile"
  | "otter"
  | "snake"
  | "alligator";

/** Which kind of log a water lane is made of (FAQ 6.4's #S/#L/#M). */
export type LogSize = "short" | "medium" | "long";

// Position
export interface Position {
  x: number;
  y: number;
}

// Frog (player) state
export interface Frog {
  x: number;
  y: number;
  direction: Direction;
  isJumping: boolean;
  jumpProgress: number; // 0-1 for animation
  isDead: boolean;
  deathType: "car" | "water" | "timeout" | "edge" | "snake" | "crocodile" | null;
  deathFrame: number;
  onObject: RiverObject | null; // Riding on log/turtle
}

// Vehicle entity
export interface Vehicle {
  id: number;
  type: VehicleType;
  x: number;
  y: number;
  lane: number;
  width: number;
  speed: number; // Negative = moving left
}

// River object (logs, turtles, etc.)
export interface RiverObject {
  id: number;
  type: RiverObjectType;
  x: number;
  y: number;
  lane: number;
  width: number;
  speed: number; // Negative = moving left
  isDiving?: boolean; // For turtles
  diveTimer?: number;
  /** Turtle sets that dive; the FAQ's #D counts one diving set per lane. */
  canDive?: boolean;
  /**
   * Where a diving set is in its cycle: riding high, going down but still
   * solid, or under the surface and deadly.
   */
  diveStage?: 'up' | 'sinking' | 'down';
  /** A snake riding this log (FAQ 7: "they sometimes like to ride on the logs"). */
  snakeAt?: number | null;
  /**
   * The lady frog riding this log (FAQ 7: "You may see a purple frog hopping
   * around on the log in water lane #2").
   */
  ladyFrogAt?: number | null;
  /** Which end of a crocodile or otter is its mouth: the leading edge. */
  mouthWidth?: number;
}

// Home slot at the top
export interface HomeSlot {
  x: number;
  occupied: boolean;
  hasFly: boolean; // Bonus fly
  hasAlligator: boolean; // Danger
  /** When the fly or crocodile currently sitting here goes away. */
  visitorUntil?: number;
}

// Lane configuration
export interface Lane {
  type: LaneType;
  y: number;
  /** The FAQ's own lane number, counting away from the median. */
  lane: number;
  objects: (Vehicle | RiverObject)[];
  direction: 1 | -1; // 1 = right, -1 = left
  speed: number;
}

/** A snake patrolling the median (FAQ 6.4: snakes appear there or on a log). */
export interface Snake {
  id: number;
  x: number;
  y: number;
  direction: 1 | -1;
  speed: number;
}

// High score entry
export interface HighScore {
  name: string;
  score: number;
  level: number;
  date: string;
}

// Main game data
export interface FroggerData {
  // Core state
  state: GameState;
  score: number;
  lives: number;
  level: number;
  timeRemaining: number; // Seconds

  // Player
  frog: Frog;

  // Game objects
  lanes: Lane[];
  homes: HomeSlot[];
  homesCompleted: number;

  // Entity tracking
  vehicleIdCounter: number;
  riverObjectIdCounter: number;

  // Bonuses
  flyTimer: number; // When to spawn bonus fly
  alligatorTimer: number; // When to spawn alligator in home
  ladyFrogTimer: number; // When to put a lady frog on a lane 2 log
  otterTimer: number; // When to send an otter down a water lane

  /** Snakes patrolling the median (FAQ 6.4). */
  snakes: Snake[];
  snakeIdCounter: number;

  /** Carrying the lady frog home is worth 200 (FAQ 6.3). */
  carryingLadyFrog: boolean;

  /**
   * The highest row this frog has reached on this trip, as a y coordinate.
   * Hop points are paid once per row, capped per home (FAQ 6.3).
   */
  furthestRow: number;
  hopPointsThisHome: number;

  /** How many lives a new game starts with (FAQ 6.3's operator setting). */
  startingLives: number;

  /** Whether the free frog at 20,000 has been handed out yet. */
  extraLifeAwarded: boolean;

  /** When the current frog's trip began, for the lane 4 speed-up. */
  frogStartTime: number;

  // Meta
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;

  // Timing
  lastUpdateTime: number;
  frameCount: number;
}

// Input types
export type InputKey =
  | "up"
  | "down"
  | "left"
  | "right"
  | "space"
  | "enter"
  | "escape"
  | "p"
  | "q"
  | "backspace"
  | string;

/**
 * One row of FAQ 6.4's level table.
 */
export interface LevelConfig {
  level: number;
  /** How many vehicles sit in road lanes 1..5. */
  cars: number[];
  /** The table's F/S for lane 4. */
  lane4Fast: boolean;
  /** The #D figures: sets of turtles in water lanes 1 and 4. */
  turtleSets: [number, number];
  /** #S, water lane 2. */
  shortLogs: number;
  /** #L, water lane 3. */
  longLogs: number;
  /** #M, water lane 5. */
  mediumLogs: number;
  /** The table's C: lane 5 is a crocodile rather than logs. */
  lane5Crocodile: boolean;
  /** "Every Nth log in lane #5 a crocodile", or null for none. */
  crocEveryNth: number | null;
  /** One snake from level 3, a second from level 7. */
  snakes: number;
  /** "CROC IN HOME MAKES APPEARANCE" from level 2. */
  crocInHome: boolean;
}

// Sound effects
export type SoundEffect =
  | "hop"
  | "splash"
  | "squash"
  | "home"
  | "levelComplete"
  | "timeWarning"
  | "gameOver"
  | "bonusFly"
  | "ladyFrog"
  | "extraLife";

// RPC methods
export interface RPCMethods {
  getHighscores: () => Promise<HighScore[]>;
  saveHighscore: (params: {
    name: string;
    score: number;
    level: number;
  }) => Promise<void>;
}

/**
 * Super Qix - Game Types
 * Shared interfaces for the 1987 Taito arcade game port
 */

/** The three skill levels the operator could set (FAQ 4). */
export type SkillLevel = 'easy' | 'medium' | 'hard';

// Direction for movement
export type Direction = 'up' | 'down' | 'left' | 'right';

// Game states
export type GameState =
  | 'menu'
  | 'playing'
  | 'paused'
  | 'levelComplete'
  | 'gameover'
  | 'highscores'
  | 'enterName'
  | 'remapKeys'
  | 'attract'
  | 'levelTransition';

/**
 * Which key moves the marker which way.
 *
 * A value is whatever normalizeKey produces, so the four direction tokens
 * ('up'..'right') stand for the arrow keys and WASD together. Those always
 * work; the map is consulted on top of them, never instead.
 */
export interface KeyMap {
  up: string;
  down: string;
  left: string;
  right: string;
}

// Cell states for the playfield grid
export type CellState = 'unclaimed' | 'claimed' | 'border' | 'stix';

// Power-up types
export type PowerUpType = 'speed' | 'shield' | 'freeze' | 'warp' | 'letter' | 'oneUp';

// Position interface
export interface Point {
  x: number;
  y: number;
}

// Marker (player) state
export interface Marker {
  x: number;
  y: number;
  isDrawing: boolean;
  hasShield: boolean;
  speedBoost: boolean;
  speedBoostTimer: number;
}

// Qix (main enemy - bouncing gremlin)
export interface Qix {
  id: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  segments: Point[];  // Visual segments for the bouncing line shape
  frozen: boolean;
  frozenTimer: number;
}

// Sparx (border patrol enemy)
export interface Sparx {
  id: number;
  x: number;
  y: number;
  pathIndex: number;
  direction: 1 | -1;  // Direction along border path
  speed: number;
  /** When this Skull last reversed, so it cannot flip twice in a row. */
  lastReversedAt: number;
  frozen: boolean;
  frozenTimer: number;
}

// Fuse (burns along stix when player stops)
export interface Fuse {
  x: number;
  y: number;
  pathIndex: number;
  active: boolean;
  burnSpeed: number;
}

/**
 * How a released bonus is travelling (FAQ 2.3).
 *
 * A Letter "drifts across the playing field in a straight line towards the
 * far wall, then moves back around the edges" - `cross` then `edge`. A
 * Power-up instead "begins following the nearest lines already laid down",
 * which is `seek` until it reaches one, then `edge`.
 */
export type PowerUpDrift = 'cross' | 'seek' | 'edge';

// Power-up entity
export interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  letter?: string;  // For letter type power-ups
  collected: boolean;
  spawnTime: number;
  /** How it is moving, once launched. */
  drift?: PowerUpDrift;
  /** Heading while crossing the field or seeking a line. */
  vx?: number;
  vy?: number;
  /** Where it is on the border path once it is walking a line. */
  pathIndex?: number;
}

// Active effect (timed power-ups)
export interface ActiveEffect {
  type: PowerUpType;
  remainingTime: number;
}

// Stix (line being drawn)
export interface Stix {
  points: Point[];
  startTime: number;
}

// High score entry
export interface HighScore {
  name: string;
  score: number;
  level: number;
  maxPercent: number;
  date: string;
}

// Level configuration
export interface LevelConfig {
  number: number;
  qixCount: number;
  qixSpeed: number;
  sparxCount: number;
  sparxSpeed: number;
  /** How long the border Time Meter takes to fill (FAQ 1). */
  timeMeterMs: number;
  fuseSpeed: number;
  targetPercent: number;
  word: string;  // Word to spell for auto-complete
  backgroundPattern: string;  // Pattern revealed when complete
}

// Region for flood fill
export interface Region {
  points: Point[];
  area: number;
}

// Claim result
export interface ClaimResult {
  success: boolean;
  percent?: number;
  points?: number;
  /** Cells the claim won, for the engine to paint in over time. */
  filled?: Point[];
}

// Main game data structure
export interface SuperQixData {
  // Core state
  state: GameState;
  score: number;
  lives: number;
  level: number;
  /** Which lap of the 16 levels this is, counting from 1 (FAQ 3). */
  lap: number;
  /** The operator's skill setting (FAQ 4). */
  skill: SkillLevel;
  /** How many of this skill's bonus-life thresholds have been paid. */
  bonusLivesAwarded: number;
  claimedPercent: number;
  targetPercent: number;
  scoreMultiplier: number;

  // Playfield
  field: CellState[][];
  fieldWidth: number;
  fieldHeight: number;

  // Player
  marker: Marker;
  currentStix: Stix | null;

  // Enemies
  qixList: Qix[];
  sparxList: Sparx[];
  fuse: Fuse | null;
  qixIdCounter: number;
  sparxIdCounter: number;

  // Power-ups & Letters
  powerUps: PowerUp[];
  powerUpIdCounter: number;
  collectedLetters: string[];
  levelWord: string;
  activeEffects: ActiveEffect[];

  // Border path for Sparx patrol
  borderPath: Point[];

  /**
   * Every line the player has finished, in the order it was drawn.
   *
   * FAQ 2.2: the Skulls "can follow any line on the screen (including
   * internal lines which you can't travel on anymore)", so the patrol path
   * needs them even after a later claim buries them and the marker loses
   * access.
   */
  internalLines: Point[][];

  // Meta
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;
  playerNameCursor: number;

  // Timing
  lastUpdateTime: number;
  frameCount: number;
  levelStartTime: number;
  stopTimer: number;  // Time marker has been stopped (for fuse)

  /**
   * How full the border Time Meter is, 0..1 (FAQ 1). At 1 two more
   * Skulls are released and it resets.
   */
  timeMeter: number;

  /**
   * How many Gremlins have been sealed into claimed ground this level.
   *
   * Paid at the end of the level, one CAPTURE_POINTS each. Reset by
   * initLevel, so it is what THIS level caught and not a running total.
   */
  gremlinsCaptured: number;

  /** The player's movement bindings, loaded from their saved settings. */
  keyMap: KeyMap;

  /** Which direction the remap screen is currently asking for, if it is open. */
  remapDirection: number;

  /** What the remap screen last refused, so it can say why. */
  remapMessage: string;

  /** An open Warp doorway, if one has been released (FAQ 2.3.1). */
  warp: { x: number; y: number; openedAt: number } | null;

  /**
   * Until when the marker cannot lose another life.
   *
   * Set on death: the enemy that killed you is still standing on you the
   * next frame, and without a moment's grace every life goes at once.
   */
  invulnerableUntil: number;

  /** When the last rejoin multiplier was scored, for chaining (FAQ 2.4.1). */
  lastMultiplierAt: number;
  /** What that multiplier was: 1, then 20, then 30 while the chain holds. */
  lastMultiplier: number;

  // Transition
  transitionTimer: number;
  transitionMessage: string;
}

// Input event types
export type InputKey =
  | 'up' | 'down' | 'left' | 'right'
  | 'z' | 'x'  // Slow/Fast draw
  | 'space' | 'enter' | 'escape'
  | 'p' | 'q'
  | 'backspace'
  | 'tab'
  | string;

// Audio event types
export type SoundEffect =
  | 'drawStart'
  | 'drawComplete'
  | 'death'
  | 'powerUp'
  | 'fuse'
  | 'levelComplete'
  | 'gameOver'
  | 'menuSelect'
  | 'menuMove'
  | 'sparxMove'
  | 'qixBounce'
  | 'letterCollect';

// RPC method types
export interface RPCMethods {
  getHighscores: () => Promise<HighScore[]>;
  saveHighscore: (params: { name: string; score: number; level: number; maxPercent: number }) => Promise<void>;
}

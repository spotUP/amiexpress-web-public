/**
 * Super Qix - Game Types
 * Shared interfaces for the 1987 Taito arcade game port
 */

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
  | 'levelTransition';

// Cell states for the playfield grid
export type CellState = 'unclaimed' | 'claimed' | 'border' | 'stix';

// Power-up types
export type PowerUpType = 'speed' | 'shield' | 'freeze' | 'warp' | 'letter';

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
  isSuper: boolean;
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

// Power-up entity
export interface PowerUp {
  id: number;
  type: PowerUpType;
  x: number;
  y: number;
  letter?: string;  // For letter type power-ups
  collected: boolean;
  spawnTime: number;
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
  superSparxTime: number;  // Time until Sparx become Super
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
  splitBonus?: number;
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

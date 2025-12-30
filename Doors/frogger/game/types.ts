/**
 * Frogger - Game Types
 * 1981 Konami arcade game port
 */

// Game states
export type GameState =
  | 'menu'
  | 'playing'
  | 'dying'
  | 'levelComplete'
  | 'gameover'
  | 'highscores'
  | 'enterName';

// Direction for frog movement
export type Direction = 'up' | 'down' | 'left' | 'right';

// Lane types
export type LaneType =
  | 'safe'      // Starting area, median
  | 'road'      // Cars and trucks
  | 'water'     // Logs and turtles
  | 'home';     // Goal areas

// Vehicle types on road
export type VehicleType = 'car' | 'truck' | 'racecar';

// River object types
export type RiverObjectType = 'log' | 'turtle' | 'alligator' | 'snake';

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
  jumpProgress: number;  // 0-1 for animation
  isDead: boolean;
  deathType: 'car' | 'water' | 'timeout' | 'edge' | null;
  deathFrame: number;
  onObject: RiverObject | null;  // Riding on log/turtle
}

// Vehicle entity
export interface Vehicle {
  id: number;
  type: VehicleType;
  x: number;
  y: number;
  lane: number;
  width: number;
  speed: number;  // Negative = moving left
}

// River object (logs, turtles, etc.)
export interface RiverObject {
  id: number;
  type: RiverObjectType;
  x: number;
  y: number;
  lane: number;
  width: number;
  speed: number;  // Negative = moving left
  isDiving?: boolean;  // For turtles
  diveTimer?: number;
}

// Home slot at the top
export interface HomeSlot {
  x: number;
  occupied: boolean;
  hasFly: boolean;     // Bonus fly
  hasAlligator: boolean;  // Danger
}

// Lane configuration
export interface Lane {
  type: LaneType;
  y: number;
  objects: (Vehicle | RiverObject)[];
  direction: 1 | -1;  // 1 = right, -1 = left
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
  timeRemaining: number;  // Seconds

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
  flyTimer: number;        // When to spawn bonus fly
  alligatorTimer: number;  // When to spawn alligator in home

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
  | 'up' | 'down' | 'left' | 'right'
  | 'space' | 'enter' | 'escape'
  | 'p' | 'q'
  | 'backspace'
  | string;

// Level configuration
export interface LevelConfig {
  vehicleSpeed: number;
  riverSpeed: number;
  turtleDiveFrequency: number;
  timeLimit: number;
  flySpawnChance: number;
  alligatorChance: number;
}

// Sound effects
export type SoundEffect =
  | 'hop'
  | 'splash'
  | 'squash'
  | 'home'
  | 'levelComplete'
  | 'timeWarning'
  | 'gameOver'
  | 'bonusFly'
  | 'extraLife';

// RPC methods
export interface RPCMethods {
  getHighscores: () => Promise<HighScore[]>;
  saveHighscore: (params: { name: string; score: number; level: number }) => Promise<void>;
}

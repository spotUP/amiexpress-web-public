/**
 * Zoo Keeper - Game Types
 * Shared interfaces for the 1982 Taito arcade game port
 */

// Direction for movement
export type Direction = 'up' | 'down' | 'left' | 'right';

// Game states
export type GameState =
  | 'menu'
  | 'playing'
  | 'platform'
  | 'stampede'
  | 'paused'
  | 'gameover'
  | 'highscores'
  | 'enterName'
  | 'levelComplete'
  | 'stageTransition';

// Animal types with their characteristics
export type AnimalType = 'elephant' | 'snake' | 'camel' | 'rhino' | 'moose' | 'lion';

// Bonus item types
export type BonusItemType = 'rootbeer' | 'clover' | 'watermelon' | 'sundae' | 'strawberry' | 'trophy' | 'money' | 'net';

// Position interface
export interface Position {
  x: number;
  y: number;
}

// Zeke (player) state
export interface Zeke {
  x: number;
  y: number;
  direction: Direction;
  hasNet: boolean;
  netTimer: number;
  isJumping: boolean;
  jumpFrame: number;
  isDead: boolean;
  deathFrame: number;
}

// Animal entity
export interface Animal {
  id: number;
  type: AnimalType;
  x: number;
  y: number;
  dx: number;  // velocity x
  dy: number;  // velocity y
  escaped: boolean;
  targetWallX: number;
  targetWallY: number;
  attackTimer: number;
}

// Bonus item on the fuse timer
export interface BonusItem {
  type: BonusItemType;
  x: number;
  y: number;
  collected: boolean;
  fusePosition: number;  // Position along the fuse (0-1)
}

// Platform for the platform stage
export interface Platform {
  x: number;
  y: number;
  width: number;
  dx: number;  // horizontal velocity
  minX: number;
  maxX: number;
}

// Coconut thrown by monkey
export interface Coconut {
  x: number;
  y: number;
  dx: number;
  dy: number;
  bounceCount: number;
}

// High score entry
export interface HighScore {
  name: string;
  score: number;
  level: number;
  date: string;
}

// Wall segment data
export interface WallSegment {
  thickness: number;  // 0-3 (0=broken, 3=max)
}

// Zoo stage specific data
export interface ZooStageData {
  wall: WallSegment[][];  // 2D grid of wall segments around perimeter
  animals: Animal[];
  bonusItems: BonusItem[];
  timer: number;  // Time remaining (fuse length)
  fusePosition: number;  // Current fuse burn position (0-1)
  animalIdCounter: number;
}

// Platform stage specific data
export interface PlatformStageData {
  platforms: Platform[];
  coconuts: Coconut[];
  zelda: Position;
  monkey: Position;
  monkeyThrowTimer: number;
  zekelY: number;  // Zeke's Y position on platforms
  zekelPlatformIndex: number;  // Which platform Zeke is on (-1 for ground)
}

// Stampede stage specific data
export interface StampedeStageData {
  escalatorSpeed: number;
  chargingAnimals: Animal[];
  zekelY: number;  // Zeke's position on escalator
  jumpedAnimals: number;  // Count for bonus scoring
}

// Main game data structure
export interface ZooKeeperData {
  // Core state
  state: GameState;
  score: number;
  lives: number;
  level: number;
  round: number;  // 1-4 within each level cycle (zoo, platform, zoo, stampede)

  // Player
  zeke: Zeke;

  // Stage-specific data
  zooStage: ZooStageData;
  platformStage: PlatformStageData;
  stampedeStage: StampedeStageData;

  // Meta
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;
  playerNameCursor: number;

  // Timing
  lastUpdateTime: number;
  frameCount: number;

  // Transition
  transitionTimer: number;
  transitionMessage: string;
}

// Input event types
export type InputKey =
  | 'up' | 'down' | 'left' | 'right'
  | 'space' | 'enter' | 'escape'
  | 'p' | 'q'
  | 'backspace'
  | 'tab'
  | string;  // For name entry

// Game configuration (for difficulty scaling)
export interface LevelConfig {
  animalTypes: AnimalType[];
  animalCount: number;
  animalSpeedMultiplier: number;
  wallStartingThickness: number;  // 1-3
  timerDuration: number;  // seconds
  bonusItemCount: number;
}

// Audio event types for sound system
export type SoundEffect =
  | 'jump'
  | 'capture'
  | 'death'
  | 'wallBreak'
  | 'bonusCollect'
  | 'netCollect'
  | 'levelComplete'
  | 'gameOver'
  | 'menuSelect'
  | 'menuMove'
  | 'animalEscape'
  | 'coconutBounce'
  | 'platformLand';

// RPC method types for server communication
export interface RPCMethods {
  getHighscores: () => Promise<HighScore[]>;
  saveHighscore: (params: { name: string; score: number; level: number }) => Promise<void>;
}

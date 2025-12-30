/**
 * Galaga - Game Types
 * 1981 Namco space shooter arcade game port
 */

// Game states
export type GameState =
  | 'menu'
  | 'playing'
  | 'dying'
  | 'stageIntro'
  | 'challengingStage'
  | 'stageComplete'
  | 'gameover'
  | 'highscores'
  | 'enterName';

// Alien types
export type AlienType =
  | 'bee'       // Blue/Yellow grunt (Zako)
  | 'butterfly' // Red butterfly (Goei)
  | 'boss'      // Green boss galaga (can capture)
  | 'captured'; // Player's captured fighter

// Alien behavior states
export type AlienState =
  | 'formation'  // In formation at top
  | 'diving'     // Attacking player
  | 'returning'  // Going back to formation
  | 'capturing'  // Boss tractor beam
  | 'dead';

// Position
export interface Position {
  x: number;
  y: number;
}

// Velocity
export interface Velocity {
  dx: number;
  dy: number;
}

// Player ship
export interface Player {
  x: number;
  y: number;
  isDead: boolean;
  deathFrame: number;
  hasDualFighter: boolean;  // After rescuing captured ship
  isCaptured: boolean;
}

// Bullet
export interface Bullet {
  id: number;
  x: number;
  y: number;
  dy: number;  // Positive = enemy, negative = player
  isEnemy: boolean;
}

// Alien entity
export interface Alien {
  id: number;
  type: AlienType;
  state: AlienState;
  x: number;
  y: number;
  formationX: number;  // Position in formation
  formationY: number;
  health: number;      // Boss takes 2 hits
  diveProgress: number;
  divePath: Position[];  // Path for dive attack
  divePathIndex: number;
  capturedFighter: boolean;  // Boss has captured player
  tractorBeamActive: boolean;
}

// Formation slot
export interface FormationSlot {
  x: number;
  y: number;
  occupied: boolean;
  alienId: number | null;
}

// Explosion effect
export interface Explosion {
  id: number;
  x: number;
  y: number;
  frame: number;
  maxFrames: number;
}

// Star in background
export interface Star {
  x: number;
  y: number;
  speed: number;
  brightness: number;
}

// High score entry
export interface HighScore {
  name: string;
  score: number;
  stage: number;
  date: string;
}

// Main game data
export interface GalagaData {
  // Core state
  state: GameState;
  score: number;
  lives: number;
  stage: number;
  shotsHit: number;
  shotsFired: number;

  // Player
  player: Player;

  // Game entities
  aliens: Alien[];
  bullets: Bullet[];
  explosions: Explosion[];
  stars: Star[];

  // Formation
  formation: FormationSlot[][];
  formationOffset: number;  // Formation sway
  formationDirection: 1 | -1;

  // Spawning
  alienIdCounter: number;
  bulletIdCounter: number;
  explosionIdCounter: number;
  spawnPhase: number;  // For stage intro animation
  aliensToSpawn: AlienType[];

  // Challenging stage
  isChallengingStage: boolean;
  challengingKills: number;
  challengingTotal: number;

  // Capture mechanics
  capturedFighterAlienId: number | null;
  tractorBeamTimer: number;

  // Meta
  highscores: HighScore[];
  menuSelection: number;
  playerName: string;

  // Timing
  lastUpdateTime: number;
  frameCount: number;
  stageIntroTimer: number;
}

// Input types
export type InputKey =
  | 'left' | 'right'
  | 'fire' | 'space'
  | 'enter' | 'escape'
  | 'p' | 'q'
  | 'backspace'
  | string;

// Stage configuration
export interface StageConfig {
  bees: number;
  butterflies: number;
  bosses: number;
  diveFrequency: number;
  alienSpeed: number;
  bulletSpeed: number;
  isChallengingStage: boolean;
}

// Sound effects
export type SoundEffect =
  | 'shoot'
  | 'explosion'
  | 'alienDive'
  | 'capture'
  | 'dualFighter'
  | 'stageStart'
  | 'challenging'
  | 'gameOver';

// RPC methods
export interface RPCMethods {
  getHighscores: () => Promise<HighScore[]>;
  saveHighscore: (params: { name: string; score: number; stage: number }) => Promise<void>;
}

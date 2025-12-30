/**
 * Pengo - Game Types
 * 1982 Sega arcade puzzle game port
 */

export type GameState =
  | 'menu'
  | 'playing'
  | 'dying'
  | 'levelComplete'
  | 'gameover'
  | 'highscores'
  | 'enterName';

export type Direction = 'up' | 'down' | 'left' | 'right';

export type CellType =
  | 'empty'
  | 'ice'        // Normal ice block
  | 'diamond'    // Diamond block (for bonus)
  | 'wall';      // Outer wall

export type EnemyState = 'walking' | 'hatching' | 'stunned' | 'dead';

export interface Position {
  x: number;
  y: number;
}

export interface Pengo {
  x: number;
  y: number;
  direction: Direction;
  isPushing: boolean;
  pushFrame: number;
  isDead: boolean;
  deathFrame: number;
}

export interface Enemy {
  id: number;
  x: number;
  y: number;
  direction: Direction;
  state: EnemyState;
  stunTimer: number;
  hatchTimer: number;
  moveTimer: number;
}

export interface Block {
  x: number;
  y: number;
  type: CellType;
  isSliding: boolean;
  slideDirection: Direction | null;
}

export interface Egg {
  x: number;
  y: number;
  hatchTimer: number;
}

export interface HighScore {
  name: string;
  score: number;
  level: number;
  date: string;
}

export interface PengoData {
  state: GameState;
  score: number;
  lives: number;
  level: number;
  timeRemaining: number;

  pengo: Pengo;
  enemies: Enemy[];
  grid: CellType[][];
  eggs: Egg[];

  diamondsAligned: boolean;
  enemyIdCounter: number;

  highscores: HighScore[];
  menuSelection: number;
  playerName: string;

  lastUpdateTime: number;
  frameCount: number;
}

export type InputKey =
  | 'up' | 'down' | 'left' | 'right'
  | 'push' | 'space'
  | 'enter' | 'escape'
  | 'p' | 'q'
  | 'backspace'
  | string;

export interface LevelConfig {
  enemies: number;
  eggs: number;
  iceBlocks: number;
  enemySpeed: number;
  timeLimit: number;
}

export type SoundEffect =
  | 'push'
  | 'crush'
  | 'stun'
  | 'death'
  | 'hatch'
  | 'diamondBonus'
  | 'levelComplete'
  | 'gameOver';

export interface RPCMethods {
  getHighscores: () => Promise<HighScore[]>;
  saveHighscore: (params: { name: string; score: number; level: number }) => Promise<void>;
}

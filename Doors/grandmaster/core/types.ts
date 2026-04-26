/**
 * Core types for GRANDMASTER
 */

// ============================================================================
// Piece Types
// ============================================================================

export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export interface Piece {
  type: PieceType;
  rotation: 0 | 1 | 2 | 3;
  x: number;
  y: number;
  invisible?: boolean;  // Bone block flag (S13+ grades)
}

export type RotationSystem = 'SRS' | 'ARS' | 'NRS' | 'BARS';

// ============================================================================
// Board
// ============================================================================

export interface Cell {
  filled: boolean;
  color: PieceType | null;
  locked: boolean;
  lockTime?: number;  // Timestamp when cell was locked (for credit roll fade)
}

export interface Board {
  width: number;
  height: number;
  grid: Cell[][];
}

// ============================================================================
// Game Modes
// ============================================================================

export type GameMode =
  | 'marathon'
  | 'sprint'
  | 'dig'
  | 'ultra'
  | 'blitz'
  | 'combo'
  | 'survival'
  | 'classic'
  | 'master'
  | 'death'
  | 'zen'
  | 'zone'          // Zone mode: fill meter, activate for massive clear bonus
  | 'training'
  | 'versus'
  | 'cpu_battle'
  | 'tetrinet';  // TetriNET mode with special blocks

// ============================================================================
// Game State
// ============================================================================

export interface GameState {
  mode: GameMode;
  board: Board;
  currentPiece: Piece | null;
  holdPiece: PieceType | null;
  canHold: boolean;
  nextQueue: PieceType[];

  // Stats
  level: number;
  lines: number;
  score: number;
  grade: string;
  combo: number;
  backToBack: boolean;
  backToBackCount: number;  // Track chain length for B2B visual bonus
  piecesPlaced: number;          // Total pieces locked (for PPS = piecesPlaced / elapsedSeconds)
  ultraTimeRemaining: number;    // ms remaining for Ultra mode (0 when not ultra)
  digLinesRemaining: number;     // Garbage rows left to clear in Dig mode
  zoneMeter: number;             // 0.0–1.0, fills as lines cleared during Zone mode
  zoneActive: boolean;           // True while Zone is activated
  zoneTimeRemaining: number;     // ms remaining in active Zone
  zoneBufferedLines: number;     // Lines accumulated during active Zone (for bonus calc)

  // T-Spin tracking (HeborisCE tspin_flag system)
  lastMove: 'rotate' | 'move' | 'drop' | null;
  lastTSpin: 'none' | 'mini' | 'full' | null;
  tSpinFlag: 0 | 1 | 2;  // 0=none, 1=potential (rotated), 2=confirmed T-Spin
  rotationCount: number;  // Number of rotations for current piece (for T-Spin detection)

  // GM condition flags
  gmFlags: {
    flag1: boolean;  // Level 300 time gate passed
    flag2: boolean;  // Level 500 time gate passed
    flag3: boolean;  // Level 700 time gate passed
  };

  // Timing
  gravity: number;
  lockDelay: number;
  lockDelayRemaining: number;
  areRemaining: number;

  // Lock delay reset tracking (HeborisCE kickm/kickr/kickc system)
  moveResetCount: number;     // kickc - horizontal moves while grounded
  rotationResetCount: number; // kickc3 - rotations while grounded
  floorKickCount: number;     // kickc2 - floor kicks used (limited to 1 for Ti-style)
  maxMoveResets: number;      // kickm - maximum allowed move resets (typically 15)
  maxRotationResets: number;  // kickr - maximum allowed rotation resets (typically 8)
  maxFloorKicks: number;      // Ti-style: typically 1

  // Legacy field for backwards compatibility
  lockResets: number;

  // IRS/IHS (Initial Rotation/Hold System)
  pendingIRS: number;        // Pending rotation direction (-1, 0, 1 for CCW, none, CW)
  pendingIHS: boolean;       // Pending hold input

  // TGM3 specific
  section: number;
  sectionTime: number;
  sectionLines: number;
  internalGrade: number;

  // Credit Roll (M grade challenge)
  creditRollActive: boolean;
  creditRollTimeRemaining: number;  // milliseconds
  creditRollStartTime: number | null;

  // Section result tracking
  lastSectionResult?: 'COOL' | 'REGRET' | 'NORMAL';

  // Game status
  status: 'ready' | 'countdown' | 'playing' | 'paused' | 'gameover' | 'complete';
  startTime: number | null;
  endTime: number | null;
}

// ============================================================================
// Player Settings
// ============================================================================

/**
 * Gamepad bindings stored as trigger strings: "button:a", "dpad:left", "axis:left-x:negative"
 * Keys match GameAction names.
 */
export type GamepadBindings = Partial<Record<string, string[]>>;

export interface KeyBindings {
  left: string[];
  right: string[];
  rotateCW: string[];
  rotateCCW: string[];
  rotate180: string[];
  softDrop: string[];
  hardDrop: string[];
  sonicDrop?: string[];
  hold: string[];
  pause: string[];
}

export interface PlayerSettings {
  rotationSystem: RotationSystem;
  das: number;              // Delayed Auto-Shift (ms)
  arr: number;              // Auto-Repeat Rate (ms)
  softDropSpeed: number;    // Multiplier
  ghostPiece: boolean;
  lockDelay: number;
  previewCount: number;
  musicVolume: number;
  sfxVolume: number;
  keyBindings: KeyBindings;
  gamepadBindings?: GamepadBindings;

  // Visual Effects Settings
  blockGlow: boolean;                 // Enable/disable block glow system
  glowIntensity: number;              // 0.0-1.0 multiplier
  clearStyle: 'inward' | 'outward' | 'instant' | 'directional';  // Line clear animation style
  clearDirection: 'in' | 'out';       // For directional mode
  clearAnimationSpeed: number;        // 0.5-2.0 multiplier (0.5=slow, 2.0=fast)
  placementEffects: boolean;          // Enable/disable piece placement effects
  floatTextMode: 'off' | 'offboard' | 'all';  // Floating text mode
  b2bGlowEnabled: boolean;            // Enable/disable B2B secondary glow
  connectedBlocks: boolean;           // Enable/disable connected block rendering
  animationIntensity: 'low' | 'normal' | 'high';  // Global animation speed multiplier
}

// ============================================================================
// Player Stats
// ============================================================================

export interface PlayerStats {
  gamesPlayed: number;
  totalLines: number;
  totalScore: number;
  bestGrade: string;
  bestLevel: number;
  fastestSprint: number | null;
  highestCombo: number;
  tetrisCount: number;
  tSpinCount: number;
  perfectClears: number;
}

// ============================================================================
// Application State
// ============================================================================

export interface AppState {
  currentMode: GameMode | null;
  playerName: string;
  settings: PlayerSettings;
  stats: PlayerStats;
}

// ============================================================================
// Input
// ============================================================================

export type GameAction =
  | 'left'
  | 'right'
  | 'rotate_cw'
  | 'rotate_ccw'
  | 'rotate_180'
  | 'soft_drop'
  | 'hard_drop'
  | 'sonic_drop'
  | 'hold'
  | 'pause';

export interface InputState {
  heldKeys: Set<string>;
  dasTimer: number;
  arrTimer: number;
  lastAction: GameAction | null;
}

// ============================================================================
// Game Result
// ============================================================================

export interface GameResult {
  mode: GameMode;
  score: number;
  level: number;
  lines: number;
  linesCleared: number;
  grade: string;
  time: number | null;
  combo: number;
  tetrisCount: number;
  tSpinCount: number;
  perfectClears: number;
  completed: boolean;
  finesseRate?: number;    // Percentage of placements with perfect finesse (0-1)
  finesseErrors?: number;  // Total finesse errors
}

// ============================================================================
// TGM3 Speed Curve
// ============================================================================

export interface SpeedLevel {
  level: number;
  gravity: number;      // G (cells per frame at 60fps)
  are: number;          // Appearance delay (frames)
  arelinelock: number;  // Line clear delay (frames)
  das: number;          // DAS (frames)
  lockDelay: number;    // Lock delay (frames)
}

// ============================================================================
// TGM3 Grading
// ============================================================================

export type TGMGrade =
  | '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2' | '1'
  | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9'
  | 'S10' | 'S11' | 'S12' | 'S13'
  | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8' | 'm9'
  | 'M' | 'MK' | 'MV' | 'MO' | 'GM' | 'GMM';

export interface GradeRequirement {
  grade: TGMGrade;
  internalGradeRequired: number;
  minLevel: number;
  decayRate: number;    // Points lost per piece
}

// ============================================================================
// Effects
// ============================================================================

export interface LockEffect {
  cells: { x: number; y: number; color: PieceType }[];
  frame: number;
  maxFrames: number;
}

export interface LineClearEffect {
  y: number;
  frame: number;
  maxFrames: number;
  style: 'center_out' | 'alternating' | 'cascade';
}

export interface ParticleEffect {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  char: string;
  color: string;
}

// ============================================================================
// Rotation Data
// ============================================================================

export type KickTable = Array<[number, number]>;

export interface RotationData {
  shapes: number[][][];    // [rotation][row][col]
  kicks: Record<string, KickTable>;
}

// ============================================================================
// AI Types
// ============================================================================

export interface AIMove {
  x: number;
  rotation: number;
  score: number;
  useHold?: boolean;
}

export interface AIDifficulty {
  level: number;
  name: string;
  thinkTime: number;
  mistakeRate: number;
  lookahead: number;
  useHold: boolean;
  tSpinAware: boolean;
  targetAPM: number;
}

// ============================================================================
// Network Types
// ============================================================================

export interface GarbageLine {
  holePosition: number;
  sender?: string;
}

export interface AttackData {
  type: 'single' | 'double' | 'triple' | 'tetris' | 'tspin' | 'perfect_clear';
  lines: number;
  combo: number;
  backToBack: boolean;
}

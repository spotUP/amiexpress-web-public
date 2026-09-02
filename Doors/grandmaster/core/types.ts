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
  /**
   * TGM item carried by this piece (HeborisCE gamestart.c:3896-3907 item_nblk
   * lookahead queue -> item[player]). Set when the piece spawns; stamped onto
   * every cell the piece occupies when it locks (gamestart.c:16230). null/undefined
   * means the piece carries no item.
   */
  itemId?: number | null;
  /**
   * BIG piece (DEATH BLOCK, item 3): every cell of the shape is a 2x2 block
   * (gamestart.c:16241-16297). Set at spawn from the engine's remaining
   * DEATH BLOCK pieces so a piece keeps its size for its whole life.
   */
  big?: boolean;
}

export type RotationSystem =
  | 'SRS'
  | 'ARS'
  | 'NRS'
  | 'BARS'
  // HeborisCE-authentic rotation rulesets (Documentation/7-Reference Sources/HeborisCE-1.1.0).
  // rots is 0-indexed HEBORIS/TI-ARS/TI-WORLD/ACE-SRS/ACE-ARS/ACE-ARS2/DS-WORLD/SRS-X/DRS
  // (src/script/config.c:1118-1126). These are NOT interchangeable rotation systems that
  // happen to share tables - each is gated on its own rots value and HeborisCE gives several
  // of them their own lock/landing behavior. What IS shared, and only that:
  //   - TI-ARS (rots==1) and ACE-ARS (rots==4) share classic.c's block-data table
  //     (src/script/classic.c:3-23, reused verbatim by ars.c per its own header comment)
  //     and, because classic.c's Ti-gated kick branches and ars.c's ungated ones compute the
  //     same offsets, the same wall/floor kick TABLE (classic.c:130-242, ars.c:112-223).
  //     They are still different systems: ACE-ARS runs ars.c's statAMove, which gives it an
  //     ARS1-style instant lock on the up key that TI-ARS's classic.c statCMove never has
  //     (ars.c:331,361,389) - modeled in core/game.ts's sonicDrop(), where ACE-ARS drops
  //     AND locks while every other system's up key leaves the piece live on the floor.
  | 'TI-ARS'
  | 'ACE-ARS'
  // TI-WORLD / ACE-SRS / DS-WORLD / SRS-X all run statWMove (src/script/world.c:139-357),
  // whose block-data table (world.c:52-72) is byte-for-byte identical to SRS piece shapes,
  // and whose plain CW/CCW kick offsets (world.c:28-47) are likewise shared by all four -
  // that rotation/kick block is not gated per system. SRS-X additionally gets a dedicated
  // 180-degree kick table (world.c:121-135) the other three don't have. Past the shape and
  // 90-degree kick tables, these are NOT the same system: DS-WORLD is exempted from the
  // kick-count forced lock the other three get (world.c:425-426, "infinite spin" - modeled
  // in core/game.ts as unlimited maxMoveResets/maxRotationResets), and SRS-X locks instantly
  // on down input once grounded instead of just resetting the lock timer (world.c:440,
  // modeled in core/game.ts's softDrop()). ACE-SRS and DS-WORLD also run a different
  // soft-drop gravity constant than TI-WORLD/SRS-X (world.c:405,452) - not modeled here; this
  // door's soft-drop speed is the player-configurable PlayerSettings.softDropSpeed multiplier,
  // not a per-rotation-system constant, and retrofitting one risks conflicting with it.
  | 'TI-WORLD'
  | 'ACE-SRS'
  | 'DS-WORLD'
  | 'SRS-X';

// ============================================================================
// Board
// ============================================================================

export interface Cell {
  filled: boolean;
  color: PieceType | null;
  locked: boolean;
  lockTime?: number;  // Timestamp when cell was locked (for credit roll fade)
  /**
   * TGM item id (1-39) carried by this cell, or the hard-block sentinel
   * (see core/items.ts HARD_BLOCK_ITEM, HeborisCE gamestart.c:1409 fldihardno).
   * Set for every cell of a piece that was carrying an item when it locked
   * (gamestart.c:16230 fldi[...] = item[player]). null/undefined = no item.
   */
  item?: number | null;
  /**
   * HIDDEN's shadow timer (HeborisCE fldt): frames this locked cell stays
   * visible. Set to p_shadow_timer on lock (gamestart.c:16224-16225,
   * init.c:732 = 300) and counted down every frame (gamestart.c:4794-4803).
   * At zero the cell is still solid - it just is not drawn.
   * undefined = HIDDEN is off and the cell is drawn for ever.
   */
  shadowFrames?: number;
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

  /**
   * Torikan: HeborisCE's qualifying time cutoff ("footcut", 足切り) for
   * Master and DOOM/DEVIL ('death') mode. True when the run was forced to
   * end at torikanCheckpointLevel because it crossed level 500 (or, in
   * 'death', 1000) after the mode's deadline instead of before it.
   * core/time-limit.ts, gamestart.c:10961 checkEnding().
   */
  torikanExpired: boolean;
  torikanCheckpointLevel: 500 | 1000 | null;

  /**
   * TGM item HUD banner (HeborisCE shows the collected item's name; see
   * gamestart.c:12725-12744 for the item-name display in the setup screen,
   * and item_name[player] for the in-game equivalent). Set when an item is
   * collected, ticks down every frame, cleared at 0.
   */
  itemBanner: { name: string; ttl: number } | null;
  /**
   * Pieces left under DEATH BLOCK (item 3) and ROLL ROLL (item 2). Both are
   * counted in PIECES, the way HeborisCE counts item_t
   * (gamestart.c:7092-7100). 0 = not active.
   */
  bigPiecesRemaining: number;
  rollRollPiecesRemaining: number;
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
  /**
   * TetriNET specials.
   *
   * These existed in input/config.ts's KeyConfig but not here, so the
   * settings screen - which is typed against THIS interface - could not
   * offer them, and its binding wizard silently dropped them from saved
   * settings. Two names for one concept is how that happened.
   */
  useSpecialOn?: string[][];
  useSpecialSelf?: string[];
  useSpecialRandom?: string[];
  discardSpecial?: string[];
}

/**
 * HeborisCE's item_mode[player] (gamestart.c:6994), plus the door's four
 * selection presets from core/items.ts. 'OFF' (or absent) is the default:
 * a board's players do not get items until they ask for them.
 */
export type ItemMode = 'OFF' | 'TGM' | 'ALL' | 'FEW' | 'DS';

/**
 * HIDDEN - locked blocks vanish while staying solid.
 *
 * HeborisCE gives each locked cell a shadow timer of p_shadow_timer frames
 * (init.c:732 = 300) and counts it down once a frame; the hidden level picks
 * the rate: 1 normally, 2 at "UNDER M2" and 3 at "UNDER M3"
 * (gamestart.c:4794-4803), i.e. 300, 150 or 100 frames of visibility.
 */
export type HiddenMode = 'OFF' | 'SLOW' | 'FAST' | 'FASTEST';

export type { VersusWinType } from './versus-goal';
import type { VersusWinType } from './versus-goal';

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
  /**
   * TGM item pickups outside versus. Versus enables items itself
   * (gamestart.c:6994's `gameMode[player] == 4` half); this is the
   * `|| item_mode[player]` half, and it reaches every other mode.
   */
  itemMode?: ItemMode;
  /** HIDDEN: locked blocks vanish after their shadow timer runs out. */
  hiddenMode?: HiddenMode;
  /**
   * VS WIN TYPE (gamestart.c:12755-12765). 'survival' is what this door has
   * always played; 'level' and 'lines' are the reference's GOAL LV and GOAL
   * LINE, both measured against versusGoal. See core/versus-goal.ts.
   */
  versusWinType?: VersusWinType;
  /** vs_goal (init.c:115, default 200). GOAL LINE uses a tenth of it. */
  versusGoal?: number;

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
  | 'pause'
  // TetriNET specials. The reference client binds 1-6 to "use the first
  // special in your inventory on the player in that slot", Enter to self,
  // Tab to a random opponent and D to discard - the special is used on the
  // key press, there is no separate target-then-fire step.
  | 'use_special_1'
  | 'use_special_2'
  | 'use_special_3'
  | 'use_special_4'
  | 'use_special_5'
  | 'use_special_6'
  | 'use_special_self'
  | 'use_special_random'
  | 'discard_special';

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
  | 'M' | 'MK' | 'MV' | 'MO' | 'GM' | 'GMM'
  // The Devil/DOOM ladder's top rank (dgname[16], gamestart.c:609). Only
  // 'death' can award it - see core/devil-grade.ts.
  | 'GOD';

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

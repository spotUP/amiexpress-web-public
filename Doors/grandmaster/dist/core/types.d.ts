/**
 * Core types for GRANDMASTER
 */
export type PieceType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';
export interface Piece {
    type: PieceType;
    rotation: 0 | 1 | 2 | 3;
    x: number;
    y: number;
    invisible?: boolean;
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
export type RotationSystem = 'SRS' | 'ARS' | 'NRS' | 'BARS' | 'TI-ARS' | 'ACE-ARS' | 'TI-WORLD' | 'ACE-SRS' | 'DS-WORLD' | 'SRS-X';
export interface Cell {
    filled: boolean;
    color: PieceType | null;
    locked: boolean;
    lockTime?: number;
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
export type GameMode = 'marathon' | 'sprint' | 'dig' | 'ultra' | 'blitz' | 'combo' | 'survival' | 'classic' | 'master' | 'death' | 'zen' | 'zone' | 'training' | 'mission' | 'versus' | 'cpu_battle' | 'tetrinet' | 'tetris_attack';
export interface GameState {
    mode: GameMode;
    board: Board;
    currentPiece: Piece | null;
    holdPiece: PieceType | null;
    canHold: boolean;
    nextQueue: PieceType[];
    level: number;
    lines: number;
    score: number;
    grade: string;
    combo: number;
    backToBack: boolean;
    backToBackCount: number;
    piecesPlaced: number;
    ultraTimeRemaining: number;
    digLinesRemaining: number;
    zoneMeter: number;
    zoneActive: boolean;
    zoneTimeRemaining: number;
    zoneBufferedLines: number;
    lastMove: 'rotate' | 'move' | 'drop' | null;
    lastTSpin: 'none' | 'mini' | 'full' | null;
    tSpinFlag: 0 | 1 | 2;
    rotationCount: number;
    gmFlags: {
        flag1: boolean;
        flag2: boolean;
        flag3: boolean;
    };
    gravity: number;
    lockDelay: number;
    lockDelayRemaining: number;
    areRemaining: number;
    moveResetCount: number;
    rotationResetCount: number;
    floorKickCount: number;
    maxMoveResets: number;
    maxRotationResets: number;
    maxFloorKicks: number;
    lockResets: number;
    pendingIRS: number;
    pendingIHS: boolean;
    section: number;
    sectionTime: number;
    sectionLines: number;
    internalGrade: number;
    creditRollActive: boolean;
    creditRollTimeRemaining: number;
    creditRollStartTime: number | null;
    lastSectionResult?: 'COOL' | 'REGRET' | 'NORMAL';
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
    itemBanner: {
        name: string;
        ttl: number;
    } | null;
    /**
     * Pieces left under DEATH BLOCK (item 3) and ROLL ROLL (item 2). Both are
     * counted in PIECES, the way HeborisCE counts item_t
     * (gamestart.c:7092-7100). 0 = not active.
     */
    bigPiecesRemaining: number;
    rollRollPiecesRemaining: number;
    /**
     * Frame-timed item effects (HeborisCE item_timer, gamestart.c:13517-13563).
     * ROTATE LOCK stops rotation, HIDE NEXT blanks the preview, <->REV swaps
     * left and right, BOOST drops the piece at 20G. 0 = not active.
     */
    rotateLockFrames: number;
    hideNextFrames: number;
    /**
     * Rules a MISSION switched on for its whole run, as opposed to an item's
     * timed version of the same thing. HeborisCE's own missions do this too -
     * BIG, HIDE NEXT and ROLL ROLL are mission TYPES as well as items
     * (mission_info.c's name list).
     */
    missionModifiers?: {
        big?: boolean;
        hideNext?: boolean;
        rollRoll?: boolean;
    };
    lrReverseFrames: number;
    boostFrames: number;
}
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
    das: number;
    arr: number;
    softDropSpeed: number;
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
    blockGlow: boolean;
    glowIntensity: number;
    clearStyle: 'inward' | 'outward' | 'instant' | 'directional';
    clearDirection: 'in' | 'out';
    clearAnimationSpeed: number;
    placementEffects: boolean;
    floatTextMode: 'off' | 'offboard' | 'all';
    b2bGlowEnabled: boolean;
    connectedBlocks: boolean;
    animationIntensity: 'low' | 'normal' | 'high';
}
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
export interface AppState {
    currentMode: GameMode | null;
    playerName: string;
    settings: PlayerSettings;
    stats: PlayerStats;
}
export type GameAction = 'left' | 'right' | 'rotate_cw' | 'rotate_ccw' | 'rotate_180' | 'soft_drop' | 'hard_drop' | 'sonic_drop' | 'hold' | 'pause' | 'use_special_1' | 'use_special_2' | 'use_special_3' | 'use_special_4' | 'use_special_5' | 'use_special_6' | 'use_special_self' | 'use_special_random' | 'discard_special';
export interface InputState {
    heldKeys: Set<string>;
    dasTimer: number;
    arrTimer: number;
    lastAction: GameAction | null;
}
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
    finesseRate?: number;
    finesseErrors?: number;
}
export interface SpeedLevel {
    level: number;
    gravity: number;
    are: number;
    arelinelock: number;
    das: number;
    lockDelay: number;
}
export type TGMGrade = '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2' | '1' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9' | 'S10' | 'S11' | 'S12' | 'S13' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8' | 'm9' | 'M' | 'MK' | 'MV' | 'MO' | 'GM' | 'GMM' | 'GOD';
export interface GradeRequirement {
    grade: TGMGrade;
    internalGradeRequired: number;
    minLevel: number;
    decayRate: number;
}
export interface LockEffect {
    cells: {
        x: number;
        y: number;
        color: PieceType;
    }[];
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
export type KickTable = Array<[number, number]>;
export interface RotationData {
    shapes: number[][][];
    kicks: Record<string, KickTable>;
}
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
//# sourceMappingURL=types.d.ts.map
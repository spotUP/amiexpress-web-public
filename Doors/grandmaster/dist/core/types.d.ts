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
}
export type RotationSystem = 'SRS' | 'ARS' | 'NRS' | 'BARS';
export interface Cell {
    filled: boolean;
    color: PieceType | null;
    locked: boolean;
    lockTime?: number;
}
export interface Board {
    width: number;
    height: number;
    grid: Cell[][];
}
export type GameMode = 'marathon' | 'sprint' | 'dig' | 'ultra' | 'blitz' | 'combo' | 'survival' | 'classic' | 'master' | 'death' | 'zen' | 'training' | 'versus' | 'cpu_battle' | 'tetrinet';
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
}
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
export type GameAction = 'left' | 'right' | 'rotate_cw' | 'rotate_ccw' | 'rotate_180' | 'soft_drop' | 'hard_drop' | 'sonic_drop' | 'hold' | 'pause';
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
export type TGMGrade = '9' | '8' | '7' | '6' | '5' | '4' | '3' | '2' | '1' | 'S1' | 'S2' | 'S3' | 'S4' | 'S5' | 'S6' | 'S7' | 'S8' | 'S9' | 'S10' | 'S11' | 'S12' | 'S13' | 'm1' | 'm2' | 'm3' | 'm4' | 'm5' | 'm6' | 'm7' | 'm8' | 'm9' | 'M' | 'MK' | 'MV' | 'MO' | 'GM' | 'GMM';
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
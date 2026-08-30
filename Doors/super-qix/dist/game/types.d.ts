/**
 * Super Qix - Game Types
 * Shared interfaces for the 1987 Taito arcade game port
 */
export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameState = 'menu' | 'playing' | 'paused' | 'levelComplete' | 'gameover' | 'highscores' | 'enterName' | 'levelTransition';
export type CellState = 'unclaimed' | 'claimed' | 'border' | 'stix';
export type PowerUpType = 'speed' | 'shield' | 'freeze' | 'warp' | 'letter';
export interface Point {
    x: number;
    y: number;
}
export interface Marker {
    x: number;
    y: number;
    isDrawing: boolean;
    hasShield: boolean;
    speedBoost: boolean;
    speedBoostTimer: number;
}
export interface Qix {
    id: number;
    x: number;
    y: number;
    vx: number;
    vy: number;
    speed: number;
    segments: Point[];
    frozen: boolean;
    frozenTimer: number;
}
export interface Sparx {
    id: number;
    x: number;
    y: number;
    pathIndex: number;
    direction: 1 | -1;
    speed: number;
    isSuper: boolean;
    frozen: boolean;
    frozenTimer: number;
}
export interface Fuse {
    x: number;
    y: number;
    pathIndex: number;
    active: boolean;
    burnSpeed: number;
}
export interface PowerUp {
    id: number;
    type: PowerUpType;
    x: number;
    y: number;
    letter?: string;
    collected: boolean;
    spawnTime: number;
}
export interface ActiveEffect {
    type: PowerUpType;
    remainingTime: number;
}
export interface Stix {
    points: Point[];
    startTime: number;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    maxPercent: number;
    date: string;
}
export interface LevelConfig {
    number: number;
    qixCount: number;
    qixSpeed: number;
    sparxCount: number;
    sparxSpeed: number;
    superSparxTime: number;
    fuseSpeed: number;
    targetPercent: number;
    word: string;
    backgroundPattern: string;
}
export interface Region {
    points: Point[];
    area: number;
}
export interface ClaimResult {
    success: boolean;
    percent?: number;
    points?: number;
    splitBonus?: number;
    /** Cells the claim won, for the engine to paint in over time. */
    filled?: Point[];
}
export interface SuperQixData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    claimedPercent: number;
    targetPercent: number;
    scoreMultiplier: number;
    field: CellState[][];
    fieldWidth: number;
    fieldHeight: number;
    marker: Marker;
    currentStix: Stix | null;
    qixList: Qix[];
    sparxList: Sparx[];
    fuse: Fuse | null;
    qixIdCounter: number;
    sparxIdCounter: number;
    powerUps: PowerUp[];
    powerUpIdCounter: number;
    collectedLetters: string[];
    levelWord: string;
    activeEffects: ActiveEffect[];
    borderPath: Point[];
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    playerNameCursor: number;
    lastUpdateTime: number;
    frameCount: number;
    levelStartTime: number;
    stopTimer: number;
    transitionTimer: number;
    transitionMessage: string;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'z' | 'x' | 'space' | 'enter' | 'escape' | 'p' | 'q' | 'backspace' | 'tab' | string;
export type SoundEffect = 'drawStart' | 'drawComplete' | 'death' | 'powerUp' | 'fuse' | 'levelComplete' | 'gameOver' | 'menuSelect' | 'menuMove' | 'sparxMove' | 'qixBounce' | 'letterCollect';
export interface RPCMethods {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
        maxPercent: number;
    }) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
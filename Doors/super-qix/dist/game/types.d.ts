/**
 * Super Qix - Game Types
 * Shared interfaces for the 1987 Taito arcade game port
 */
/** The three skill levels the operator could set (FAQ 4). */
export type SkillLevel = 'easy' | 'medium' | 'hard';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameState = 'menu' | 'playing' | 'paused' | 'levelComplete' | 'gameover' | 'highscores' | 'enterName' | 'remapKeys' | 'levelTransition';
/**
 * Which key moves the marker which way.
 *
 * A value is whatever normalizeKey produces, so the four direction tokens
 * ('up'..'right') stand for the arrow keys and WASD together. Those always
 * work; the map is consulted on top of them, never instead.
 */
export interface KeyMap {
    up: string;
    down: string;
    left: string;
    right: string;
}
export type CellState = 'unclaimed' | 'claimed' | 'border' | 'stix';
export type PowerUpType = 'speed' | 'shield' | 'freeze' | 'warp' | 'letter' | 'oneUp';
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
    /** When this Skull last reversed, so it cannot flip twice in a row. */
    lastReversedAt: number;
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
/**
 * How a released bonus is travelling (FAQ 2.3).
 *
 * A Letter "drifts across the playing field in a straight line towards the
 * far wall, then moves back around the edges" - `cross` then `edge`. A
 * Power-up instead "begins following the nearest lines already laid down",
 * which is `seek` until it reaches one, then `edge`.
 */
export type PowerUpDrift = 'cross' | 'seek' | 'edge';
export interface PowerUp {
    id: number;
    type: PowerUpType;
    x: number;
    y: number;
    letter?: string;
    collected: boolean;
    spawnTime: number;
    /** How it is moving, once launched. */
    drift?: PowerUpDrift;
    /** Heading while crossing the field or seeking a line. */
    vx?: number;
    vy?: number;
    /** Where it is on the border path once it is walking a line. */
    pathIndex?: number;
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
    /** How long the border Time Meter takes to fill (FAQ 1). */
    timeMeterMs: number;
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
    /** Cells the claim won, for the engine to paint in over time. */
    filled?: Point[];
}
export interface SuperQixData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    /** Which lap of the 16 levels this is, counting from 1 (FAQ 3). */
    lap: number;
    /** The operator's skill setting (FAQ 4). */
    skill: SkillLevel;
    /** How many of this skill's bonus-life thresholds have been paid. */
    bonusLivesAwarded: number;
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
    /**
     * Every line the player has finished, in the order it was drawn.
     *
     * FAQ 2.2: the Skulls "can follow any line on the screen (including
     * internal lines which you can't travel on anymore)", so the patrol path
     * needs them even after a later claim buries them and the marker loses
     * access.
     */
    internalLines: Point[][];
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    playerNameCursor: number;
    lastUpdateTime: number;
    frameCount: number;
    levelStartTime: number;
    stopTimer: number;
    /**
     * How full the border Time Meter is, 0..1 (FAQ 1). At 1 two more
     * Skulls are released and it resets.
     */
    timeMeter: number;
    /**
     * How many Gremlins have been sealed into claimed ground this level.
     *
     * Paid at the end of the level, one CAPTURE_POINTS each. Reset by
     * initLevel, so it is what THIS level caught and not a running total.
     */
    gremlinsCaptured: number;
    /** The player's movement bindings, loaded from their saved settings. */
    keyMap: KeyMap;
    /** Which direction the remap screen is currently asking for, if it is open. */
    remapDirection: number;
    /** What the remap screen last refused, so it can say why. */
    remapMessage: string;
    /** An open Warp doorway, if one has been released (FAQ 2.3.1). */
    warp: {
        x: number;
        y: number;
        openedAt: number;
    } | null;
    /**
     * Until when the marker cannot lose another life.
     *
     * Set on death: the enemy that killed you is still standing on you the
     * next frame, and without a moment's grace every life goes at once.
     */
    invulnerableUntil: number;
    /** When the last rejoin multiplier was scored, for chaining (FAQ 2.4.1). */
    lastMultiplierAt: number;
    /** What that multiplier was: 1, then 20, then 30 while the chain holds. */
    lastMultiplier: number;
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
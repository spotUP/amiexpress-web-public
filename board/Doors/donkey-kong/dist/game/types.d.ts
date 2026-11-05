/**
 * Donkey Kong - Game Types
 * 1981 Nintendo arcade classic
 */
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'highscores' | 'enterName' | 'help' | 'stageComplete' | 'stageIntro';
export type Direction = 'left' | 'right';
export type StageType = 'barrels' | 'conveyors' | 'elevators' | 'rivets';
export type BarrelType = 'normal' | 'blue' | 'wild';
export interface Position {
    x: number;
    y: number;
}
export interface Velocity {
    vx: number;
    vy: number;
}
export interface Player extends Position, Velocity {
    direction: Direction;
    isJumping: boolean;
    isOnGround: boolean;
    isClimbing: boolean;
    climbFrame: number;
    walkFrame: number;
    hasHammer: boolean;
    hammerTimer: number;
    hammerFrame: number;
    isAlive: boolean;
    respawnTimer: number;
    invincibleTimer: number;
}
export interface Barrel extends Position, Velocity {
    id: number;
    type: BarrelType;
    isRolling: boolean;
    onLadder: boolean;
    direction: Direction;
    frame: number;
}
export interface FireBall extends Position, Velocity {
    id: number;
    direction: Direction;
    isClimbing: boolean;
    frame: number;
    aiTimer: number;
}
export interface Spring extends Position, Velocity {
    id: number;
    bouncePhase: number;
    frame: number;
}
export interface Girder {
    x: number;
    y: number;
    width: number;
    slope: number;
}
export interface Ladder {
    x: number;
    y: number;
    height: number;
    isBroken: boolean;
}
export interface Rivet {
    x: number;
    y: number;
    isRemoved: boolean;
}
export interface Hammer {
    x: number;
    y: number;
    isCollected: boolean;
}
export interface Elevator {
    x: number;
    y: number;
    direction: 'up' | 'down';
    height: number;
}
export interface Conveyor {
    x: number;
    y: number;
    width: number;
    direction: Direction;
}
export interface StageData {
    girders: Girder[];
    ladders: Ladder[];
    rivets: Rivet[];
    hammers: Hammer[];
    elevators: Elevator[];
    conveyors: Conveyor[];
    paulineX: number;
    paulineY: number;
    dkX: number;
    dkY: number;
    startX: number;
    startY: number;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface DonkeyKongData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    stage: StageType;
    stageIndex: number;
    player: Player;
    barrels: Barrel[];
    fireBalls: FireBall[];
    springs: Spring[];
    girders: Girder[];
    ladders: Ladder[];
    rivets: Rivet[];
    hammers: Hammer[];
    elevators: Elevator[];
    conveyors: Conveyor[];
    paulineX: number;
    paulineY: number;
    dkX: number;
    dkY: number;
    dkFrame: number;
    dkThrowTimer: number;
    barrelIdCounter: number;
    fireballIdCounter: number;
    springIdCounter: number;
    bonusTimer: number;
    jumpScore: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'jump' | 'enter' | 'escape' | 'backspace' | string;

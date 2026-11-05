/**
 * Joust - Game Types
 * 1982 Williams Electronics arcade jousting game
 */
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'highscores' | 'enterName' | 'help' | 'waveComplete';
export type Direction = 'left' | 'right';
export type MountType = 'ostrich' | 'stork' | 'buzzard';
export type EnemyType = 'bounder' | 'hunter' | 'shadowLord';
export type EggState = 'falling' | 'landed' | 'hatching' | 'hatched';
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
    mount: MountType;
    isFlapping: boolean;
    flapFrame: number;
    isWalking: boolean;
    walkFrame: number;
    isAlive: boolean;
    respawnTimer: number;
    invincibleTimer: number;
}
export interface Enemy extends Position, Velocity {
    id: number;
    type: EnemyType;
    direction: Direction;
    mount: MountType;
    isFlapping: boolean;
    flapFrame: number;
    state: 'flying' | 'landing' | 'walking' | 'dismounted' | 'dead';
    targetX: number;
    targetY: number;
    aiTimer: number;
}
export interface Egg extends Position, Velocity {
    id: number;
    state: EggState;
    timer: number;
    enemyType: EnemyType;
}
export interface Platform {
    x: number;
    y: number;
    width: number;
    type: 'solid' | 'floating';
}
export interface LavaPit {
    x: number;
    width: number;
}
export interface Pterodactyl extends Position, Velocity {
    isActive: boolean;
    targetPlayer: boolean;
    mouthOpen: boolean;
    mouthTimer: number;
}
export interface HighScore {
    name: string;
    score: number;
    wave: number;
    date: string;
}
export interface WaveConfig {
    bounders: number;
    hunters: number;
    shadowLords: number;
    eggHatchTime: number;
    enemySpeed: number;
    pterodactylTimer: number;
}
export interface JoustData {
    state: GameState;
    score: number;
    lives: number;
    wave: number;
    player: Player;
    enemies: Enemy[];
    eggs: Egg[];
    pterodactyl: Pterodactyl;
    platforms: Platform[];
    lavaPits: LavaPit[];
    enemyIdCounter: number;
    eggIdCounter: number;
    waveTimer: number;
    survivalBonus: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'flap' | 'enter' | 'escape' | 'backspace' | string;

/**
 * Bubble Bobble - Game Types
 * 1986 Taito arcade platformer
 */
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'highscores' | 'enterName' | 'help' | 'levelComplete' | 'levelIntro';
export type Direction = 'left' | 'right';
export type EnemyType = 'zenChan' | 'mighta' | 'monsta' | 'banebou' | 'pulpul' | 'drunk' | 'invader' | 'superDrunk';
export type ItemType = 'apple' | 'orange' | 'cherry' | 'grape' | 'watermelon' | 'diamond' | 'crown' | 'shoe' | 'candy' | 'umbrella' | 'ring' | 'cross' | 'bomb' | 'thunder' | 'fire' | 'water';
export type BubbleType = 'normal' | 'fire' | 'water' | 'thunder' | 'extend';
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
    isBubbling: boolean;
    bubbleFrame: number;
    walkFrame: number;
    invincibleTimer: number;
    isAlive: boolean;
    respawnTimer: number;
    hasShoes: boolean;
    hasCandy: boolean;
    rapidFire: boolean;
    bubbleRange: number;
}
export interface Enemy extends Position, Velocity {
    id: number;
    type: EnemyType;
    direction: Direction;
    state: 'normal' | 'bubbled' | 'angry' | 'dead';
    bubbleTimer: number;
    angerTimer: number;
    frame: number;
    aiTimer: number;
}
export interface Bubble extends Position, Velocity {
    id: number;
    type: BubbleType;
    state: 'shooting' | 'floating' | 'popping' | 'hasEnemy';
    trappedEnemy: Enemy | null;
    timer: number;
    frame: number;
}
export interface Item extends Position {
    id: number;
    type: ItemType;
    timer: number;
    isFalling: boolean;
    vy: number;
}
export interface Platform {
    x: number;
    y: number;
    width: number;
    passThrough: boolean;
}
export interface LevelData {
    platforms: Platform[];
    enemySpawns: {
        type: EnemyType;
        x: number;
        y: number;
    }[];
    walls: {
        x: number;
        y: number;
    }[];
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface BubbleBobbleData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    player: Player;
    enemies: Enemy[];
    bubbles: Bubble[];
    items: Item[];
    platforms: Platform[];
    walls: {
        x: number;
        y: number;
    }[];
    enemyIdCounter: number;
    bubbleIdCounter: number;
    itemIdCounter: number;
    levelTimer: number;
    hurryUpTimer: number;
    isHurryUp: boolean;
    extendLetters: boolean[];
    comboCount: number;
    lastPopTime: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'jump' | 'bubble' | 'enter' | 'escape' | 'backspace' | string;

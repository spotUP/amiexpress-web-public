/**
 * Zoo Keeper - Game Types
 * Shared interfaces for the 1982 Taito arcade game port
 */
export type Direction = 'up' | 'down' | 'left' | 'right';
export type GameState = 'menu' | 'playing' | 'platform' | 'stampede' | 'paused' | 'gameover' | 'highscores' | 'enterName' | 'levelComplete' | 'stageTransition';
export type AnimalType = 'elephant' | 'snake' | 'camel' | 'rhino' | 'moose' | 'lion';
export type BonusItemType = 'rootbeer' | 'clover' | 'watermelon' | 'sundae' | 'strawberry' | 'trophy' | 'money' | 'net';
export interface Position {
    x: number;
    y: number;
}
export interface Zeke {
    x: number;
    y: number;
    direction: Direction;
    hasNet: boolean;
    netTimer: number;
    isJumping: boolean;
    jumpFrame: number;
    isDead: boolean;
    deathFrame: number;
}
export interface Animal {
    id: number;
    type: AnimalType;
    x: number;
    y: number;
    dx: number;
    dy: number;
    escaped: boolean;
    targetWallX: number;
    targetWallY: number;
    attackTimer: number;
}
export interface BonusItem {
    type: BonusItemType;
    x: number;
    y: number;
    collected: boolean;
    fusePosition: number;
}
export interface Platform {
    x: number;
    y: number;
    width: number;
    dx: number;
    minX: number;
    maxX: number;
}
export interface Coconut {
    x: number;
    y: number;
    dx: number;
    dy: number;
    bounceCount: number;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface WallSegment {
    thickness: number;
}
export interface ZooStageData {
    wall: WallSegment[][];
    animals: Animal[];
    bonusItems: BonusItem[];
    timer: number;
    fusePosition: number;
    animalIdCounter: number;
}
export interface PlatformStageData {
    platforms: Platform[];
    coconuts: Coconut[];
    zelda: Position;
    monkey: Position;
    monkeyThrowTimer: number;
    zekelY: number;
    zekelPlatformIndex: number;
}
export interface StampedeStageData {
    escalatorSpeed: number;
    chargingAnimals: Animal[];
    zekelY: number;
    jumpedAnimals: number;
}
export interface ZooKeeperData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    round: number;
    zeke: Zeke;
    zooStage: ZooStageData;
    platformStage: PlatformStageData;
    stampedeStage: StampedeStageData;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    playerNameCursor: number;
    lastUpdateTime: number;
    frameCount: number;
    transitionTimer: number;
    transitionMessage: string;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'space' | 'enter' | 'escape' | 'p' | 'q' | 'backspace' | 'tab' | string;
export interface LevelConfig {
    animalTypes: AnimalType[];
    animalCount: number;
    animalSpeedMultiplier: number;
    wallStartingThickness: number;
    timerDuration: number;
    bonusItemCount: number;
}
export type SoundEffect = 'jump' | 'capture' | 'death' | 'wallBreak' | 'bonusCollect' | 'netCollect' | 'levelComplete' | 'gameOver' | 'menuSelect' | 'menuMove' | 'animalEscape' | 'coconutBounce' | 'platformLand';
export interface RPCMethods {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
    }) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
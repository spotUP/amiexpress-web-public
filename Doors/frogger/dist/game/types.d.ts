/**
 * Frogger - Game Types
 * 1981 Konami arcade game port
 */
export type GameState = "menu" | "playing" | "dying" | "levelComplete" | "gameover" | "highscores" | "enterName" | "paused";
export type Direction = "up" | "down" | "left" | "right";
export type LaneType = "safe" | "road" | "water" | "home";
export type VehicleType = "car" | "truck" | "racecar";
export type RiverObjectType = "log" | "turtle" | "alligator" | "snake";
export interface Position {
    x: number;
    y: number;
}
export interface Frog {
    x: number;
    y: number;
    direction: Direction;
    isJumping: boolean;
    jumpProgress: number;
    isDead: boolean;
    deathType: "car" | "water" | "timeout" | "edge" | null;
    deathFrame: number;
    onObject: RiverObject | null;
}
export interface Vehicle {
    id: number;
    type: VehicleType;
    x: number;
    y: number;
    lane: number;
    width: number;
    speed: number;
}
export interface RiverObject {
    id: number;
    type: RiverObjectType;
    x: number;
    y: number;
    lane: number;
    width: number;
    speed: number;
    isDiving?: boolean;
    diveTimer?: number;
}
export interface HomeSlot {
    x: number;
    occupied: boolean;
    hasFly: boolean;
    hasAlligator: boolean;
}
export interface Lane {
    type: LaneType;
    y: number;
    objects: (Vehicle | RiverObject)[];
    direction: 1 | -1;
    speed: number;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface FroggerData {
    state: GameState;
    score: number;
    lives: number;
    level: number;
    timeRemaining: number;
    frog: Frog;
    lanes: Lane[];
    homes: HomeSlot[];
    homesCompleted: number;
    vehicleIdCounter: number;
    riverObjectIdCounter: number;
    flyTimer: number;
    alligatorTimer: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = "up" | "down" | "left" | "right" | "space" | "enter" | "escape" | "p" | "q" | "backspace" | string;
export interface LevelConfig {
    vehicleSpeed: number;
    riverSpeed: number;
    turtleDiveFrequency: number;
    timeLimit: number;
    flySpawnChance: number;
    alligatorChance: number;
}
export type SoundEffect = "hop" | "splash" | "squash" | "home" | "levelComplete" | "timeWarning" | "gameOver" | "bonusFly" | "extraLife";
export interface RPCMethods {
    getHighscores: () => Promise<HighScore[]>;
    saveHighscore: (params: {
        name: string;
        score: number;
        level: number;
    }) => Promise<void>;
}
//# sourceMappingURL=types.d.ts.map
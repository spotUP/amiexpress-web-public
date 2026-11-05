/**
 * Pipe Dream - Game Types
 * 1989 LucasArts puzzle game
 */
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'highscores' | 'enterName' | 'help' | 'levelComplete';
export type Direction = 'up' | 'down' | 'left' | 'right';
export type PipeType = 'vertical' | 'horizontal' | 'cornerNE' | 'cornerNW' | 'cornerSE' | 'cornerSW' | 'cross' | 'start' | 'end' | 'reservoir' | 'oneWay';
export interface PipeConnections {
    up: boolean;
    down: boolean;
    left: boolean;
    right: boolean;
}
export interface Position {
    x: number;
    y: number;
}
export interface Cell {
    pipe: PipeType | null;
    fillLevel: number;
    isObstacle: boolean;
    isStart: boolean;
    startDirection: Direction | null;
}
export interface Cursor extends Position {
}
export interface FlowState {
    x: number;
    y: number;
    direction: Direction;
    progress: number;
}
export interface LevelConfig {
    gridWidth: number;
    gridHeight: number;
    flowSpeed: number;
    flowDelay: number;
    requiredPipes: number;
    obstacleCount: number;
    hasReservoirs: boolean;
    hasCross: boolean;
    hasOneWay: boolean;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface PipeDreamData {
    state: GameState;
    score: number;
    level: number;
    pipesUsed: number;
    grid: Cell[][];
    cursor: Cursor;
    pipeQueue: PipeType[];
    queueSize: number;
    flowState: FlowState | null;
    flowStarted: boolean;
    flowTimer: number;
    flowDelay: number;
    startX: number;
    startY: number;
    startDirection: Direction;
    endX: number;
    endY: number;
    hasEnd: boolean;
    reachedEnd: boolean;
    requiredPipes: number;
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'place' | 'discard' | 'enter' | 'escape' | 'backspace' | string;

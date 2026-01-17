/**
 * Puzzle Bobble (Bust-A-Move) - Game Types
 * 1994 Taito bubble-matching puzzle game
 */
export type GameState = 'menu' | 'playing' | 'paused' | 'gameover' | 'highscores' | 'enterName' | 'help' | 'levelComplete';
export type BubbleColor = 'red' | 'blue' | 'green' | 'yellow' | 'purple' | 'orange' | 'gray' | 'special';
export interface Position {
    x: number;
    y: number;
}
export interface Velocity {
    vx: number;
    vy: number;
}
export interface GridBubble extends Position {
    color: BubbleColor;
    isPopping: boolean;
    popFrame: number;
    isFalling: boolean;
    fallVy: number;
}
export interface ShootingBubble extends Position, Velocity {
    color: BubbleColor;
    isActive: boolean;
}
export interface Shooter {
    x: number;
    y: number;
    angle: number;
    currentBubble: BubbleColor;
    nextBubble: BubbleColor;
}
export interface LevelConfig {
    gridRows: number;
    colorsUsed: number;
    ceilingDropInterval: number;
    ceilingDropAmount: number;
    hasSpecialBubbles: boolean;
}
export interface HighScore {
    name: string;
    score: number;
    level: number;
    date: string;
}
export interface PuzzleBobbleData {
    state: GameState;
    score: number;
    level: number;
    bubblesCleared: number;
    grid: (GridBubble | null)[][];
    gridOffset: number;
    gridWidth: number;
    gridHeight: number;
    shooter: Shooter;
    shootingBubble: ShootingBubble | null;
    ceilingTimer: number;
    ceilingInterval: number;
    combo: number;
    lastMatchTime: number;
    colorsInPlay: BubbleColor[];
    highscores: HighScore[];
    menuSelection: number;
    playerName: string;
    lastUpdateTime: number;
    frameCount: number;
}
export type InputKey = 'up' | 'down' | 'left' | 'right' | 'shoot' | 'enter' | 'escape' | 'backspace' | string;

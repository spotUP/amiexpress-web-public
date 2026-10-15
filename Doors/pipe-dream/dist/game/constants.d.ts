/**
 * Pipe Dream - Game Constants
 */
import { LevelConfig, HighScore, PipeType, PipeConnections, Direction } from './types';
export declare const SCREEN_WIDTH = 80;
export declare const SCREEN_HEIGHT = 24;
export declare const GRID_WIDTH = 10;
export declare const GRID_HEIGHT = 7;
export declare const GAME_TICK_MS = 100;
export declare const QUEUE_SIZE = 5;
export declare const BASE_FLOW_DELAY = 50;
export declare const BASE_FLOW_SPEED = 5;
export declare const SCORES: {
    pipeUsed: number;
    pipeFilled: number;
    crossFilled: number;
    reservoirFilled: number;
    reachedEnd: number;
    levelBonus: number;
    unusedQueue: number;
};
export declare const PIPE_CONNECTIONS: Record<PipeType, PipeConnections>;
export declare const PIPE_SPRITES: Record<PipeType, string[]>;
export declare const PIPE_CHARS: Record<PipeType, string>;
export declare const OPPOSITE: Record<Direction, Direction>;
export declare const DIRECTION_VECTORS: Record<Direction, {
    dx: number;
    dy: number;
}>;
export declare const BASIC_PIPES: PipeType[];
export declare const LEVEL_CONFIGS: LevelConfig[];
export declare function getLevelConfig(level: number): LevelConfig;
export declare function getPipesForLevel(level: number): PipeType[];
export declare const MENU_OPTIONS: string[];
export declare const DEFAULT_HIGHSCORES: HighScore[];

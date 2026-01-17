/**
 * Pipe Dream - Game Engine
 * 1989 LucasArts puzzle game
 */
import { PipeDreamData, Direction } from './types';
export declare class PipeDreamGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onLevelComplete;
    constructor(data: PipeDreamData, renderCallback: (content: string) => void, onGameOver: () => void, onLevelComplete: () => void);
    initLevel(): void;
    private getRandomPipe;
    update(): void;
    private startFlow;
    private updateFlow;
    private getNextCell;
    private getPipeConnections;
    private getExitDirection;
    private endGame;
    handleMove(direction: Direction): void;
    handlePlace(): void;
    handleDiscard(): void;
    render(): void;
}

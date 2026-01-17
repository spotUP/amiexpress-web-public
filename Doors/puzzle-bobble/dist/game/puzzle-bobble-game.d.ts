/**
 * Puzzle Bobble (Bust-A-Move) - Game Engine
 * 1994 Taito bubble-matching puzzle game
 */
import { PuzzleBobbleData } from './types';
export declare class PuzzleBobbleGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onLevelComplete;
    constructor(data: PuzzleBobbleData, renderCallback: (content: string) => void, onGameOver: () => void, onLevelComplete: () => void);
    initLevel(): void;
    private getRandomColor;
    private getColorsOnGrid;
    update(): void;
    private updateShootingBubble;
    private checkBubbleCollision;
    private findPlacementSpot;
    private getNeighborPositions;
    private placeBubble;
    private findMatches;
    private dropDisconnectedBubbles;
    private updateBubbleAnimations;
    private dropCeiling;
    private isGridEmpty;
    private checkGameOver;
    handleAim(direction: 'left' | 'right'): void;
    handleShoot(): void;
    render(): void;
    private getAngleIndicator;
}

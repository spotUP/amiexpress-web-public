/**
 * Puzzle Bobble (Bust-A-Move) - Game Engine
 * 1994 Taito bubble-matching puzzle game
 */
import { PuzzleBobbleData } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class PuzzleBobbleGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onLevelComplete;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
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

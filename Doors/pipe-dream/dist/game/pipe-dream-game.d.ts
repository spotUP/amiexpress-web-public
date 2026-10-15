/**
 * Pipe Dream - Game Engine
 * 1989 LucasArts puzzle game
 */
import { PipeDreamData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class PipeDreamGame {
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

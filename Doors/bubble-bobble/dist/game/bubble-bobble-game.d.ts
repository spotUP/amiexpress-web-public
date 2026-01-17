/**
 * Bubble Bobble - Game Engine
 * 1986 Taito arcade platformer
 */
import { BubbleBobbleData, Direction } from './types';
export declare class BubbleBobbleGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onLevelComplete;
    constructor(data: BubbleBobbleData, renderCallback: (content: string) => void, onGameOver: () => void, onLevelComplete: () => void);
    initLevel(): void;
    private spawnEnemy;
    update(): void;
    private updatePlayer;
    private handlePlatformCollision;
    private updateEnemies;
    private updateEnemyAI;
    private makeEnemiesAngry;
    private updateBubbles;
    private checkBubbleEnemyCollision;
    private updateItems;
    private checkCollisions;
    private popEnemyBubble;
    private spawnItem;
    private collectItem;
    private killPlayer;
    handleMove(direction: Direction): void;
    handleJump(): void;
    handleBubble(): void;
    render(): void;
}

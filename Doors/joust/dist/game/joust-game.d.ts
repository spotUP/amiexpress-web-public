/**
 * Joust - Game Engine
 * 1982 Williams Electronics arcade jousting game
 */
import { JoustData, Direction } from './types';
export declare class JoustGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onWaveComplete;
    constructor(data: JoustData, renderCallback: (content: string) => void, onGameOver: () => void, onWaveComplete: () => void);
    initWave(): void;
    private spawnEnemy;
    update(): void;
    private updatePlayer;
    private updateEnemies;
    private updateEnemyAI;
    private updateEggs;
    private checkEggLanding;
    private hatchEgg;
    private updatePterodactyl;
    private isOnPlatform;
    private handlePlatformCollision;
    private checkCollisions;
    private defeatEnemy;
    private killPlayer;
    handleFlap(): void;
    handleDirection(direction: Direction): void;
    render(): void;
}

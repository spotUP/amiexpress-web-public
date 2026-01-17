/**
 * Donkey Kong - Game Engine
 * 1981 Nintendo arcade classic
 */
import { DonkeyKongData, Direction } from './types';
export declare class DonkeyKongGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onStageComplete;
    constructor(data: DonkeyKongData, renderCallback: (content: string) => void, onGameOver: () => void, onStageComplete: () => void);
    initStage(): void;
    update(): void;
    private updateDK;
    private spawnBarrel;
    private spawnFireball;
    private updatePlayer;
    private handleGirderCollision;
    private isOnLadder;
    private updateBarrels;
    private checkBarrelOnLadder;
    private updateFireballs;
    private updateElevators;
    private checkCollisions;
    private checkStageComplete;
    private killPlayer;
    handleMove(direction: Direction): void;
    handleClimb(direction: 'up' | 'down'): void;
    handleJump(): void;
    render(): void;
}

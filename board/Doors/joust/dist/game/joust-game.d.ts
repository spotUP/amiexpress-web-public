/**
 * Joust - Game Engine
 * 1982 Williams Electronics arcade jousting game
 */
import { JoustData, Direction } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class JoustGame {
    private data;
    private renderCallback;
    private onGameOver;
    private onWaveComplete;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
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
    /**
     * Public because the door's own tests drive it, the way Frogger's do: a
     * collision is a step a test needs to take on its own without letting a
     * whole update() move everything it just placed.
     */
    checkCollisions(): void;
    private defeatEnemy;
    private killPlayer;
    handleFlap(): void;
    handleDirection(direction: Direction): void;
    render(): void;
}

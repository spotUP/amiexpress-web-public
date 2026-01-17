/**
 * Galaga - Game Engine
 * Core game logic for the 1981 Namco space shooter
 */
import { GalagaData } from './types';
export declare class GalagaGame {
    private data;
    private renderCallback;
    private lastDiveTime;
    private heldKeys;
    constructor(data: GalagaData, onRender: (content: string) => void);
    /**
     * Initialize a new stage
     */
    initStage(): void;
    /**
     * Spawn aliens into formation
     */
    private spawnFormation;
    /**
     * Initialize star field
     */
    private initStars;
    /**
     * Handle key down
     */
    handleKeyDown(key: string): void;
    /**
     * Handle key up
     */
    handleKeyUp(key: string): void;
    /**
     * Shoot bullet
     */
    private shoot;
    /**
     * Main game update
     */
    update(): void;
    /**
     * Update star field
     */
    private updateStars;
    /**
     * Update formation position (sway)
     */
    private updateFormation;
    /**
     * Update all aliens
     */
    private updateAliens;
    /**
     * Update bullets
     */
    private updateBullets;
    /**
     * Update explosions
     */
    private updateExplosions;
    /**
     * Trigger alien dive attacks
     */
    private triggerDives;
    /**
     * Start an alien diving
     */
    private startDive;
    /**
     * Check all collisions
     */
    private checkCollisions;
    /**
     * Kill an alien
     */
    private killAlien;
    /**
     * Kill player
     */
    private killPlayer;
    /**
     * Respawn player
     */
    private respawnPlayer;
    /**
     * Check if stage is complete
     */
    private checkStageComplete;
    /**
     * Render the game
     */
    render(): void;
}
//# sourceMappingURL=galaga-game.d.ts.map
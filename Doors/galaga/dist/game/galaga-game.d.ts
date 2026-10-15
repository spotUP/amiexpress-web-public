/**
 * Galaga - Game Engine
 * Core game logic for the 1981 Namco space shooter
 */
import { GalagaData } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
export declare class GalagaGame {
    private data;
    private renderCallback;
    private lastDiveTime;
    private heldKeys;
    /**
     * What just happened, for whoever is listening.
     *
     * The game names the moment; the door decides whether anybody hears it.
     * Nothing in here touches a socket, so the sound design is assertable in
     * a test with no audio anywhere near it.
     */
    readonly cues: SfxCues;
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
    /**
     * Public because the door's own tests drive it, the way Frogger's do: a
     * collision is a step a test needs to take on its own without letting a
     * whole update() move everything it just placed.
     */
    checkCollisions(): void;
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
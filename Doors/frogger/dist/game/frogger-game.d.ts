/**
 * Frogger - Game Engine
 * Core game logic for the 1981 Konami arcade classic
 */
import { FroggerData, Direction } from './types';
export declare class FroggerGame {
    private data;
    private renderCallback;
    private lastSpawnTime;
    constructor(data: FroggerData, onRender: (content: string) => void);
    /**
     * Initialize a new level
     */
    initLevel(): void;
    /**
     * Spawn initial vehicles and river objects
     */
    private spawnInitialObjects;
    /**
     * Spawn a vehicle in a lane
     */
    private spawnVehicle;
    /**
     * Spawn a river object in a lane
     */
    private spawnRiverObject;
    /**
     * Handle direction input
     */
    handleDirection(direction: Direction): void;
    /**
     * Main game update
     */
    update(): void;
    /**
     * Update all moving objects
     */
    private updateObjects;
    /**
     * Update frog position when riding an object
     */
    private updateFrogOnObject;
    /**
     * Check all collisions
     */
    private checkCollisions;
    /**
     * Check if frog collides with an object
     */
    private isColliding;
    /**
     * Check if frog reached a home slot
     */
    private checkHomeArrival;
    /**
     * Kill the frog
     */
    private killFrog;
    /**
     * Respawn frog after death
     */
    private respawnFrog;
    /**
     * Reset frog to starting position
     */
    private resetFrogPosition;
    /**
     * Render the game
     */
    render(): void;
}
//# sourceMappingURL=frogger-game.d.ts.map
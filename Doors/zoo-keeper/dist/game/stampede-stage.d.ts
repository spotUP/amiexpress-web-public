/**
 * Zoo Keeper - Stampede Stage Logic
 * Jump over charging animals on escalators to reach the top for an extra life
 */
import { ZooKeeperData, Direction } from './types';
type RenderCallback = (content: string) => void;
/**
 * Stampede Stage Game Engine
 */
export declare class StampedeStageGame {
    private data;
    private renderCallback;
    private waveTimer;
    private animalIdCounter;
    constructor(data: ZooKeeperData, renderCallback: RenderCallback);
    /**
     * Initialize stampede stage
     */
    init(): void;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Spawn a wave of charging animals
     */
    private spawnWave;
    /**
     * Update charging animals
     */
    private updateAnimals;
    /**
     * Check collisions with animals
     */
    private checkCollisions;
    /**
     * Zeke hit by charging animal
     */
    private hitByAnimal;
    /**
     * Handle direction input (limited in stampede)
     */
    handleDirection(dir: Direction): void;
    /**
     * Handle jump input
     */
    handleJump(): void;
    /**
     * Update jump animation
     */
    private updateJump;
    /**
     * Stage complete - reached top
     */
    private stageComplete;
    /**
     * Render the stampede stage
     */
    render(): void;
}
export {};
//# sourceMappingURL=stampede-stage.d.ts.map
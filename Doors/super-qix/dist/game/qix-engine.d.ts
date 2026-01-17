/**
 * Super Qix - Core Game Engine
 * Main game logic and state management
 */
import { SuperQixData, Direction } from './types';
type RenderCallback = (content: string) => void;
/**
 * Main game engine for Super Qix
 */
export declare class QixEngine {
    private data;
    private renderCallback;
    private drawingSystem;
    private enemySystem;
    private powerUpSystem;
    private lastMoveTime;
    constructor(data: SuperQixData, renderCallback: RenderCallback);
    /**
     * Initialize a new level
     */
    initLevel(levelNum: number): void;
    /**
     * Create initial field with borders
     */
    private createField;
    /**
     * Create border path for Sparx patrol
     */
    private createBorderPath;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Handle direction input
     */
    handleDirection(dir: Direction): void;
    /**
     * Start drawing (slow)
     */
    handleSlowDraw(): void;
    /**
     * Start drawing (fast)
     */
    handleFastDraw(): void;
    /**
     * Start drawing in the current direction
     */
    private startDrawing;
    /**
     * Stop drawing (release key)
     */
    handleStopDraw(): void;
    /**
     * Update border path to include claimed area edges
     */
    private updateBorderPath;
    /**
     * Check all collisions
     */
    private checkCollisions;
    /**
     * Handle player death
     */
    private handleDeath;
    /**
     * Check if word is complete
     */
    private checkWordComplete;
    /**
     * Level complete
     */
    private levelComplete;
    /**
     * Advance to next level
     */
    advanceLevel(): void;
    /**
     * Main render function
     */
    render(): void;
}
export {};
//# sourceMappingURL=qix-engine.d.ts.map
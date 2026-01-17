/**
 * Super Qix - Enemy System
 * Handles Qix, Sparx, and Fuse behavior
 */
import { SuperQixData, Point, LevelConfig } from './types';
/**
 * Enemy system managing Qix, Sparx, and Fuse
 */
export declare class EnemySystem {
    private data;
    constructor(data: SuperQixData);
    /**
     * Initialize enemies for a level
     */
    initLevel(config: LevelConfig): void;
    /**
     * Create a new Qix
     */
    private createQix;
    /**
     * Create a new Sparx
     */
    private createSparx;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Get current level config
     */
    private getLevelConfig;
    /**
     * Update a single Qix
     */
    private updateQix;
    /**
     * Update a single Sparx
     */
    private updateSparx;
    /**
     * Update fuse (burns along stix when player stops)
     */
    updateFuse(stixPoints: Point[]): void;
    /**
     * Check Qix collision with marker or stix
     */
    checkQixCollision(marker: Point, stix: Point[]): boolean;
    /**
     * Check Sparx collision with marker
     */
    checkSparxCollision(marker: Point): boolean;
    /**
     * Check Fuse collision with marker
     */
    checkFuseCollision(marker: Point): boolean;
    /**
     * Freeze all enemies
     */
    freezeEnemies(duration: number): void;
    /**
     * Reset fuse (when player starts moving again)
     */
    resetFuse(): void;
}
//# sourceMappingURL=enemies.d.ts.map
/**
 * Super Qix - Power-Up System
 * Handles power-up spawning, effects, and letter collection
 */
import { SuperQixData, Marker } from './types';
/**
 * Power-up system for spawning and managing power-ups
 */
export declare class PowerUpSystem {
    private data;
    constructor(data: SuperQixData);
    /**
     * Try to spawn a power-up after claiming area
     */
    trySpawnPowerUp(): void;
    /**
     * Find a valid position to spawn a power-up
     */
    private findSpawnPosition;
    /**
     * Select a random power-up type
     */
    private selectPowerUpType;
    /**
     * Get the next letter needed to complete the word
     */
    private getNextNeededLetter;
    /**
     * Check if marker collects any power-ups
     */
    checkCollection(marker: Marker): void;
    /**
     * Collect a power-up and apply its effect
     */
    private collectPowerUp;
    /**
     * Apply speed boost effect
     */
    private applySpeedBoost;
    /**
     * Apply freeze effect to all enemies
     */
    private applyFreeze;
    /**
     * Check if the level word is complete
     */
    private isWordComplete;
    /**
     * Update active effects (tick down timers)
     */
    updateEffects(): void;
    /**
     * Get display string for collected letters
     */
    getLetterDisplay(): string;
    /**
     * Get active effects for HUD display
     */
    getActiveEffectsDisplay(): string[];
}
//# sourceMappingURL=powerups.d.ts.map
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
     * Take a letter.
     *
     * FAQ 2.3: "Collecting the Letters needed to spell the level's name will
     * not give you any points until you complete the level ... Getting Letters
     * you already have or which are not part of the current word give you an
     * instant 500 points."
     */
    private collectLetter;
    /**
     * Drop whatever power-up is running, because a new one has been taken.
     * Hurry is the exception: only the most recent is cancelled, so a stack of
     * them keeps some of its benefit.
     */
    private clearActivePowerUps;
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
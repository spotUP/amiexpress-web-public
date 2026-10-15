/**
 * Super Qix - Power-Up System
 * Handles power-up spawning, effects, and letter collection
 */
import { SuperQixData, PowerUp, Marker, Point } from './types';
import { SfxCues } from '@amiexpress/bbs-door-sdk/engines/ui/arcade';
/**
 * Power-up system for spawning and managing power-ups
 */
export declare class PowerUpSystem {
    /**
     * What just happened here, drained by QixEngine each tick.
     *
     * The engine owns the one queue the door reads, so this system keeps its
     * own and hands it over rather than reaching for a socket it cannot see.
     */
    readonly cues: SfxCues;
    private data;
    constructor(data: SuperQixData);
    /**
     * Try to spawn a power-up after claiming area
     */
    /**
     * @param filled the cells the claim just took, if any. FAQ 2.3 releases a
     *   bonus from the area you have just filled, so that is where it starts.
     */
    trySpawnPowerUp(filled?: Point[]): void;
    /**
     * Send a freshly released bonus on its way (FAQ 2.3).
     *
     * "When created, Letters will tend to drift across the playing field in a
     * straight line towards the far wall, then move back around the edges. In
     * contrast, Power-ups will begin following the nearest lines ('stix')
     * already laid down". Both used to be dropped where they spawned and sit
     * there until they expired, which made catching one a matter of walking
     * to it rather than heading it off.
     */
    launch(powerUp: PowerUp): void;
    /** A unit heading towards whichever wall is farthest away. */
    private farthestWall;
    /** A unit heading towards the closest line the bonus could follow. */
    private nearestLine;
    /**
     * Move every uncollected bonus one tick (FAQ 2.3).
     *
     * A Letter crosses the field until it meets a line, a Power-up makes
     * straight for the nearest one, and both then walk the lines - "but like
     * the Skulls, can sometimes get lost following internal lines which you
     * can't reach anymore", which falls out of following the same path the
     * Skulls patrol.
     */
    updateMovement(): void;
    /**
     * Turn a flying letter away from whatever it just met.
     *
     * Each axis is tried on its own, so a letter meeting a wall head-on
     * reverses and one meeting a corner reverses both - the same reflection
     * the Gremlin uses.
     */
    private bounce;
    /**
     * Take every bonus standing on ground the player has just claimed.
     *
     * FAQ 5.2's whole strategy is boxing letters in rather than chasing them
     * down: "you can sometimes zip out into the field and quickly catch them
     * before they get too far" is the alternative, not the only way.
     */
    collectEnclosed(cells: Point[]): void;
    /** Anchor a bonus to the line network at the closest point on it. */
    private joinEdge;
    /** One step along the lines. */
    private walkEdge;
    /**
     * Find a valid position to spawn a power-up
     */
    /**
     * Where a released bonus starts.
     *
     * FAQ 2.3: "Every time you fill an area of the picture (no matter how
     * small), there's a chance a random Letter or heart-shaped Power-up will
     * be released" - so it is released from the ground just filled.
     *
     * This used to scan the whole board for a claimed cell touching open
     * field, and only between x,y of 2 and FIELD-2. A claim hugging an edge -
     * which is what almost every claim is, and what FAQ 5.2's strategy is
     * built on - lands on the row that scan excludes, so it found nothing and
     * no bonus was ever released. Nobody had seen a letter.
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
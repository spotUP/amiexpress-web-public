/**
 * Super Qix - Enemy System
 * Handles Qix, Sparx, and Fuse behavior
 */
import { SuperQixData, Sparx, Point, LevelConfig } from './types';
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
    /**
     * Create a Skull.
     *
     * FAQ 2.2: "Two of these start directly opposite you at the beginning of
     * each level, and move in opposite directions around the edge of the
     * screen." Opposite means half a lap round the border path from the
     * marker, and the pair then walks away from each other.
     */
    private createSparx;
    /**
     * The point on the border path directly opposite the marker - half a lap
     * away, so a Skull released there is as far from the player as the path
     * allows.
     */
    private oppositeMarkerIndex;
    /**
     * Release more Skulls onto the field.
     *
     * FAQ 1: when the Time Meter fills, "two more Skulls are released onto the
     * field and the counter resets"; FAQ 2.2 says they come from the
     * centre-top. They join the ones already patrolling.
     */
    releaseSkulls(count: number, speedMult?: number): void;
    /**
     * Cull the Skulls back to the two a level starts with.
     *
     * FAQ 2.2: "If you should die, all but two Skulls will disappear."
     */
    cullSkullsAfterDeath(): void;
    /**
     * Main update loop
     */
    update(): void;
    /**
     * Get current level config
     */
    private getLevelConfig;
    /**
     * Nearest unclaimed cell to a point, searched outwards in rings.
     *
     * Used to free a Qix that ended up inside claimed ground - which happens
     * when a completed stix converts the cells it is standing on.
     */
    private findNearestOpenCell;
    /**
     * Is this position off limits to a Qix?
     *
     * The Qix roams the unclaimed interior only. The playable range is the
     * non-border cells, x in [1, FIELD_WIDTH-2] and y in [1, FIELD_HEIGHT-2] -
     * the SAME range the movement code keeps it inside, so the bounce test and
     * the bounds can never disagree.
     *
     * A stix is deliberately not blocking: running over the player's line is
     * how the Qix kills, and checkQixCollision handles that.
     */
    private isBlockedForQix;
    /**
     * Update a single Qix
     *
     * Previously the Qix glued itself to the edge of the playfield and stopped
     * moving: the bounce test fired at FIELD_HEIGHT-1 (the border row) but the
     * position was then clamped to FIELD_HEIGHT-2, so in the gap between the
     * two the Qix was pushed back every tick without its velocity ever being
     * reversed. vy stayed at full speed into the wall forever, the random
     * per-bounce jitter shook the other axis down to nothing, and it parked on
     * the bottom row - measured at 98% of ticks against a wall, moving on only
     * 2% of them, visiting 13 of 576 cells. That is also why it killed the
     * player on nearly every draw: it sat exactly where the marker starts.
     *
     * Movement is now axis-separated reflection against isBlockedForQix, so a
     * wall reverses the component that hit it and the Qix keeps its speed.
     */
    private updateQix;
    /**
     * Re-anchor every Sparx's pathIndex after d.borderPath has been rebuilt.
     *
     * updateBorderPath() rebuilds the array by re-scanning the field, so a
     * claim can change both its length and the order of its points - the old
     * pathIndex no longer names the same physical cell. Left unfixed, the next
     * updateSparx() snaps sparx.x/y to whatever cell the stale index now
     * lands on, which can be right on top of the marker that just finished
     * drawing and trips checkSparxCollision. Re-anchoring to the nearest
     * point keeps each Sparx where it visually was.
     */
    reanchorBorderPositions(): void;
    /**
     * Update a single Sparx
     */
    private updateSparx;
    /**
     * Turn a Skull round, if it is allowed to.
     *
     * FAQ 2.2: "Skulls will never instantly reverse direction on a line (i.e.
     * after you dodge around one by drawing a small box, they can't
     * immediately turn around and chase you)". A reversal is therefore
     * refused while one is still fresh.
     */
    reverseSkull(sparx: Sparx, now?: number): boolean;
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
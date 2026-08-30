/**
 * Super Qix - Drawing System
 * Handles stix drawing, area claiming, and flood fill algorithms
 */
import { SuperQixData, Point, ClaimResult } from './types';
/**
 * Drawing system for stix and area claiming
 */
export declare class DrawingSystem {
    private data;
    constructor(data: SuperQixData);
    /**
     * Extend the current stix to a new point
     */
    extendStix(point: Point): boolean;
    /**
     * Check if stix contains a point
     */
    private stixContains;
    /**
     * Complete the stix and claim area
     */
    completeStix(endPoint: Point): ClaimResult;
    /**
     * Claim the area that doesn't contain any Qix
     */
    private claimAreaWithoutQix;
    /**
     * Find all unclaimed regions using flood fill
     */
    private findUnclaimedRegions;
    /**
     * Flood fill to find connected unclaimed area
     */
    private floodFill;
    /**
     * Count cells of a specific type
     */
    private countCells;
    /**
     * Check if Qix have been split into separate regions
     * Returns bonus multiplier if split occurred
     */
    private checkQixSplit;
    /**
     * Calculate total claimed percentage
     */
    calculateClaimedPercent(): number;
    /**
     * Check if a point is on the safe area (border or claimed)
     */
    /**
     * Does this claimed cell sit on the edge of claimed ground?
     *
     * "Edge" means it has at least one unclaimed neighbour, so it is part of
     * the outline of a claimed region rather than buried inside it.
     */
    touchesUnclaimed(x: number, y: number): boolean;
    /**
     * May the marker stand here when it is NOT drawing?
     *
     * FAQ 2.1: "the joystick moves your marker around the playing field, but
     * only along either the border (if no area has been claimed in front of
     * it) or the inside edges of any areas you have successfully marked off",
     * and FAQ 1: "internal lines become inaccessible".
     *
     * So the outer frame is always walkable, and claimed ground is walkable
     * only where it borders unclaimed area. Without the second half the player
     * can wander around inside everything they have claimed, which is the
     * "I can move freely" that was reported.
     */
    isWalkable(point: Point): boolean;
    isOnSafeArea(point: Point): boolean;
    /**
     * Find the path from stix start to current position (for fuse)
     */
    getStixPath(): Point[];
    /**
     * Get area that would be claimed if stix completed at given point
     */
    previewClaimArea(endPoint: Point): number;
}
//# sourceMappingURL=drawing.d.ts.map
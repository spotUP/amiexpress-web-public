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
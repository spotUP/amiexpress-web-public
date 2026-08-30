/**
 * Super Qix - Drawing System
 * Handles stix drawing, area claiming, and flood fill algorithms
 */

import {
  SuperQixData,
  CellState,
  Point,
  ClaimResult,
  Region
} from './types';
import {
  FIELD_WIDTH,
  FIELD_HEIGHT,
  DRAW_BASE_POINTS,
  SPLIT_QIX_MULTIPLIERS
} from './constants';

/**
 * Drawing system for stix and area claiming
 */
export class DrawingSystem {
  private data: SuperQixData;

  constructor(data: SuperQixData) {
    this.data = data;
  }

  /**
   * Extend the current stix to a new point
   */
  extendStix(point: Point): boolean {
    const d = this.data;

    if (!d.currentStix) return false;

    // Check if point is valid
    if (point.x < 0 || point.x >= FIELD_WIDTH || point.y < 0 || point.y >= FIELD_HEIGHT) {
      return false;
    }

    const cell = d.field[point.y][point.x];

    // Can only draw into unclaimed area
    if (cell !== 'unclaimed') {
      return false;
    }

    // Check for self-intersection
    if (this.stixContains(point)) {
      return false;  // Would cross own stix - handled as death in engine
    }

    // Add point to stix
    d.currentStix.points.push({ ...point });
    d.field[point.y][point.x] = 'stix';

    return true;
  }

  /**
   * Check if stix contains a point
   */
  private stixContains(point: Point): boolean {
    const d = this.data;
    if (!d.currentStix) return false;

    return d.currentStix.points.some(p => p.x === point.x && p.y === point.y);
  }

  /**
   * Complete the stix and claim area
   */
  completeStix(endPoint: Point): ClaimResult {
    const d = this.data;

    if (!d.currentStix || d.currentStix.points.length < 2) {
      return { success: false };
    }

    // Add end point to stix
    d.currentStix.points.push({ ...endPoint });

    // Convert stix to claimed (the line itself)
    for (const point of d.currentStix.points) {
      if (d.field[point.y][point.x] === 'stix') {
        d.field[point.y][point.x] = 'claimed';
      }
    }

    // Find and claim the area without Qix
    const claimResult = this.claimAreaWithoutQix();

    // Points scale with the size of the section claimed (FAQ 2.4.1).
    // There is no slow/fast draw in Super Qix (FAQ 2.5.3), so there is
    // only one base rate.
    const points = Math.floor(claimResult.percent * DRAW_BASE_POINTS * d.scoreMultiplier);

    // Check if we split the Qix
    const splitBonus = this.checkQixSplit();
    if (splitBonus > 0) {
      d.scoreMultiplier = Math.min(9, d.scoreMultiplier + splitBonus);
    }

    return {
      success: true,
      percent: claimResult.percent,
      points: points + (splitBonus * 1000),
      splitBonus,
      filled: claimResult.filled
    };
  }

  /**
   * Claim the area that doesn't contain any Qix
   */
  private claimAreaWithoutQix(): { percent: number; filled: Point[] } {
    const d = this.data;
    const filled: Point[] = [];

    // Find all unclaimed regions
    const regions = this.findUnclaimedRegions();

    // Find Qix positions
    const qixPositions = d.qixList.map(q => ({
      x: Math.floor(q.x),
      y: Math.floor(q.y)
    }));

    // Claim regions that don't contain any Qix
    let totalClaimed = 0;
    const totalUnclaimed = this.countCells('unclaimed');

    for (const region of regions) {
      const containsQix = qixPositions.some(qp =>
        region.points.some(rp => rp.x === qp.x && rp.y === qp.y)
      );

      if (!containsQix) {
        // Collected, not painted: the engine fills these in over a few
        // frames so the sweep is visible (see QixEngine's pending fill).
        for (const point of region.points) {
          filled.push(point);
        }
        totalClaimed += region.points.length;
      }
    }

    // Calculate percentage of total field
    const fieldArea = (FIELD_WIDTH - 2) * (FIELD_HEIGHT - 2);  // Exclude borders
    const percent = (totalClaimed / fieldArea) * 100;

    return { percent, filled };
  }

  /**
   * Find all unclaimed regions using flood fill
   */
  private findUnclaimedRegions(): Region[] {
    const d = this.data;
    const visited = new Set<string>();
    const regions: Region[] = [];

    for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
      for (let x = 1; x < FIELD_WIDTH - 1; x++) {
        const key = `${x},${y}`;

        if (d.field[y][x] === 'unclaimed' && !visited.has(key)) {
          const region = this.floodFill(x, y, visited);
          regions.push(region);
        }
      }
    }

    return regions;
  }

  /**
   * Flood fill to find connected unclaimed area
   */
  private floodFill(startX: number, startY: number, visited: Set<string>): Region {
    const d = this.data;
    const points: Point[] = [];
    const stack: Point[] = [{ x: startX, y: startY }];

    while (stack.length > 0) {
      const point = stack.pop()!;
      const key = `${point.x},${point.y}`;

      if (visited.has(key)) continue;
      if (point.x < 1 || point.x >= FIELD_WIDTH - 1) continue;
      if (point.y < 1 || point.y >= FIELD_HEIGHT - 1) continue;
      if (d.field[point.y][point.x] !== 'unclaimed') continue;

      visited.add(key);
      points.push(point);

      // Add neighbors
      stack.push({ x: point.x - 1, y: point.y });
      stack.push({ x: point.x + 1, y: point.y });
      stack.push({ x: point.x, y: point.y - 1 });
      stack.push({ x: point.x, y: point.y + 1 });
    }

    return {
      points,
      area: points.length
    };
  }

  /**
   * Count cells of a specific type
   */
  private countCells(type: CellState): number {
    const d = this.data;
    let count = 0;

    for (let y = 1; y < FIELD_HEIGHT - 1; y++) {
      for (let x = 1; x < FIELD_WIDTH - 1; x++) {
        if (d.field[y][x] === type) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Check if Qix have been split into separate regions
   * Returns bonus multiplier if split occurred
   */
  private checkQixSplit(): number {
    const d = this.data;

    if (d.qixList.length < 2) return 0;

    // Find all unclaimed regions
    const regions = this.findUnclaimedRegions();

    if (regions.length <= 1) return 0;

    // Check which regions contain Qix
    const qixRegionMap = new Map<number, number[]>();

    for (let i = 0; i < d.qixList.length; i++) {
      const qix = d.qixList[i];
      const qx = Math.floor(qix.x);
      const qy = Math.floor(qix.y);

      for (let r = 0; r < regions.length; r++) {
        if (regions[r].points.some(p => p.x === qx && p.y === qy)) {
          if (!qixRegionMap.has(r)) {
            qixRegionMap.set(r, []);
          }
          qixRegionMap.get(r)!.push(i);
          break;
        }
      }
    }

    // If Qix are in different regions, they've been split
    if (qixRegionMap.size > 1) {
      // Bonus based on how many regions have Qix
      return Math.min(qixRegionMap.size, SPLIT_QIX_MULTIPLIERS.length);
    }

    return 0;
  }

  /**
   * Calculate total claimed percentage
   */
  calculateClaimedPercent(): number {
    const d = this.data;
    const fieldArea = (FIELD_WIDTH - 2) * (FIELD_HEIGHT - 2);
    const claimed = this.countCells('claimed');
    return (claimed / fieldArea) * 100;
  }

  /**
   * Check if a point is on the safe area (border or claimed)
   */
  /**
   * Does this claimed cell sit on the edge of claimed ground?
   *
   * "Edge" means it has at least one unclaimed neighbour, so it is part of
   * the outline of a claimed region rather than buried inside it.
   */
  touchesUnclaimed(x: number, y: number): boolean {
    const d = this.data;
    const neighbours = [
      { x: x - 1, y },
      { x: x + 1, y },
      { x, y: y - 1 },
      { x, y: y + 1 },
    ];

    for (const n of neighbours) {
      if (n.x < 0 || n.x >= FIELD_WIDTH || n.y < 0 || n.y >= FIELD_HEIGHT) continue;
      if (d.field[n.y][n.x] === 'unclaimed') return true;
    }

    return false;
  }

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
  isWalkable(point: Point): boolean {
    const d = this.data;

    if (point.x < 0 || point.x >= FIELD_WIDTH || point.y < 0 || point.y >= FIELD_HEIGHT) {
      return false;
    }

    const cell = d.field[point.y][point.x];
    if (cell === 'border') return true;
    if (cell !== 'claimed') return false;

    return this.touchesUnclaimed(point.x, point.y);
  }

  isOnSafeArea(point: Point): boolean {
    const d = this.data;

    if (point.x < 0 || point.x >= FIELD_WIDTH || point.y < 0 || point.y >= FIELD_HEIGHT) {
      return false;
    }

    const cell = d.field[point.y][point.x];
    return cell === 'border' || cell === 'claimed';
  }

  /**
   * Find the path from stix start to current position (for fuse)
   */
  getStixPath(): Point[] {
    const d = this.data;
    return d.currentStix ? [...d.currentStix.points] : [];
  }

  /**
   * Get area that would be claimed if stix completed at given point
   */
  previewClaimArea(endPoint: Point): number {
    // This could be used for UI preview
    // For now, return 0
    return 0;
  }
}

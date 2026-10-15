/**
 * Collision Detection System
 */
export class CollisionSystem {
  /**
   * Check rectangle collision
   */
  static rectCollision(
    x1: number, y1: number, w1: number, h1: number,
    x2: number, y2: number, w2: number, h2: number
  ): boolean {
    return x1 < x2 + w2 && x1 + w1 > x2 && y1 < y2 + h2 && y1 + h1 > y2;
  }

  /**
   * Check point in rectangle
   */
  static pointInRect(px: number, py: number, rx: number, ry: number, rw: number, rh: number): boolean {
    return px >= rx && px <= rx + rw && py >= ry && py <= ry + rh;
  }

  /**
   * Check circle collision
   */
  static circleCollision(
    x1: number, y1: number, r1: number,
    x2: number, y2: number, r2: number
  ): boolean {
    const dx = x1 - x2;
    const dy = y1 - y2;
    const distance = Math.sqrt(dx * dx + dy * dy);
    return distance < r1 + r2;
  }

  /**
   * Get collision side (for platformer games)
   */
  static getCollisionSide(
    movingX: number, movingY: number, movingW: number, movingH: number,
    staticX: number, staticY: number, staticW: number, staticH: number
  ): 'top' | 'bottom' | 'left' | 'right' | null {
    if (!this.rectCollision(movingX, movingY, movingW, movingH, staticX, staticY, staticW, staticH)) {
      return null;
    }

    const overlapLeft = (movingX + movingW) - staticX;
    const overlapRight = (staticX + staticW) - movingX;
    const overlapTop = (movingY + movingH) - staticY;
    const overlapBottom = (staticY + staticH) - movingY;

    const minOverlap = Math.min(overlapLeft, overlapRight, overlapTop, overlapBottom);

    if (minOverlap === overlapTop) return 'top';
    if (minOverlap === overlapBottom) return 'bottom';
    if (minOverlap === overlapLeft) return 'left';
    if (minOverlap === overlapRight) return 'right';

    return null;
  }
}

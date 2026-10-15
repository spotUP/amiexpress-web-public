/**
 * Block Collision Detection
 *
 * Provides AABB (fast) and pixel-perfect (accurate) collision detection
 * for block sprites.
 */

import {
  BlockSprite,
  BlockFrame,
  BlockCell,
  Rect,
  Point,
  CollisionResult,
} from './types';
import { getCurrentFrame } from './block-animation';

/**
 * Get the effective hitbox for a sprite (uses frame dimensions if no custom hitbox)
 */
export function getEffectiveHitbox(sprite: BlockSprite): Rect {
  if (sprite.hitbox) {
    return {
      x: sprite.x + sprite.hitbox.x,
      y: sprite.y + sprite.hitbox.y,
      width: sprite.hitbox.width,
      height: sprite.hitbox.height,
    };
  }

  const frame = getCurrentFrame(sprite);
  if (!frame) {
    return { x: sprite.x, y: sprite.y, width: 1, height: 1 };
  }

  return {
    x: sprite.x,
    y: sprite.y,
    width: frame.width,
    height: frame.height,
  };
}

/**
 * Check if two rectangles overlap (AABB collision)
 */
export function checkAABB(a: Rect, b: Rect): boolean {
  return !(
    a.x + a.width <= b.x ||
    b.x + b.width <= a.x ||
    a.y + a.height <= b.y ||
    b.y + b.height <= a.y
  );
}

/**
 * Get the overlap rectangle of two rectangles
 */
export function getOverlap(a: Rect, b: Rect): Rect | null {
  const x = Math.max(a.x, b.x);
  const y = Math.max(a.y, b.y);
  const right = Math.min(a.x + a.width, b.x + b.width);
  const bottom = Math.min(a.y + a.height, b.y + b.height);

  if (x >= right || y >= bottom) {
    return null;
  }

  return {
    x,
    y,
    width: right - x,
    height: bottom - y,
  };
}

/**
 * Check if a cell is solid (non-transparent)
 */
function isCellSolid(cell: BlockCell): boolean {
  if (cell === null) return false;
  if (typeof cell === 'string') return cell !== ' ';
  return !cell.transparent && cell.char !== ' ';
}

/**
 * Get cell at position in frame data (with flip support)
 */
function getCellAt(
  frame: BlockFrame,
  x: number,
  y: number,
  flipX: boolean,
  flipY: boolean
): BlockCell | null {
  // Apply flip transformations
  const fx = flipX ? frame.width - 1 - x : x;
  const fy = flipY ? frame.height - 1 - y : y;

  if (fy < 0 || fy >= frame.data.length) return null;
  if (fx < 0 || fx >= (frame.data[fy]?.length ?? 0)) return null;

  return frame.data[fy][fx] ?? null;
}

/**
 * Check pixel-perfect collision between two sprites
 */
export function checkPixelPerfect(a: BlockSprite, b: BlockSprite): boolean {
  // First do AABB check for early exit
  const aBox = getEffectiveHitbox(a);
  const bBox = getEffectiveHitbox(b);

  if (!checkAABB(aBox, bBox)) {
    return false;
  }

  // Get overlap region
  const overlap = getOverlap(aBox, bBox);
  if (!overlap) {
    return false;
  }

  // Get current frames
  const aFrame = getCurrentFrame(a);
  const bFrame = getCurrentFrame(b);

  if (!aFrame || !bFrame) {
    // If no frame, treat as solid rectangle
    return true;
  }

  // Check each cell in overlap region
  for (let y = 0; y < overlap.height; y++) {
    for (let x = 0; x < overlap.width; x++) {
      // World position of this cell
      const worldX = overlap.x + x;
      const worldY = overlap.y + y;

      // Position within sprite A's frame
      const aLocalX = worldX - a.x;
      const aLocalY = worldY - a.y;

      // Position within sprite B's frame
      const bLocalX = worldX - b.x;
      const bLocalY = worldY - b.y;

      // Get cells at these positions
      const aCell = getCellAt(aFrame, aLocalX, aLocalY, a.flipX, a.flipY);
      const bCell = getCellAt(bFrame, bLocalX, bLocalY, b.flipX, b.flipY);

      // Check if both cells are solid
      if (isCellSolid(aCell) && isCellSolid(bCell)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Full collision check between two sprites
 *
 * @param a - First sprite
 * @param b - Second sprite
 * @param pixelPerfect - Use pixel-perfect collision (slower but accurate)
 * @returns Collision result with details
 */
export function checkCollision(
  a: BlockSprite,
  b: BlockSprite,
  pixelPerfect: boolean = false
): CollisionResult {
  const aBox = getEffectiveHitbox(a);
  const bBox = getEffectiveHitbox(b);

  // Basic AABB check
  if (!checkAABB(aBox, bBox)) {
    return { collided: false };
  }

  // Get overlap
  const overlap = getOverlap(aBox, bBox);

  // Pixel perfect check if requested
  if (pixelPerfect && !checkPixelPerfect(a, b)) {
    return { collided: false };
  }

  return {
    collided: true,
    overlap: overlap ?? undefined,
    spriteA: a,
    spriteB: b,
  };
}

/**
 * Check if a point is inside a sprite's solid area
 *
 * @param sprite - Sprite to check
 * @param point - Point to test
 * @param pixelPerfect - Check actual sprite data vs just hitbox
 */
export function checkPointCollision(
  sprite: BlockSprite,
  point: Point,
  pixelPerfect: boolean = false
): boolean {
  const box = getEffectiveHitbox(sprite);

  // Check if point is in bounding box
  if (
    point.x < box.x ||
    point.x >= box.x + box.width ||
    point.y < box.y ||
    point.y >= box.y + box.height
  ) {
    return false;
  }

  if (!pixelPerfect) {
    return true;
  }

  // Check actual sprite data
  const frame = getCurrentFrame(sprite);
  if (!frame) {
    return true;
  }

  const localX = Math.floor(point.x - sprite.x);
  const localY = Math.floor(point.y - sprite.y);

  const cell = getCellAt(frame, localX, localY, sprite.flipX, sprite.flipY);
  return isCellSolid(cell);
}

/**
 * Check if a sprite collides with a rectangle
 */
export function checkRectCollision(
  sprite: BlockSprite,
  rect: Rect,
  pixelPerfect: boolean = false
): boolean {
  const box = getEffectiveHitbox(sprite);

  if (!checkAABB(box, rect)) {
    return false;
  }

  if (!pixelPerfect) {
    return true;
  }

  // Get overlap region
  const overlap = getOverlap(box, rect);
  if (!overlap) {
    return false;
  }

  const frame = getCurrentFrame(sprite);
  if (!frame) {
    return true;
  }

  // Check each cell in overlap
  for (let y = 0; y < overlap.height; y++) {
    for (let x = 0; x < overlap.width; x++) {
      const worldX = overlap.x + x;
      const worldY = overlap.y + y;
      const localX = worldX - sprite.x;
      const localY = worldY - sprite.y;

      const cell = getCellAt(frame, localX, localY, sprite.flipX, sprite.flipY);
      if (isCellSolid(cell)) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get all sprites at a given point
 */
export function getSpritesAtPoint(
  sprites: BlockSprite[],
  point: Point,
  options: {
    visibleOnly?: boolean;
    pixelPerfect?: boolean;
  } = {}
): BlockSprite[] {
  const { visibleOnly = true, pixelPerfect = false } = options;

  return sprites.filter(sprite => {
    if (visibleOnly && !sprite.visible) {
      return false;
    }
    return checkPointCollision(sprite, point, pixelPerfect);
  });
}

/**
 * Get all sprites that collide with a given sprite
 */
export function getCollidingSprites(
  sprite: BlockSprite,
  candidates: BlockSprite[],
  options: {
    visibleOnly?: boolean;
    pixelPerfect?: boolean;
  } = {}
): BlockSprite[] {
  const { visibleOnly = true, pixelPerfect = false } = options;

  return candidates.filter(other => {
    if (other.id === sprite.id) {
      return false;
    }
    if (visibleOnly && !other.visible) {
      return false;
    }
    return checkCollision(sprite, other, pixelPerfect).collided;
  });
}

/**
 * Get all collision pairs among a set of sprites
 */
export function getAllCollisions(
  sprites: BlockSprite[],
  options: {
    visibleOnly?: boolean;
    pixelPerfect?: boolean;
  } = {}
): CollisionResult[] {
  const { visibleOnly = true, pixelPerfect = false } = options;
  const results: CollisionResult[] = [];

  for (let i = 0; i < sprites.length; i++) {
    const a = sprites[i];
    if (visibleOnly && !a.visible) continue;

    for (let j = i + 1; j < sprites.length; j++) {
      const b = sprites[j];
      if (visibleOnly && !b.visible) continue;

      const result = checkCollision(a, b, pixelPerfect);
      if (result.collided) {
        results.push(result);
      }
    }
  }

  return results;
}

/**
 * Check if a sprite would collide if moved to a new position
 */
export function wouldCollide(
  sprite: BlockSprite,
  newX: number,
  newY: number,
  candidates: BlockSprite[],
  options: {
    visibleOnly?: boolean;
    pixelPerfect?: boolean;
  } = {}
): BlockSprite | null {
  const { visibleOnly = true, pixelPerfect = false } = options;

  // Temporarily move sprite
  const oldX = sprite.x;
  const oldY = sprite.y;
  sprite.x = newX;
  sprite.y = newY;

  // Check collisions
  for (const other of candidates) {
    if (other.id === sprite.id) continue;
    if (visibleOnly && !other.visible) continue;

    if (checkCollision(sprite, other, pixelPerfect).collided) {
      // Restore position
      sprite.x = oldX;
      sprite.y = oldY;
      return other;
    }
  }

  // Restore position
  sprite.x = oldX;
  sprite.y = oldY;
  return null;
}

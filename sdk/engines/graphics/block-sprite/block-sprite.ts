/**
 * Block Sprite Engine
 *
 * Main engine class for managing and rendering block-based sprites.
 * Provides a complete API for creating, animating, and rendering
 * sprites using Unicode block characters.
 *
 * @example
 * ```typescript
 * import { BlockSpriteEngine } from './block-sprite';
 *
 * const engine = new BlockSpriteEngine({ width: 80, height: 24 });
 *
 * // Create a simple sprite
 * engine.createSprite({
 *   id: 'player',
 *   x: 10, y: 5,
 *   frames: [{
 *     width: 3, height: 2,
 *     data: [
 *       [null, '▄', null],
 *       ['█', '█', '█']
 *     ]
 *   }]
 * });
 *
 * // Game loop
 * setInterval(() => {
 *   engine.update(33);
 *   console.log(engine.render());
 * }, 33);
 * ```
 */

import {
  BlockSprite,
  BlockSpriteConfig,
  BlockSpriteEngineConfig,
  BlockFrame,
  BlockAnimation,
  BufferCell,
  AnsiColor,
  Rect,
  Point,
  CollisionResult,
  BlockSpriteEvent,
  BlockSpriteEventListener,
  Hitbox,
} from './types';

import {
  updateAnimation,
  playAnimation,
  stopAnimation,
  pauseAnimation,
  resumeAnimation,
  setFrame,
  getCurrentFrame,
  getCurrentFrames,
} from './block-animation';

import {
  createBuffer,
  clearBuffer,
  renderSprites,
  bufferToAnsi,
  bufferRegionToAnsi,
  bufferDiff,
  cloneBuffer,
  resetDirtyFlags,
  getDirtyRect,
  fillRect,
  drawText,
} from './block-renderer';

import {
  checkCollision,
  checkPointCollision,
  checkRectCollision,
  getSpritesAtPoint,
  getCollidingSprites,
  getAllCollisions,
  wouldCollide,
  getEffectiveHitbox,
} from './block-collision';

/**
 * Block Sprite Engine
 *
 * Manages a collection of block sprites, handles animation updates,
 * collision detection, and renders to an optimized ANSI string output.
 */
export class BlockSpriteEngine {
  /** Screen/buffer dimensions */
  private width: number;
  private height: number;

  /** Default colors */
  private defaultFg: AnsiColor;
  private defaultBg: AnsiColor;

  /** All registered sprites */
  private sprites: Map<string, BlockSprite> = new Map();

  /** Render buffer */
  private buffer: BufferCell[][];

  /** Previous frame buffer (for differential updates) */
  private prevBuffer: BufferCell[][] | null = null;

  /** Whether to use double buffering */
  private doubleBuffer: boolean;

  /** Whether to track dirty rectangles */
  private enableDirtyRects: boolean;

  /** Event listeners */
  private listeners: BlockSpriteEventListener[] = [];

  /** Sprite ID counter for auto-generated IDs */
  private idCounter: number = 0;

  constructor(config: BlockSpriteEngineConfig) {
    this.width = config.width;
    this.height = config.height;
    this.defaultFg = config.defaultFg ?? 'white';
    this.defaultBg = config.defaultBg ?? 'black';
    this.enableDirtyRects = config.enableDirtyRects ?? false;
    this.doubleBuffer = config.doubleBuffer ?? false;

    // Create render buffer
    this.buffer = createBuffer(this.width, this.height, this.defaultFg, this.defaultBg);

    // Create previous buffer if double buffering
    if (this.doubleBuffer) {
      this.prevBuffer = createBuffer(this.width, this.height, this.defaultFg, this.defaultBg);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Sprite Management
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create and register a new sprite
   */
  createSprite(config: BlockSpriteConfig): BlockSprite {
    const sprite: BlockSprite = {
      id: config.id || `sprite_${++this.idCounter}`,
      x: config.x ?? 0,
      y: config.y ?? 0,
      z: config.z ?? 0,
      frames: config.frames,
      animations: config.animations ?? {},
      currentAnimation: null,
      currentFrame: 0,
      frameTime: 0,
      playing: config.playing ?? false,
      loop: config.loop ?? true,
      speed: config.speed ?? 1,
      visible: config.visible ?? true,
      flipX: config.flipX ?? false,
      flipY: config.flipY ?? false,
      hitbox: config.hitbox ?? null,
      data: config.data ?? {},
    };

    this.sprites.set(sprite.id, sprite);
    this.emit({ type: 'spriteAdded', sprite });

    return sprite;
  }

  /**
   * Remove a sprite by ID
   */
  removeSprite(id: string): boolean {
    const removed = this.sprites.delete(id);
    if (removed) {
      this.emit({ type: 'spriteRemoved', spriteId: id });
    }
    return removed;
  }

  /**
   * Get a sprite by ID
   */
  getSprite(id: string): BlockSprite | undefined {
    return this.sprites.get(id);
  }

  /**
   * Get all sprites
   */
  getAllSprites(): BlockSprite[] {
    return Array.from(this.sprites.values());
  }

  /**
   * Get sprites sorted by z-index
   */
  getSpritesByZ(): BlockSprite[] {
    return this.getAllSprites().sort((a, b) => a.z - b.z);
  }

  /**
   * Check if a sprite exists
   */
  hasSprite(id: string): boolean {
    return this.sprites.has(id);
  }

  /**
   * Clear all sprites
   */
  clearSprites(): void {
    this.sprites.clear();
  }

  // ═══════════════════════════════════════════════════════════════
  // Sprite Movement
  // ═══════════════════════════════════════════════════════════════

  /**
   * Move a sprite to absolute position
   */
  moveSprite(id: string, x: number, y: number): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.x = x;
      sprite.y = y;
    }
  }

  /**
   * Move a sprite by relative amount
   */
  moveSpriteBy(id: string, dx: number, dy: number): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.x += dx;
      sprite.y += dy;
    }
  }

  /**
   * Set sprite z-index
   */
  setSpriteZ(id: string, z: number): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.z = z;
    }
  }

  /**
   * Set sprite visibility
   */
  setSpriteVisible(id: string, visible: boolean): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.visible = visible;
    }
  }

  /**
   * Set visibility for multiple sprites
   */
  setSpritesVisible(ids: string[], visible: boolean): void {
    for (const id of ids) {
      this.setSpriteVisible(id, visible);
    }
  }

  /**
   * Set sprite flip state
   */
  setSpriteFlip(id: string, flipX: boolean, flipY: boolean): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.flipX = flipX;
      sprite.flipY = flipY;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Animation Control
  // ═══════════════════════════════════════════════════════════════

  /**
   * Play animation on a sprite
   */
  playSprite(id: string, animation?: string, restart?: boolean): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      playAnimation(sprite, animation ?? null, restart);
    }
  }

  /**
   * Stop animation on a sprite
   */
  stopSprite(id: string): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      stopAnimation(sprite);
    }
  }

  /**
   * Pause animation on a sprite
   */
  pauseSprite(id: string): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      pauseAnimation(sprite);
    }
  }

  /**
   * Resume animation on a sprite
   */
  resumeSprite(id: string): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      resumeAnimation(sprite);
    }
  }

  /**
   * Set current frame of a sprite
   */
  setSpriteFrame(id: string, frame: number): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      setFrame(sprite, frame);
    }
  }

  /**
   * Set animation callback for a sprite
   */
  onSpriteComplete(id: string, callback: () => void): void {
    const sprite = this.sprites.get(id);
    if (sprite) {
      sprite.onComplete = callback;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Collision Detection
  // ═══════════════════════════════════════════════════════════════

  /**
   * Check collision between two sprites
   */
  checkCollision(id1: string, id2: string, pixelPerfect?: boolean): boolean {
    const a = this.sprites.get(id1);
    const b = this.sprites.get(id2);
    if (!a || !b) return false;
    return checkCollision(a, b, pixelPerfect).collided;
  }

  /**
   * Check if a point hits a sprite
   */
  checkPointCollision(id: string, x: number, y: number, pixelPerfect?: boolean): boolean {
    const sprite = this.sprites.get(id);
    if (!sprite) return false;
    return checkPointCollision(sprite, { x, y }, pixelPerfect);
  }

  /**
   * Get all sprites at a point
   */
  getSpritesAt(x: number, y: number, options?: { visibleOnly?: boolean; pixelPerfect?: boolean }): BlockSprite[] {
    return getSpritesAtPoint(this.getAllSprites(), { x, y }, options);
  }

  /**
   * Get sprites colliding with a specific sprite
   */
  getCollidingWith(id: string, options?: { visibleOnly?: boolean; pixelPerfect?: boolean }): BlockSprite[] {
    const sprite = this.sprites.get(id);
    if (!sprite) return [];
    return getCollidingSprites(sprite, this.getAllSprites(), options);
  }

  /**
   * Get all collision pairs
   */
  getAllCollisions(options?: { visibleOnly?: boolean; pixelPerfect?: boolean }): CollisionResult[] {
    return getAllCollisions(this.getAllSprites(), options);
  }

  /**
   * Check if sprite would collide at new position
   */
  wouldCollide(id: string, newX: number, newY: number, options?: { visibleOnly?: boolean; pixelPerfect?: boolean }): BlockSprite | null {
    const sprite = this.sprites.get(id);
    if (!sprite) return null;
    return wouldCollide(sprite, newX, newY, this.getAllSprites(), options);
  }

  /**
   * Get effective hitbox for a sprite
   */
  getHitbox(id: string): Rect | null {
    const sprite = this.sprites.get(id);
    if (!sprite) return null;
    return getEffectiveHitbox(sprite);
  }

  // ═══════════════════════════════════════════════════════════════
  // Update & Render
  // ═══════════════════════════════════════════════════════════════

  /**
   * Update all sprite animations
   *
   * @param deltaTime - Time elapsed in milliseconds
   */
  update(deltaTime: number): void {
    for (const sprite of this.sprites.values()) {
      const completed = updateAnimation(sprite, deltaTime);

      // Check for animation complete events
      if (completed && !sprite.playing && sprite.currentAnimation) {
        this.emit({
          type: 'animationComplete',
          sprite,
          animation: sprite.currentAnimation,
        });
      }
    }
  }

  /**
   * Clear the render buffer
   */
  clear(): void {
    clearBuffer(this.buffer, this.defaultFg, this.defaultBg);
  }

  /**
   * Render all sprites to buffer and return ANSI string
   */
  render(): string {
    // Save previous buffer for diff if double buffering
    if (this.doubleBuffer && this.prevBuffer) {
      const temp = this.prevBuffer;
      this.prevBuffer = cloneBuffer(this.buffer);
      this.buffer = temp;
    }

    // Clear buffer
    this.clear();

    // Render all sprites
    renderSprites(this.buffer, this.getSpritesByZ(), this.defaultFg, this.defaultBg);

    // Generate output
    if (this.doubleBuffer && this.prevBuffer) {
      return bufferDiff(this.buffer, this.prevBuffer);
    }

    return bufferToAnsi(this.buffer);
  }

  /**
   * Render only a specific region
   */
  renderRegion(rect: Rect, cursorHome?: { x: number; y: number }): string {
    // Clear region
    fillRect(this.buffer, rect, ' ', this.defaultFg, this.defaultBg);

    // Render sprites
    renderSprites(this.buffer, this.getSpritesByZ(), this.defaultFg, this.defaultBg);

    return bufferRegionToAnsi(this.buffer, rect, { cursorHome });
  }

  /**
   * Get the raw buffer (for advanced use)
   */
  getBuffer(): BufferCell[][] {
    return this.buffer;
  }

  /**
   * Draw directly to buffer
   */
  drawRect(rect: Rect, char: string, fg: AnsiColor, bg: AnsiColor): void {
    fillRect(this.buffer, rect, char, fg, bg);
  }

  /**
   * Draw text directly to buffer
   */
  drawText(x: number, y: number, text: string, fg: AnsiColor, bg?: AnsiColor): void {
    drawText(this.buffer, x, y, text, fg, bg ?? this.defaultBg);
  }

  // ═══════════════════════════════════════════════════════════════
  // Events
  // ═══════════════════════════════════════════════════════════════

  /**
   * Add event listener
   */
  on(listener: BlockSpriteEventListener): void {
    this.listeners.push(listener);
  }

  /**
   * Remove event listener
   */
  off(listener: BlockSpriteEventListener): void {
    const index = this.listeners.indexOf(listener);
    if (index >= 0) {
      this.listeners.splice(index, 1);
    }
  }

  /**
   * Emit event to all listeners
   */
  private emit(event: BlockSpriteEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Utility
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get engine dimensions
   */
  getDimensions(): { width: number; height: number } {
    return { width: this.width, height: this.height };
  }

  /**
   * Resize the engine
   */
  resize(width: number, height: number): void {
    this.width = width;
    this.height = height;
    this.buffer = createBuffer(width, height, this.defaultFg, this.defaultBg);
    if (this.doubleBuffer) {
      this.prevBuffer = createBuffer(width, height, this.defaultFg, this.defaultBg);
    }
  }

  /**
   * Set default colors
   */
  setDefaultColors(fg: AnsiColor, bg: AnsiColor): void {
    this.defaultFg = fg;
    this.defaultBg = bg;
  }
}

// Re-export types and utilities
export * from './types';
export * from './block-charset';
export * from './block-animation';
export * from './block-collision';
export * from './block-renderer';

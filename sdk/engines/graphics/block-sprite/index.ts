/**
 * Block Sprite Engine
 *
 * A complete sprite engine for creating animated graphics using
 * Unicode block characters. Perfect for retro-style arcade games
 * in terminal/BBS environments.
 *
 * Features:
 * - Sprite creation and management
 * - Frame-based animation with timing control
 * - AABB and pixel-perfect collision detection
 * - Optimized ANSI output rendering
 * - Pre-built sprite patterns for common game elements
 * - Sprite sheet support for organizing sprites
 * - Flip and transform operations
 *
 * @example
 * ```typescript
 * import {
 *   BlockSpriteEngine,
 *   FROG,
 *   EXPLOSION_MEDIUM
 * } from '@amiexpress/bbs-door-sdk/engines/graphics/block-sprite';
 *
 * // Create engine
 * const engine = new BlockSpriteEngine({ width: 80, height: 24 });
 *
 * // Create player sprite using pre-built pattern
 * const player = engine.createSprite({
 *   id: 'player',
 *   x: 40, y: 12,
 *   frames: FROG.hop,
 *   playing: true,
 *   loop: true
 * });
 *
 * // Game loop
 * setInterval(() => {
 *   engine.update(33);
 *   console.log(engine.render());
 * }, 33);
 * ```
 *
 * @module block-sprite
 */

// Main engine class
export { BlockSpriteEngine } from './block-sprite';

// Types
export type {
  AnsiColor,
  BlockChar,
  BlockCell,
  BlockFrame,
  BlockSprite,
  BlockSpriteConfig,
  BlockSpriteEngineConfig,
  BlockAnimation,
  Hitbox,
  BufferCell,
  Rect,
  Point,
  CollisionResult,
  AnimationState,
  BlockSpriteEvent,
  BlockSpriteEventListener,
  SpriteSheetDef,
} from './types';

// Block character utilities
export {
  FULL_BLOCK,
  HALF_BLOCKS,
  QUARTER_BLOCKS,
  SHADE_BLOCKS,
  BLOCKS,
  getBlockChar,
  getQuadrants,
  isBlockChar,
  isShadeChar,
  getShadeLevel,
  getShadeChar,
  combineBlocks,
  flipBlockH,
  flipBlockV,
} from './block-charset';

// Animation utilities
export {
  DEFAULT_FRAME_DURATION,
  updateAnimation,
  getCurrentFrames,
  getCurrentFrame,
  playAnimation,
  stopAnimation,
  pauseAnimation,
  resumeAnimation,
  setFrame,
  getAnimationState,
  setAnimationState,
  getAnimationDuration,
  getAnimationProgress,
  createAnimation,
  createPingPongAnimation,
} from './block-animation';

// Collision detection
export {
  getEffectiveHitbox,
  checkAABB,
  getOverlap,
  checkPixelPerfect,
  checkCollision,
  checkPointCollision,
  checkRectCollision,
  getSpritesAtPoint,
  getCollidingSprites,
  getAllCollisions,
  wouldCollide,
} from './block-collision';

// Rendering utilities
export {
  createBuffer,
  clearBuffer,
  renderSprite,
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

// Sprite sheet utilities
export {
  createSpriteSheet,
  extractCell,
  extractRange,
  getSprite,
  frameFromAscii,
  frameFromBlocks,
  frameFromArrays,
  flipFrameH,
  flipFrameV,
  rotateFrame90,
  scaleFrame,
  recolorFrame,
  overlayFrames,
} from './sprite-sheet';
export type { SpriteSheet } from './sprite-sheet';

// Pre-built patterns
export {
  // Character patterns
  HUMANOID,
  FROG,
  SPACESHIP,
  GHOST,
  DRAGON,
  BIRD,
  PENGUIN,
  BEE,
  CAR,
  TRUCK,
  LOG,
  TURTLE,
  ICE_BLOCK,
  BUBBLE,
  CHARACTER_PATTERNS,
  recolorCharacter,
} from './patterns/characters';

export {
  // Effect patterns
  EXPLOSION_SMALL,
  EXPLOSION_MEDIUM,
  EXPLOSION_LARGE,
  SPARK,
  HIT_FLASH,
  SPLASH,
  SMOKE,
  FIRE,
  SHIMMER,
  POWERUP_GLOW,
  DEATH_FADE,
  TELEPORT,
  BUBBLE_POP,
  COIN_COLLECT,
  EFFECT_PATTERNS,
  createScorePopup,
  recolorEffect,
  createExplosion,
} from './patterns/effects';

export {
  // Projectile patterns
  BULLET,
  BULLET_TRAIL,
  LASER_SMALL,
  LASER_MEDIUM,
  LASER_LARGE,
  LASER_H,
  MISSILE_UP,
  MISSILE_DOWN,
  MISSILE_LEFT,
  MISSILE_RIGHT,
  MISSILE_EXHAUST,
  FIREBALL,
  ENERGY_BALL,
  PLASMA,
  ARROW_RIGHT,
  ARROW_LEFT,
  ARROW_UP,
  ARROW_DOWN,
  BOOMERANG,
  SHURIKEN,
  BUBBLE_PROJECTILE,
  CHAIN_LINK,
  BOMB,
  BOMB_LIT,
  ROCK,
  ICE_SHARD,
  FIRE_WAVE_H,
  FIRE_WAVE_V,
  PROJECTILE_PATTERNS,
  createDirectionalProjectile,
  recolorProjectile,
  createBulletTrail,
} from './patterns/projectiles';

export { SPRITE_PATTERNS } from './patterns';

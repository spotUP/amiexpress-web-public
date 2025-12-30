/**
 * Sprite Patterns Index
 *
 * Exports all pre-built sprite patterns for use in games.
 */

// Character sprites
export * from './characters';
export { CHARACTER_PATTERNS } from './characters';

// Effect sprites
export * from './effects';
export { EFFECT_PATTERNS } from './effects';

// Projectile sprites
export * from './projectiles';
export { PROJECTILE_PATTERNS } from './projectiles';

// Combined pattern library
import { CHARACTER_PATTERNS } from './characters';
import { EFFECT_PATTERNS } from './effects';
import { PROJECTILE_PATTERNS } from './projectiles';

/**
 * All sprite patterns combined
 */
export const SPRITE_PATTERNS = {
  characters: CHARACTER_PATTERNS,
  effects: EFFECT_PATTERNS,
  projectiles: PROJECTILE_PATTERNS,
} as const;

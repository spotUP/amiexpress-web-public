/**
 * Projectile Sprite Patterns
 *
 * Pre-built sprite frames for bullets, missiles, lasers,
 * and other projectile types.
 */

import { BlockFrame, AnsiColor } from '../types';
import { frameFromBlocks, recolorFrame, rotateFrame90, flipFrameH, flipFrameV } from '../sprite-sheet';

/**
 * Simple bullet (1x1)
 */
export const BULLET: BlockFrame[] = [
  frameFromBlocks(['█'], 'white'),
];

/**
 * Animated bullet with trail (1x1)
 */
export const BULLET_TRAIL: BlockFrame[] = [
  frameFromBlocks(['░'], 'gray'),
  frameFromBlocks(['▒'], 'white'),
  frameFromBlocks(['█'], 'brightWhite'),
];

/**
 * Small laser shot (1x1)
 */
export const LASER_SMALL: BlockFrame[] = [
  frameFromBlocks(['│'], 'cyan'),
];

/**
 * Medium laser beam (1x2)
 */
export const LASER_MEDIUM: BlockFrame[] = [
  frameFromBlocks([
    '│',
    '│',
  ], 'cyan'),
  frameFromBlocks([
    '║',
    '║',
  ], 'brightCyan'),
];

/**
 * Large laser beam (1x3)
 */
export const LASER_LARGE: BlockFrame[] = [
  frameFromBlocks([
    '│',
    '█',
    '│',
  ], 'cyan'),
  frameFromBlocks([
    '▒',
    '█',
    '▒',
  ], 'brightCyan'),
];

/**
 * Horizontal laser (3x1)
 */
export const LASER_H: BlockFrame[] = [
  frameFromBlocks(['─█─'], 'cyan'),
  frameFromBlocks(['═█═'], 'brightCyan'),
];

/**
 * Missile up (1x2)
 */
export const MISSILE_UP: BlockFrame[] = [
  frameFromBlocks([
    '▲',
    '█',
  ], 'red'),
];

/**
 * Missile down (1x2)
 */
export const MISSILE_DOWN: BlockFrame[] = [
  frameFromBlocks([
    '█',
    '▼',
  ], 'red'),
];

/**
 * Missile left (2x1)
 */
export const MISSILE_LEFT: BlockFrame[] = [
  frameFromBlocks(['◄█'], 'red'),
];

/**
 * Missile right (2x1)
 */
export const MISSILE_RIGHT: BlockFrame[] = [
  frameFromBlocks(['█►'], 'red'),
];

/**
 * Missile with exhaust trail (1x3) - animated
 */
export const MISSILE_EXHAUST: BlockFrame[] = [
  frameFromBlocks([
    '▲',
    '█',
    '░',
  ], 'red'),
  frameFromBlocks([
    '▲',
    '█',
    '▒',
  ], 'red'),
  frameFromBlocks([
    '▲',
    '█',
    '▓',
  ], 'red'),
];

/**
 * Fireball (2x2)
 */
export const FIREBALL: BlockFrame[] = [
  frameFromBlocks([
    '▒▓',
    '▓▒',
  ], 'red'),
  frameFromBlocks([
    '▓▒',
    '▒▓',
  ], 'brightRed'),
  frameFromBlocks([
    '▒▓',
    '▓▒',
  ], 'yellow'),
  frameFromBlocks([
    '▓▒',
    '▒▓',
  ], 'brightYellow'),
];

/**
 * Energy ball (2x2)
 */
export const ENERGY_BALL: BlockFrame[] = [
  frameFromBlocks([
    '▒▓',
    '▓▒',
  ], 'cyan'),
  frameFromBlocks([
    '▓▒',
    '▒▓',
  ], 'brightCyan'),
];

/**
 * Plasma shot (2x2)
 */
export const PLASMA: BlockFrame[] = [
  frameFromBlocks([
    '░▒',
    '▒░',
  ], 'magenta'),
  frameFromBlocks([
    '▒▓',
    '▓▒',
  ], 'brightMagenta'),
  frameFromBlocks([
    '▓█',
    '█▓',
  ], 'brightMagenta'),
  frameFromBlocks([
    '▒▓',
    '▓▒',
  ], 'magenta'),
];

/**
 * Arrow right (2x1)
 */
export const ARROW_RIGHT: BlockFrame[] = [
  frameFromBlocks(['─►'], 'white'),
];

/**
 * Arrow left (2x1)
 */
export const ARROW_LEFT: BlockFrame[] = [
  frameFromBlocks(['◄─'], 'white'),
];

/**
 * Arrow up (1x2)
 */
export const ARROW_UP: BlockFrame[] = [
  frameFromBlocks([
    '▲',
    '│',
  ], 'white'),
];

/**
 * Arrow down (1x2)
 */
export const ARROW_DOWN: BlockFrame[] = [
  frameFromBlocks([
    '│',
    '▼',
  ], 'white'),
];

/**
 * Boomerang (2x2) - rotating animation
 */
export const BOOMERANG: BlockFrame[] = [
  frameFromBlocks([
    '▄▀',
    '  ',
  ], 'yellow'),
  frameFromBlocks([
    ' ▌',
    ' ▌',
  ], 'yellow'),
  frameFromBlocks([
    '  ',
    '▀▄',
  ], 'yellow'),
  frameFromBlocks([
    '▐ ',
    '▐ ',
  ], 'yellow'),
];

/**
 * Shuriken/star (3x3) - rotating animation
 */
export const SHURIKEN: BlockFrame[] = [
  frameFromBlocks([
    ' ▲ ',
    '◄█►',
    ' ▼ ',
  ], 'gray'),
  frameFromBlocks([
    '▘ ▝',
    ' █ ',
    '▖ ▗',
  ], 'gray'),
];

/**
 * Bubble projectile (2x2)
 */
export const BUBBLE_PROJECTILE: BlockFrame[] = [
  frameFromBlocks([
    '▄▄',
    '▀▀',
  ], 'cyan'),
  frameFromBlocks([
    '▄▄',
    '▀▀',
  ], 'brightCyan'),
];

/**
 * Chain/hook (variable length) - for grappling hooks
 */
export const CHAIN_LINK: BlockFrame[] = [
  frameFromBlocks(['○'], 'gray'),
];

/**
 * Bomb falling (2x2)
 */
export const BOMB: BlockFrame[] = [
  frameFromBlocks([
    '▄▄',
    '██',
  ], 'gray'),
];

/**
 * Bomb with lit fuse (2x2) - animated
 */
export const BOMB_LIT: BlockFrame[] = [
  frameFromBlocks([
    '▄░',
    '██',
  ], 'gray'),
  frameFromBlocks([
    '▄▒',
    '██',
  ], 'gray'),
  frameFromBlocks([
    '▄▓',
    '██',
  ], 'gray'),
];

/**
 * Coconut/rock (1x1) for throwing enemies
 */
export const ROCK: BlockFrame[] = [
  frameFromBlocks(['●'], 'yellow'),
];

/**
 * Ice shard (1x2)
 */
export const ICE_SHARD: BlockFrame[] = [
  frameFromBlocks([
    '▲',
    '▼',
  ], 'cyan'),
];

/**
 * Fire wave horizontal (3x1)
 */
export const FIRE_WAVE_H: BlockFrame[] = [
  frameFromBlocks(['░▒▓'], 'red'),
  frameFromBlocks(['▒▓█'], 'brightRed'),
  frameFromBlocks(['▓█▓'], 'yellow'),
  frameFromBlocks(['▒▓█'], 'brightYellow'),
  frameFromBlocks(['░▒▓'], 'red'),
];

/**
 * Fire wave vertical (1x3)
 */
export const FIRE_WAVE_V: BlockFrame[] = [
  frameFromBlocks([
    '░',
    '▒',
    '▓',
  ], 'red'),
  frameFromBlocks([
    '▒',
    '▓',
    '█',
  ], 'brightRed'),
  frameFromBlocks([
    '▓',
    '█',
    '▓',
  ], 'yellow'),
];

/**
 * Helper to create directional projectile variants
 *
 * Takes base frames (assumed to be pointing 'up') and rotates/flips
 * to create the requested direction variant.
 *
 * @param baseFrames - Base frames (pointing up)
 * @param direction - Target direction
 * @returns Transformed frames for the requested direction
 */
export function createDirectionalProjectile(
  baseFrames: BlockFrame[],
  direction: 'up' | 'down' | 'left' | 'right'
): BlockFrame[] {
  switch (direction) {
    case 'up':
      // Base direction, no transformation needed
      return baseFrames;

    case 'down':
      // Flip vertically (180 degree rotation)
      return baseFrames.map(frame => flipFrameV(frame));

    case 'left':
      // Rotate 90 degrees counter-clockwise (3x clockwise)
      return baseFrames.map(frame => {
        let rotated = frame;
        rotated = rotateFrame90(rotated);
        rotated = rotateFrame90(rotated);
        rotated = rotateFrame90(rotated);
        return rotated;
      });

    case 'right':
      // Rotate 90 degrees clockwise
      return baseFrames.map(frame => rotateFrame90(frame));

    default:
      return baseFrames;
  }
}

/**
 * Helper to recolor projectile
 */
export function recolorProjectile(
  frames: BlockFrame[],
  fg?: AnsiColor,
  bg?: AnsiColor
): BlockFrame[] {
  return frames.map(frame => recolorFrame(frame, fg, bg));
}

/**
 * Create a custom bullet trail effect
 */
export function createBulletTrail(
  length: number,
  color: AnsiColor = 'white',
  fadeColor: AnsiColor = 'gray'
): BlockFrame[] {
  const frames: BlockFrame[] = [];

  for (let i = 0; i < 3; i++) {
    const data: string[] = [];
    for (let j = 0; j < length; j++) {
      const intensity = (j + i) % 3;
      data.push(intensity === 0 ? '░' : intensity === 1 ? '▒' : '█');
    }
    frames.push(frameFromBlocks(data, i < 2 ? color : fadeColor));
  }

  return frames;
}

/**
 * All projectile patterns indexed by name
 */
export const PROJECTILE_PATTERNS = {
  bullet: BULLET,
  bulletTrail: BULLET_TRAIL,
  laserSmall: LASER_SMALL,
  laserMedium: LASER_MEDIUM,
  laserLarge: LASER_LARGE,
  laserH: LASER_H,
  missileUp: MISSILE_UP,
  missileDown: MISSILE_DOWN,
  missileLeft: MISSILE_LEFT,
  missileRight: MISSILE_RIGHT,
  missileExhaust: MISSILE_EXHAUST,
  fireball: FIREBALL,
  energyBall: ENERGY_BALL,
  plasma: PLASMA,
  arrowRight: ARROW_RIGHT,
  arrowLeft: ARROW_LEFT,
  arrowUp: ARROW_UP,
  arrowDown: ARROW_DOWN,
  boomerang: BOOMERANG,
  shuriken: SHURIKEN,
  bubbleProjectile: BUBBLE_PROJECTILE,
  chainLink: CHAIN_LINK,
  bomb: BOMB,
  bombLit: BOMB_LIT,
  rock: ROCK,
  iceShard: ICE_SHARD,
  fireWaveH: FIRE_WAVE_H,
  fireWaveV: FIRE_WAVE_V,
} as const;

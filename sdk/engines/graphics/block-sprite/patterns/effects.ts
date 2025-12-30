/**
 * Effect Sprite Patterns
 *
 * Pre-built sprite frames for visual effects like explosions,
 * sparks, splashes, and other particles.
 */

import { BlockFrame, AnsiColor } from '../types';
import { frameFromBlocks, recolorFrame } from '../sprite-sheet';

/**
 * Small explosion (3x3) - quick burst
 */
export const EXPLOSION_SMALL: BlockFrame[] = [
  frameFromBlocks([
    '   ',
    ' ░ ',
    '   ',
  ], 'yellow'),
  frameFromBlocks([
    ' ░ ',
    '░▒░',
    ' ░ ',
  ], 'yellow'),
  frameFromBlocks([
    '░▒░',
    '▒▓▒',
    '░▒░',
  ], 'brightYellow'),
  frameFromBlocks([
    '▒▓▒',
    '▓█▓',
    '▒▓▒',
  ], 'brightYellow'),
  frameFromBlocks([
    '░▒░',
    '▒▓▒',
    '░▒░',
  ], 'red'),
  frameFromBlocks([
    ' ░ ',
    '░▒░',
    ' ░ ',
  ], 'red'),
  frameFromBlocks([
    '   ',
    ' ░ ',
    '   ',
  ], 'gray'),
];

/**
 * Medium explosion (5x5) - standard destruction
 */
export const EXPLOSION_MEDIUM: BlockFrame[] = [
  frameFromBlocks([
    '     ',
    '     ',
    '  ░  ',
    '     ',
    '     ',
  ], 'yellow'),
  frameFromBlocks([
    '     ',
    '  ░  ',
    ' ░▒░ ',
    '  ░  ',
    '     ',
  ], 'yellow'),
  frameFromBlocks([
    '  ░  ',
    ' ░▒░ ',
    '░▒▓▒░',
    ' ░▒░ ',
    '  ░  ',
  ], 'brightYellow'),
  frameFromBlocks([
    ' ░▒░ ',
    '░▒▓▒░',
    '▒▓█▓▒',
    '░▒▓▒░',
    ' ░▒░ ',
  ], 'brightYellow'),
  frameFromBlocks([
    '░▒▓▒░',
    '▒▓█▓▒',
    '▓███▓',
    '▒▓█▓▒',
    '░▒▓▒░',
  ], 'red'),
  frameFromBlocks([
    ' ░▒░ ',
    '░▒▓▒░',
    '▒▓█▓▒',
    '░▒▓▒░',
    ' ░▒░ ',
  ], 'red'),
  frameFromBlocks([
    '  ░  ',
    ' ░▒░ ',
    '░▒▓▒░',
    ' ░▒░ ',
    '  ░  ',
  ], 'gray'),
  frameFromBlocks([
    '     ',
    '  ░  ',
    ' ░▒░ ',
    '  ░  ',
    '     ',
  ], 'gray'),
];

/**
 * Large explosion (7x7) - big boom
 */
export const EXPLOSION_LARGE: BlockFrame[] = [
  frameFromBlocks([
    '       ',
    '       ',
    '       ',
    '   ░   ',
    '       ',
    '       ',
    '       ',
  ], 'yellow'),
  frameFromBlocks([
    '       ',
    '       ',
    '   ░   ',
    '  ░▒░  ',
    '   ░   ',
    '       ',
    '       ',
  ], 'yellow'),
  frameFromBlocks([
    '       ',
    '   ░   ',
    '  ░▒░  ',
    ' ░▒▓▒░ ',
    '  ░▒░  ',
    '   ░   ',
    '       ',
  ], 'brightYellow'),
  frameFromBlocks([
    '   ░   ',
    '  ░▒░  ',
    ' ░▒▓▒░ ',
    '░▒▓█▓▒░',
    ' ░▒▓▒░ ',
    '  ░▒░  ',
    '   ░   ',
  ], 'brightYellow'),
  frameFromBlocks([
    '  ░▒░  ',
    ' ░▒▓▒░ ',
    '░▒▓█▓▒░',
    '▒▓███▓▒',
    '░▒▓█▓▒░',
    ' ░▒▓▒░ ',
    '  ░▒░  ',
  ], 'red'),
  frameFromBlocks([
    '   ░   ',
    '  ░▒░  ',
    ' ░▒▓▒░ ',
    '░▒▓█▓▒░',
    ' ░▒▓▒░ ',
    '  ░▒░  ',
    '   ░   ',
  ], 'red'),
  frameFromBlocks([
    '       ',
    '   ░   ',
    '  ░▒░  ',
    ' ░▒▓▒░ ',
    '  ░▒░  ',
    '   ░   ',
    '       ',
  ], 'gray'),
  frameFromBlocks([
    '       ',
    '       ',
    '   ░   ',
    '  ░▒░  ',
    '   ░   ',
    '       ',
    '       ',
  ], 'gray'),
];

/**
 * Spark effect (1x1) - quick flash
 */
export const SPARK: BlockFrame[] = [
  frameFromBlocks(['░'], 'white'),
  frameFromBlocks(['▒'], 'brightYellow'),
  frameFromBlocks(['█'], 'brightWhite'),
  frameFromBlocks(['▒'], 'yellow'),
  frameFromBlocks(['░'], 'gray'),
];

/**
 * Hit flash (3x3) - impact indicator
 */
export const HIT_FLASH: BlockFrame[] = [
  frameFromBlocks([
    ' ░ ',
    '░█░',
    ' ░ ',
  ], 'brightWhite'),
  frameFromBlocks([
    '░▒░',
    '▒█▒',
    '░▒░',
  ], 'white'),
  frameFromBlocks([
    ' ░ ',
    '░░░',
    ' ░ ',
  ], 'gray'),
];

/**
 * Water splash (3x3)
 */
export const SPLASH: BlockFrame[] = [
  frameFromBlocks([
    '   ',
    ' ▄ ',
    '   ',
  ], 'cyan'),
  frameFromBlocks([
    ' ▄ ',
    '▄█▄',
    '   ',
  ], 'cyan'),
  frameFromBlocks([
    '▄ ▄',
    ' █ ',
    '▀ ▀',
  ], 'brightCyan'),
  frameFromBlocks([
    '   ',
    '▀ ▀',
    '   ',
  ], 'cyan'),
];

/**
 * Smoke puff (3x3)
 */
export const SMOKE: BlockFrame[] = [
  frameFromBlocks([
    '   ',
    ' ░ ',
    '   ',
  ], 'gray'),
  frameFromBlocks([
    ' ░ ',
    '░▒░',
    ' ░ ',
  ], 'gray'),
  frameFromBlocks([
    '░▒░',
    '▒▓▒',
    '░▒░',
  ], 'gray'),
  frameFromBlocks([
    '▒▓▒',
    '▓░▓',
    '▒▓▒',
  ], 'gray'),
  frameFromBlocks([
    ' ▒ ',
    '▒░▒',
    ' ▒ ',
  ], 'gray'),
  frameFromBlocks([
    '   ',
    ' ░ ',
    '   ',
  ], 'gray'),
];

/**
 * Fire animation (2x2) - looping
 */
export const FIRE: BlockFrame[] = [
  frameFromBlocks([
    '▒▓',
    '▓█',
  ], 'red'),
  frameFromBlocks([
    '▓▒',
    '█▓',
  ], 'brightRed'),
  frameFromBlocks([
    '▒▓',
    '▓█',
  ], 'yellow'),
  frameFromBlocks([
    '▓▒',
    '█▓',
  ], 'brightYellow'),
];

/**
 * Shimmer/sparkle effect (1x1) - for collectibles
 */
export const SHIMMER: BlockFrame[] = [
  frameFromBlocks(['░'], 'white'),
  frameFromBlocks(['▒'], 'white'),
  frameFromBlocks(['▓'], 'brightWhite'),
  frameFromBlocks(['█'], 'brightWhite'),
  frameFromBlocks(['▓'], 'white'),
  frameFromBlocks(['▒'], 'white'),
];

/**
 * Power-up glow (3x3) - pulsing aura
 */
export const POWERUP_GLOW: BlockFrame[] = [
  frameFromBlocks([
    '   ',
    ' ░ ',
    '   ',
  ], 'cyan'),
  frameFromBlocks([
    ' ░ ',
    '░▒░',
    ' ░ ',
  ], 'brightCyan'),
  frameFromBlocks([
    '░▒░',
    '▒▓▒',
    '░▒░',
  ], 'brightCyan'),
  frameFromBlocks([
    ' ░ ',
    '░▒░',
    ' ░ ',
  ], 'cyan'),
];

/**
 * Death fade (3x3) - entity disappearing
 */
export const DEATH_FADE: BlockFrame[] = [
  frameFromBlocks([
    '███',
    '███',
    '███',
  ], 'white'),
  frameFromBlocks([
    '▓▓▓',
    '▓▓▓',
    '▓▓▓',
  ], 'white'),
  frameFromBlocks([
    '▒▒▒',
    '▒▒▒',
    '▒▒▒',
  ], 'gray'),
  frameFromBlocks([
    '░░░',
    '░░░',
    '░░░',
  ], 'gray'),
  frameFromBlocks([
    '   ',
    '   ',
    '   ',
  ]),
];

/**
 * Teleport effect (3x3)
 */
export const TELEPORT: BlockFrame[] = [
  frameFromBlocks([
    ' ░ ',
    ' ░ ',
    ' ░ ',
  ], 'magenta'),
  frameFromBlocks([
    ' ▒ ',
    '░▒░',
    ' ▒ ',
  ], 'brightMagenta'),
  frameFromBlocks([
    '░▓░',
    '▒█▒',
    '░▓░',
  ], 'brightMagenta'),
  frameFromBlocks([
    '▒█▒',
    '███',
    '▒█▒',
  ], 'white'),
  frameFromBlocks([
    '░▓░',
    '▒█▒',
    '░▓░',
  ], 'brightMagenta'),
  frameFromBlocks([
    ' ▒ ',
    '░▒░',
    ' ▒ ',
  ], 'magenta'),
  frameFromBlocks([
    ' ░ ',
    ' ░ ',
    ' ░ ',
  ], 'magenta'),
];

/**
 * Bubble pop effect (2x2)
 */
export const BUBBLE_POP: BlockFrame[] = [
  frameFromBlocks([
    '▄▄',
    '▀▀',
  ], 'cyan'),
  frameFromBlocks([
    '░░',
    '░░',
  ], 'brightCyan'),
  frameFromBlocks([
    '▘▝',
    '▖▗',
  ], 'cyan'),
  frameFromBlocks([
    '  ',
    '  ',
  ]),
];

/**
 * Coin collect effect (2x2)
 */
export const COIN_COLLECT: BlockFrame[] = [
  frameFromBlocks([
    '▒▒',
    '▒▒',
  ], 'yellow'),
  frameFromBlocks([
    '▓▓',
    '▓▓',
  ], 'brightYellow'),
  frameFromBlocks([
    '██',
    '██',
  ], 'brightWhite'),
  frameFromBlocks([
    '▓▓',
    '▓▓',
  ], 'yellow'),
  frameFromBlocks([
    '░░',
    '░░',
  ], 'yellow'),
];

/**
 * Score popup rising effect (creates a "100", "500" etc that rises)
 *
 * Creates frames with fading effect - brighter at start, dimmer at end.
 * The returned frames should be rendered with rising Y position for popup effect.
 *
 * @param score - Score value to display
 * @param color - Base color for the text
 * @returns Array of frames for the popup animation
 */
export function createScorePopup(score: number, color: AnsiColor = 'yellow'): BlockFrame[] {
  const text = score.toString();
  const width = text.length;

  // Create frames with fade effect
  const frames: BlockFrame[] = [];

  // Brightness progression: bright -> normal -> fading
  const fadeColors: AnsiColor[] = [
    'brightWhite',
    color === 'yellow' ? 'brightYellow' : color,
    color,
    color,
    'gray',
    'gray',
  ];

  for (let i = 0; i < 6; i++) {
    frames.push({
      width,
      height: 1,
      data: [[{
        char: text,
        fg: fadeColors[i] ?? color,
      }]],
      duration: 100,
    });
  }

  return frames;
}

/**
 * Helper to recolor an effect
 */
export function recolorEffect(
  frames: BlockFrame[],
  fg?: AnsiColor,
  bg?: AnsiColor
): BlockFrame[] {
  return frames.map(frame => recolorFrame(frame, fg, bg));
}

/**
 * Create explosion with custom color
 */
export function createExplosion(
  size: 'small' | 'medium' | 'large',
  primaryColor: AnsiColor = 'yellow',
  secondaryColor: AnsiColor = 'red'
): BlockFrame[] {
  const base = size === 'small'
    ? EXPLOSION_SMALL
    : size === 'medium'
      ? EXPLOSION_MEDIUM
      : EXPLOSION_LARGE;

  // Recolor based on frame position in animation
  return base.map((frame, i) => {
    const progress = i / base.length;
    const color = progress < 0.5 ? primaryColor : secondaryColor;
    return recolorFrame(frame, color);
  });
}

/**
 * All effect patterns indexed by name
 */
export const EFFECT_PATTERNS = {
  explosionSmall: EXPLOSION_SMALL,
  explosionMedium: EXPLOSION_MEDIUM,
  explosionLarge: EXPLOSION_LARGE,
  spark: SPARK,
  hitFlash: HIT_FLASH,
  splash: SPLASH,
  smoke: SMOKE,
  fire: FIRE,
  shimmer: SHIMMER,
  powerupGlow: POWERUP_GLOW,
  deathFade: DEATH_FADE,
  teleport: TELEPORT,
  bubblePop: BUBBLE_POP,
  coinCollect: COIN_COLLECT,
} as const;

/**
 * Animation Renderers
 * Functions that render animated text for each frame
 */

import type { AnimationType, AnimationSegment } from './parser';

// 16 blessed colors (excluding black for readability)
const RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
const ALL_COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'];

// Sparkle characters
const SPARKLE_CHARS = ['*', '+', '.', "'", '`', '"', '^'];

/**
 * Render rainbow animation - cycle colors through text
 */
export function renderRainbow(text: string, frame: number): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const colorIndex = (i + frame) % RAINBOW_COLORS.length;
    const color = RAINBOW_COLORS[colorIndex];
    result += `{${color}-fg}${text[i]}{/${color}-fg}`;
  }
  return result;
}

/**
 * Render pulse animation - fade color intensity
 */
export function renderPulse(text: string, frame: number, params?: Record<string, string>): string {
  const color = params?.color || 'cyan';
  // Oscillate between full color and dimmed (gray)
  const intensity = Math.sin(frame * 0.3) * 0.5 + 0.5;
  const useColor = intensity > 0.5 ? color : 'gray';
  return `{${useColor}-fg}${text}{/${useColor}-fg}`;
}

/**
 * Render sparkle animation - randomly replace chars with sparkle characters
 */
export function renderSparkle(text: string, frame: number): string {
  let result = '';
  // Use frame as seed for consistent randomness per frame
  const seed = frame * 7;
  for (let i = 0; i < text.length; i++) {
    const rand = ((seed + i * 13) % 100) / 100;
    if (rand < 0.15 && text[i] !== ' ') {
      // 15% chance to sparkle
      const sparkleChar = SPARKLE_CHARS[(frame + i) % SPARKLE_CHARS.length];
      result += `{yellow-fg}${sparkleChar}{/yellow-fg}`;
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * Render shake animation - add subtle random padding
 */
export function renderShake(text: string, frame: number): string {
  // Shake effect uses padding - add 0-1 spaces before/after
  const shakeAmount = frame % 3;
  const leftPad = shakeAmount === 1 ? ' ' : '';
  const rightPad = shakeAmount === 2 ? ' ' : '';
  return `${leftPad}${text}${rightPad}`;
}

/**
 * Render wave animation - add vertical offset chars
 */
export function renderWave(text: string, frame: number): string {
  let result = '';
  for (let i = 0; i < text.length; i++) {
    const wave = Math.sin((frame + i) * 0.5);
    // Use combining characters for subtle vertical shift effect
    // In terminals, we can use superscript-like positioning
    if (wave > 0.5) {
      result += `{cyan-fg}${text[i]}{/cyan-fg}`;
    } else if (wave < -0.5) {
      result += `{blue-fg}${text[i]}{/blue-fg}`;
    } else {
      result += text[i];
    }
  }
  return result;
}

/**
 * Render gradient animation - shift color across text
 */
export function renderGradient(text: string, frame: number, params?: Record<string, string>): string {
  const fromColor = params?.from || 'red';
  const toColor = params?.to || 'blue';
  const colors = [fromColor, toColor];

  let result = '';
  const halfLen = Math.ceil(text.length / 2);
  const offset = frame % text.length;

  for (let i = 0; i < text.length; i++) {
    const shiftedI = (i + offset) % text.length;
    const colorIndex = shiftedI < halfLen ? 0 : 1;
    const color = colors[colorIndex];
    result += `{${color}-fg}${text[i]}{/${color}-fg}`;
  }
  return result;
}

/**
 * Render a segment based on its animation type
 */
export function renderAnimatedSegment(segment: AnimationSegment, frame: number): string {
  if (segment.type === 'static') {
    return segment.content;
  }

  if (!segment.animation) {
    return segment.content;
  }

  switch (segment.animation.name) {
    case 'rainbow':
      return renderRainbow(segment.content, frame);
    case 'pulse':
      return renderPulse(segment.content, frame, segment.animation.params);
    case 'sparkle':
      return renderSparkle(segment.content, frame);
    case 'shake':
      return renderShake(segment.content, frame);
    case 'wave':
      return renderWave(segment.content, frame);
    case 'gradient':
      return renderGradient(segment.content, frame, segment.animation.params);
    default:
      return segment.content;
  }
}

/**
 * Render all segments for a line
 */
export function renderSegments(segments: AnimationSegment[], frame: number): string {
  return segments.map(seg => renderAnimatedSegment(seg, frame)).join('');
}

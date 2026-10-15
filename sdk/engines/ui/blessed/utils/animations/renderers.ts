/**
 * Animation Renderers
 * Functions that render animated text for each frame
 */

import type { AnimationType, AnimationSegment } from './parser';

// 16 blessed colors (excluding black for readability)
const RAINBOW_COLORS = ['red', 'yellow', 'green', 'cyan', 'blue', 'magenta'];
const ALL_COLORS = ['red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'gray'];

/**
 * Colours a sparkle passes through, brightest first. The text KEEPS its own
 * characters - see renderSparkle.
 */
const SPARKLE_COLORS = ['white', 'yellow', 'white'];

/**
 * The ramp a gradient walks between its two ends.
 *
 * Sixteen-colour terminals cannot blend, so a gradient has to be built from
 * the colours that exist. Ordering them by brightness is what makes a run of
 * them read as a fade rather than as stripes.
 */
const GRADIENT_RAMPS: Record<string, string[]> = {
  'red-blue': ['red', 'magenta', 'blue'],
  'blue-red': ['blue', 'magenta', 'red'],
  'red-yellow': ['red', 'yellow', 'white'],
  'yellow-red': ['white', 'yellow', 'red'],
  'green-cyan': ['green', 'cyan', 'white'],
  'cyan-green': ['white', 'cyan', 'green'],
  'blue-cyan': ['blue', 'cyan', 'white'],
  'cyan-blue': ['white', 'cyan', 'blue'],
  'magenta-cyan': ['magenta', 'blue', 'cyan'],
  'cyan-magenta': ['cyan', 'blue', 'magenta'],
};

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
  // Frame as a seed, so a given frame always sparkles the same way.
  const seed = frame * 7;
  for (let i = 0; i < text.length; i++) {
    const rand = ((seed + i * 13) % 100) / 100;
    if (rand < 0.15 && text[i] !== ' ') {
      // Light the CHARACTER up. This used to substitute a sparkle glyph for
      // it - so 15% of every message was replaced with punctuation on every
      // frame, and the text was unreadable while the effect ran.
      const color = SPARKLE_COLORS[(frame + i) % SPARKLE_COLORS.length];
      result += `{${color}-fg}{bold}${text[i]}{/bold}{/${color}-fg}`;
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
  // The width NEVER changes - only where the text sits inside it.
  //
  // This used to add a space on one side and nothing on the other, so the
  // line got a column longer and shorter as it shook. In a fixed-width chat
  // panel that re-wraps the line, which shoves everything after it around:
  // the whole message area twitched, not the shaken word.
  // Pure ASCII: one space, on one side or the other. Same width either way,
  // and the text jumps a column. No zero-width or combining characters - an
  // Amiga client renders those as a visible glyph, if at all.
  return frame % 2 === 0 ? `${text} ` : ` ${text}`;
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
  if (text.length === 0) return '';

  const fromColor = params?.from || 'red';
  const toColor = params?.to || 'blue';

  // A real ramp between the two ends where one is known, so the run reads as
  // a fade. It used to be the two end colours and nothing between, split
  // down the middle - two blocks of solid colour, which is not a gradient.
  const ramp = GRADIENT_RAMPS[`${fromColor}-${toColor}`] ?? [fromColor, toColor];

  let result = '';
  const offset = frame % text.length;

  for (let i = 0; i < text.length; i++) {
    const shiftedI = (i + offset) % text.length;
    const position = text.length === 1 ? 0 : shiftedI / (text.length - 1);
    const stop = Math.min(ramp.length - 1, Math.floor(position * ramp.length));
    const color = ramp[stop];
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

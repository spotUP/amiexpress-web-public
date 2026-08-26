/**
 * Animation Tag Parser
 * Parses ~animation~text~/animation~ tags from content
 */

export type AnimationType = 'rainbow' | 'pulse' | 'sparkle' | 'shake' | 'wave' | 'gradient';

export interface AnimationSegment {
  type: 'static' | 'animated';
  content: string;
  animation?: {
    name: AnimationType;
    params?: Record<string, string>;
  };
}

export interface ParsedLine {
  lineIndex: number;
  segments: AnimationSegment[];
  hasAnimations: boolean;
  originalContent: string;
}

// Animation tag pattern: ~name~ or ~name param=value~
// [\s\S], not `.` - the content of an effect can run across a line break,
// and with `.` an effect that wrapped simply never matched, so it rendered
// as its literal tags.
const ANIMATION_TAG_REGEX = /~(\w+)(?:\s+([^~]+))?~([\s\S]*?)~\/\1~/g;

/**
 * Parse animation tags from text and return segments
 */
export function parseAnimationTags(text: string): AnimationSegment[] {
  const segments: AnimationSegment[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  // Reset regex state
  ANIMATION_TAG_REGEX.lastIndex = 0;

  while ((match = ANIMATION_TAG_REGEX.exec(text)) !== null) {
    // Add static content before match
    if (match.index > lastIndex) {
      segments.push({
        type: 'static',
        content: text.slice(lastIndex, match.index),
      });
    }

    const [, animName, paramsStr, content] = match;

    // Parse params if present (e.g., "from=red to=blue")
    let params: Record<string, string> | undefined;
    if (paramsStr) {
      params = {};
      const paramMatches = paramsStr.matchAll(/(\w+)=(\w+)/g);
      for (const pm of paramMatches) {
        params[pm[1]] = pm[2];
      }
    }

    // Add animated segment
    if (isValidAnimationType(animName)) {
      segments.push({
        type: 'animated',
        content,
        animation: {
          name: animName,
          params,
        },
      });
    } else {
      // Invalid animation type, treat as static
      segments.push({
        type: 'static',
        content: match[0],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Add remaining static content
  if (lastIndex < text.length) {
    segments.push({
      type: 'static',
      content: text.slice(lastIndex),
    });
  }

  return segments;
}

/**
 * Check if string is a valid animation type
 */
function isValidAnimationType(name: string): name is AnimationType {
  return ['rainbow', 'pulse', 'sparkle', 'shake', 'wave', 'gradient'].includes(name);
}

/**
 * Check if text contains any animation tags
 */
export function hasAnimationTags(text: string): boolean {
  ANIMATION_TAG_REGEX.lastIndex = 0;
  return ANIMATION_TAG_REGEX.test(text);
}

/** Rebuild the opening tag for an animated segment, parameters and all. */
function openingTag(animation: { name: AnimationType; params?: Record<string, string> }): string {
  const params = animation.params
    ? Object.entries(animation.params).map(([k, v]) => `${k}=${v}`).join(' ')
    : '';
  return params ? `~${animation.name} ${params}~` : `~${animation.name}~`;
}

/**
 * Split text into one string per DISPLAY ROW, keeping every effect balanced
 * within the row it lands on.
 *
 * A log widget addresses rows, and callers that track animated lines by index
 * are really tracking rows. A message containing a newline occupies more rows
 * than the one index it was registered under, so every animated line after it
 * gets its frames written to the wrong row - reported live as an effect
 * applied mid-sentence making "the entire chatlog go crazy". The effect's
 * position was incidental; the newline in the same message was the fault.
 *
 * Effect content is allowed to run across a line break (see the [\s\S] note on
 * ANIMATION_TAG_REGEX), so a split cannot simply cut the string: that would
 * leave an opening tag on one row and its closing tag on the next, and both
 * would render as literal markup. Each piece is re-wrapped instead.
 */
export function splitAnimatedLines(text: string): string[] {
  // Normalise CRLF first so a line break counts once, not twice.
  const normalised = text.replace(/\r\n/g, '\n');
  if (!normalised.includes('\n')) return [normalised];

  const rows: string[] = [''];
  const append = (s: string) => { rows[rows.length - 1] += s; };

  for (const segment of parseAnimationTags(normalised)) {
    const pieces = segment.content.split('\n');
    pieces.forEach((piece, index) => {
      if (index > 0) rows.push('');
      if (segment.type === 'animated' && segment.animation) {
        // An effect wrapping nothing is markup with no content - skip it and
        // leave the row empty, so the row still exists and still counts.
        if (piece.length > 0) {
          append(`${openingTag(segment.animation)}${piece}~/${segment.animation.name}~`);
        }
      } else {
        append(piece);
      }
    });
  }

  return rows;
}

/**
 * Strip animation tags from text, returning plain text
 */
export function stripAnimationTags(text: string): string {
  return text.replace(ANIMATION_TAG_REGEX, '$3');
}

/**
 * Get animation types present in text
 */
export function getAnimationTypes(text: string): AnimationType[] {
  const types = new Set<AnimationType>();
  ANIMATION_TAG_REGEX.lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = ANIMATION_TAG_REGEX.exec(text)) !== null) {
    if (isValidAnimationType(match[1])) {
      types.add(match[1]);
    }
  }
  return Array.from(types);
}

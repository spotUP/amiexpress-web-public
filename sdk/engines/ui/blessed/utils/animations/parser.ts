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
const ANIMATION_TAG_REGEX = /~(\w+)(?:\s+([^~]+))?~(.*?)~\/\1~/g;

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

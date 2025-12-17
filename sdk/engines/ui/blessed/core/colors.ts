/**
 * ANSI color and style utilities
 */

const ESC = '\x1b';
const CSI = `${ESC}[`;

// ============================================================================
// Color Name to Code Mapping
// ============================================================================

// Special value for transparent (no background)
export const TRANSPARENT = -1;

export const colorNames: Record<string, number> = {
  // Special
  transparent: TRANSPARENT,
  none: TRANSPARENT,
  default: TRANSPARENT,

  // Standard colors (0-7)
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,

  // Bright colors (8-15)
  brightBlack: 8,
  brightRed: 9,
  brightGreen: 10,
  brightYellow: 11,
  brightBlue: 12,
  brightMagenta: 13,
  brightCyan: 14,
  brightWhite: 15,

  // Aliases
  gray: 8,
  grey: 8,
  lightBlack: 8,
  lightRed: 9,
  lightGreen: 10,
  lightYellow: 11,
  lightBlue: 12,
  lightMagenta: 13,
  lightCyan: 14,
  lightWhite: 15,
};

// ============================================================================
// Color Parsing
// ============================================================================

export function parseColor(color: string | number | undefined): number {
  if (color === undefined || color === null) {
    return -1;
  }

  if (typeof color === 'number') {
    return color;
  }

  // Named color
  if (colorNames.hasOwnProperty(color)) {
    return colorNames[color];
  }

  // Hex color (#RGB or #RRGGBB)
  if (color[0] === '#') {
    return hexToColor(color);
  }

  // rgb(r, g, b)
  const match = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (match) {
    const r = parseInt(match[1], 10);
    const g = parseInt(match[2], 10);
    const b = parseInt(match[3], 10);
    return rgbToColor(r, g, b);
  }

  return -1;
}

function hexToColor(hex: string): number {
  hex = hex.slice(1);

  // Expand shorthand (#RGB -> #RRGGBB)
  if (hex.length === 3) {
    hex = hex[0] + hex[0] + hex[1] + hex[1] + hex[2] + hex[2];
  }

  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);

  return rgbToColor(r, g, b);
}

function rgbToColor(r: number, g: number, b: number): number {
  // Convert RGB to 256-color palette (16-231 are RGB, 232-255 are grayscale)
  if (r === g && g === b) {
    // Grayscale
    if (r < 8) return 16;
    if (r > 248) return 231;
    return Math.round(((r - 8) / 247) * 24) + 232;
  }

  // RGB cube (6x6x6)
  const rIdx = Math.round((r / 255) * 5);
  const gIdx = Math.round((g / 255) * 5);
  const bIdx = Math.round((b / 255) * 5);

  return 16 + (rIdx * 36) + (gIdx * 6) + bIdx;
}

// ============================================================================
// ANSI Escape Sequence Generation
// ============================================================================

export function fg(color: string | number): string {
  const code = parseColor(color);
  if (code === -1) return '';

  if (code < 8) {
    // Standard foreground
    return `${CSI}3${code}m`;
  } else if (code < 16) {
    // Bright foreground
    return `${CSI}9${code - 8}m`;
  } else {
    // 256-color foreground
    return `${CSI}38;5;${code}m`;
  }
}

export function bg(color: string | number): string {
  const code = parseColor(color);
  if (code === -1) return '';

  if (code < 8) {
    // Standard background
    return `${CSI}4${code}m`;
  } else if (code < 16) {
    // Bright background
    return `${CSI}10${code - 8}m`;
  } else {
    // 256-color background
    return `${CSI}48;5;${code}m`;
  }
}

// ============================================================================
// Attributes
// ============================================================================

export const attrs = {
  reset: `${CSI}0m`,
  bold: `${CSI}1m`,
  dim: `${CSI}2m`,
  italic: `${CSI}3m`,
  underline: `${CSI}4m`,
  blink: `${CSI}5m`,
  inverse: `${CSI}7m`,
  invisible: `${CSI}8m`,
  strike: `${CSI}9m`,

  // Reset specific attributes
  noBold: `${CSI}22m`,
  noItalic: `${CSI}23m`,
  noUnderline: `${CSI}24m`,
  noBlink: `${CSI}25m`,
  noInverse: `${CSI}27m`,
  noInvisible: `${CSI}28m`,
  noStrike: `${CSI}29m`,
};

// ============================================================================
// Cursor Control
// ============================================================================

export const cursor = {
  hide: `${CSI}?25l`,
  show: `${CSI}?25h`,
  save: `${ESC}7`,
  restore: `${ESC}8`,
  pos: (x: number, y: number) => `${CSI}${y + 1};${x + 1}H`,
  up: (n: number = 1) => `${CSI}${n}A`,
  down: (n: number = 1) => `${CSI}${n}B`,
  forward: (n: number = 1) => `${CSI}${n}C`,
  backward: (n: number = 1) => `${CSI}${n}D`,
  nextLine: (n: number = 1) => `${CSI}${n}E`,
  prevLine: (n: number = 1) => `${CSI}${n}F`,
  col: (n: number) => `${CSI}${n + 1}G`,
  home: `${CSI}H`,
};

// ============================================================================
// Screen Control
// ============================================================================

export const screen = {
  clear: `${CSI}2J`,
  clearToBottom: `${CSI}0J`,
  clearToTop: `${CSI}1J`,
  clearLine: `${CSI}2K`,
  clearLineRight: `${CSI}0K`,
  clearLineLeft: `${CSI}1K`,
  scrollUp: (n: number = 1) => `${CSI}${n}S`,
  scrollDown: (n: number = 1) => `${CSI}${n}T`,
  saveCursor: `${ESC}7`,
  restoreCursor: `${ESC}8`,
  setScrollRegion: (top: number, bottom: number) => `${CSI}${top + 1};${bottom + 1}r`,
  resetScrollRegion: `${CSI}r`,
};

// ============================================================================
// Style Builder
// ============================================================================

export interface StyleFlags {
  fg?: string | number;
  bg?: string | number;
  bold?: boolean;
  dim?: boolean;
  italic?: boolean;
  underline?: boolean;
  blink?: boolean;
  inverse?: boolean;
  invisible?: boolean;
}

export function buildStyle(flags: StyleFlags): string {
  let result = '';

  if (flags.fg !== undefined) {
    result += fg(flags.fg);
  }

  if (flags.bg !== undefined) {
    result += bg(flags.bg);
  }

  if (flags.bold) result += attrs.bold;
  if (flags.dim) result += attrs.dim;
  if (flags.italic) result += attrs.italic;
  if (flags.underline) result += attrs.underline;
  if (flags.blink) result += attrs.blink;
  if (flags.inverse) result += attrs.inverse;
  if (flags.invisible) result += attrs.invisible;

  return result;
}

// ============================================================================
// Tag Parsing
// ============================================================================

// Match tags like {bold}, {cyan-fg}, {/bold}, {/cyan-fg}, and {/} (reset shorthand)
const tagRegex = /\{(\/?)([\w-]*)(?::([\w-]+))?\}/g;

export function parseTags(text: string): string {
  return text.replace(tagRegex, (match, close, name, value) => {
    if (close) {
      // Closing tag or {/} shorthand - reset attributes
      return attrs.reset;
    }

    // Empty tag with no close (like {}) - return as-is
    if (!name) {
      return match;
    }

    // Opening tag
    switch (name) {
      case 'bold':
        return attrs.bold;
      case 'underline':
        return attrs.underline;
      case 'blink':
        return attrs.blink;
      case 'inverse':
        return attrs.inverse;
      case 'invisible':
        return attrs.invisible;

      // Basic colors (no suffix)
      case 'black':
      case 'red':
      case 'green':
      case 'yellow':
      case 'blue':
      case 'magenta':
      case 'cyan':
      case 'white':
      case 'gray':
      case 'grey':
        return fg(name === 'grey' ? 'gray' : name);

      // Foreground colors with -fg suffix (standard blessed format)
      case 'black-fg':
        return fg('black');
      case 'red-fg':
        return fg('red');
      case 'green-fg':
        return fg('green');
      case 'yellow-fg':
        return fg('yellow');
      case 'blue-fg':
        return fg('blue');
      case 'magenta-fg':
        return fg('magenta');
      case 'cyan-fg':
        return fg('cyan');
      case 'white-fg':
        return fg('white');
      case 'gray-fg':
      case 'grey-fg':
        return fg('gray');

      // Background colors with -bg suffix
      case 'black-bg':
        return bg('black');
      case 'red-bg':
        return bg('red');
      case 'green-bg':
        return bg('green');
      case 'yellow-bg':
        return bg('yellow');
      case 'blue-bg':
        return bg('blue');
      case 'magenta-bg':
        return bg('magenta');
      case 'cyan-bg':
        return bg('cyan');
      case 'white-bg':
        return bg('white');
      case 'gray-bg':
      case 'grey-bg':
        return bg('gray');

      // Custom color with value
      case 'fg':
        return value ? fg(value) : '';
      case 'bg':
        return value ? bg(value) : '';

      default:
        return match;
    }
  });
}

// ============================================================================
// Strip ANSI Codes
// ============================================================================

const ansiRegex = /\x1b\[[0-9;]*m/g;

export function stripAnsi(text: string): string {
  return text.replace(ansiRegex, '');
}

// ============================================================================
// String Width (accounting for ANSI codes)
// ============================================================================

export function textWidth(text: string): number {
  return stripAnsi(text).length;
}

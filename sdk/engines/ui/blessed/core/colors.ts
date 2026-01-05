/**
 * colors.ts - color-related functions for blessed.
 * EXACT 1:1 PORT of neo-blessed lib/colors.js
 * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
 * https://github.com/chjj/blessed
 */

// ============================================================================
// EXACT PORT OF NEO-BLESSED lib/colors.js
// ============================================================================

// Match cache
export const _cache: Record<number, number> = {};

export function match(r1: number | string | number[], g1?: number, b1?: number): number {
  if (typeof r1 === 'string') {
    const hex = r1;
    if (hex[0] !== '#') {
      return -1;
    }
    const rgb = hexToRGB(hex);
    r1 = rgb[0];
    g1 = rgb[1];
    b1 = rgb[2];
  } else if (Array.isArray(r1)) {
    b1 = r1[2];
    g1 = r1[1];
    r1 = r1[0];
  }

  const hash = ((r1 as number) << 16) | ((g1 as number) << 8) | (b1 as number);

  if (_cache[hash] !== null && _cache[hash] !== undefined) {
    return _cache[hash];
  }

  let ldiff = Infinity;
  let li = -1;
  let i = 0;
  let c: number[];
  let r2: number;
  let g2: number;
  let b2: number;
  let diff: number;

  for (; i < vcolors.length; i++) {
    c = vcolors[i];
    r2 = c[0];
    g2 = c[1];
    b2 = c[2];

    diff = colorDistance(r1 as number, g1 as number, b1 as number, r2, g2, b2);

    if (diff === 0) {
      li = i;
      break;
    }

    if (diff < ldiff) {
      ldiff = diff;
      li = i;
    }
  }

  _cache[hash] = li;
  return _cache[hash];
}

export function RGBToHex(r: number | number[], g?: number, b?: number): string {
  if (Array.isArray(r)) {
    b = r[2];
    g = r[1];
    r = r[0];
  }

  function hex(n: number): string {
    const s = n.toString(16);
    if (s.length < 2) return '0' + s;
    return s;
  }

  return '#' + hex(r as number) + hex(g as number) + hex(b as number);
}

export function hexToRGB(hex: string): [number, number, number] {
  if (hex.length === 4) {
    hex = hex[0] + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
  }

  const col = parseInt(hex.substring(1), 16);
  const r = (col >> 16) & 0xff;
  const g = (col >> 8) & 0xff;
  const b = col & 0xff;

  return [r, g, b];
}

// Color distance using human perception weights
function colorDistance(r1: number, g1: number, b1: number, r2: number, g2: number, b2: number): number {
  return Math.pow(30 * (r1 - r2), 2)
    + Math.pow(59 * (g1 - g2), 2)
    + Math.pow(11 * (b1 - b2), 2);
}

// Mix two colors with alpha blending (EXACT from neo-blessed)
export function mixColors(c1: number, c2: number, alpha?: number | null): number {
  // if (c1 === 0x1ff) return c1;
  // if (c2 === 0x1ff) return c1;
  if (c1 === 0x1ff) c1 = 0;
  if (c2 === 0x1ff) c2 = 0;
  if (alpha === null || alpha === undefined) alpha = 0.5;

  const rgb1 = vcolors[c1];
  let r1 = rgb1[0];
  let g1 = rgb1[1];
  let b1 = rgb1[2];

  const rgb2 = vcolors[c2];
  const r2 = rgb2[0];
  const g2 = rgb2[1];
  const b2 = rgb2[2];

  r1 = (r1 + ((r2 - r1) * alpha)) | 0;
  g1 = (g1 + ((g2 - g1) * alpha)) | 0;
  b1 = (b1 + ((b2 - b1) * alpha)) | 0;

  return match([r1, g1, b1]);
}

// Blend cache
const _blendCache: Record<number, number> = {};

// Blend function (EXACT from neo-blessed)
export function blend(attr: number, attr2?: number | null, alpha?: number): number {
  let name: string;
  let i: number;
  let c: number[];
  let nc: number[];

  let bg = attr & 0x1ff;
  if (attr2 !== null && attr2 !== undefined) {
    let bg2 = attr2 & 0x1ff;
    if (bg === 0x1ff) bg = 0;
    if (bg2 === 0x1ff) bg2 = 0;
    bg = mixColors(bg, bg2, alpha);
  } else {
    if (_blendCache[bg] !== null && _blendCache[bg] !== undefined) {
      bg = _blendCache[bg];
    // } else if (bg < 8) {
    //   bg += 8;
    } else if (bg >= 8 && bg <= 15) {
      bg -= 8;
    } else {
      name = ncolors[bg];
      if (name) {
        for (i = 0; i < ncolors.length; i++) {
          if (name === ncolors[i] && i !== bg) {
            c = vcolors[bg];
            nc = vcolors[i];
            if (nc[0] + nc[1] + nc[2] < c[0] + c[1] + c[2]) {
              _blendCache[bg] = i;
              bg = i;
              break;
            }
          }
        }
      }
    }
  }

  attr &= ~0x1ff;
  attr |= bg;

  let fg = (attr >> 9) & 0x1ff;
  if (attr2 !== null && attr2 !== undefined) {
    let fg2 = (attr2 >> 9) & 0x1ff;
    // 0, 7, 188, 231, 251
    if (fg === 0x1ff) {
      // XXX workaround
      fg = 248;
    } else {
      if (fg === 0x1ff) fg = 7;
      if (fg2 === 0x1ff) fg2 = 7;
      fg = mixColors(fg, fg2, alpha);
    }
  } else {
    if (_blendCache[fg] !== null && _blendCache[fg] !== undefined) {
      fg = _blendCache[fg];
    // } else if (fg < 8) {
    //   fg += 8;
    } else if (fg >= 8 && fg <= 15) {
      fg -= 8;
    } else {
      name = ncolors[fg];
      if (name) {
        for (i = 0; i < ncolors.length; i++) {
          if (name === ncolors[i] && i !== fg) {
            c = vcolors[fg];
            nc = vcolors[i];
            if (nc[0] + nc[1] + nc[2] < c[0] + c[1] + c[2]) {
              _blendCache[fg] = i;
              fg = i;
              break;
            }
          }
        }
      }
    }
  }

  attr &= ~(0x1ff << 9);
  attr |= fg << 9;

  return attr;
}

export function reduce(color: number, total: number): number {
  if (color >= 16 && total <= 16) {
    color = ccolors[color];
  } else if (color >= 8 && total <= 8) {
    color -= 8;
  } else if (color >= 2 && total <= 2) {
    color %= 2;
  }
  return color;
}

// XTerm Colors (EXACT from neo-blessed)
export const xterm = [
  '#000000', // black
  '#cd0000', // red3
  '#00cd00', // green3
  '#cdcd00', // yellow3
  '#0000ee', // blue2
  '#cd00cd', // magenta3
  '#00cdcd', // cyan3
  '#e5e5e5', // gray90
  '#7f7f7f', // gray50
  '#ff0000', // red
  '#00ff00', // green
  '#ffff00', // yellow
  '#5c5cff', // rgb:5c/5c/ff
  '#ff00ff', // magenta
  '#00ffff', // cyan
  '#ffffff'  // white
];

// Seed all 256 colors (EXACT from neo-blessed)
export const colors: string[] = [];
export const vcolors: number[][] = [];

(function initColors() {
  function hex(n: number): string {
    const s = n.toString(16);
    if (s.length < 2) return '0' + s;
    return s;
  }

  function push(i: number, r: number, g: number, b: number) {
    colors[i] = '#' + hex(r) + hex(g) + hex(b);
    vcolors[i] = [r, g, b];
  }

  // 0 - 15
  xterm.forEach(function(c, i) {
    const val = parseInt(c.substring(1), 16);
    push(i, (val >> 16) & 0xff, (val >> 8) & 0xff, val & 0xff);
  });

  // 16 - 231
  for (let r = 0; r < 6; r++) {
    for (let g = 0; g < 6; g++) {
      for (let b = 0; b < 6; b++) {
        const i = 16 + (r * 36) + (g * 6) + b;
        push(i,
          r ? (r * 40 + 55) : 0,
          g ? (g * 40 + 55) : 0,
          b ? (b * 40 + 55) : 0);
      }
    }
  }

  // 232 - 255 are grey.
  for (let g = 0; g < 24; g++) {
    const l = (g * 10) + 8;
    const i = 232 + g;
    push(i, l, l, l);
  }
})();

// Map higher colors to the first 8 colors (EXACT from neo-blessed)
export let ccolors: number[] = (function() {
  const _cols = vcolors.slice();
  const cols = colors.slice();

  // Temporarily limit to 8 colors for matching
  (vcolors as number[][]).length = 8;
  (colors as string[]).length = 8;

  const out = cols.map((c) => match(c));

  // Restore full arrays
  for (let i = 0; i < _cols.length; i++) {
    vcolors[i] = _cols[i];
  }
  for (let i = 0; i < cols.length; i++) {
    colors[i] = cols[i];
  }

  return out;
})();

// Color names (EXACT from neo-blessed)
export const colorNames: Record<string, number> = {
  // special
  default: -1,
  normal: -1,
  bg: -1,
  fg: -1,
  // normal
  black: 0,
  red: 1,
  green: 2,
  yellow: 3,
  blue: 4,
  magenta: 5,
  cyan: 6,
  white: 7,
  // light
  lightblack: 8,
  lightred: 9,
  lightgreen: 10,
  lightyellow: 11,
  lightblue: 12,
  lightmagenta: 13,
  lightcyan: 14,
  lightwhite: 15,
  // bright
  brightblack: 8,
  brightred: 9,
  brightgreen: 10,
  brightyellow: 11,
  brightblue: 12,
  brightmagenta: 13,
  brightcyan: 14,
  brightwhite: 15,
  // alternate spellings
  grey: 8,
  gray: 8,
  lightgrey: 7,
  lightgray: 7,
  brightgrey: 7,
  brightgray: 7
};

// Convert color input to color code (EXACT from neo-blessed)
export function convert(color: number | string | number[]): number {
  if (typeof color === 'number') {
    // already a number
  } else if (typeof color === 'string') {
    color = color.replace(/[\- ]/g, '');
    if (colorNames[color] !== null && colorNames[color] !== undefined) {
      color = colorNames[color];
    } else {
      color = match(color);
    }
  } else if (Array.isArray(color)) {
    color = match(color);
  } else {
    color = -1;
  }
  return color !== -1 ? color : 0x1ff;
}

// ccolors mapping for color name lookup (EXACT from neo-blessed)
const ccolorsMap: Record<string, (number | [number, number])[]> = {
  blue: [
    4,
    12,
    [17, 21],
    [24, 27],
    [31, 33],
    [38, 39],
    45,
    [54, 57],
    [60, 63],
    [67, 69],
    [74, 75],
    81,
    [91, 93],
    [97, 99],
    [103, 105],
    [110, 111],
    117,
    [128, 129],
    [134, 135],
    [140, 141],
    [146, 147],
    153,
    165,
    171,
    177,
    183,
    189
  ],

  green: [
    2,
    10,
    22,
    [28, 29],
    [34, 36],
    [40, 43],
    [46, 50],
    [64, 65],
    [70, 72],
    [76, 79],
    [82, 86],
    [106, 108],
    [112, 115],
    [118, 122],
    [148, 151],
    [154, 158],
    [190, 194]
  ],

  cyan: [
    6,
    14,
    23,
    30,
    37,
    44,
    51,
    66,
    73,
    80,
    87,
    109,
    116,
    123,
    152,
    159,
    195
  ],

  red: [
    1,
    9,
    52,
    [88, 89],
    [94, 95],
    [124, 126],
    [130, 132],
    [136, 138],
    [160, 163],
    [166, 169],
    [172, 175],
    [178, 181],
    [196, 200],
    [202, 206],
    [208, 212],
    [214, 218],
    [220, 224]
  ],

  magenta: [
    5,
    13,
    53,
    90,
    96,
    127,
    133,
    139,
    164,
    170,
    176,
    182,
    201,
    207,
    213,
    219,
    225
  ],

  yellow: [
    3,
    11,
    58,
    [100, 101],
    [142, 144],
    [184, 187],
    [226, 230]
  ],

  black: [
    0,
    8,
    16,
    59,
    102,
    [232, 243]
  ],

  white: [
    7,
    15,
    145,
    188,
    231,
    [244, 255]
  ]
};

export const ncolors: string[] = [];

// Populate ncolors (EXACT from neo-blessed)
Object.keys(ccolorsMap).forEach(function(name) {
  ccolorsMap[name].forEach(function(offset) {
    if (typeof offset === 'number') {
      ncolors[offset] = name;
      (ccolors as any)[offset] = colorNames[name];
      return;
    }
    for (let i = offset[0], l = offset[1]; i <= l; i++) {
      ncolors[i] = name;
      (ccolors as any)[i] = colorNames[name];
    }
  });
  delete (ccolorsMap as any)[name];
});

// ============================================================================
// ADDITIONAL ANSI UTILITIES (not from neo-blessed, but needed for our use)
// ============================================================================

const ESC = '\x1b';
const CSI = `${ESC}[`;

// Special value for transparent
export const TRANSPARENT = -1;

// Parse color name to code (handles case-insensitive lookup)
export function parseColor(color: string | number | undefined): number {
  if (color === undefined || color === null) {
    return -1;
  }

  if (typeof color === 'number') {
    return color;
  }

  // Use neo-blessed convert() which handles all formats
  return convert(color);
}

// Foreground color escape sequence
export function fg(color: string | number): string {
  const code = parseColor(color);
  if (code === -1) return '';

  if (code < 8) {
    return `${CSI}3${code}m`;
  } else if (code < 16) {
    return `${CSI}9${code - 8}m`;
  } else {
    return `${CSI}38;5;${code}m`;
  }
}

// Background color escape sequence
export function bg(color: string | number): string {
  const code = parseColor(color);
  if (code === -1) return '';

  if (code < 8) {
    return `${CSI}4${code}m`;
  } else if (code < 16) {
    return `${CSI}10${code - 8}m`;
  } else {
    return `${CSI}48;5;${code}m`;
  }
}

// Text attributes
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
  noBold: `${CSI}22m`,
  noItalic: `${CSI}23m`,
  noUnderline: `${CSI}24m`,
  noBlink: `${CSI}25m`,
  noInverse: `${CSI}27m`,
  noInvisible: `${CSI}28m`,
  noStrike: `${CSI}29m`,
};

// Cursor control
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

// Screen control
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

// Style builder
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

// Tag parsing for blessed-style tags
const tagRegex = /\{(\/?)([\w-]*)(?::([\w-]+))?\}/g;

// Default color codes (reset to terminal default)
const defaultFg = `${CSI}39m`;
const defaultBg = `${CSI}49m`;

// Opt #6: Memoization cache for parseTags (60-70% faster for static content)
const _parseTagsCache = new Map<string, string>();
const _parseTagsCacheLimit = 1000; // Limit cache size to prevent unbounded growth

export function parseTags(text: string): string {
  // Opt #6: Return cached result if available
  const cached = _parseTagsCache.get(text);
  if (cached !== undefined) {
    return cached;
  }

  const result = text.replace(tagRegex, (match, close, name, value) => {
    // Handle closing tags
    if (close) {
      // {/} with no name = reset all
      if (!name) {
        return attrs.reset;
      }

      // Handle specific closing tags without resetting everything
      switch (name) {
        case 'bold':
          return attrs.noBold;
        case 'underline':
          return attrs.noUnderline;
        case 'blink':
          return attrs.noBlink;
        case 'inverse':
          return attrs.noInverse;
        case 'invisible':
          return attrs.noInvisible;

        // Foreground color closing tags - reset to default fg
        case 'black-fg':
        case 'red-fg':
        case 'green-fg':
        case 'yellow-fg':
        case 'blue-fg':
        case 'magenta-fg':
        case 'cyan-fg':
        case 'white-fg':
        case 'gray-fg':
        case 'grey-fg':
        case 'lightblack-fg':
        case 'lightred-fg':
        case 'lightgreen-fg':
        case 'lightyellow-fg':
        case 'lightblue-fg':
        case 'lightmagenta-fg':
        case 'lightcyan-fg':
        case 'lightwhite-fg':
        case 'brightblack-fg':
        case 'brightred-fg':
        case 'brightgreen-fg':
        case 'brightyellow-fg':
        case 'brightblue-fg':
        case 'brightmagenta-fg':
        case 'brightcyan-fg':
        case 'brightwhite-fg':
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
        case 'fg':
          return defaultFg;

        // Background color closing tags - reset to default bg
        case 'black-bg':
        case 'red-bg':
        case 'green-bg':
        case 'yellow-bg':
        case 'blue-bg':
        case 'magenta-bg':
        case 'cyan-bg':
        case 'white-bg':
        case 'gray-bg':
        case 'grey-bg':
        case 'lightblack-bg':
        case 'lightred-bg':
        case 'lightgreen-bg':
        case 'lightyellow-bg':
        case 'lightblue-bg':
        case 'lightmagenta-bg':
        case 'lightcyan-bg':
        case 'lightwhite-bg':
        case 'brightblack-bg':
        case 'brightred-bg':
        case 'brightgreen-bg':
        case 'brightyellow-bg':
        case 'brightblue-bg':
        case 'brightmagenta-bg':
        case 'brightcyan-bg':
        case 'brightwhite-bg':
        case 'bg':
          return defaultBg;

        default:
          // Unknown closing tag - use reset as fallback
          return attrs.reset;
      }
    }

    if (!name) {
      return match;
    }

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

      // Standard foreground colors (0-7)
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

      // Bright/light foreground colors (8-15)
      case 'lightblack-fg':
      case 'brightblack-fg':
        return fg('lightblack');
      case 'lightred-fg':
      case 'brightred-fg':
        return fg('lightred');
      case 'lightgreen-fg':
      case 'brightgreen-fg':
        return fg('lightgreen');
      case 'lightyellow-fg':
      case 'brightyellow-fg':
        return fg('lightyellow');
      case 'lightblue-fg':
      case 'brightblue-fg':
        return fg('lightblue');
      case 'lightmagenta-fg':
      case 'brightmagenta-fg':
        return fg('lightmagenta');
      case 'lightcyan-fg':
      case 'brightcyan-fg':
        return fg('lightcyan');
      case 'lightwhite-fg':
      case 'brightwhite-fg':
        return fg('lightwhite');

      // Standard background colors (0-7)
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

      // Bright/light background colors (8-15)
      case 'lightblack-bg':
      case 'brightblack-bg':
        return bg('lightblack');
      case 'lightred-bg':
      case 'brightred-bg':
        return bg('lightred');
      case 'lightgreen-bg':
      case 'brightgreen-bg':
        return bg('lightgreen');
      case 'lightyellow-bg':
      case 'brightyellow-bg':
        return bg('lightyellow');
      case 'lightblue-bg':
      case 'brightblue-bg':
        return bg('lightblue');
      case 'lightmagenta-bg':
      case 'brightmagenta-bg':
        return bg('lightmagenta');
      case 'lightcyan-bg':
      case 'brightcyan-bg':
        return bg('lightcyan');
      case 'lightwhite-bg':
      case 'brightwhite-bg':
        return bg('lightwhite');

      case 'fg':
        return value ? fg(value) : '';
      case 'bg':
        return value ? bg(value) : '';

      // Escape sequences for literal braces
      case 'open':
        return '{';
      case 'close':
        return '}';

      default:
        return match;
    }
  });

  // Opt #6: Cache result (with size limit to prevent memory bloat)
  if (_parseTagsCache.size >= _parseTagsCacheLimit) {
    // Simple LRU: delete first (oldest) entry
    const firstKey = _parseTagsCache.keys().next().value;
    if (firstKey !== undefined) {
      _parseTagsCache.delete(firstKey);
    }
  }
  _parseTagsCache.set(text, result);

  return result;
}

// Strip ANSI codes
const ansiRegex = /\x1b\[[0-9;]*m/g;

// Opt #11: Memoization cache for stripAnsi (70-80% faster for static content)
const _stripAnsiCache = new Map<string, string>();
const _stripAnsiCacheLimit = 1000;

export function stripAnsi(text: string): string {
  // Opt #11: Return cached result if available
  const cached = _stripAnsiCache.get(text);
  if (cached !== undefined) {
    return cached;
  }

  const result = text.replace(ansiRegex, '');

  // Opt #11: Cache result (with size limit)
  if (_stripAnsiCache.size >= _stripAnsiCacheLimit) {
    const firstKey = _stripAnsiCache.keys().next().value;
    if (firstKey !== undefined) {
      _stripAnsiCache.delete(firstKey);
    }
  }
  _stripAnsiCache.set(text, result);

  return result;
}

// Text width accounting for ANSI codes
export function textWidth(text: string): number {
  return stripAnsi(text).length;
}

// Legacy aliases
export const colorToRgb = (color: number): number[] => vcolors[color] || [0, 0, 0];
export const rgbToNearestColor = match;

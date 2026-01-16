/**
 * Neo-Blessed Helper Functions
 *
 * These helpers ensure tags are always enabled by default, preventing the common issue
 * where {gray-fg} and other tags show as literal text instead of being parsed.
 *
 * ALWAYS use these helpers instead of calling blessed.* directly.
 *
 * IMPORTANT - COLOR SYSTEM:
 * Neo-blessed only supports 16 standard colors. Do NOT use:
 * - Raw ANSI codes like \x1b[38;5;196m (256-color) - they get stripped
 * - Raw ANSI codes like \x1b[31m - use blessed tags instead
 *
 * USE THESE INSTEAD:
 * - Blessed tags in content: {red-fg}text{/red-fg}
 * - Style properties: style: { fg: 'red', bg: 'black' }
 * - The colorize() helper: colorize('text', 'red')
 *
 * SUPPORTED COLORS: black, red, green, yellow, blue, magenta, cyan, white, gray
 *
 * BBS COMPATIBILITY - AUTOMATIC ANSI CODE CONVERSION:
 * All create* functions automatically convert standard ANSI escape codes to blessed tags.
 * This means blessed elements can display content from bbs.write() and legacy BBS
 * doors without manual conversion.
 *
 * Example:
 *   const content = '\x1b[31mError\x1b[0m: Something went wrong';
 *   const box = createBox({ content });  // Auto-converts to: {red-fg}Error{/}: Something went wrong
 *
 * When calling setContent() after creation, use sanitizeContent() or ansiToTags():
 *   box.setContent(sanitizeContent('\x1b[32mSuccess!\x1b[0m'));
 */

import blessed from '../engines/ui/blessed';
import type {
  ElementOptions,
  ListOptions,
  TextboxOptions,
  ButtonOptions,
  TableOptions,
  LogOptions,
  ScreenOptions
} from '../engines/ui/blessed/core/types';
import type { Screen } from '../engines/ui/blessed/core/screen';
import type { Box } from '../engines/ui/blessed/widgets/box';
import { DockablePanel } from '../engines/ui/blessed/widgets/dockable-panel';
import type { DockablePanelOptions } from '../engines/ui/blessed/widgets/dockable-panel';
import type { List } from '../engines/ui/blessed/widgets/list';
import type { Text } from '../engines/ui/blessed/widgets/text';
import type { Textbox, Textarea } from '../engines/ui/blessed/widgets/textbox';
import type { Button } from '../engines/ui/blessed/widgets/button';
import type { Table } from '../engines/ui/blessed/widgets/table';
import type { Log } from '../engines/ui/blessed/widgets/log';

// Track if we've already warned to avoid spam
const warnedAbout = new Set<string>();

/**
 * Warn about common neo-blessed color mistakes (only once per issue type)
 */
function warnOnce(key: string, message: string): void {
  if (!warnedAbout.has(key)) {
    warnedAbout.add(key);
    console.warn(`[neo-blessed] ${message}`);
  }
}

/**
 * Check content for unsupported ANSI codes and warn
 */
function checkForUnsupportedAnsi(content: string, context: string): void {
  // Check for 256-color ANSI codes (38;5;N or 48;5;N)
  if (/\x1b\[(?:38|48);5;\d+m/.test(content)) {
    warnOnce('256-color',
      `256-color ANSI codes detected in ${context}. ` +
      `Neo-blessed only supports 16 colors. Use blessed tags like {red-fg} instead.`
    );
  }

  // Check for raw ANSI that won't be converted (remaining after ansiToTags)
  const afterConversion = ansiToTags(content);
  if (/\x1b\[/.test(afterConversion)) {
    warnOnce('unsupported-ansi',
      `Unsupported ANSI codes in ${context} were not converted. ` +
      `Use blessed tags like {red-fg}text{/} instead.`
    );
  }
}

/**
 * Setup auto-resize handler for elements with percentage widths/heights
 * Ensures percentage-based dimensions update correctly when screen resizes
 */
function setupAutoResize(element: any, options?: any): void {
  if (!options) return;

  const hasPercentageWidth = typeof options.width === 'string' && options.width.includes('%');
  const hasPercentageHeight = typeof options.height === 'string' && options.height.includes('%');

  if (!hasPercentageWidth && !hasPercentageHeight) return;

  // Store original percentage values
  const originalWidth = options.width;
  const originalHeight = options.height;

  // Wait for element to attach to screen
  element.once('attach', () => {
    if (!element.screen) return;

    // Update dimensions on screen resize
    element.screen.on('resize', () => {
      if (hasPercentageWidth && element.parent) {
        // Recalculate percentage width
        const parentWidth = (element.parent as any).width || element.screen.width;
        if (typeof originalWidth === 'string' && originalWidth.endsWith('%')) {
          const percent = parseInt(originalWidth, 10) / 100;
          element.position.width = Math.floor(parentWidth * percent);
        }
      }

      if (hasPercentageHeight && element.parent) {
        // Recalculate percentage height
        const parentHeight = (element.parent as any).height || element.screen.height;
        if (typeof originalHeight === 'string' && originalHeight.endsWith('%')) {
          const percent = parseInt(originalHeight, 10) / 100;
          element.position.height = Math.floor(parentHeight * percent);
        }
      }

      // Trigger render
      if (element.screen) {
        element.screen.render();
      }
    });
  });
}

/**
 * Process options to ensure tags work correctly
 * - Forces tags: true (cannot be overridden)
 * - Warns if tags: false was attempted
 * - Converts ANSI codes in content
 */
function processElementOptions<T extends ElementOptions>(
  options: T | undefined,
  elementType: string
): T {
  const processed = { ...options } as T;

  // Warn if someone tried to disable tags
  if (options && 'tags' in options && (options as any).tags === false) {
    warnOnce('tags-false',
      `tags: false is not allowed in ${elementType}. ` +
      `Tags are required for color support. Ignoring tags: false.`
    );
  }

  // Auto-convert ANSI codes in content
  if (processed.content && typeof processed.content === 'string') {
    checkForUnsupportedAnsi(processed.content, elementType);
    processed.content = ansiToTags(processed.content);
  }

  return processed;
}

/**
 * Convert ANSI escape codes to blessed tags
 *
 * Enables blessed elements to display content with ANSI codes (from bbs.write(), etc.)
 * Supports both legacy and modern ANSI formats.
 *
 * @example
 * ansiToTags('\x1b[31mError\x1b[0m')        // Returns: {red-fg}Error{/}
 * ansiToTags('\x1b[1;36mInfo\x1b[0m')       // Returns: {bold}{cyan-fg}Info{/}
 * ansiToTags('\x1b[32mOK\x1b[0m')           // Returns: {green-fg}OK{/}
 *
 * Supported ANSI codes:
 * - Colors: 30-37 (fg), 40-47 (bg)
 * - Styles: 0 (reset), 1 (bold), 4 (underline), 7 (inverse)
 * - Combined: \x1b[1;31m (bold + red)
 */
export function ansiToTags(text: string): string {
  // ANSI color code mapping
  const fgColors: Record<number, string> = {
    30: 'black',
    31: 'red',
    32: 'green',
    33: 'yellow',
    34: 'blue',
    35: 'magenta',
    36: 'cyan',
    37: 'white',
    90: 'gray',  // Bright black (gray)
  };

  const bgColors: Record<number, string> = {
    40: 'black',
    41: 'red',
    42: 'green',
    43: 'yellow',
    44: 'blue',
    45: 'magenta',
    46: 'cyan',
    47: 'white',
  };

  // Replace ANSI codes with blessed tags
  return text.replace(/\x1b\[([0-9;]+)m/g, (match, codes) => {
    const parts = codes.split(';').map(Number);
    let result = '';

    for (const code of parts) {
      if (code === 0) {
        // Reset all
        result += '{/}';
      } else if (code === 1) {
        // Bold
        result += '{bold}';
      } else if (code === 4) {
        // Underline
        result += '{underline}';
      } else if (code === 7) {
        // Inverse
        result += '{inverse}';
      } else if (code >= 30 && code <= 37 || code === 90) {
        // Foreground color
        const color = fgColors[code];
        if (color) result += `{${color}-fg}`;
      } else if (code >= 40 && code <= 47) {
        // Background color
        const color = bgColors[code];
        if (color) result += `{${color}-bg}`;
      }
    }

    return result;
  });
}

// createScreen moved to line 431 (below) - merged with proper default styles

/**
 * Create a blessed box with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: If content contains ANSI escape codes (like \x1b[31m),
 * they are automatically converted to blessed tags for proper rendering.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createBox(options?: DockablePanelOptions): DockablePanel {
  return createDockablePanel({
    useTitleBar: false,
    ...options,
  });
}

/**
 * Create a dockable panel with tags ALWAYS enabled
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 */
export function createDockablePanel(options?: DockablePanelOptions): DockablePanel {
  const fixedDefault = options?.fixed ?? (options?.parent instanceof DockablePanel);
  const processedOptions = processElementOptions({
    ...options,
    fixed: fixedDefault,
  } as ElementOptions, 'createDockablePanel');

  const panel = new DockablePanel({
    ...processedOptions,
    tags: true,
  } as DockablePanelOptions);

  setupAutoResize(panel, options);

  return panel;
}

/**
 * Create a blessed list with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: List items with ANSI codes are automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createList(options?: ListOptions): List {
  const processedOptions = processElementOptions(options, 'createList');

  // Also convert ANSI codes in list items
  if (processedOptions.items) {
    processedOptions.items = processedOptions.items.map(item =>
      typeof item === 'string' ? ansiToTags(item) : item
    );
  }

  return blessed.list({
    ...processedOptions,
    tags: true,        // FORCED AFTER spread - cannot be overridden
    focusable: true,   // Enable keyboard navigation (arrow keys, vi keys)
    keys: true,        // Enable keyboard interaction
    mouse: true,       // Enable mouse interaction
  });
}

/**
 * Create a blessed text element with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createText(options?: ElementOptions): Text {
  const processedOptions = processElementOptions(options, 'createText');

  return blessed.text({
    ...processedOptions,
    tags: true,  // FORCED AFTER spread - cannot be overridden
  });
}

/**
 * Create a blessed textbox (single-line input) with tags ALWAYS enabled
 *
 * Use this for single-line input fields like username, password, search boxes.
 * Enter key triggers 'submit' event instead of inserting newline.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 * NOTE: Elements with percentage width/height auto-update on screen resize.
 */
export function createTextbox(options?: TextboxOptions): Textbox {
  const processedOptions = processElementOptions(options, 'createTextbox');

  const textbox = blessed.textbox({
    ...processedOptions,
    tags: true,        // FORCED AFTER spread - cannot be overridden
    focusable: true,   // Enable keyboard focus for input fields
    clickable: true,   // Enable mouse click to focus
    keys: true,        // Enable keyboard interaction
    mouse: true,       // Enable mouse interaction
  });

  // Auto-handle percentage widths/heights on screen resize
  setupAutoResize(textbox, options);

  return textbox;
}

/**
 * Create a blessed textarea (multi-line input) with tags ALWAYS enabled
 *
 * Use this for multi-line text areas like message composition.
 * Enter key inserts newline. Use Shift+Tab to submit.
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 * NOTE: Elements with percentage width/height auto-update on screen resize.
 */
export function createTextarea(options?: TextboxOptions): Textarea {
  const processedOptions = processElementOptions(options, 'createTextarea');

  const textarea = blessed.textarea({
    ...processedOptions,
    tags: true,        // FORCED AFTER spread - cannot be overridden
    focusable: true,   // Enable keyboard focus for input fields
    clickable: true,   // Enable mouse click to focus
    keys: true,        // Enable keyboard interaction
    mouse: true,       // Enable mouse interaction
  });

  // Auto-handle percentage widths/heights on screen resize
  setupAutoResize(textarea, options);

  return textarea;
}

/**
 * Create a blessed log with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 * NOTE: Elements with percentage width/height auto-update on screen resize.
 */
export function createLog(options?: LogOptions): Log {
  const processedOptions = processElementOptions(options, 'createLog');

  const log = blessed.log({
    ...processedOptions,
    tags: true,  // FORCED AFTER spread - cannot be overridden
  });

  // Auto-handle percentage widths/heights on screen resize
  setupAutoResize(log, options);

  return log;
}

/**
 * Create a blessed table with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createTable(options?: TableOptions): Table {
  const processedOptions = processElementOptions(options, 'createTable');

  return blessed.table({
    ...processedOptions,
    tags: true,        // FORCED AFTER spread - cannot be overridden
    focusable: true,   // Enable keyboard navigation through table cells
    keys: true,        // Enable keyboard interaction
    mouse: true,       // Enable mouse interaction
  });
}

/**
 * Create a blessed button with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createButton(options?: ButtonOptions): Button {
  const processedOptions = processElementOptions(options, 'createButton');

  const button = blessed.button({
    ...processedOptions,
    tags: true,        // FORCED AFTER spread - cannot be overridden
    focusable: true,   // Ensure buttons can receive keyboard focus
    clickable: true,   // Ensure buttons respond to clicks
    keys: true,        // Enable keyboard interaction
    mouse: true,       // Enable mouse interaction
  });

  // Debug: Log when button receives events
  button.on('click', () => {
    console.log('[createButton] Button received click event');
  });
  button.on('press', () => {
    console.log('[createButton] Button received press event');
  });
  button.on('mouse', (event: any) => {
    console.log('[createButton] Button received mouse event:', event.action, event.button);
  });

  return button;
}

/**
 * Common Neo-Blessed color tags for easy reference
 * Use these in your content strings: `{red-fg}Error{/red-fg}`
 */
export const Tags = {
  // Foreground colors
  fg: {
    black: '{black-fg}',
    red: '{red-fg}',
    green: '{green-fg}',
    yellow: '{yellow-fg}',
    blue: '{blue-fg}',
    magenta: '{magenta-fg}',
    cyan: '{cyan-fg}',
    white: '{white-fg}',
    gray: '{gray-fg}',
    grey: '{gray-fg}',  // Alias
  },

  // Background colors
  bg: {
    black: '{black-bg}',
    red: '{red-bg}',
    green: '{green-bg}',
    yellow: '{yellow-bg}',
    blue: '{blue-bg}',
    magenta: '{magenta-bg}',
    cyan: '{cyan-bg}',
    white: '{white-bg}',
  },

  // Styles
  bold: '{bold}',
  underline: '{underline}',
  blink: '{blink}',
  inverse: '{inverse}',

  // Reset
  reset: '{/}',
  end: '{/}',  // Alias
} as const;

/**
 * Helper to wrap text in a color tag
 *
 * @example
 * colorize('Error message', 'red')  // Returns: {red-fg}Error message{/}
 */
export function colorize(text: string, color: keyof typeof Tags.fg): string {
  return `${Tags.fg[color]}${text}${Tags.reset}`;
}

/**
 * Sanitize content for blessed elements - handles both ANSI codes and blessed tags
 *
 * Use this when displaying content that might have ANSI codes (from bbs.write(), legacy doors, etc.)
 * in blessed elements. It converts ANSI codes to blessed tags so they render correctly.
 *
 * @example
 * const content = '\x1b[31mError:\x1b[0m Something went wrong';
 * createBox({ content: sanitizeContent(content) });
 * // Displays: {red-fg}Error:{/} Something went wrong
 */
export function sanitizeContent(content: string): string {
  return ansiToTags(content);
}

/**
 * CRITICAL: HOW TO CENTER CONTENT IN BLESSED
 *
 * ❌ WRONG - {center} tags DO NOT WORK in blessed:
 *   content: '{center}My Text{/center}'
 *
 * ✅ CORRECT - Use align property:
 *   createBox({
 *     align: 'center',
 *     content: 'My Text'
 *   })
 *
 * For multi-line centered content, use valign too:
 *   createBox({
 *     align: 'center',
 *     valign: 'middle',
 *     content: 'Line 1\nLine 2\nLine 3'
 *   })
 *
 * Supported align values: 'left', 'center', 'right'
 * Supported valign values: 'top', 'middle', 'bottom'
 */

/**
 * Create a blessed screen with proper default styles
 *
 * Sets default fg/bg colors to prevent inverted text rendering.
 * All neo-blessed doors should use this instead of blessed.screen() directly.
 *
 * @example
 * const screen = createScreen(bbs, { title: 'My Door' });
 * // Or without bbs: const screen = createScreen({ title: 'Test', output: bbs.write });
 */

/**
 * Unicode box-drawing to VT100 ACS (Alternate Character Set) mapping.
 * ACS uses single-byte ASCII chars with ESC(0 prefix, avoiding UTF-8 corruption.
 * xterm.js interprets these natively as box-drawing characters.
 */
const UNICODE_TO_ACS: Record<string, string> = {
  // Light box drawing
  '─': 'q', '│': 'x',
  '┌': 'l', '┐': 'k', '└': 'm', '┘': 'j',
  '├': 't', '┤': 'u', '┬': 'w', '┴': 'v', '┼': 'n',
  // Heavy box drawing (map to light equivalents)
  '━': 'q', '┃': 'x',
  '┏': 'l', '┓': 'k', '┗': 'm', '┛': 'j',
  '┣': 't', '┫': 'u', '┳': 'w', '┻': 'v', '╋': 'n',
  // Double box drawing (map to light equivalents)
  '═': 'q', '║': 'x',
  '╔': 'l', '╗': 'k', '╚': 'm', '╝': 'j',
  '╠': 't', '╣': 'u', '╦': 'w', '╩': 'v', '╬': 'n',
  // Mixed corners (map to light)
  '╒': 'l', '╓': 'l', '╕': 'k', '╖': 'k',
  '╘': 'm', '╙': 'm', '╛': 'j', '╜': 'j',
  '╞': 't', '╟': 't', '╡': 'u', '╢': 'u',
  '╤': 'w', '╥': 'w', '╧': 'v', '╨': 'v', '╪': 'n', '╫': 'n',
};

// Use String.fromCharCode(27) for ESC to survive minification
// Terser strips literal \x1b from strings
const ESC = String.fromCharCode(27);
const ACS_ENTER = ESC + '(0';
const ACS_EXIT = ESC + '(B';

/**
 * Converts Unicode box-drawing characters to VT100 ACS escape sequences.
 * This prevents UTF-8 corruption when multi-byte sequences are split by
 * the modem emulator or interpreted as Windows-1252.
 *
 * Input: "┌─────┐"
 * Output: "\x1b(0lqqqqqk\x1b(B"
 */
export function convertUnicodeBoxToACS(str: string): string {
  let result = '';
  let inACS = false;

  for (const char of str) {
    const acsChar = UNICODE_TO_ACS[char];
    if (acsChar) {
      if (!inACS) {
        result += ACS_ENTER;
        inACS = true;
      }
      result += acsChar;
    } else {
      if (inACS) {
        result += ACS_EXIT;
        inACS = false;
      }
      result += char;
    }
  }

  // Close ACS mode if still active
  if (inACS) {
    result += ACS_EXIT;
  }

  return result;
}

// =============================================================================
// AMIGA COMPATIBILITY MODE
// =============================================================================
// When enabled, replaces Unicode characters with ANSI background colors or ASCII.
// This ensures compatibility with Amiga terminals and telnet clients that don't
// support Unicode. Box-drawing is always converted to VT100 ACS (above).

/**
 * Compatibility mode configuration
 */
export interface CompatibilityConfig {
  /** Enable Amiga/telnet compatibility mode (default: true for BBS) */
  enabled: boolean;
  /** Keep braille characters for modern features like webcam (default: true) */
  keepBraille: boolean;
  /** Keep sparkline characters for charts (default: false in compat mode) */
  keepSparklines: boolean;
}

// Global compatibility mode state (can be changed at runtime)
let compatConfig: CompatibilityConfig = {
  enabled: true,      // Default ON for BBS compatibility
  keepBraille: true,  // Keep braille for webcam demo
  keepSparklines: false,
};

/**
 * Set compatibility mode configuration
 */
export function setCompatibilityMode(config: Partial<CompatibilityConfig>): void {
  compatConfig = { ...compatConfig, ...config };
}

/**
 * Get current compatibility mode configuration
 */
export function getCompatibilityMode(): CompatibilityConfig {
  return { ...compatConfig };
}

/**
 * Unicode characters that need ANSI background color fallbacks.
 * Maps to: [fallbackChar, fgColor, bgColor] or just [fallbackChar] for simple replacement
 * When bgColor is specified, we use a space with that background color.
 */
const UNICODE_TO_ANSI_FALLBACK: Record<string, [string, string?, string?]> = {
  // Block fill characters -> space with background color
  '█': [' ', undefined, 'white'],   // Full block -> white bg
  '▓': [' ', undefined, 'gray'],    // Dark shade -> gray bg
  '▒': [' ', undefined, 'gray'],    // Medium shade -> gray bg
  '░': [' ', undefined, 'black'],   // Light shade -> dark bg
  '▄': [' ', undefined, 'white'],   // Lower half -> white bg
  '▀': [' ', undefined, 'white'],   // Upper half -> white bg

  // Arrows and markers -> ASCII equivalents
  '▶': ['>'],
  '◀': ['<'],
  '▲': ['^'],
  '▼': ['v'],
  '►': ['>'],
  '◄': ['<'],
  '●': ['*'],
  '○': ['o'],
  '◆': ['*'],
  '◇': ['o'],
  '■': ['#'],
  '□': ['o'],
  '▪': ['*'],
  '▫': ['.'],
  '»': ['>>'],
  '«': ['<<'],
  '•': ['*'],
  '·': ['.'],
  '…': ['...'],
  '→': ['->'],
  '←': ['<-'],
  '↑': ['^'],
  '↓': ['v'],
  '✓': ['[OK]'],
  '✗': ['[X]'],
  '✔': ['[OK]'],
  '✘': ['[X]'],
};

/**
 * Sparkline characters (vertical bar graph)
 * Maps to ASCII representation using = and space
 */
const SPARKLINE_CHARS = ['▁', '▂', '▃', '▄', '▅', '▆', '▇', '█'];
const SPARKLINE_ASCII = ['_', '.', '-', '=', '=', '#', '#', '#'];

/**
 * Braille pattern block (U+2800-U+28FF) - kept for modern features
 */
function isBrailleChar(char: string): boolean {
  const code = char.charCodeAt(0);
  return code >= 0x2800 && code <= 0x28FF;
}

/**
 * Check if character is a sparkline character
 */
function isSparklineChar(char: string): boolean {
  return SPARKLINE_CHARS.includes(char);
}

/**
 * Convert Unicode characters to Amiga-compatible equivalents.
 * Uses ANSI background colors for block characters.
 *
 * @param str - Input string with potential Unicode characters
 * @param inheritBg - Background color to inherit for fills (optional)
 * @returns Converted string safe for Amiga/telnet
 */
export function convertToAmigaCompat(str: string, inheritBg?: string): string {
  if (!compatConfig.enabled) {
    return str;
  }

  let result = '';

  for (const char of str) {
    // Keep braille if configured
    if (compatConfig.keepBraille && isBrailleChar(char)) {
      result += char;
      continue;
    }

    // Handle sparklines
    if (isSparklineChar(char)) {
      if (compatConfig.keepSparklines) {
        result += char;
      } else {
        const idx = SPARKLINE_CHARS.indexOf(char);
        result += SPARKLINE_ASCII[idx] || char;
      }
      continue;
    }

    // Check for fallback mapping
    const fallback = UNICODE_TO_ANSI_FALLBACK[char];
    if (fallback) {
      const [fallbackChar, _fg, bg] = fallback;
      if (bg) {
        // Use ANSI background color: ESC[4Xm where X is color code
        const bgCode = getAnsiColorCode(bg, true);
        const resetCode = ESC + '[0m';
        result += `${bgCode}${fallbackChar}${resetCode}`;
      } else {
        result += fallbackChar;
      }
      continue;
    }

    // Pass through other characters unchanged
    result += char;
  }

  return result;
}

/**
 * Get ANSI escape code for a color name
 */
function getAnsiColorCode(color: string, isBackground: boolean): string {
  const base = isBackground ? 40 : 30;
  const colorMap: Record<string, number> = {
    'black': 0,
    'red': 1,
    'green': 2,
    'yellow': 3,
    'blue': 4,
    'magenta': 5,
    'cyan': 6,
    'white': 7,
    'gray': 0,  // Use black for gray in simple mode
    'grey': 0,
  };
  const code = colorMap[color.toLowerCase()] ?? 7;
  return ESC + `[${base + code}m`;
}

/**
 * Combined conversion: Box-drawing to ACS + Unicode to Amiga-compat
 * This is the main function used by createScreen output handler.
 */
export function convertForAmiga(str: string): string {
  // First convert box-drawing to VT100 ACS (always done)
  let result = convertUnicodeBoxToACS(str);

  // Then convert other Unicode if compatibility mode enabled
  if (compatConfig.enabled) {
    result = convertToAmigaCompat(result);
  }

  return result;
}

export function createScreen(
  bbsOrOptions?: any,
  optionsIfBbs?: Partial<ScreenOptions>
): Screen {
  // Handle both signatures: createScreen(bbs, options) and createScreen(options)
  const isBbsFirst = bbsOrOptions && typeof bbsOrOptions.write === 'function';
  const bbs = isBbsFirst ? bbsOrOptions : null;
  const options = isBbsFirst ? optionsIfBbs : bbsOrOptions;

  // Get initial terminal size from BBS if available
  const termSize = bbs?.getTerminalSize?.() || { width: 80, height: 25 };

  // Enable responsive mode if terminal is wider than 80 or options.responsive is true
  const responsive = options?.responsive || termSize.width > 80;

  // Check Unicode capability - use Amiga conversion only for non-Unicode terminals
  // Web terminals always support Unicode (xterm.js)
  // Telnet/SSH: detected via TTYPE negotiation (modern terminals like xterm, PuTTY get Unicode)
  const unicodeCapable = bbs?.unicodeCapable ?? (bbs?.connectionType === 'web' || !bbs);
  const needsAmigaConversion = !unicodeCapable;

  console.log(`[createScreen] connectionType=${bbs?.connectionType}, unicodeCapable=${unicodeCapable}, needsAmigaConversion=${needsAmigaConversion}`);

  // Create output function based on Unicode capability
  const outputFn = bbs
    ? needsAmigaConversion
      ? (data: string) => bbs.write(convertForAmiga(data))
      : (data: string) => bbs.write(data)
    : options?.output;

  const screen = blessed.screen({
    smartCSR: false, // Disabled to prevent jumping/flickering in high-frequency TUI apps
    dockBorders: false, // Disabled for more stable layout rendering
    fullUnicode: unicodeCapable, // Unicode for capable terminals, ACS for Amiga/legacy
    terminal: 'xterm',
    tags: true,
    width: termSize.width,
    height: termSize.height,
    responsive,
    output: outputFn,
    style: {
      fg: 'white',
      bg: 'black'
    },
    ...options
  });

  // Enable mouse support by default for all doors using this helper
  screen.enableMouse();

  // Enable mouse toggle (F12/Alt+M) to allow users to disable if needed
  screen.enableMouseToggle();

  // REMOVED: Auto-join lobby room
  //
  // This was causing "Chat Room: lobby" text to appear in door backgrounds because:
  // 1. createScreen() called bbs.joinRoom('lobby')
  // 2. BBS wrote join messages to terminal BEFORE door took control
  // 3. Blessed screen rendered on top but didn't clear background
  // 4. Chat room text showed through in all doors
  //
  // FIX: Doors that need room membership (like voice-chat) should explicitly call
  // bbs.joinRoom() AFTER setting up their screen, not rely on createScreen() to do it.
  // This prevents unwanted terminal output during door initialization.

  // Listen for resize events from backend if bbs is provided
  if (bbs && typeof bbs.on === 'function') {
    console.log('[createScreen] Setting up screen:resize listener via bbs.on()');
    bbs.on('screen:resize', (size: { cols: number; rows: number }) => {
      console.log(`[createScreen] Received screen:resize event: ${size.cols}x${size.rows}`);
      console.log(`[createScreen] Current screen size: ${screen.width}x${screen.height}`);

      // IMPORTANT: Do NOT force-update screen.width/height before calling resize()!
      // The setters update _width/_height but don't reallocate buffers.
      // This causes resize() to see dimensions already match and return early,
      // leaving buffers at the old size - resulting in a black screen.

      console.log(`[createScreen] screen.resize is: ${typeof screen.resize}`);
      if (typeof screen.resize === 'function') {
        screen.resize(size.cols, size.rows);
        console.log(`[createScreen] After resize: ${screen.width}x${screen.height}`);
      } else {
        console.error('[createScreen] screen.resize is not a function!');
      }
    });
  } else {
    console.log('[createScreen] No bbs.on() available - resize events will not be handled');
  }

  // Forward cursor-style events to frontend for mouse hover feedback
  if (bbs && typeof bbs.setCursorStyle === 'function') {
    screen.on('cursor-style', (style: string) => {
      bbs.setCursorStyle(style);
    });
  }

  return screen;
}

/**
 * Setup input handler for blessed screen
 *
 * Connects terminal input from BBS session to blessed screen.
 * Handles both raw data and F1 key for help.
 *
 * @example
 * const screen = createScreen(bbs);
 * setupInputHandler(session, screen, {
 *   onF1Help: showHelpFn,
 *   debug: true
 * });
 */
export function setupInputHandler(
  session: any,
  screen: Screen,
  options?: {
    onF1Help?: () => void;
    debug?: boolean;
    debugName?: string;
    onData?: (data: string) => boolean | void;
  } | (() => void) // Backward compatibility for onF1Help as 3rd param
) {
  if (!session.bbsSession) return;

  // Handle backward compatibility: if options is a function, treat it as onF1Help
  const config = typeof options === 'function'
    ? { onF1Help: options }
    : (options || {});

  const debugName = config.debugName || 'Door';

  session.bbsSession.doorInputHandler = (data: string) => {
    // 1. Debug logging if enabled
    if (config.debug) {
      const hexData = Buffer.from(data).toString('hex');
      console.log(`[${debugName}] doorInputHandler raw:`, hexData, 'text:', JSON.stringify(data));
    }

    // 2. Custom data handler (can swallow event)
    if (config.onData && config.onData(data) === true) {
      return;
    }

    // 3. Check for F1 key (help)
    if (config.onF1Help && (data === ESC + 'OP' || data === ESC + '[11~')) {
      config.onF1Help();
      return;
    }

    // 4. Pass ALL input to blessed screen's program
    // Neo-blessed's program.ts handles JSON mouse events internally
    if (screen.program) {
      screen.program.emit('data', data);
    }
  };
}

/**
 * Remove input handler from BBS session
 */
export function removeInputHandler(session: any) {
  if (session?.bbsSession) {
    session.bbsSession.doorInputHandler = null;
  }
}

/**
 * Create cleanup function for blessed door
 *
 * Returns a cleanup function that:
 * - Disables mouse
 * - Clears input handler
 * - Destroys screen
 * - Optionally runs custom cleanup
 *
 * @example
 * const cleanup = createCleanupHandler(screen, session, bbs, {
 *   onCleanup: () => { socket.emit('disconnect'); }
 * });
 * screen.key(['C-q'], cleanup);
 */
export function createCleanupHandler(
  screen: Screen,
  session: any,
  bbs: any,
  options?: {
    onCleanup?: () => void;
    exitMessage?: string;
  }
) {
  return () => {
    // Run custom cleanup first
    if (options?.onCleanup) {
      options.onCleanup();
    }

    // Disable mouse and clean up input handler
    screen.disableMouse();
    if (session.bbsSession) {
      delete session.bbsSession.doorInputHandler;
    }

    // Destroy screen
    if (!screen.destroyed) {
      screen.destroy();
    }

    // Show exit message
    if (options?.exitMessage) {
      bbs.write(ESC + '[2J' + ESC + '[H');
      bbs.writeLine(options.exitMessage);
    }
  };
}

/**
 * Setup door lifecycle with proper cleanup handling
 *
 * Combines screen creation, input handler, cleanup, and promise-based lifecycle.
 * Returns { screen, cleanup, promise } for easy door setup.
 *
 * @example
 * const { screen, cleanup } = setupDoorLifecycle(session, bbs, {
 *   title: 'My Door',
 *   onCleanup: () => socket.disconnect()
 * });
 * screen.key(['C-q'], cleanup);
 */
export function setupDoorLifecycle(
  session: any,
  bbs: any,
  options?: {
    title?: string;
    onF1Help?: () => void;
    onCleanup?: () => void;
    exitMessage?: string;
  }
) {
  const screen = createScreen(bbs, { title: options?.title });
  setupInputHandler(session, screen, options?.onF1Help);

  const cleanup = createCleanupHandler(screen, session, bbs, {
    onCleanup: options?.onCleanup,
    exitMessage: options?.exitMessage
  });

  // Setup destroy handler
  screen.on('destroy', () => {
    if (session.bbsSession) {
      session.bbsSession.doorInputHandler = null;
    }
  });

  // Create promise that resolves when door exits
  const promise = new Promise<void>((resolve) => {
    let resolved = false;
    const onDestroy = () => {
      if (!resolved) {
        resolved = true;
        try {
          if (!screen.destroyed) {
            screen.destroy();
          }
        } catch (err) {
          console.error('[Door] Error destroying screen:', err);
        }
        resolve();
      }
    };
    screen.on('destroy', onDestroy);
  });

  return { screen, cleanup, promise };
}

/**
 * Modal Manager - Handles modal overlays and z-index layering
 *
 * Creates a transparent overlay and provides showModal/hideModal functions
 * that properly manage z-index to ensure modals appear on top of the overlay.
 *
 * @example
 * const { showModal, hideModal } = createModalManager(screen, inputBox);
 * const settingsModal = createBox({ ... });
 * showModal(settingsModal);  // Shows overlay + modal on top
 * hideModal(settingsModal);  // Hides both and returns focus to inputBox
 */
export function createModalManager(screen: Screen, returnFocusElement?: any) {
  const modalOverlay = blessed.box({
    parent: screen,
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    fixed: true,
    hidden: true,
    zIndex: 500, // Above normal UI
    ch: ' ',     // Fill with spaces to ensure opacity
    style: { bg: 'black' }
  });

  function showModal(widget: any) {
    modalOverlay.show();
    modalOverlay.setFront();  // Bring overlay to front first
    widget.show();
    widget.setFront();        // Then bring modal on top of overlay
    widget.focus();
    screen.render();
  }

  function hideModal(widget: any) {
    modalOverlay.hide();
    widget.hide();
    if (returnFocusElement) {
      returnFocusElement.focus();
    }
    screen.render();
  }

  return { modalOverlay, showModal, hideModal };
}

/**
 * Create standard dialog widgets (Message, Prompt, Question)
 *
 * Provides showMessageDialog, showPromptDialog, and showConfirmDialog functions
 * that automatically handle the overlay and cleanup.
 *
 * @example
 * const { showMessageDialog, showPromptDialog, showConfirmDialog } = createDialogs(screen, inputBox);
 * showMessageDialog('File saved successfully!');
 * showPromptDialog('Enter your name:', 'Guest', (err, name) => { ... });
 * showConfirmDialog('Delete this file?', (confirmed) => { ... });
 */
export function createDialogs(screen: Screen, returnFocusElement?: any) {
  const { modalOverlay, showModal, hideModal } = createModalManager(screen, returnFocusElement);

  const messageDialog = blessed.message({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    tags: true,
    zIndex: 600, // Above overlay
    ch: ' ',     // Ensure solid background
    style: { fg: 'white', bg: 'blue', transparent: true, border: { fg: 'cyan' } }
  });

  const promptDialog = blessed.prompt({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 50,
    tags: true,
    zIndex: 600, // Above overlay
    ch: ' ',     // Ensure solid background
    style: { fg: 'white', bg: 'blue', transparent: true, border: { fg: 'green' } }
  });

  const questionDialog = blessed.question({
    parent: screen,
    top: 'center',
    left: 'center',
    width: 45,
    title: ' Confirm ',
    tags: true,
    zIndex: 600, // Above overlay
    ch: ' ',     // Ensure solid background
    style: { fg: 'white', bg: 'blue', transparent: true, border: { fg: 'yellow' } }
  });

  function showMessageDialog(text: string, callback?: () => void) {
    modalOverlay.show();
    modalOverlay.setFront();
    messageDialog.show();
    messageDialog.setFront();
    messageDialog.focus();
    messageDialog.once('hide', () => {
      modalOverlay.hide();
      if (returnFocusElement) returnFocusElement.focus();
      screen.render();
    });
    messageDialog.display(text, () => {
      if (callback) callback();
    });
  }

  function showPromptDialog(text: string, value: string, callback: (err: Error | null, val?: string) => void) {
    modalOverlay.show();
    modalOverlay.setFront();
    promptDialog.show();
    promptDialog.setFront();
    promptDialog.focus();
    promptDialog.once('hide', () => {
      modalOverlay.hide();
      if (returnFocusElement) returnFocusElement.focus();
      screen.render();
    });
    promptDialog.showInput(text, value, (err, val) => {
      callback(err, val);
    });
  }

  function showConfirmDialog(text: string, callback: (answer: boolean) => void) {
    modalOverlay.show();
    modalOverlay.setFront();
    questionDialog.show();
    questionDialog.setFront();
    questionDialog.focus();
    questionDialog.once('hide', () => {
      modalOverlay.hide();
      if (returnFocusElement) returnFocusElement.focus();
      screen.render();
    });
    questionDialog.ask(text, (answer: boolean) => {
      callback(answer);
    });
  }

  return {
    modalOverlay,
    showModal,
    hideModal,
    messageDialog,
    promptDialog,
    questionDialog,
    showMessageDialog,
    showPromptDialog,
    showConfirmDialog
  };
}

/**
 * Disable mouse click selection on an element
 *
 * Prevents accidental selections when using mouse for other interactions.
 * Useful for games with custom mouse handling (e.g., arkanoid paddle control).
 *
 * @example
 * const menu = createList({ items: ['Start', 'Quit'] });
 * disableMouseSelect(menu);  // Can't click to select, must use keyboard
 */
export function disableMouseSelect(element: any): void {
  if (element) {
    element.options.clickable = false;
    element.clickable = false;
  }
}

/**
 * Enable mouse click selection on an element
 *
 * Re-enables mouse selection after it was disabled.
 *
 * @example
 * enableMouseSelect(menu);  // Re-enable clicking
 */
export function enableMouseSelect(element: any): void {
  if (element) {
    element.options.clickable = true;
    element.clickable = true;
  }
}

/**
 * Add context menu to an element (right-click menu)
 *
 * Automatically handles right-click events and shows a popup menu.
 *
 * @example
 * const menu = addContextMenu(myBox, screen, [
 *   { label: 'Copy', action: () => console.log('Copy') },
 *   { label: 'Paste', action: () => console.log('Paste'), disabled: true },
 *   { separator: true },
 *   { label: 'Delete', action: () => console.log('Delete') }
 * ]);
 */
export function addContextMenu(
  element: any,
  screen: any,
  items: Array<{
    label: string;
    action?: () => void;
    disabled?: boolean;
    separator?: boolean;
  }>
): any {
  const { ContextMenu } = require('../engines/ui/blessed');

  const contextMenu = new ContextMenu({
    parent: screen,
    items,
  });

  // Show menu on right-click
  element.on('mousedown', (event: any) => {
    if (event.button === 'right') {
      contextMenu.showAt(event.x, event.y);
    }
  });

  return contextMenu;
}

/**
 * Create a Panel widget for multi-panel layouts
 *
 * Features:
 * - Visual indication when panel is active (has focused child)
 * - Alt+<number> shortcuts for quick switching
 * - F6 cycles through panels
 *
 * @example
 * const leftPanel = createPanel({
 *   parent: screen,
 *   left: 0,
 *   top: 0,
 *   width: '50%',
 *   height: '100%',
 *   title: 'Files',
 *   panelIndex: 1,  // Alt+1 to activate
 * });
 *
 * const rightPanel = createPanel({
 *   parent: screen,
 *   left: '50%',
 *   top: 0,
 *   width: '50%',
 *   height: '100%',
 *   title: 'Preview',
 *   panelIndex: 2,  // Alt+2 to activate
 * });
 */
export function createPanel(options: any): any {
  const { Panel } = require('../engines/ui/blessed');
  return new Panel({
    tags: true,
    ...options,
  });
}

// Export DoorInputManager for centralized input state management
export { DoorInputManager, type DoorInputOptions } from './door-input-manager';

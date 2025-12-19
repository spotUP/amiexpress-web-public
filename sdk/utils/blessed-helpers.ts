/**
 * Neo-Blessed Helper Functions
 *
 * These helpers ensure tags are always enabled by default, preventing the common issue
 * where {gray-fg} and other tags show as literal text instead of being parsed.
 *
 * ALWAYS use these helpers instead of calling blessed.* directly.
 */

import * as blessed from 'neo-blessed';

/**
 * Create a blessed box with tags enabled by default
 */
export function createBox(options: blessed.Widgets.BoxOptions): blessed.Widgets.BoxElement {
  return blessed.box({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
}

/**
 * Create a blessed list with tags enabled by default
 */
export function createList(options: blessed.Widgets.ListOptions<blessed.Widgets.ListElementStyle>): blessed.Widgets.ListElement {
  return blessed.list({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
}

/**
 * Create a blessed text element with tags enabled by default
 */
export function createText(options: blessed.Widgets.TextOptions): blessed.Widgets.TextElement {
  return blessed.text({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
}

/**
 * Create a blessed textarea with tags enabled by default
 */
export function createTextarea(options: blessed.Widgets.TextareaOptions): blessed.Widgets.TextareaElement {
  return blessed.textarea({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
}

/**
 * Create a blessed log with tags enabled by default
 */
export function createLog(options: blessed.Widgets.BoxOptions): blessed.Widgets.Log {
  return blessed.log({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
}

/**
 * Create a blessed table with tags enabled by default
 */
export function createTable(options: blessed.Widgets.TableOptions): blessed.Widgets.TableElement {
  return blessed.table({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
}

/**
 * Create a blessed button with tags enabled by default
 */
export function createButton(options: blessed.Widgets.ButtonOptions): blessed.Widgets.ButtonElement {
  return blessed.button({
    tags: true,  // CRITICAL: Enable tag parsing
    ...options,
  });
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

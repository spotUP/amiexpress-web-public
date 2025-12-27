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
// Track if we've already warned to avoid spam
const warnedAbout = new Set();
/**
 * Warn about common neo-blessed color mistakes (only once per issue type)
 */
function warnOnce(key, message) {
    if (!warnedAbout.has(key)) {
        warnedAbout.add(key);
        console.warn(`[neo-blessed] ${message}`);
    }
}
/**
 * Check content for unsupported ANSI codes and warn
 */
function checkForUnsupportedAnsi(content, context) {
    // Check for 256-color ANSI codes (38;5;N or 48;5;N)
    if (/\x1b\[(?:38|48);5;\d+m/.test(content)) {
        warnOnce('256-color', `256-color ANSI codes detected in ${context}. ` +
            `Neo-blessed only supports 16 colors. Use blessed tags like {red-fg} instead.`);
    }
    // Check for raw ANSI that won't be converted (remaining after ansiToTags)
    const afterConversion = ansiToTags(content);
    if (/\x1b\[/.test(afterConversion)) {
        warnOnce('unsupported-ansi', `Unsupported ANSI codes in ${context} were not converted. ` +
            `Use blessed tags like {red-fg}text{/} instead.`);
    }
}
/**
 * Process options to ensure tags work correctly
 * - Forces tags: true (cannot be overridden)
 * - Warns if tags: false was attempted
 * - Converts ANSI codes in content
 */
function processElementOptions(options, elementType) {
    const processed = { ...options };
    // Warn if someone tried to disable tags
    if (options && 'tags' in options && options.tags === false) {
        warnOnce('tags-false', `tags: false is not allowed in ${elementType}. ` +
            `Tags are required for color support. Ignoring tags: false.`);
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
export function ansiToTags(text) {
    // ANSI color code mapping
    const fgColors = {
        30: 'black',
        31: 'red',
        32: 'green',
        33: 'yellow',
        34: 'blue',
        35: 'magenta',
        36: 'cyan',
        37: 'white',
        90: 'gray', // Bright black (gray)
    };
    const bgColors = {
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
            }
            else if (code === 1) {
                // Bold
                result += '{bold}';
            }
            else if (code === 4) {
                // Underline
                result += '{underline}';
            }
            else if (code === 7) {
                // Inverse
                result += '{inverse}';
            }
            else if (code >= 30 && code <= 37 || code === 90) {
                // Foreground color
                const color = fgColors[code];
                if (color)
                    result += `{${color}-fg}`;
            }
            else if (code >= 40 && code <= 47) {
                // Background color
                const color = bgColors[code];
                if (color)
                    result += `{${color}-bg}`;
            }
        }
        return result;
    });
}
/**
 * Create a blessed screen
 *
 * ALWAYS use this instead of blessed.screen() for consistency
 * Note: Tags are enabled per-element (see createBox, createList, etc.)
 */
export function createScreen(options) {
    return blessed.screen({
        smartCSR: true,
        ...options,
    });
}
/**
 * Create a blessed box with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: If content contains ANSI escape codes (like \x1b[31m),
 * they are automatically converted to blessed tags for proper rendering.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createBox(options) {
    const processedOptions = processElementOptions(options, 'createBox');
    return blessed.box({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
    });
}
/**
 * Create a blessed list with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: List items with ANSI codes are automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createList(options) {
    const processedOptions = processElementOptions(options, 'createList');
    // Also convert ANSI codes in list items
    if (processedOptions.items) {
        processedOptions.items = processedOptions.items.map(item => typeof item === 'string' ? ansiToTags(item) : item);
    }
    return blessed.list({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
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
export function createText(options) {
    const processedOptions = processElementOptions(options, 'createText');
    return blessed.text({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
    });
}
/**
 * Create a blessed textarea with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createTextarea(options) {
    const processedOptions = processElementOptions(options, 'createTextarea');
    return blessed.textarea({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
    });
}
/**
 * Create a blessed log with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createLog(options) {
    const processedOptions = processElementOptions(options, 'createLog');
    return blessed.log({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
    });
}
/**
 * Create a blessed table with tags ALWAYS enabled
 *
 * AUTO-CONVERTS ANSI CODES: Content with ANSI codes is automatically converted to blessed tags.
 *
 * NOTE: tags: true is FORCED and cannot be disabled. This prevents color bugs.
 * NOTE: For dialogs/overlays that need opaque backgrounds, explicitly set style.bg.
 */
export function createTable(options) {
    const processedOptions = processElementOptions(options, 'createTable');
    return blessed.table({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
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
export function createButton(options) {
    const processedOptions = processElementOptions(options, 'createButton');
    return blessed.button({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
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
        grey: '{gray-fg}', // Alias
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
    end: '{/}', // Alias
};
/**
 * Helper to wrap text in a color tag
 *
 * @example
 * colorize('Error message', 'red')  // Returns: {red-fg}Error message{/}
 */
export function colorize(text, color) {
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
export function sanitizeContent(content) {
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

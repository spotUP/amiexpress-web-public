"use strict";
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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Tags = void 0;
exports.ansiToTags = ansiToTags;
exports.createBox = createBox;
exports.createList = createList;
exports.createText = createText;
exports.createTextarea = createTextarea;
exports.createLog = createLog;
exports.createTable = createTable;
exports.createButton = createButton;
exports.colorize = colorize;
exports.sanitizeContent = sanitizeContent;
exports.createScreen = createScreen;
exports.setupInputHandler = setupInputHandler;
exports.createCleanupHandler = createCleanupHandler;
exports.setupDoorLifecycle = setupDoorLifecycle;
exports.createModalManager = createModalManager;
exports.createDialogs = createDialogs;
const blessed_1 = __importDefault(require("../engines/ui/blessed"));
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
function ansiToTags(text) {
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
function createBox(options) {
    const processedOptions = processElementOptions(options, 'createBox');
    return blessed_1.default.box({
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
function createList(options) {
    const processedOptions = processElementOptions(options, 'createList');
    // Also convert ANSI codes in list items
    if (processedOptions.items) {
        processedOptions.items = processedOptions.items.map(item => typeof item === 'string' ? ansiToTags(item) : item);
    }
    return blessed_1.default.list({
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
function createText(options) {
    const processedOptions = processElementOptions(options, 'createText');
    return blessed_1.default.text({
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
function createTextarea(options) {
    const processedOptions = processElementOptions(options, 'createTextarea');
    return blessed_1.default.textarea({
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
function createLog(options) {
    const processedOptions = processElementOptions(options, 'createLog');
    return blessed_1.default.log({
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
function createTable(options) {
    const processedOptions = processElementOptions(options, 'createTable');
    return blessed_1.default.table({
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
function createButton(options) {
    const processedOptions = processElementOptions(options, 'createButton');
    return blessed_1.default.button({
        ...processedOptions,
        tags: true, // FORCED AFTER spread - cannot be overridden
    });
}
/**
 * Common Neo-Blessed color tags for easy reference
 * Use these in your content strings: `{red-fg}Error{/red-fg}`
 */
exports.Tags = {
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
function colorize(text, color) {
    return `${exports.Tags.fg[color]}${text}${exports.Tags.reset}`;
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
function sanitizeContent(content) {
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
function createScreen(bbsOrOptions, optionsIfBbs) {
    // Handle both signatures: createScreen(bbs, options) and createScreen(options)
    const isBbsFirst = bbsOrOptions && typeof bbsOrOptions.write === 'function';
    const bbs = isBbsFirst ? bbsOrOptions : null;
    const options = isBbsFirst ? optionsIfBbs : bbsOrOptions;
    return blessed_1.default.screen({
        smartCSR: true,
        dockBorders: true,
        fullUnicode: true,
        tags: true,
        output: bbs ? (data) => bbs.write(data) : options?.output,
        style: {
            fg: 'white',
            bg: 'black'
        },
        ...options
    });
}
/**
 * Setup input handler for blessed screen
 *
 * Connects terminal input from BBS session to blessed screen.
 * Handles both raw data and F1 key for help.
 *
 * @example
 * const screen = createScreen(bbs);
 * setupInputHandler(session, screen, showHelpFn);
 */
function setupInputHandler(session, screen, onF1Help) {
    if (!session.bbsSession)
        return;
    session.bbsSession.doorInputHandler = (data) => {
        // Check for F1 key (help)
        if (onF1Help && (data === '\x1bOP' || data === '\x1b[11~')) {
            onF1Help();
            return;
        }
        // Pass input to blessed screen's program
        if (screen.program) {
            screen.program.emit('data', data);
        }
    };
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
function createCleanupHandler(screen, session, bbs, options) {
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
            bbs.write('\x1b[2J\x1b[H');
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
function setupDoorLifecycle(session, bbs, options) {
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
    const promise = new Promise((resolve) => {
        let resolved = false;
        const onDestroy = () => {
            if (!resolved) {
                resolved = true;
                try {
                    if (!screen.destroyed) {
                        screen.destroy();
                    }
                }
                catch (err) {
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
function createModalManager(screen, returnFocusElement) {
    const modalOverlay = blessed_1.default.overlay({
        parent: screen,
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        opacity: 0.5,
        hidden: true,
        style: { bg: 'black' }
    });
    function showModal(widget) {
        modalOverlay.show();
        modalOverlay.setFront(); // Bring overlay to front first
        widget.show();
        widget.setFront(); // Then bring modal on top of overlay
        widget.focus();
        screen.render();
    }
    function hideModal(widget) {
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
function createDialogs(screen, returnFocusElement) {
    const { modalOverlay, showModal, hideModal } = createModalManager(screen, returnFocusElement);
    const messageDialog = blessed_1.default.message({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 50,
        tags: true,
        style: { fg: 'white', bg: 'black', border: { fg: 'cyan' } }
    });
    const promptDialog = blessed_1.default.prompt({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 50,
        tags: true,
        style: { fg: 'white', bg: 'black', border: { fg: 'green' } }
    });
    const questionDialog = blessed_1.default.question({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 45,
        title: ' Confirm ',
        tags: true,
        style: { fg: 'white', bg: 'black', border: { fg: 'yellow' } }
    });
    function showMessageDialog(text, callback) {
        modalOverlay.show();
        modalOverlay.setFront();
        messageDialog.once('hide', () => {
            modalOverlay.hide();
            if (returnFocusElement)
                returnFocusElement.focus();
            screen.render();
        });
        messageDialog.display(text, () => {
            if (callback)
                callback();
        });
    }
    function showPromptDialog(text, value, callback) {
        modalOverlay.show();
        modalOverlay.setFront();
        promptDialog.once('hide', () => {
            modalOverlay.hide();
            if (returnFocusElement)
                returnFocusElement.focus();
            screen.render();
        });
        promptDialog.showInput(text, value, (err, val) => {
            callback(err, val);
        });
    }
    function showConfirmDialog(text, callback) {
        modalOverlay.show();
        modalOverlay.setFront();
        questionDialog.once('hide', () => {
            modalOverlay.hide();
            if (returnFocusElement)
                returnFocusElement.focus();
            screen.render();
        });
        questionDialog.ask(text, (answer) => {
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

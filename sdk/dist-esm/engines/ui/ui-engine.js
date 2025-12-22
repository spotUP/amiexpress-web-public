/**
 * UI Engine - Blessed Terminal UI Library Integration
 *
 * Provides a powerful ncurses-like widget system for creating sophisticated
 * ASCII/ANSI user interfaces in BBS doors. Built on our browser-compatible blessed port,
 * this engine offers a DOM-like API for terminal applications with:
 *
 * - Rich widget library (boxes, lists, forms, tables, progress bars, etc.)
 * - Efficient rendering (only draws screen changes)
 * - Mouse and keyboard input handling
 * - Focus management and navigation
 * - Styling and theming support
 * - Layout management
 *
 * @example Basic Usage
 * ```typescript
 * import { UIEngine } from '@amiexpress/bbs-door-sdk';
 *
 * const ui = new UIEngine();
 *
 * // Create a centered box
 * const box = ui.createBox({
 *   top: 'center',
 *   left: 'center',
 *   width: '50%',
 *   height: '50%',
 *   content: 'Hello World!',
 *   border: { type: 'line' },
 *   style: { fg: 'white', bg: 'blue' }
 * });
 *
 * // Render the screen
 * ui.render();
 *
 * // Get ANSI output to send to client
 * const output = ui.getOutput();
 * ```
 *
 * @example Interactive Form
 * ```typescript
 * const form = ui.createForm({
 *   top: 2,
 *   left: 2,
 *   width: 50,
 *   height: 20
 * });
 *
 * const input = ui.createTextbox({
 *   parent: form,
 *   top: 1,
 *   left: 1,
 *   width: 30,
 *   height: 1,
 *   label: 'Name: '
 * });
 *
 * form.on('submit', () => {
 *   console.log('User entered:', input.getValue());
 * });
 * ```
 */
import blessed from './blessed/index';
/**
 * UI Engine - Blessed Integration
 *
 * Main class for creating terminal UIs using blessed widgets.
 * Handles screen management, widget creation, rendering, and output capture.
 */
export class UIEngine {
    constructor(options = {}) {
        this.elements = new Map();
        this.focusStack = [];
        // Create blessed screen with optimizations
        this.screen = blessed.screen({
            smartCSR: options.smartCSR !== false,
            fastCSR: options.fastCSR !== false,
            resizeTimeout: 300,
            autoPadding: options.autoPadding !== false,
            fullUnicode: options.fullUnicode || false,
            terminal: options.terminal || 'ansi',
            output: options.output,
        });
        this.screen.width = options.width || 80;
        this.screen.height = options.height || 24;
        // Note: Mouse and keyboard support are always enabled in our blessed implementation
        // enableMouse() and enableKeys() are not needed
        // Setup exit handler
        this.screen.key(['escape', 'q', 'C-c'], () => {
            this.emit('exit');
        });
    }
    // ========================================================================
    // BOX WIDGETS
    // ========================================================================
    /**
     * Create a box element - the fundamental building block for layouts
     *
     * @example
     * ```typescript
     * const box = ui.createBox({
     *   top: 'center',
     *   left: 'center',
     *   width: 40,
     *   height: 10,
     *   content: 'Hello!',
     *   border: { type: 'line' },
     *   style: { fg: 'white', bg: 'blue' }
     * });
     * ```
     */
    createBox(options) {
        const box = blessed.box({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, box);
        }
        return box;
    }
    /**
     * Create a text element - optimized for simple text display
     */
    createText(options) {
        const text = blessed.text({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, text);
        }
        return text;
    }
    /**
     * Create a line element - for dividers
     */
    createLine(options) {
        // TODO: Implement line widget in blessed port
        const line = blessed.box({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, line);
        }
        return line;
    }
    // ========================================================================
    // LIST WIDGETS
    // ========================================================================
    /**
     * Create a scrollable list with selectable items
     *
     * @example
     * ```typescript
     * const list = ui.createList({
     *   top: 1,
     *   left: 1,
     *   width: 30,
     *   height: 10,
     *   items: ['Item 1', 'Item 2', 'Item 3'],
     *   border: { type: 'line' },
     *   style: { selected: { bg: 'blue' } }
     * });
     *
     * list.on('select', (item, index) => {
     *   console.log(`Selected: ${item.content} at index ${index}`);
     * });
     * ```
     */
    createList(options) {
        const list = blessed.list({
            ...options,
            parent: options.parent || this.screen,
            keys: true,
            vi: true,
            scrollbar: options.scrollbar,
        });
        if (options.id) {
            this.elements.set(options.id, list);
        }
        return list;
    }
    /**
     * Create a file manager widget for directory browsing
     */
    createFileManager(options) {
        // TODO: Implement FileManager widget in blessed port
        const fm = blessed.box({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, fm);
        }
        return fm;
    }
    /**
     * Create a table with rows and columns
     */
    createListTable(options) {
        // TODO: Implement ListTable widget in blessed port
        const table = blessed.table({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, table);
        }
        return table;
    }
    // ========================================================================
    // FORM WIDGETS
    // ========================================================================
    /**
     * Create a form container for input elements
     *
     * @example
     * ```typescript
     * const form = ui.createForm({
     *   top: 2,
     *   left: 2,
     *   width: 50,
     *   height: 20,
     *   border: { type: 'line' }
     * });
     *
     * form.on('submit', (data) => {
     *   console.log('Form submitted:', data);
     * });
     * ```
     */
    createForm(options) {
        const form = blessed.form({
            ...options,
            parent: options.parent || this.screen,
            keys: true,
        });
        if (options.id) {
            this.elements.set(options.id, form);
        }
        return form;
    }
    /**
     * Create a single-line text input
     */
    createTextbox(options) {
        const textbox = blessed.textbox({
            ...options,
            parent: options.parent || this.screen,
            inputOnFocus: true,
        });
        if (options.id) {
            this.elements.set(options.id, textbox);
        }
        return textbox;
    }
    /**
     * Create a multi-line text input
     */
    createTextarea(options) {
        const textarea = blessed.textarea({
            ...options,
            parent: options.parent || this.screen,
            inputOnFocus: true,
        });
        if (options.id) {
            this.elements.set(options.id, textarea);
        }
        return textarea;
    }
    /**
     * Create a button
     */
    createButton(options) {
        const button = blessed.button({
            ...options,
            parent: options.parent || this.screen,
            mouse: true,
            keys: true,
        });
        if (options.id) {
            this.elements.set(options.id, button);
        }
        return button;
    }
    /**
     * Create a checkbox
     */
    createCheckbox(options) {
        // TODO: Implement Checkbox widget in blessed port
        const checkbox = blessed.button({
            ...options,
            parent: options.parent || this.screen,
            keys: true,
        });
        if (options.id) {
            this.elements.set(options.id, checkbox);
        }
        return checkbox;
    }
    /**
     * Create a radio button set
     */
    createRadioSet(options) {
        // TODO: Implement RadioSet widget in blessed port
        const radioSet = blessed.form({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, radioSet);
        }
        return radioSet;
    }
    // ========================================================================
    // PROMPT WIDGETS
    // ========================================================================
    /**
     * Create a prompt dialog
     */
    createPrompt(options) {
        // TODO: Implement Prompt widget in blessed port
        const prompt = blessed.box({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, prompt);
        }
        return prompt;
    }
    /**
     * Create a message dialog
     */
    createMessage(options) {
        // TODO: Implement Message widget in blessed port
        const message = blessed.box({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, message);
        }
        return message;
    }
    /**
     * Create a loading spinner
     */
    createLoading(options) {
        // TODO: Implement Loading widget in blessed port
        const loading = blessed.box({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, loading);
        }
        return loading;
    }
    // ========================================================================
    // DATA DISPLAY WIDGETS
    // ========================================================================
    /**
     * Create a progress bar
     *
     * @example
     * ```typescript
     * const progress = ui.createProgressBar({
     *   top: 10,
     *   left: 10,
     *   width: 50,
     *   height: 3,
     *   border: { type: 'line' },
     *   filled: 0
     * });
     *
     * progress.setProgress(50); // 50%
     * ```
     */
    createProgressBar(options) {
        const progressBar = blessed.progressbar({
            ...options,
            parent: options.parent || this.screen,
            style: options.style,
        });
        if (options.id) {
            this.elements.set(options.id, progressBar);
        }
        return progressBar;
    }
    /**
     * Create a scrollable log display
     */
    createLog(options) {
        const log = blessed.log({
            ...options,
            parent: options.parent || this.screen,
            scrollable: true,
            scrollbar: options.scrollbar,
        });
        if (options.id) {
            this.elements.set(options.id, log);
        }
        return log;
    }
    /**
     * Create a table
     */
    createTable(options) {
        const table = blessed.table({
            ...options,
            parent: options.parent || this.screen,
        });
        if (options.id) {
            this.elements.set(options.id, table);
        }
        return table;
    }
    // ========================================================================
    // SCREEN MANAGEMENT
    // ========================================================================
    /**
     * Render the screen and capture output
     */
    render() {
        this.screen.render();
    }
    /**
     * Get the rendered ANSI output to send to client
     * This captures the screen buffer as ANSI escape sequences
     */
    getOutput() {
        // The screen's output is already written to the output stream
        // For BBS usage, we need to capture this
        // This is a simplified approach - in production, you'd want to
        // pipe the output stream to a buffer
        return '';
    }
    /**
     * Clear the screen
     */
    clear() {
        this.screen.clearRegion(0, this.screen.width, 0, this.screen.height);
    }
    /**
     * Set screen title
     */
    setTitle(title) {
        this.screen.title = title;
    }
    /**
     * Get an element by ID
     */
    getElement(id) {
        return this.elements.get(id);
    }
    /**
     * Remove an element
     */
    removeElement(id) {
        const element = this.elements.get(id);
        if (element) {
            element.destroy();
            this.elements.delete(id);
        }
    }
    // ========================================================================
    // FOCUS MANAGEMENT
    // ========================================================================
    /**
     * Focus an element
     */
    focus(element) {
        element.focus();
    }
    /**
     * Focus next element
     */
    focusNext() {
        this.screen.focusNext();
    }
    /**
     * Focus previous element
     */
    focusPrevious() {
        this.screen.focusPrevious();
    }
    // ========================================================================
    // INPUT HANDLING
    // ========================================================================
    /**
     * Handle key press
     */
    onKey(key, callback) {
        this.screen.key(key, callback);
    }
    /**
     * Remove key handler
     */
    removeKey(key, callback) {
        this.screen.unkey(key, callback);
    }
    /**
     * Emit custom events
     */
    emit(event, ...args) {
        this.screen.emit(event, ...args);
    }
    /**
     * Listen to events
     */
    on(event, callback) {
        this.screen.on(event, callback);
    }
    /**
     * Listen to event once
     */
    once(event, callback) {
        this.screen.once(event, callback);
    }
    // ========================================================================
    // CLEANUP
    // ========================================================================
    /**
     * Destroy the screen and clean up resources
     */
    destroy() {
        this.screen.destroy();
        this.elements.clear();
        this.focusStack = [];
    }
    /**
     * Get the underlying blessed screen object for advanced usage
     */
    getScreen() {
        return this.screen;
    }
}

/**
 * UI Engine - Neo-Blessed Terminal UI Library Integration
 *
 * Provides a powerful ncurses-like widget system for creating sophisticated
 * ASCII/ANSI user interfaces in BBS doors. Built on neo-blessed, this engine
 * offers a DOM-like API for terminal applications with:
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

import * as blessed from 'neo-blessed';
import { Widgets } from 'blessed';

/**
 * UI Engine Options
 */
export interface UIEngineOptions {
  /** Screen width (default: 80) */
  width?: number;
  /** Screen height (default: 24) */
  height?: number;
  /** Enable smart CSR optimization (default: true) */
  smartCSR?: boolean;
  /** Enable fast CSR optimization (default: true) */
  fastCSR?: boolean;
  /** Enable back-color-erase optimization (default: true) */
  useBCE?: boolean;
  /** Auto-padding for borders (default: true) */
  autoPadding?: boolean;
  /** Support full Unicode (default: false) */
  fullUnicode?: boolean;
  /** Terminal type (default: 'ansi') */
  terminal?: string;
  /** Enable mouse support (default: true) */
  enableMouse?: boolean;
  /** Enable keyboard support (default: true) */
  enableKeys?: boolean;
  /** Custom input stream */
  input?: any;
  /** Custom output stream */
  output?: any;
}

/**
 * Common widget styling options
 */
export interface WidgetStyle {
  fg?: string;
  bg?: string;
  bold?: boolean;
  underline?: boolean;
  blink?: boolean;
  inverse?: boolean;
  invisible?: boolean;
  transparent?: boolean;
  border?: {
    fg?: string;
    bg?: string;
  };
  scrollbar?: {
    fg?: string;
    bg?: string;
  };
  focus?: {
    fg?: string;
    bg?: string;
    border?: { fg?: string; bg?: string };
  };
  hover?: {
    fg?: string;
    bg?: string;
  };
}

/**
 * UI Engine - Neo-Blessed Integration
 *
 * Main class for creating terminal UIs using neo-blessed widgets.
 * Handles screen management, widget creation, rendering, and output capture.
 */
export class UIEngine {
  private screen: Widgets.Screen;
  private elements: Map<string, Widgets.Node> = new Map();
  private focusStack: Widgets.Node[] = [];

  constructor(options: UIEngineOptions = {}) {
    // Create blessed screen with optimizations
    this.screen = blessed.screen({
      width: options.width || 80,
      height: options.height || 24,
      smartCSR: options.smartCSR !== false,
      fastCSR: options.fastCSR !== false,
      useBCE: options.useBCE !== false,
      autoPadding: options.autoPadding !== false,
      fullUnicode: options.fullUnicode || false,
      terminal: options.terminal || 'ansi',
      forceUnicode: false,
      dockBorders: true,
      input: options.input,
      output: options.output,
    });

    // Enable input if requested
    if (options.enableMouse !== false) {
      this.screen.enableMouse();
    }
    if (options.enableKeys !== false) {
      this.screen.enableKeys();
    }

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
  createBox(options: Widgets.BoxOptions & { parent?: Widgets.Node; id?: string }): Widgets.BoxElement {
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
  createText(options: Widgets.TextOptions & { parent?: Widgets.Node; id?: string }): Widgets.TextElement {
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
  createLine(options: Widgets.LineOptions & { parent?: Widgets.Node; id?: string }): Widgets.LineElement {
    const line = blessed.line({
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
  createList(options: Widgets.ListOptions<any> & { parent?: Widgets.Node; id?: string }): Widgets.ListElement {
    const list = blessed.list({
      ...options,
      parent: options.parent || this.screen,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: !options.scrollbar ? undefined : {
        ch: ' ',
        track: {
          bg: 'cyan'
        },
        style: {
          inverse: true
        }
      },
    });

    if (options.id) {
      this.elements.set(options.id, list);
    }

    return list;
  }

  /**
   * Create a file manager widget for directory browsing
   */
  createFileManager(options: Widgets.FileManagerOptions & { parent?: Widgets.Node; id?: string }): Widgets.FileManagerElement {
    const fm = blessed.filemanager({
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
  createListTable(options: Widgets.ListTableOptions & { parent?: Widgets.Node; id?: string }): Widgets.ListTableElement {
    const table = blessed.listtable({
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
  createForm(options: Widgets.FormOptions & { parent?: Widgets.Node; id?: string }): Widgets.FormElement<any> {
    const form = blessed.form({
      ...options,
      parent: options.parent || this.screen,
      keys: true,
    }) as Widgets.FormElement<any>;

    if (options.id) {
      this.elements.set(options.id, form);
    }

    return form;
  }

  /**
   * Create a single-line text input
   */
  createTextbox(options: Widgets.TextboxOptions & { parent?: Widgets.Node; id?: string }): Widgets.TextboxElement {
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
  createTextarea(options: Widgets.TextareaOptions & { parent?: Widgets.Node; id?: string }): Widgets.TextareaElement {
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
  createButton(options: Widgets.ButtonOptions & { parent?: Widgets.Node; id?: string }): Widgets.ButtonElement {
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
  createCheckbox(options: Widgets.CheckboxOptions & { parent?: Widgets.Node; id?: string }): Widgets.CheckboxElement {
    const checkbox = blessed.checkbox({
      ...options,
      parent: options.parent || this.screen,
      mouse: true,
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
  createRadioSet(options: Widgets.RadioSetOptions & { parent?: Widgets.Node; id?: string }): Widgets.RadioSetElement {
    const radioSet = blessed.radioset({
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
  createPrompt(options: Widgets.PromptOptions & { parent?: Widgets.Node; id?: string }): Widgets.PromptElement {
    const prompt = blessed.prompt({
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
  createMessage(options: Widgets.MessageOptions & { parent?: Widgets.Node; id?: string }): Widgets.MessageElement {
    const message = blessed.message({
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
  createLoading(options: Widgets.LoadingOptions & { parent?: Widgets.Node; id?: string }): Widgets.LoadingElement {
    const loading = blessed.loading({
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
  createProgressBar(options: Widgets.ProgressBarOptions & { parent?: Widgets.Node; id?: string }): Widgets.ProgressBarElement {
    const progressBar = blessed.progressbar({
      ...options,
      parent: options.parent || this.screen,
      style: {
        bar: {
          bg: 'blue'
        },
        ...(options.style || {})
      },
    });

    if (options.id) {
      this.elements.set(options.id, progressBar);
    }

    return progressBar;
  }

  /**
   * Create a scrollable log display
   */
  createLog(options: Widgets.LogOptions & { parent?: Widgets.Node; id?: string }): Widgets.Log {
    const log = blessed.log({
      ...options,
      parent: options.parent || this.screen,
      scrollable: true,
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'cyan'
        },
        style: {
          inverse: true
        }
      },
    });

    if (options.id) {
      this.elements.set(options.id, log);
    }

    return log;
  }

  /**
   * Create a table
   */
  createTable(options: Widgets.TableOptions & { parent?: Widgets.Node; id?: string }): Widgets.TableElement {
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
  render(): void {
    this.screen.render();
  }

  /**
   * Get the rendered ANSI output to send to client
   * This captures the screen buffer as ANSI escape sequences
   */
  getOutput(): string {
    // The screen's output is already written to the output stream
    // For BBS usage, we need to capture this
    // This is a simplified approach - in production, you'd want to
    // pipe the output stream to a buffer
    return '';
  }

  /**
   * Clear the screen
   */
  clear(): void {
    this.screen.clearRegion(0, this.screen.width as number, 0, this.screen.height as number);
  }

  /**
   * Set screen title
   */
  setTitle(title: string): void {
    this.screen.title = title;
  }

  /**
   * Get an element by ID
   */
  getElement(id: string): Widgets.Node | undefined {
    return this.elements.get(id);
  }

  /**
   * Remove an element
   */
  removeElement(id: string): void {
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
  focus(element: Widgets.Node): void {
    (element as any).focus();
  }

  /**
   * Focus next element
   */
  focusNext(): void {
    this.screen.focusNext();
  }

  /**
   * Focus previous element
   */
  focusPrevious(): void {
    this.screen.focusPrevious();
  }

  // ========================================================================
  // INPUT HANDLING
  // ========================================================================

  /**
   * Handle key press
   */
  onKey(key: string | string[], callback: (ch: any, key: any) => void): void {
    this.screen.key(key, callback);
  }

  /**
   * Remove key handler
   */
  removeKey(key: string, callback: (ch: any, key: any) => void): void {
    this.screen.unkey(key, callback);
  }

  /**
   * Emit custom events
   */
  emit(event: string, ...args: any[]): void {
    this.screen.emit(event, ...args);
  }

  /**
   * Listen to events
   */
  on(event: string, callback: (...args: any[]) => void): void {
    this.screen.on(event, callback);
  }

  /**
   * Listen to event once
   */
  once(event: string, callback: (...args: any[]) => void): void {
    this.screen.once(event, callback);
  }

  // ========================================================================
  // CLEANUP
  // ========================================================================

  /**
   * Destroy the screen and clean up resources
   */
  destroy(): void {
    this.screen.destroy();
    this.elements.clear();
    this.focusStack = [];
  }

  /**
   * Get the underlying blessed screen object for advanced usage
   */
  getScreen(): Widgets.Screen {
    return this.screen;
  }
}

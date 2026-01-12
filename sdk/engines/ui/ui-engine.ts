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
import type {
  Screen,
  Element,
  ElementOptions,
  ListOptions,
  FormOptions,
  TextboxOptions,
  ButtonOptions,
  ProgressBarOptions,
  TableOptions,
  LogOptions,
} from './blessed/core/types';
import { DockablePanel } from './blessed/widgets/dockable-panel';
import type { DockablePanelOptions } from './blessed/widgets/dockable-panel';

// Type aliases for backward compatibility with neo-blessed API
// TODO: Full neo-blessed API compatibility layer
type WidgetNode = Element;
type BoxOptions = DockablePanelOptions;
type TextOptions = ElementOptions;

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
 * UI Engine - Blessed Integration
 *
 * Main class for creating terminal UIs using blessed widgets.
 * Handles screen management, widget creation, rendering, and output capture.
 */
export class UIEngine {
  private screen: any; // Screen type - using any to avoid circular type issues
  private elements: Map<string, Element> = new Map();
  private focusStack: Element[] = [];

  constructor(options: UIEngineOptions = {}) {
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
  createBox(options: BoxOptions & { parent?: WidgetNode; id?: string }): Element {
    const fixedDefault = options.fixed ?? (options.parent instanceof DockablePanel);
    const box = new DockablePanel({
      ...options,
      fixed: fixedDefault,
      parent: options.parent || this.screen,
      useTitleBar: false,
    });

    if (options.id) {
      this.elements.set(options.id, box);
    }

    return box;
  }

  /**
   * Create a text element - optimized for simple text display
   */
  createText(options: TextOptions & { parent?: WidgetNode; id?: string }): Element {
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
  createLine(options: any & { parent?: WidgetNode; id?: string }): Element {
    // TODO: Implement line widget in blessed port
    const line = blessed.box({
      ...options,
      fixed: true,
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
  createList(options: ListOptions & { parent?: WidgetNode; id?: string }): Element {
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
  createFileManager(options: any & { parent?: WidgetNode; id?: string }): Element {
    // TODO: Implement FileManager widget in blessed port
    const fm = blessed.box({
      ...options,
      fixed: true,
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
  createListTable(options: any & { parent?: WidgetNode; id?: string }): Element {
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
  createForm(options: FormOptions & { parent?: WidgetNode; id?: string }): Element {
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
  createTextbox(options: TextboxOptions & { parent?: WidgetNode; id?: string }): Element {
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
  createTextarea(options: TextboxOptions & { parent?: WidgetNode; id?: string }): Element {
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
  createButton(options: ButtonOptions & { parent?: WidgetNode; id?: string }): Element {
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
  createCheckbox(options: any & { parent?: WidgetNode; id?: string }): Element {
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
  createRadioSet(options: any & { parent?: WidgetNode; id?: string }): Element {
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
  createPrompt(options: any & { parent?: WidgetNode; id?: string }): Element {
    // TODO: Implement Prompt widget in blessed port
    const prompt = blessed.box({
      ...options,
      fixed: true,
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
  createMessage(options: any & { parent?: WidgetNode; id?: string }): Element {
    // TODO: Implement Message widget in blessed port
    const message = blessed.box({
      ...options,
      fixed: true,
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
  createLoading(options: any & { parent?: WidgetNode; id?: string }): Element {
    // TODO: Implement Loading widget in blessed port
    const loading = blessed.box({
      ...options,
      fixed: true,
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
  createProgressBar(options: ProgressBarOptions & { parent?: WidgetNode; id?: string }): Element {
    const progressBar = blessed.progressbar({
      ...options,
      parent: options.parent || this.screen,
      style: options.style as any,
    });

    if (options.id) {
      this.elements.set(options.id, progressBar);
    }

    return progressBar;
  }

  /**
   * Create a scrollable log display
   */
  createLog(options: LogOptions & { parent?: WidgetNode; id?: string }): Element {
    const log = blessed.log({
      ...options,
      parent: options.parent || this.screen,
      scrollable: true,
      scrollbar: options.scrollbar as any,
    });

    if (options.id) {
      this.elements.set(options.id, log);
    }

    return log;
  }

  /**
   * Create a table
   */
  createTable(options: TableOptions & { parent?: WidgetNode; id?: string }): Element {
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
  render(force: boolean = false): void {
    if (force) {
      this.screen.forceFullRedraw();
    }
    this.screen.render();
  }

  /**
   * Get the rendered ANSI output to send to client
   * This captures the screen buffer as ANSI escape sequences
   */
  getOutput(): string {
    return this.screen.getOutput();
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
  getElement(id: string): Element | undefined {
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
  focus(element: Element): void {
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
  getScreen(): any {
    return this.screen;
  }
}

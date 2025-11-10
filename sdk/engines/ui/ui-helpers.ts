/**
 * UI Helpers - Common BBS UI Patterns and Utilities
 *
 * Provides high-level helper functions for creating common BBS UI elements
 * like menus, dialogs, input forms, and status displays using neo-blessed.
 *
 * These helpers encapsulate best practices for BBS UI design and make it
 * easy to create professional-looking interfaces quickly.
 */

import { UIEngine } from './ui-engine';
import type { Widgets } from 'blessed';

/**
 * Menu item definition
 */
export interface MenuItem {
  /** Display text */
  label: string;
  /** Shortcut key */
  key?: string;
  /** Callback when selected */
  action: () => void | Promise<void>;
  /** Whether item is enabled */
  enabled?: boolean;
}

/**
 * Dialog options
 */
export interface DialogOptions {
  title: string;
  message: string;
  buttons?: string[];
  width?: number;
  height?: number;
}

/**
 * Input dialog options
 */
export interface InputDialogOptions {
  title: string;
  label: string;
  defaultValue?: string;
  secret?: boolean;
  maxLength?: number;
  width?: number;
}

/**
 * Confirm dialog options
 */
export interface ConfirmDialogOptions {
  title: string;
  message: string;
  width?: number;
}

/**
 * List selection options
 */
export interface ListSelectionOptions {
  title: string;
  items: string[];
  width?: number;
  height?: number;
}

/**
 * Status bar options
 */
export interface StatusBarOptions {
  position?: 'top' | 'bottom';
  height?: number;
  style?: any;
}

/**
 * UI Helpers class - High-level BBS UI patterns
 */
export class UIHelpers {
  constructor(private ui: UIEngine) {}

  /**
   * Create a vertical menu
   *
   * @example
   * ```typescript
   * const helpers = new UIHelpers(ui);
   * const menu = helpers.createMenu({
   *   top: 2,
   *   left: 2,
   *   width: 30,
   *   height: 15,
   *   title: 'Main Menu'
   * }, [
   *   { label: 'New Game', key: 'n', action: () => startNewGame() },
   *   { label: 'Load Game', key: 'l', action: () => loadGame() },
   *   { label: 'Options', key: 'o', action: () => showOptions() },
   *   { label: 'Quit', key: 'q', action: () => quit() }
   * ]);
   * ```
   */
  createMenu(
    options: Widgets.ListOptions<any> & { title?: string },
    items: MenuItem[]
  ): Widgets.ListElement {
    const itemLabels = items.map((item, i) => {
      const key = item.key ? `[${item.key}]` : `[${i + 1}]`;
      const enabled = item.enabled !== false;
      return enabled ? `${key} ${item.label}` : `    ${item.label} (disabled)`;
    });

    const list = this.ui.createList({
      ...options,
      label: options.title ? ` ${options.title} ` : undefined,
      items: itemLabels,
      border: options.border || { type: 'line' },
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
        },
        border: {
          fg: 'cyan',
        },
        ...(options.style || {}),
      },
    });

    // Handle selection
    list.on('select', (_: any, index: number) => {
      const item = items[index];
      if (item && item.enabled !== false) {
        item.action();
      }
    });

    // Handle keyboard shortcuts
    items.forEach((item, index) => {
      if (item.key && item.enabled !== false) {
        list.key(item.key, () => {
          list.select(index);
          item.action();
        });
      }
    });

    list.focus();
    return list;
  }

  /**
   * Create a horizontal menu bar
   *
   * @example
   * ```typescript
   * const menuBar = helpers.createMenuBar({
   *   top: 0,
   *   height: 1
   * }, [
   *   { label: 'File', key: 'f', action: () => showFileMenu() },
   *   { label: 'Edit', key: 'e', action: () => showEditMenu() },
   *   { label: 'Help', key: 'h', action: () => showHelp() }
   * ]);
   * ```
   */
  createMenuBar(
    options: Widgets.BoxOptions,
    items: MenuItem[]
  ): Widgets.BoxElement {
    const menuText = items
      .map(item => {
        const key = item.key ? item.key.toUpperCase() : '';
        return `{cyan-fg}[{/cyan-fg}{white-fg}${key}{/white-fg}{cyan-fg}]{/cyan-fg} ${item.label}`;
      })
      .join('  ');

    const box = this.ui.createBox({
      ...options,
      content: menuText,
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        ...(options.style || {}),
      },
    });

    // Handle keyboard shortcuts
    items.forEach(item => {
      if (item.key && item.enabled !== false) {
        box.key(item.key, () => {
          item.action();
        });
      }
    });

    return box;
  }

  /**
   * Show an alert dialog
   *
   * @example
   * ```typescript
   * await helpers.showAlert({
   *   title: 'Error',
   *   message: 'Could not save file!',
   *   buttons: ['OK']
   * });
   * ```
   */
  async showAlert(options: DialogOptions): Promise<string> {
    return new Promise((resolve) => {
      const width = options.width || 50;
      const height = options.height || 10;

      const msg = this.ui.createMessage({
        top: 'center',
        left: 'center',
        width,
        height,
        label: ` ${options.title} `,
        content: options.message,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'red' },
        },
        tags: true,
      });

      // Create OK button
      const button = this.ui.createButton({
        parent: msg,
        bottom: 1,
        left: 'center',
        width: 10,
        height: 3,
        content: 'OK',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'blue',
          focus: {
            bg: 'cyan',
          },
        },
      });

      button.on('press', () => {
        msg.destroy();
        this.ui.render();
        resolve('OK');
      });

      button.key(['enter', 'escape'], () => {
        button.press();
      });

      msg.show();
      button.focus();
      this.ui.render();
    });
  }

  /**
   * Show a confirmation dialog
   *
   * @example
   * ```typescript
   * const confirmed = await helpers.showConfirm({
   *   title: 'Confirm',
   *   message: 'Are you sure you want to delete this item?'
   * });
   *
   * if (confirmed) {
   *   // Delete item
   * }
   * ```
   */
  async showConfirm(options: ConfirmDialogOptions): Promise<boolean> {
    return new Promise((resolve) => {
      const width = options.width || 50;

      const box = this.ui.createBox({
        top: 'center',
        left: 'center',
        width,
        height: 8,
        label: ` ${options.title} `,
        content: options.message,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'yellow' },
        },
        tags: true,
      });

      // Create Yes button
      const yesButton = this.ui.createButton({
        parent: box,
        bottom: 1,
        left: 5,
        width: 10,
        height: 3,
        content: 'Yes',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'green',
          focus: {
            bg: 'cyan',
          },
        },
      });

      // Create No button
      const noButton = this.ui.createButton({
        parent: box,
        bottom: 1,
        right: 5,
        width: 10,
        height: 3,
        content: 'No',
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'red',
          focus: {
            bg: 'cyan',
          },
        },
      });

      yesButton.on('press', () => {
        box.destroy();
        this.ui.render();
        resolve(true);
      });

      noButton.on('press', () => {
        box.destroy();
        this.ui.render();
        resolve(false);
      });

      yesButton.key(['enter', 'y'], () => {
        yesButton.press();
      });

      noButton.key(['escape', 'n'], () => {
        noButton.press();
      });

      box.show();
      yesButton.focus();
      this.ui.render();
    });
  }

  /**
   * Show an input dialog
   *
   * @example
   * ```typescript
   * const name = await helpers.showInput({
   *   title: 'Enter Name',
   *   label: 'Name:',
   *   defaultValue: 'Player'
   * });
   *
   * if (name) {
   *   console.log('User entered:', name);
   * }
   * ```
   */
  async showInput(options: InputDialogOptions): Promise<string | null> {
    return new Promise((resolve) => {
      const width = options.width || 50;

      const box = this.ui.createBox({
        top: 'center',
        left: 'center',
        width,
        height: 8,
        label: ` ${options.title} `,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'cyan' },
        },
      });

      // Create label
      this.ui.createText({
        parent: box,
        top: 1,
        left: 2,
        content: options.label,
      });

      // Create input
      const input = this.ui.createTextbox({
        parent: box,
        top: 2,
        left: 2,
        width: width - 6,
        height: 1,
        value: options.defaultValue || '',
        secret: options.secret,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'black',
          focus: {
            border: { fg: 'green' },
          },
        },
      });

      input.on('submit', () => {
        const value = input.getValue();
        box.destroy();
        this.ui.render();
        resolve(value);
      });

      input.on('cancel', () => {
        box.destroy();
        this.ui.render();
        resolve(null);
      });

      box.show();
      input.focus();
      input.readInput();
      this.ui.render();
    });
  }

  /**
   * Show a list selection dialog
   *
   * @example
   * ```typescript
   * const selected = await helpers.showListSelection({
   *   title: 'Select Character',
   *   items: ['Warrior', 'Mage', 'Rogue', 'Cleric']
   * });
   *
   * if (selected !== null) {
   *   console.log('Selected:', selected);
   * }
   * ```
   */
  async showListSelection(options: ListSelectionOptions): Promise<number | null> {
    return new Promise((resolve) => {
      const width = options.width || 40;
      const height = options.height || 15;

      const box = this.ui.createBox({
        top: 'center',
        left: 'center',
        width,
        height,
        label: ` ${options.title} `,
        border: { type: 'line' },
        style: {
          fg: 'white',
          bg: 'black',
          border: { fg: 'cyan' },
        },
      });

      const list = this.ui.createList({
        parent: box,
        top: 0,
        left: 0,
        width: width - 4,
        height: height - 4,
        items: options.items,
        style: {
          selected: {
            bg: 'blue',
          },
        },
      });

      list.on('select', (_: any, index: number) => {
        box.destroy();
        this.ui.render();
        resolve(index);
      });

      list.key(['escape'], () => {
        box.destroy();
        this.ui.render();
        resolve(null);
      });

      box.show();
      list.focus();
      this.ui.render();
    });
  }

  /**
   * Create a status bar
   *
   * @example
   * ```typescript
   * const statusBar = helpers.createStatusBar({
   *   position: 'bottom'
   * });
   *
   * // Update status
   * statusBar.setContent('Ready | Items: 5 | HP: 100/100');
   * ```
   */
  createStatusBar(options: StatusBarOptions = {}): Widgets.BoxElement {
    const position = options.position || 'bottom';
    const height = options.height || 1;

    return this.ui.createBox({
      [position]: 0,
      left: 0,
      width: '100%',
      height,
      content: '',
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
        ...(options.style || {}),
      },
    });
  }

  /**
   * Create a title/header bar
   */
  createTitleBar(title: string, subtitle?: string): Widgets.BoxElement {
    const content = subtitle
      ? `{center}{bold}${title}{/bold}\n{center}${subtitle}{/center}`
      : `{center}{bold}${title}{/bold}{/center}`;

    return this.ui.createBox({
      top: 0,
      left: 0,
      width: '100%',
      height: subtitle ? 3 : 2,
      content,
      tags: true,
      style: {
        fg: 'white',
        bg: 'blue',
      },
    });
  }

  /**
   * Create a bordered panel
   */
  createPanel(
    title: string,
    options: Widgets.BoxOptions & { content?: string }
  ): Widgets.BoxElement {
    return this.ui.createBox({
      ...options,
      label: ` ${title} `,
      border: options.border || { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        ...(options.style || {}),
      },
    });
  }

  /**
   * Create a progress indicator with label
   */
  createProgressIndicator(
    options: Widgets.ProgressBarOptions & { label?: string }
  ): { bar: Widgets.ProgressBarElement; label: Widgets.TextElement } {
    const container = this.ui.createBox({
      top: options.top,
      left: options.left,
      width: options.width,
      height: options.height || 5,
    });

    const label = this.ui.createText({
      parent: container,
      top: 0,
      left: 0,
      content: options.label || 'Progress:',
    });

    const bar = this.ui.createProgressBar({
      parent: container,
      top: 1,
      left: 0,
      width: options.width,
      height: 3,
      border: { type: 'line' },
      filled: options.filled || 0,
    });

    return { bar, label };
  }

  /**
   * Create a scrollable text viewer
   */
  createTextViewer(
    options: Widgets.BoxOptions & { content: string; title?: string }
  ): Widgets.BoxElement {
    return this.ui.createBox({
      ...options,
      label: options.title ? ` ${options.title} ` : undefined,
      content: options.content,
      border: options.border || { type: 'line' },
      scrollable: true,
      alwaysScroll: true,
      keys: true,
      vi: true,
      mouse: true,
      scrollbar: {
        ch: ' ',
        track: {
          bg: 'cyan',
        },
        style: {
          inverse: true,
        },
      },
      style: {
        border: { fg: 'cyan' },
        scrollbar: {
          bg: 'blue',
        },
        ...(options.style || {}),
      },
    });
  }

  /**
   * Create a table display
   */
  createDataTable(
    options: Widgets.ListTableOptions & { title?: string; data: string[][] }
  ): Widgets.ListTableElement {
    return this.ui.createListTable({
      ...options,
      label: options.title ? ` ${options.title} ` : undefined,
      data: options.data,
      border: options.border || { type: 'line' },
      style: {
        border: { fg: 'cyan' },
        header: {
          fg: 'white',
          bg: 'blue',
          bold: true,
        },
        cell: {
          selected: {
            bg: 'blue',
          },
        },
        ...(options.style || {}),
      },
    });
  }
}

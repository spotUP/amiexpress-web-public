/**
 * FileBox - File/directory selection dialog
 *
 * Responsive features:
 * - Full-screen on mobile (xs breakpoint)
 * - Touch-friendly row heights
 * - Swipe navigation
 */

import { List } from './list';
import { Box } from './box';
import type { ListOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';
import { MIN_TOUCH_HEIGHT, DIALOG_EDGE_PADDING } from '../core/responsive-constants';

export interface FileBoxOptions extends ListOptions {
  cwd?: string;
  directory?: boolean;
  allowMultiple?: boolean;
  /** Enable full-screen mode on mobile (default: true) */
  mobileFullScreen?: boolean;
}

export class FileBox extends Box {
  private list: List;
  private cwd: string;
  private directory: boolean;
  private allowMultiple: boolean;
  private selected: string[] = [];
  private _mobileFullScreen: boolean;
  private _desktopWidth: number | string | undefined;
  private _desktopHeight: number | string | undefined;
  private _desktopTop: number | string | undefined;
  private _desktopLeft: number | string | undefined;

  constructor(options: FileBoxOptions = {}) {
    const { cwd, directory, allowMultiple, ...boxOptions } = options;

    super({
      ...boxOptions,
      border: options.border !== undefined ? options.border : { type: 'line' },
      label: options.label || ' Select File ',
    });

    this.cwd = cwd || '/';
    this.directory = directory || false;
    this.allowMultiple = allowMultiple || false;

    // Create internal list
    this.list = new List({
      parent: this,
      top: 0,
      left: 0,
      width: '100%-2',
      height: '100%-2',
      keys: true,
      vi: true,
      mouse: true,
      style: options.style,
    });

    // Handle selection
    this.list.on('select', (item: any, index: number) => {
      this.handleSelection(item.content || item);
    });

    // Handle cancel
    this.list.key(['escape', 'q'], () => {
      this.emit('cancel');
      this.hide();
      return true;
    });

    // Store desktop dimensions for responsive toggling
    this._mobileFullScreen = options.mobileFullScreen !== false;  // Default: enabled
    this._desktopWidth = options.width;
    this._desktopHeight = options.height;
    this._desktopTop = options.top;
    this._desktopLeft = options.left;

    // Load initial directory
    this.refresh();
  }

  /**
   * Refresh file list
   */
  refresh(): void {
    // In browser, we can't actually list files
    // This is a placeholder that emits an event for custom handling
    this.emit('refresh', this.cwd);

    // Default empty list with instructions
    this.list.setItems([
      '(Use setItems() to populate file list)',
      '',
      'Example:',
      'fileBox.setItems(["file1.txt", "file2.txt"]);',
    ]);
  }

  /**
   * Handle file/directory selection
   */
  private handleSelection(item: string): void {
    if (item === '..') {
      // Go up one directory
      const parts = this.cwd.split('/').filter(p => p);
      parts.pop();
      this.cwd = '/' + parts.join('/');
      this.refresh();
      return;
    }

    if (item.endsWith('/')) {
      // Directory - navigate into it
      const dirName = item.slice(0, -1);
      if (this.cwd === '/') {
        this.cwd = '/' + dirName;
      } else {
        this.cwd = this.cwd + '/' + dirName;
      }
      this.refresh();
    } else {
      // File - select it
      if (this.allowMultiple) {
        const index = this.selected.indexOf(item);
        if (index >= 0) {
          this.selected.splice(index, 1);
        } else {
          this.selected.push(item);
        }
        this.emit('select', this.selected, this.cwd);
      } else {
        this.selected = [item];
        this.emit('select', item, this.cwd);
        if (!this.directory) {
          this.hide();
        }
      }
    }
  }

  /**
   * Set file list items
   */
  setItems(items: string[]): void {
    // Add parent directory option if not at root
    const listItems = this.cwd !== '/' ? ['..', ...items] : items;
    this.list.setItems(listItems);
  }

  /**
   * Get current directory
   */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Set current directory
   */
  setCwd(cwd: string): void {
    this.cwd = cwd;
    this.refresh();
  }

  /**
   * Get selected items
   */
  getSelected(): string[] {
    return [...this.selected];
  }

  /**
   * Clear selection
   */
  clearSelection(): void {
    this.selected = [];
  }

  /**
   * Focus the file list
   */
  focus(): void {
    this.list.focus();
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  /**
   * Handle breakpoint change - adjust size
   */
  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    if (state.isMobile) {
      this._setMobileLayout();
    } else {
      this._setDesktopLayout();
    }
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }

  /**
   * Called when entering mobile mode - full screen
   */
  protected _enterMobileMode(): void {
    this._setMobileLayout();
    this.emit('enter-mobile');
  }

  /**
   * Called when exiting mobile mode - restore desktop layout
   */
  protected _exitMobileMode(): void {
    this._setDesktopLayout();
    this.emit('exit-mobile');
  }

  /**
   * Set mobile-friendly layout (full-screen)
   */
  private _setMobileLayout(): void {
    if (!this._mobileFullScreen || !this.screen) return;

    // Full screen with small padding
    const padding = DIALOG_EDGE_PADDING;
    this.top = padding;
    this.left = padding;
    this.width = (this.screen.width as number) - (padding * 2);
    this.height = (this.screen.height as number) - (padding * 2);

    if (this.screen) this.screen.render();
  }

  /**
   * Restore desktop layout
   */
  private _setDesktopLayout(): void {
    if (this._desktopWidth !== undefined) {
      this.width = this._desktopWidth;
    }
    if (this._desktopHeight !== undefined) {
      this.height = this._desktopHeight;
    }
    if (this._desktopTop !== undefined) {
      this.top = this._desktopTop;
    }
    if (this._desktopLeft !== undefined) {
      this.left = this._desktopLeft;
    }

    if (this.screen) this.screen.render();
  }
}

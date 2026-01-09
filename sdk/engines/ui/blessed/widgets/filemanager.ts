/**
 * FileManager - Directory browser widget
 * Note: This is a simplified browser-compatible version
 *
 * Responsive features (inherited from List):
 * - Touch-friendly row heights on mobile
 * - Swipe scrolling on mobile
 * - Momentum scrolling
 */

import { List } from './list';
import type { ElementOptions, ListOptions } from '../core/types';
import type { ResponsiveState } from '../core/responsive-mixin';
import type { BreakpointName } from '../core/responsive-constants';

export interface FileManagerOptions extends ElementOptions {
  cwd?: string;
  files?: string[];
  directories?: string[];
}

export class FileManager extends List {
  private cwd: string = '/';
  private files: string[] = [];
  private directories: string[] = [];

  constructor(options: FileManagerOptions = {}) {
    super({
      ...options,
      keys: true,
      vi: true,
      mouse: true,
      // Amiga-safe scrollbar: space with bg colors (no Unicode needed)
      scrollbar: options.scrollbar === undefined || options.scrollbar ? {
        ch: ' ',
        track: { ch: ' ', style: { bg: 'black' } },
        style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || { bg: 'cyan' },
      } : undefined,
      style: {
        selected: {
          bg: 'blue',
          fg: 'white',
        },
        item: {
          fg: 'white',
          hover: {
            bg: 'blue',
            fg: 'yellow',
          },
        },
        focus: {
          border: {
            fg: 'white',
          }
        },
        ...(options.style || {}),
      },
    } as ListOptions);

    this.cwd = options.cwd || '/';
    this.files = options.files || [];
    this.directories = options.directories || [];

    this.updateItems();

    // Handle focus/blur for visual feedback
    this.on('focus', () => {
      this.screen?.render();
    });

    this.on('blur', () => {
      this.screen?.render();
    });

    // Handle selection
    this.on('select', (item: any) => {
      this.handleSelection(item.content);
    });

    // Enter key to navigate
    this.key(['enter'], () => {
      const selected = this.getSelectedItem();
      if (selected) {
        this.handleSelection(selected);
      }
      return true;
    });

    // Backspace to go up
    this.key(['backspace'], () => {
      this.upDirectory();
      return true;
    });
  }

  /**
   * Update list items from files and directories
   */
  private updateItems(): void {
    const items: string[] = [];

    // Add parent directory if not at root
    if (this.cwd !== '/') {
      items.push('.. (parent)');
    }

    // Add directories first
    for (const dir of this.directories) {
      items.push(`[${dir}]`);
    }

    // Add files
    for (const file of this.files) {
      items.push(file);
    }

    this.setItems(items);
  }

  /**
   * Handle item selection
   */
  private handleSelection(item: string): void {
    if (item === '.. (parent)') {
      this.upDirectory();
    } else if (item.startsWith('[') && item.endsWith(']')) {
      // Directory selected
      const dirName = item.slice(1, -1);
      this.changeDirectory(dirName);
    } else {
      // File selected
      this.emit('file', item, this.getFullPath(item));
    }
  }

  /**
   * Change to a subdirectory
   */
  changeDirectory(dir: string): void {
    const oldCwd = this.cwd;
    this.cwd = this.joinPath(this.cwd, dir);
    this.emit('cd', this.cwd, oldCwd);
    this.refresh();
  }

  /**
   * Go up one directory
   */
  upDirectory(): void {
    if (this.cwd === '/') return;

    const oldCwd = this.cwd;
    const parts = this.cwd.split('/').filter(p => p);
    parts.pop();
    this.cwd = '/' + parts.join('/');
    this.emit('cd', this.cwd, oldCwd);
    this.refresh();
  }

  /**
   * Refresh the file list
   */
  refresh(): void {
    this.emit('refresh', this.cwd);
    // In a real implementation, this would read the filesystem
    // For browser compatibility, we rely on external file list updates
  }

  /**
   * Set current working directory
   */
  setCwd(cwd: string): void {
    this.cwd = cwd;
    this.updateItems();
  }

  /**
   * Get current working directory
   */
  getCwd(): string {
    return this.cwd;
  }

  /**
   * Set files list
   */
  setFiles(files: string[]): void {
    this.files = files;
    this.updateItems();
  }

  /**
   * Set directories list
   */
  setDirectories(directories: string[]): void {
    this.directories = directories;
    this.updateItems();
  }

  /**
   * Set both files and directories
   */
  setListing(files: string[], directories: string[]): void {
    this.files = files;
    this.directories = directories;
    this.updateItems();
  }

  /**
   * Get full path for a file
   */
  private getFullPath(file: string): string {
    return this.joinPath(this.cwd, file);
  }

  /**
   * Join path components
   */
  private joinPath(...parts: string[]): string {
    return parts
      .join('/')
      .replace(/\/+/g, '/')
      .replace(/\/$/, '') || '/';
  }

  /**
   * Pick a file (show dialog and wait for selection)
   * Overrides List.pick() with FileManager-specific behavior
   */
  pick(
    label?: string | ((err?: Error, file?: string) => void),
    callback?: (err?: Error, file?: string) => void
  ): void {
    // Handle overload: pick(callback) or pick(label, callback)
    if (typeof label === 'function') {
      callback = label;
      label = undefined;
    }

    this.show();
    this.focus();

    const onFile = (file: string, fullPath: string) => {
      this.removeListener('file', onFile);
      this.removeListener('cancel', onCancel);
      if (callback) callback(undefined, fullPath);
    };

    const onCancel = () => {
      this.removeListener('file', onFile);
      this.removeListener('cancel', onCancel);
      if (callback) callback(new Error('cancelled'));
    };

    this.once('file', onFile);
    this.key(['escape'], () => {
      onCancel();
      return true;
    });
  }

  /**
   * Reset to initial directory
   */
  reset(cwd?: string): void {
    this.cwd = cwd || '/';
    this.files = [];
    this.directories = [];
    this.updateItems();
    this.select(0);
  }

  // ============================================================================
  // Responsive Lifecycle Hooks
  // ============================================================================

  protected _handleBreakpointChange(
    breakpoint: BreakpointName,
    previousBreakpoint: BreakpointName,
    state: ResponsiveState
  ): void {
    super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
    // FileManager inherits touch-friendly scrolling from List
    this.emit('breakpoint-change', breakpoint, previousBreakpoint);
  }
}

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
import { DIALOG_EDGE_PADDING } from '../core/responsive-constants';
export class FileBox extends Box {
    constructor(options = {}) {
        const { cwd, directory, allowMultiple, ...boxOptions } = options;
        super({
            ...boxOptions,
            border: options.border !== undefined ? options.border : { type: 'line' },
            label: options.label || ' Select File ',
        });
        this.selected = [];
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
        this.list.on('select', (item, index) => {
            this.handleSelection(item.content || item);
        });
        // Handle cancel
        this.list.key(['escape', 'q'], () => {
            this.emit('cancel');
            this.hide();
            return true;
        });
        // Store desktop dimensions for responsive toggling
        this._mobileFullScreen = options.mobileFullScreen !== false; // Default: enabled
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
    refresh() {
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
    handleSelection(item) {
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
            }
            else {
                this.cwd = this.cwd + '/' + dirName;
            }
            this.refresh();
        }
        else {
            // File - select it
            if (this.allowMultiple) {
                const index = this.selected.indexOf(item);
                if (index >= 0) {
                    this.selected.splice(index, 1);
                }
                else {
                    this.selected.push(item);
                }
                this.emit('select', this.selected, this.cwd);
            }
            else {
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
    setItems(items) {
        // Add parent directory option if not at root
        const listItems = this.cwd !== '/' ? ['..', ...items] : items;
        this.list.setItems(listItems);
    }
    /**
     * Get current directory
     */
    getCwd() {
        return this.cwd;
    }
    /**
     * Set current directory
     */
    setCwd(cwd) {
        this.cwd = cwd;
        this.refresh();
    }
    /**
     * Get selected items
     */
    getSelected() {
        return [...this.selected];
    }
    /**
     * Clear selection
     */
    clearSelection() {
        this.selected = [];
    }
    /**
     * Focus the file list
     */
    focus() {
        this.list.focus();
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle breakpoint change - adjust size
     */
    _handleBreakpointChange(breakpoint, previousBreakpoint, state) {
        super._handleBreakpointChange(breakpoint, previousBreakpoint, state);
        if (state.isMobile) {
            this._setMobileLayout();
        }
        else {
            this._setDesktopLayout();
        }
        this.emit('breakpoint-change', breakpoint, previousBreakpoint);
    }
    /**
     * Called when entering mobile mode - full screen
     */
    _enterMobileMode() {
        this._setMobileLayout();
        this.emit('enter-mobile');
    }
    /**
     * Called when exiting mobile mode - restore desktop layout
     */
    _exitMobileMode() {
        this._setDesktopLayout();
        this.emit('exit-mobile');
    }
    /**
     * Set mobile-friendly layout (full-screen)
     */
    _setMobileLayout() {
        if (!this._mobileFullScreen || !this.screen)
            return;
        // Full screen with small padding
        const padding = DIALOG_EDGE_PADDING;
        this.top = padding;
        this.left = padding;
        this.width = this.screen.width - (padding * 2);
        this.height = this.screen.height - (padding * 2);
        if (this.screen)
            this.screen.render();
    }
    /**
     * Restore desktop layout
     */
    _setDesktopLayout() {
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
        if (this.screen)
            this.screen.render();
    }
}

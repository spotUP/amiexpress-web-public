/**
 * FileExplorer Widget
 * Advanced file browser with tree navigation and preview
 *
 * Responsive features:
 * - Single-column mode on mobile (tree and files stacked)
 * - Touch-friendly navigation
 * - Swipe between tree and files on mobile
 */
import { Box } from './box';
import { Tree } from './tree';
import { ListTable } from './listtable';
export class FileExplorer extends Box {
    constructor(options = {}) {
        super({
            ...options,
        });
        this.cwd = '/';
        // Responsive tracking
        this._isMobileMode = false;
        this._mobileView = 'files'; // Current view on mobile
        this.cwd = options.cwd || '/';
        // Left pane: Directory Tree
        this.tree = new Tree({
            parent: this,
            top: 0,
            left: 0,
            width: '30%',
            bottom: 0,
            border: { type: 'line' },
            label: ' Folders ',
            keys: true,
            vi: true,
            mouse: true,
            style: {
                border: { fg: 'cyan' },
                selected: { bg: 'blue', fg: 'white' }
            }
        });
        // Right Top pane: File List
        this.fileList = new ListTable({
            parent: this,
            top: 0,
            left: '30%',
            width: '70%',
            height: '60%',
            border: { type: 'line' },
            label: ' Files ',
            keys: true,
            vi: true,
            mouse: true,
            interactive: true,
            headers: ['Name', 'Size', 'Date'],
            style: {
                border: { fg: 'green' },
                header: { fg: 'yellow', bold: true },
                cell: { selected: { bg: 'blue', fg: 'white' } }
            }
        });
        // Right Bottom pane: Preview
        this.preview = new Box({
            parent: this,
            top: '60%',
            left: '30%',
            width: '70%',
            bottom: 0,
            border: { type: 'line' },
            label: ' Preview ',
            tags: true,
            style: {
                border: { fg: 'yellow' }
            }
        });
        this.setupHandlers();
    }
    setupHandlers() {
        // When a directory is selected in the tree
        this.tree.on('select', (node) => {
            if (node && node.name) {
                this.emit('directory-select', node.name);
                // In a real app, you'd fetch files for this directory
            }
        });
        // When a file is selected in the list
        this.fileList.on('select', (row, index) => {
            const fileName = row[0];
            this.emit('file-select', fileName);
            this.preview.setContent(`{bold}Selected File:{/} ${fileName}\n{bold}Details:{/} ${row[1]}, ${row[2]}`);
            this.screen?.render();
        });
        // Focus switching
        this.tree.on('keypress', (ch, key) => {
            if (key.name === 'right' || key.name === 'tab') {
                this.fileList.focus();
                return true;
            }
            return false;
        });
        this.fileList.on('keypress', (ch, key) => {
            if (key.name === 'left' || (key.name === 'tab' && key.shift)) {
                this.tree.focus();
                return true;
            }
            return false;
        });
    }
    /**
     * Set the directory tree data
     */
    setTreeData(data) {
        this.tree.setData(data);
    }
    /**
     * Set the file list data
     */
    setFileData(rows) {
        this.fileList.setData(rows);
    }
    /**
     * Set preview content
     */
    setPreview(content) {
        this.preview.setContent(content);
        this.screen?.render();
    }
    focus() {
        this.tree.focus();
    }
    get type() {
        return 'fileexplorer';
    }
    // ============================================================================
    // Responsive Lifecycle Hooks
    // ============================================================================
    /**
     * Handle breakpoint change - switch between multi-pane and single-column
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
     * Called when entering mobile mode - single-column layout
     */
    _enterMobileMode() {
        this._isMobileMode = true;
        this._setMobileLayout();
        this.emit('enter-mobile');
    }
    /**
     * Called when exiting mobile mode - restore multi-pane layout
     */
    _exitMobileMode() {
        this._isMobileMode = false;
        this._setDesktopLayout();
        this.emit('exit-mobile');
    }
    /**
     * Set mobile-friendly single-column layout
     */
    _setMobileLayout() {
        this._isMobileMode = true;
        // Hide preview on mobile
        this.preview.hide();
        // Show only one pane at a time (toggle with swipe or tab)
        if (this._mobileView === 'tree') {
            this.tree.show();
            this.tree.top = 0;
            this.tree.left = 0;
            this.tree.width = '100%';
            this.tree.height = '100%';
            this.fileList.hide();
        }
        else {
            this.fileList.show();
            this.fileList.top = 0;
            this.fileList.left = 0;
            this.fileList.width = '100%';
            this.fileList.height = '100%';
            this.tree.hide();
        }
        if (this.screen)
            this.screen.render();
    }
    /**
     * Restore desktop multi-pane layout
     */
    _setDesktopLayout() {
        this._isMobileMode = false;
        // Show all panes
        this.tree.show();
        this.tree.top = 0;
        this.tree.left = 0;
        this.tree.width = '30%';
        this.tree.height = '100%';
        this.fileList.show();
        this.fileList.top = 0;
        this.fileList.left = '30%';
        this.fileList.width = '70%';
        this.fileList.height = '60%';
        this.preview.show();
        this.preview.top = '60%';
        this.preview.left = '30%';
        this.preview.width = '70%';
        this.preview.height = '40%';
        if (this.screen)
            this.screen.render();
    }
    /**
     * Switch to tree view on mobile
     */
    showTreeView() {
        if (!this._isMobileMode)
            return;
        this._mobileView = 'tree';
        this._setMobileLayout();
        this.tree.focus();
    }
    /**
     * Switch to files view on mobile
     */
    showFilesView() {
        if (!this._isMobileMode)
            return;
        this._mobileView = 'files';
        this._setMobileLayout();
        this.fileList.focus();
    }
    /**
     * Toggle between tree and files view on mobile
     */
    toggleMobileView() {
        if (!this._isMobileMode)
            return;
        if (this._mobileView === 'tree') {
            this.showFilesView();
        }
        else {
            this.showTreeView();
        }
    }
}
/**
 * Factory function
 */
export function fileexplorer(options) {
    return new FileExplorer(options);
}

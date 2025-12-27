/**
 * FileManager - Directory browser widget
 * Note: This is a simplified browser-compatible version
 */
import { List } from './list';
export class FileManager extends List {
    constructor(options = {}) {
        super({
            ...options,
            keys: true,
            vi: true,
            mouse: true,
            scrollbar: options.scrollbar === undefined || options.scrollbar ? {
                ch: '█',
                track: { ch: '│' },
                style: (options.scrollbar && typeof options.scrollbar === 'object' ? options.scrollbar.style : undefined) || options.style,
            } : undefined,
            style: {
                selected: {
                    bg: 'blue',
                    fg: 'white',
                },
                item: {
                    fg: 'white',
                },
                ...(options.style || {}),
            },
        });
        this.cwd = '/';
        this.files = [];
        this.directories = [];
        this.cwd = options.cwd || '/';
        this.files = options.files || [];
        this.directories = options.directories || [];
        this.updateItems();
        // Handle selection
        this.on('select', (item) => {
            this.handleSelection(item.content);
        });
        // Enter key to navigate
        this.key(['enter'], () => {
            const selected = this.getSelectedItem();
            if (selected) {
                this.handleSelection(selected);
            }
        });
        // Backspace to go up
        this.key(['backspace'], () => {
            this.upDirectory();
        });
    }
    /**
     * Update list items from files and directories
     */
    updateItems() {
        const items = [];
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
    handleSelection(item) {
        if (item === '.. (parent)') {
            this.upDirectory();
        }
        else if (item.startsWith('[') && item.endsWith(']')) {
            // Directory selected
            const dirName = item.slice(1, -1);
            this.changeDirectory(dirName);
        }
        else {
            // File selected
            this.emit('file', item, this.getFullPath(item));
        }
    }
    /**
     * Change to a subdirectory
     */
    changeDirectory(dir) {
        const oldCwd = this.cwd;
        this.cwd = this.joinPath(this.cwd, dir);
        this.emit('cd', this.cwd, oldCwd);
        this.refresh();
    }
    /**
     * Go up one directory
     */
    upDirectory() {
        if (this.cwd === '/')
            return;
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
    refresh() {
        this.emit('refresh', this.cwd);
        // In a real implementation, this would read the filesystem
        // For browser compatibility, we rely on external file list updates
    }
    /**
     * Set current working directory
     */
    setCwd(cwd) {
        this.cwd = cwd;
        this.updateItems();
    }
    /**
     * Get current working directory
     */
    getCwd() {
        return this.cwd;
    }
    /**
     * Set files list
     */
    setFiles(files) {
        this.files = files;
        this.updateItems();
    }
    /**
     * Set directories list
     */
    setDirectories(directories) {
        this.directories = directories;
        this.updateItems();
    }
    /**
     * Set both files and directories
     */
    setListing(files, directories) {
        this.files = files;
        this.directories = directories;
        this.updateItems();
    }
    /**
     * Get full path for a file
     */
    getFullPath(file) {
        return this.joinPath(this.cwd, file);
    }
    /**
     * Join path components
     */
    joinPath(...parts) {
        return parts
            .join('/')
            .replace(/\/+/g, '/')
            .replace(/\/$/, '') || '/';
    }
    /**
     * Pick a file (show dialog and wait for selection)
     * Overrides List.pick() with FileManager-specific behavior
     */
    pick(label, callback) {
        // Handle overload: pick(callback) or pick(label, callback)
        if (typeof label === 'function') {
            callback = label;
            label = undefined;
        }
        this.show();
        this.focus();
        const onFile = (file, fullPath) => {
            this.removeListener('file', onFile);
            this.removeListener('cancel', onCancel);
            if (callback)
                callback(undefined, fullPath);
        };
        const onCancel = () => {
            this.removeListener('file', onFile);
            this.removeListener('cancel', onCancel);
            if (callback)
                callback(new Error('cancelled'));
        };
        this.once('file', onFile);
        this.key(['escape'], onCancel);
    }
    /**
     * Reset to initial directory
     */
    reset(cwd) {
        this.cwd = cwd || '/';
        this.files = [];
        this.directories = [];
        this.updateItems();
        this.select(0);
    }
}

/**
 * FileExplorer Widget
 * Advanced file browser with tree navigation and preview
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
}
/**
 * Factory function
 */
export function fileexplorer(options) {
    return new FileExplorer(options);
}

/**
 * FileBox - File/directory selection dialog
 */
import { Box } from './box';
import type { ListOptions } from '../core/types';
export interface FileBoxOptions extends ListOptions {
    cwd?: string;
    directory?: boolean;
    allowMultiple?: boolean;
}
export declare class FileBox extends Box {
    private list;
    private cwd;
    private directory;
    private allowMultiple;
    private selected;
    constructor(options?: FileBoxOptions);
    /**
     * Refresh file list
     */
    refresh(): void;
    /**
     * Handle file/directory selection
     */
    private handleSelection;
    /**
     * Set file list items
     */
    setItems(items: string[]): void;
    /**
     * Get current directory
     */
    getCwd(): string;
    /**
     * Set current directory
     */
    setCwd(cwd: string): void;
    /**
     * Get selected items
     */
    getSelected(): string[];
    /**
     * Clear selection
     */
    clearSelection(): void;
    /**
     * Focus the file list
     */
    focus(): void;
}
//# sourceMappingURL=filebox.d.ts.map
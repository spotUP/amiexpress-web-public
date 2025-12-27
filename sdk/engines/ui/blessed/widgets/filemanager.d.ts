/**
 * FileManager - Directory browser widget
 * Note: This is a simplified browser-compatible version
 */
import { List } from './list';
import type { ElementOptions } from '../core/types';
export interface FileManagerOptions extends ElementOptions {
    cwd?: string;
    files?: string[];
    directories?: string[];
}
export declare class FileManager extends List {
    private cwd;
    private files;
    private directories;
    constructor(options?: FileManagerOptions);
    /**
     * Update list items from files and directories
     */
    private updateItems;
    /**
     * Handle item selection
     */
    private handleSelection;
    /**
     * Change to a subdirectory
     */
    changeDirectory(dir: string): void;
    /**
     * Go up one directory
     */
    upDirectory(): void;
    /**
     * Refresh the file list
     */
    refresh(): void;
    /**
     * Set current working directory
     */
    setCwd(cwd: string): void;
    /**
     * Get current working directory
     */
    getCwd(): string;
    /**
     * Set files list
     */
    setFiles(files: string[]): void;
    /**
     * Set directories list
     */
    setDirectories(directories: string[]): void;
    /**
     * Set both files and directories
     */
    setListing(files: string[], directories: string[]): void;
    /**
     * Get full path for a file
     */
    private getFullPath;
    /**
     * Join path components
     */
    private joinPath;
    /**
     * Pick a file (show dialog and wait for selection)
     * Overrides List.pick() with FileManager-specific behavior
     */
    pick(label?: string | ((err?: Error, file?: string) => void), callback?: (err?: Error, file?: string) => void): void;
    /**
     * Reset to initial directory
     */
    reset(cwd?: string): void;
}
//# sourceMappingURL=filemanager.d.ts.map
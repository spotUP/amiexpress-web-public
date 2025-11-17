/**
 * Amiga-compatible File System Utilities
 *
 * AmigaOS uses case-insensitive file systems, so all file operations must support
 * case-insensitive lookups to properly import BBS data from real Amiga systems.
 *
 * These utilities provide case-insensitive wrappers around Node.js fs operations.
 */
/**
 * Find a file or directory with case-insensitive matching
 * AmigaOS is case-insensitive, so we need to support files imported from real Amigas
 *
 * @param directory - Directory to search in
 * @param targetName - Target filename/dirname to find (case-insensitive)
 * @returns Actual filesystem path if found, null otherwise
 *
 * @example
 * // Find "Menu.txt" when looking for "MENU.TXT"
 * const file = findCaseInsensitive('/path/to/screens', 'MENU.TXT');
 * // Returns: '/path/to/screens/Menu.txt'
 */
export declare function findCaseInsensitive(directory: string, targetName: string): string | null;
/**
 * Read a file with case-insensitive filename matching
 *
 * @param directory - Directory containing the file
 * @param filename - Filename to read (case-insensitive)
 * @param encoding - File encoding (default: 'utf-8')
 * @returns File contents as string, or null if not found
 *
 * @example
 * const content = readFileCaseInsensitive('/screens', 'MENU.TXT');
 */
export declare function readFileCaseInsensitive(directory: string, filename: string, encoding?: BufferEncoding): string | null;
/**
 * Check if a file exists with case-insensitive matching
 *
 * @param directory - Directory to search in
 * @param filename - Filename to check (case-insensitive)
 * @returns true if file exists, false otherwise
 *
 * @example
 * if (existsCaseInsensitive('/screens', 'MENU.TXT')) {
 *   // File found (could be Menu.txt, MENU.TXT, menu.txt, etc.)
 * }
 */
export declare function existsCaseInsensitive(directory: string, filename: string): boolean;
/**
 * Resolve a full path with case-insensitive component matching
 * Useful for resolving paths with multiple directory components
 *
 * @param basePath - Base directory path
 * @param components - Path components to resolve (case-insensitive)
 * @returns Resolved path, or null if any component not found
 *
 * @example
 * // Find "Node0/Screens/Menu.txt" when looking for "NODE0/SCREENS/MENU.TXT"
 * const resolved = resolveCaseInsensitivePath('/bbs', ['NODE0', 'SCREENS', 'MENU.TXT']);
 * // Returns: '/bbs/Node0/Screens/Menu.txt'
 */
export declare function resolveCaseInsensitivePath(basePath: string, components: string[]): string | null;
/**
 * List directory contents (case-sensitive return, but directory lookup is case-insensitive)
 *
 * @param basePath - Base directory
 * @param subdirName - Subdirectory name (case-insensitive)
 * @returns Array of filenames, or null if directory not found
 *
 * @example
 * const files = readdirCaseInsensitive('/bbs', 'SCREENS');
 * // Returns files from /bbs/Screens/ or /bbs/screens/ etc.
 */
export declare function readdirCaseInsensitive(basePath: string, subdirName: string): string[] | null;

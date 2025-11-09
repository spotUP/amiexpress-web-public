/**
 * Amiga-compatible File System Utilities
 *
 * AmigaOS uses case-insensitive file systems, so all file operations must support
 * case-insensitive lookups to properly import BBS data from real Amiga systems.
 *
 * These utilities provide case-insensitive wrappers around Node.js fs operations.
 */

import * as fs from 'fs';
import * as path from 'path';

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
export function findCaseInsensitive(directory: string, targetName: string): string | null {
  try {
    if (!fs.existsSync(directory)) {
      return null;
    }

    const entries = fs.readdirSync(directory);
    const match = entries.find((entry: string) => entry.toLowerCase() === targetName.toLowerCase());

    if (match) {
      return path.join(directory, match);
    }
  } catch (error) {
    // Directory doesn't exist or can't be read
    return null;
  }

  return null;
}

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
export function readFileCaseInsensitive(
  directory: string,
  filename: string,
  encoding: BufferEncoding = 'utf-8'
): string | null {
  const foundPath = findCaseInsensitive(directory, filename);

  if (foundPath) {
    try {
      return fs.readFileSync(foundPath, encoding);
    } catch (error) {
      console.error(`[fs-amiga] Error reading file ${foundPath}:`, error);
      return null;
    }
  }

  return null;
}

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
export function existsCaseInsensitive(directory: string, filename: string): boolean {
  return findCaseInsensitive(directory, filename) !== null;
}

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
export function resolveCaseInsensitivePath(basePath: string, components: string[]): string | null {
  let currentPath = basePath;

  for (const component of components) {
    const found = findCaseInsensitive(currentPath, component);

    if (!found) {
      return null;
    }

    currentPath = found;
  }

  return currentPath;
}

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
export function readdirCaseInsensitive(basePath: string, subdirName: string): string[] | null {
  const foundDir = findCaseInsensitive(basePath, subdirName);

  if (!foundDir) {
    return null;
  }

  try {
    return fs.readdirSync(foundDir);
  } catch (error) {
    console.error(`[fs-amiga] Error reading directory ${foundDir}:`, error);
    return null;
  }
}

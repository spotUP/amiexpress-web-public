/**
 * Path Utility Functions
 *
 * Implements MiscFuncs.e path functions for AmiExpress compatibility.
 * All functions match express.e path handling behavior.
 */

import * as path from 'path';
import * as fs from 'fs';
import { boardRoot } from './board-root.util';
import { assignKey, findInAssignDirs, standardAssigns } from '../amiga-emulation/api/dos/standard-assigns';

/**
 * Ensure path ends with trailing slash
 * Equivalent to MiscFuncs.e checkPathSlash()
 *
 * Express.e usage: 29 instances
 * Used for directory path normalization
 *
 * @param dirPath - Directory path
 * @returns Path with trailing slash
 */
export function checkPathSlash(dirPath: string): string {
  if (!dirPath || dirPath.length === 0) {
    return '/';
  }

  return dirPath.endsWith('/') ? dirPath : dirPath + '/';
}

/**
 * Remove trailing slash from path
 * Opposite of checkPathSlash()
 *
 * @param dirPath - Directory path
 * @returns Path without trailing slash
 */
export function removePathSlash(dirPath: string): string {
  if (!dirPath || dirPath.length === 0) {
    return '';
  }

  return dirPath.replace(/\/+$/, '');
}

/**
 * Find Amiga DOS assign path
 * Equivalent to MiscFuncs.e findAssign()
 *
 * Express.e usage: 5 instances
 * Used for resolving logical assigns like "BBS:", "SYS:", "C:"
 *
 * The board's assign table is the emulator's (amiga-emulation/api/dos/
 * standard-assigns.ts), so the BBS and a 68K program mean the same directory
 * by the same name. An assign that names several directories (C:, L:, LIBS:)
 * answers with its first; resolveAssignPath() searches all of them.
 *
 * @param assignName - Assign name (e.g., "BBS:", "SYS:")
 * @returns Resolved path, or null if assign not found
 */
export function findAssign(assignName: string): string | null {
  const dirs = standardAssigns(boardRoot()).get(assignKey(assignName));
  return dirs?.[0] ?? null;
}

/**
 * MiscFuncs.e findAssign() as express.e asks it (`IF findAssign(x)` is TRUE
 * when the device is NOT there): the path must name a device - the part
 * before its first `:` - and that device must be mounted. A path with no
 * colon names none. Message entry's attached files (express.e:10529), the
 * sysop's DS (12872) and VS (20436) all ask it.
 */
export function deviceMounted(file: string): boolean {
  const colon = file.indexOf(':');
  if (colon < 0) return false;
  return findAssign(file.slice(0, colon + 1)) !== null;
}

/**
 * Resolve path with Amiga assign support
 * Expands assigns like "BBS:Doors/door.exe" to full path
 *
 * @param filePath - Path that may contain assign
 * @returns Resolved full path
 */
export function resolveAssignPath(filePath: string): string {
  if (!filePath) {
    return '';
  }

  // Check if path starts with an assign (word followed by colon)
  const assignMatch = filePath.match(/^([A-Za-z]+):(.*)/);

  if (assignMatch) {
    const assignName = assignMatch[1] + ':';
    const remainingPath = assignMatch[2];

    const dirs = standardAssigns(boardRoot()).get(assignKey(assignName));
    if (dirs?.length) {
      const components = remainingPath.split('/').filter((c) => c.length > 0);
      return findInAssignDirs(dirs, components) ?? path.join(dirs[0], remainingPath);
    }
  }

  // No assign found, return as-is
  return filePath;
}

/**
 * Join path components with proper separators
 * @param parts - Path components to join
 * @returns Joined path
 */
export function joinPath(...parts: string[]): string {
  return path.join(...parts);
}

/**
 * Get directory name from path
 * @param filePath - File path
 * @returns Directory path
 */
export function getDirName(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Get file name from path (with extension)
 * @param filePath - File path
 * @returns File name
 */
export function getFileName(filePath: string): string {
  return path.basename(filePath);
}

/**
 * Get file name without extension
 * @param filePath - File path
 * @returns File name without extension
 */
export function getFileNameWithoutExt(filePath: string): string {
  const fileName = path.basename(filePath);
  const extIndex = fileName.lastIndexOf('.');

  if (extIndex === -1 || extIndex === 0) {
    return fileName;
  }

  return fileName.substring(0, extIndex);
}

/**
 * Get file extension (with dot)
 * @param filePath - File path
 * @returns File extension (e.g., ".txt")
 */
export function getFileExt(filePath: string): string {
  return path.extname(filePath);
}

/**
 * Get file extension without dot
 * @param filePath - File path
 * @returns File extension (e.g., "txt")
 */
export function getFileExtNoDot(filePath: string): string {
  const ext = path.extname(filePath);
  return ext.startsWith('.') ? ext.substring(1) : ext;
}

/**
 * Normalize path (resolve . and .. components)
 * @param filePath - File path
 * @returns Normalized path
 */
export function normalizePath(filePath: string): string {
  return path.normalize(filePath);
}

/**
 * Get absolute path
 * @param filePath - File path (may be relative)
 * @returns Absolute path
 */
export function getAbsolutePath(filePath: string): string {
  return path.resolve(filePath);
}

/**
 * Get relative path from one path to another
 * @param from - Starting path
 * @param to - Target path
 * @returns Relative path
 */
export function getRelativePath(from: string, to: string): string {
  return path.relative(from, to);
}

/**
 * Check if path is absolute
 * @param filePath - File path
 * @returns true if path is absolute
 */
export function isAbsolutePath(filePath: string): boolean {
  return path.isAbsolute(filePath);
}

/**
 * Convert Windows-style path to Unix-style
 * Replaces backslashes with forward slashes
 *
 * @param filePath - File path
 * @returns Unix-style path
 */
export function toUnixPath(filePath: string): string {
  if (!filePath) {
    return '';
  }
  return filePath.replace(/\\/g, '/');
}

/**
 * Convert Unix-style path to Windows-style
 * Replaces forward slashes with backslashes
 *
 * @param filePath - File path
 * @returns Windows-style path
 */
export function toWindowsPath(filePath: string): string {
  if (!filePath) {
    return '';
  }
  return filePath.replace(/\//g, '\\');
}

/**
 * Ensure directory exists, create if it doesn't
 * @param dirPath - Directory path
 */
export function ensureDir(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Get parent directory path
 * @param filePath - File or directory path
 * @returns Parent directory path
 */
export function getParentDir(filePath: string): string {
  return path.dirname(filePath);
}

/**
 * Check if path is a subdirectory of another path
 * @param childPath - Potential child path
 * @param parentPath - Potential parent path
 * @returns true if childPath is under parentPath
 */
export function isSubdirectory(childPath: string, parentPath: string): boolean {
  const relative = path.relative(parentPath, childPath);
  return !relative.startsWith('..') && !path.isAbsolute(relative);
}

/**
 * Sanitize filename by removing invalid characters
 * @param fileName - File name to sanitize
 * @returns Sanitized file name
 */
export function sanitizeFileName(fileName: string): string {
  if (!fileName) {
    return '';
  }

  // Remove invalid characters for both Windows and Unix
  return fileName.replace(/[<>:"|?*\x00-\x1f]/g, '_');
}

/**
 * Create unique file path if file already exists
 * Appends (1), (2), etc. before extension
 *
 * @param filePath - Desired file path
 * @returns Unique file path
 */
export function getUniqueFilePath(filePath: string): string {
  if (!fs.existsSync(filePath)) {
    return filePath;
  }

  const dir = path.dirname(filePath);
  const ext = path.extname(filePath);
  const nameWithoutExt = path.basename(filePath, ext);

  let counter = 1;
  let uniquePath: string;

  do {
    uniquePath = path.join(dir, `${nameWithoutExt} (${counter})${ext}`);
    counter++;
  } while (fs.existsSync(uniquePath));

  return uniquePath;
}

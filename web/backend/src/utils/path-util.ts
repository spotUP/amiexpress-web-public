/**
 * Path Utility Functions
 *
 * Implements MiscFuncs.e path functions for AmiExpress compatibility.
 * All functions match express.e path handling behavior.
 */

import * as path from 'path';
import * as fs from 'fs';

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
 * Used for resolving logical assigns like "BBS:", "SYS:", "REXX:"
 *
 * Amiga assigns map logical names to physical paths:
 * - BBS: → /path/to/bbs/data
 * - SYS: → /usr/local/amiexpress
 * - REXX: → /path/to/arexx
 *
 * @param assignName - Assign name (e.g., "BBS:", "SYS:")
 * @returns Resolved path, or null if assign not found
 */
export function findAssign(assignName: string): string | null {
  // Map of Amiga assigns to actual paths
  const assigns: Record<string, string> = {
    // BBS: points to BBS data directory
    // config's dataDir, which is BBS_DATA_DIR or this checkout's root. It used
    // to end in one developer's absolute path, which resolves to nothing
    // anywhere else and is not a fallback so much as a wrong answer with a
    // straight face.
    'BBS:': process.env.BBS_DATA_DIR || process.env.BBS_ROOT || path.resolve(__dirname, '../../../..'),

    // SYS: points to system directory (Amiga OS root)
    'SYS:': process.env.AMIGA_SYS_DIR || '/usr/local/amiexpress',

    // REXX: points to AREXX scripts directory
    'REXX:': process.env.AREXX_DIR || path.join(process.env.BBS_DATA_DIR || '.', 'AREXX'),

    // DOORS: points to doors directory
    'DOORS:': process.env.DOORS_DIR || path.join(process.env.BBS_DATA_DIR || '.', 'Doors'),

    // LIBS: points to libraries directory
    'LIBS:': process.env.LIBS_DIR || path.join(process.env.BBS_DATA_DIR || '.', 'Libs'),

    // S: points to scripts directory
    'S:': process.env.SCRIPTS_DIR || path.join(process.env.BBS_DATA_DIR || '.', 'S'),

    // C: points to commands directory
    'C:': process.env.COMMANDS_DIR || path.join(process.env.BBS_DATA_DIR || '.', 'Commands'),

    // T: points to temp directory
    'T:': process.env.TEMP_DIR || '/tmp',

    // RAM: points to ram disk (use temp) - consistent with PathManager
    'RAM:': process.env.RAM_DIR || '/tmp/ram',

    // ENV: points to environment variables
    'ENV:': process.env.ENV_DIR || '/tmp/ENV',

    // ENVARC: points to saved environment variables
    'ENVARC:': process.env.ENVARC_DIR || path.join(process.env.BBS_DATA_DIR || '.', 'ENVARC'),
  };

  // Normalize assign name to uppercase with colon
  let normalizedAssign = assignName.toUpperCase();
  if (!normalizedAssign.endsWith(':')) {
    normalizedAssign += ':';
  }

  return assigns[normalizedAssign] || null;
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

    const assignPath = findAssign(assignName);
    if (assignPath) {
      return path.join(assignPath, remainingPath);
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

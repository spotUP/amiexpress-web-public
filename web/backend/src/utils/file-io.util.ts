/**
 * File I/O Utility Functions
 *
 * Implements MiscFuncs.e file I/O functions for AmiExpress compatibility.
 * All functions match express.e file handling behavior.
 */

import * as fs from 'fs';
import * as path from 'path';
import * as amigafs from './amigafs';

/**
 * Write line with newline to file descriptor
 * Equivalent to MiscFuncs.e fileWriteLn()
 *
 * Express.e usage: 45 instances
 * Critical for log files, bulletins, message files, door logs
 *
 * @param fd - File descriptor (from fs.openSync)
 * @param text - Text to write (newline will be appended)
 */
export function fileWriteLn(fd: number, text: string): void {
  fs.writeSync(fd, text + '\n');
}

/**
 * Write line with newline to file path (convenience wrapper)
 * Opens file, writes line, closes file
 *
 * @param filePath - Path to file
 * @param text - Text to write
 * @param append - Append to file if true, overwrite if false (default: true)
 */
export function fileWriteLnPath(filePath: string, text: string, append: boolean = true): void {
  const flags = append ? 'a' : 'w';
  const fd = fs.openSync(filePath, flags);
  try {
    fileWriteLn(fd, text);
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Read integer from file
 * Equivalent to MiscFuncs.e readIntFromFile()
 *
 * Express.e usage: 6 instances
 * Used for reading counters, stats, numeric config values
 *
 * @param filePath - Path to file containing integer
 * @returns Parsed integer value
 */
export function readIntFromFile(filePath: string): number {
  const resolved = amigafs.resolvePath(filePath);
  if (!resolved) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  const trimmed = content.trim();
  const value = parseInt(trimmed, 10);

  if (isNaN(value)) {
    throw new Error(`Invalid integer in file ${filePath}: ${trimmed}`);
  }

  return value;
}

/**
 * Write integer to file
 * Equivalent to MiscFuncs.e writeIntToFile()
 *
 * Express.e usage: 5 instances
 * Used for writing counters, stats, numeric config values
 *
 * @param filePath - Path to file
 * @param value - Integer value to write
 */
export function writeIntToFile(filePath: string, value: number): void {
  fs.writeFileSync(filePath, value.toString());
}

/**
 * Find first file matching pattern in directory
 * Equivalent to MiscFuncs.e findFirst()
 *
 * Express.e usage: 8 instances
 * Used for file scanning operations, wildcard matching
 *
 * Supports wildcards:
 * - * matches any characters
 * - ? matches single character
 *
 * @param directory - Directory to search
 * @param pattern - Wildcard pattern (e.g., "*.txt", "file?.dat")
 * @returns Full path to first matching file, or null if not found
 */
export function findFirst(directory: string, pattern: string): string | null {
  // Resolve directory with case-insensitive matching
  const resolvedDir = amigafs.resolvePath(directory);
  if (!resolvedDir) {
    return null;
  }

  // Check if directory exists
  if (!amigafs.existsSync(resolvedDir)) {
    return null;
  }

  // Convert wildcard pattern to regex
  // Escape special regex chars except * and ?
  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')  // Escape regex special chars
    .replace(/\*/g, '.*')                   // * → .*
    .replace(/\?/g, '.');                   // ? → .

  const regex = new RegExp(`^${regexPattern}$`, 'i'); // Case-insensitive

  try {
    const files = amigafs.readdirSync(resolvedDir);

    for (const file of files) {
      if (regex.test(file)) {
        return path.join(resolvedDir, file);
      }
    }
  } catch (err) {
    return null;
  }

  return null;
}

/**
 * Find all files matching pattern in directory
 * Extension of findFirst() that returns all matches
 *
 * @param directory - Directory to search
 * @param pattern - Wildcard pattern
 * @returns Array of full paths to matching files
 */
export function findAll(directory: string, pattern: string): string[] {
  const resolvedDir = amigafs.resolvePath(directory);
  if (!resolvedDir || !amigafs.existsSync(resolvedDir)) {
    return [];
  }

  const regexPattern = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');

  const regex = new RegExp(`^${regexPattern}$`, 'i');

  try {
    const files = amigafs.readdirSync(resolvedDir);
    const matches: string[] = [];

    for (const file of files) {
      if (regex.test(file)) {
        matches.push(path.join(resolvedDir, file));
      }
    }

    return matches;
  } catch (err) {
    return [];
  }
}

/**
 * Read all lines from file
 * @param filePath - Path to file
 * @returns Array of lines (without newline characters)
 */
export function readLines(filePath: string): string[] {
  const resolved = amigafs.resolvePath(filePath);
  if (!resolved) {
    throw new Error(`File not found: ${filePath}`);
  }

  const content = fs.readFileSync(resolved, 'utf-8');
  return content.split(/\r?\n/);
}

/**
 * Write array of lines to file
 * @param filePath - Path to file
 * @param lines - Array of lines to write
 * @param append - Append to file if true, overwrite if false (default: false)
 */
export function writeLines(filePath: string, lines: string[], append: boolean = false): void {
  const flags = append ? 'a' : 'w';
  const fd = fs.openSync(filePath, flags);
  try {
    for (const line of lines) {
      fileWriteLn(fd, line);
    }
  } finally {
    fs.closeSync(fd);
  }
}

/**
 * Append line to file (convenience wrapper)
 * @param filePath - Path to file
 * @param text - Text to append
 */
export function appendLine(filePath: string, text: string): void {
  fileWriteLnPath(filePath, text, true);
}

/**
 * Read entire file as string
 * Case-insensitive path resolution
 *
 * @param filePath - Path to file
 * @param encoding - File encoding (default: 'utf-8')
 * @returns File contents as string
 */
export function readFile(filePath: string, encoding: BufferEncoding = 'utf-8'): string {
  const resolved = amigafs.resolvePath(filePath);
  if (!resolved) {
    throw new Error(`File not found: ${filePath}`);
  }

  return fs.readFileSync(resolved, encoding);
}

/**
 * Write entire file (convenience wrapper)
 * @param filePath - Path to file
 * @param content - Content to write
 * @param encoding - File encoding (default: 'utf-8')
 */
export function writeFile(filePath: string, content: string, encoding: BufferEncoding = 'utf-8'): void {
  fs.writeFileSync(filePath, content, encoding);
}

/**
 * Check if file exists (case-insensitive)
 * Wrapper around amigafs.existsSync for consistency
 *
 * @param filePath - Path to file
 * @returns true if file exists
 */
export function fileExists(filePath: string): boolean {
  return amigafs.existsSync(filePath);
}

/**
 * Check if directory exists (case-insensitive)
 * @param dirPath - Path to directory
 * @returns true if directory exists
 */
export function dirExists(dirPath: string): boolean {
  if (!amigafs.existsSync(dirPath)) {
    return false;
  }

  try {
    const stats = amigafs.statSync(dirPath);
    return stats.isDirectory();
  } catch {
    return false;
  }
}

/**
 * Get file size in bytes
 * @param filePath - Path to file
 * @returns File size in bytes
 */
export function getFileSize(filePath: string): number {
  const resolved = amigafs.resolvePath(filePath);
  if (!resolved) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(resolved);
  return stats.size;
}

/**
 * Get file modification time
 * @param filePath - Path to file
 * @returns File modification date
 */
export function getFileModTime(filePath: string): Date {
  const resolved = amigafs.resolvePath(filePath);
  if (!resolved) {
    throw new Error(`File not found: ${filePath}`);
  }

  const stats = fs.statSync(resolved);
  return stats.mtime;
}

/**
 * Copy file
 * @param srcPath - Source file path
 * @param destPath - Destination file path
 */
export function copyFile(srcPath: string, destPath: string): void {
  const resolved = amigafs.resolvePath(srcPath);
  if (!resolved) {
    throw new Error(`Source file not found: ${srcPath}`);
  }

  fs.copyFileSync(resolved, destPath);
}

/**
 * Move/rename file
 * @param srcPath - Source file path
 * @param destPath - Destination file path
 */
export function moveFile(srcPath: string, destPath: string): void {
  const resolved = amigafs.resolvePath(srcPath);
  if (!resolved) {
    throw new Error(`Source file not found: ${srcPath}`);
  }

  fs.renameSync(resolved, destPath);
}

/**
 * Delete file
 * @param filePath - Path to file
 */
export function deleteFile(filePath: string): void {
  const resolved = amigafs.resolvePath(filePath);
  if (!resolved) {
    return; // File doesn't exist, nothing to delete
  }

  fs.unlinkSync(resolved);
}

/**
 * Create directory (recursive)
 * @param dirPath - Path to directory
 */
export function createDirectory(dirPath: string): void {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

/**
 * Delete directory (recursive)
 * @param dirPath - Path to directory
 */
export function deleteDirectory(dirPath: string): void {
  const resolved = amigafs.resolvePath(dirPath);
  if (!resolved) {
    return; // Directory doesn't exist
  }

  fs.rmSync(resolved, { recursive: true, force: true });
}

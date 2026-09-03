/**
 * AmigaFS - Case-Insensitive File System Wrapper
 *
 * Provides drop-in replacements for Node.js fs operations that work with
 * case-insensitive paths, matching AmigaOS behavior.
 *
 * Usage:
 *   import * as amigafs from './utils/amigafs';
 *
 *   // Instead of: fs.existsSync('/path/to/FILE.txt')
 *   // Use:        amigafs.existsSync('/path/to/file.txt')
 *
 * All functions handle case-insensitive path resolution automatically.
 */

import * as fs from 'fs';
import * as path from 'path';

/**
 * Find a file/directory with case-insensitive matching
 * Returns the actual path with correct casing, or null if not found
 */
/**
 * Directory listings, remembered until the directory changes.
 *
 * Every case-insensitive lookup used to readdir the whole directory, and the
 * screen loader asks ~200 times per screen per scope: express.e's level walk
 * tries 255 down to 5 in fives, each against four extensions. Building the
 * screen index for this board - 30 screens across 41 nodes and 14 conferences
 * - came to roughly a quarter of a million readdir calls and took TWELVE
 * SECONDS, which is what made the manager feel slow and what made a delete
 * (two index builds) look like it had done nothing.
 *
 * Validated by mtime rather than a timer: a stat is cheap, a readdir of a node
 * directory is not, and a screen written by the admin bumps the directory's
 * mtime, so the next lookup sees it.
 */
const listings = new Map<string, { mtimeMs: number; entries: string[] }>();

function entriesOf(directory: string): string[] | null {
  let mtimeMs: number;
  try {
    mtimeMs = fs.statSync(directory).mtimeMs;
  } catch {
    listings.delete(directory);
    return null;
  }

  const cached = listings.get(directory);
  if (cached && cached.mtimeMs === mtimeMs) return cached.entries;

  try {
    const entries = fs.readdirSync(directory);
    listings.set(directory, { mtimeMs, entries });
    return entries;
  } catch {
    return null;
  }
}

/** Drop the remembered listings. For a caller that has just written files. */
export function forgetDirectoryListings(): void {
  listings.clear();
}

export function findCaseInsensitive(directory: string, filename: string): string | null {
  try {
    const entries = entriesOf(directory);
    if (!entries) return null;

    const lowerFilename = filename.toLowerCase();

    for (const entry of entries) {
      if (entry.toLowerCase() === lowerFilename) {
        return path.join(directory, entry);
      }
    }

    return null;
  } catch {
    return null;
  }
}

/**
 * Resolve a full path with case-insensitive component matching
 */
export function resolvePath(targetPath: string): string | null {
  // If path doesn't exist as-is, try case-insensitive resolution
  if (fs.existsSync(targetPath)) {
    return targetPath;
  }

  // Split path into components and resolve each case-insensitively
  const parsed = path.parse(targetPath);
  const components = targetPath.split(path.sep).filter(c => c.length > 0);

  let currentPath = parsed.root || (components[0] === '' ? path.sep : '');
  let startIndex = parsed.root ? 0 : (components[0] === '' ? 1 : 0);

  // Handle absolute paths starting with /
  if (targetPath.startsWith(path.sep)) {
    currentPath = path.sep;
    startIndex = 0;
  }

  for (let i = startIndex; i < components.length; i++) {
    const component = components[i];
    const found = findCaseInsensitive(currentPath, component);

    if (!found) {
      return null;
    }

    currentPath = found;
  }

  return currentPath;
}

// ============================================================================
// Drop-in replacements for fs methods
// ============================================================================

/**
 * Case-insensitive existsSync
 */
export function existsSync(filePath: string): boolean {
  if (fs.existsSync(filePath)) {
    return true;
  }

  const resolved = resolvePath(filePath);
  return resolved !== null;
}

/**
 * Case-insensitive readFileSync
 */
export function readFileSync(filePath: string, encoding?: BufferEncoding): string | Buffer {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }

  if (encoding) {
    return fs.readFileSync(resolved, encoding);
  }

  return fs.readFileSync(resolved);
}

/**
 * Case-insensitive readdirSync
 */
export function readdirSync(dirPath: string): string[] {
  const resolved = resolvePath(dirPath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, scandir '${dirPath}'`);
  }

  return fs.readdirSync(resolved);
}

/**
 * Case-insensitive statSync
 */
export function statSync(filePath: string): fs.Stats {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, stat '${filePath}'`);
  }

  return fs.statSync(resolved);
}

/**
 * Case-insensitive lstatSync
 */
export function lstatSync(filePath: string): fs.Stats {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, lstat '${filePath}'`);
  }

  return fs.lstatSync(resolved);
}

/**
 * Case-insensitive writeFileSync
 * Creates file with exact casing provided in path
 */
export function writeFileSync(filePath: string, data: string | Buffer, options?: fs.WriteFileOptions): void {
  // For writes, ensure parent directory exists (case-insensitive)
  const dir = path.dirname(filePath);
  const resolvedDir = resolvePath(dir);

  if (!resolvedDir) {
    throw new Error(`ENOENT: no such file or directory, open '${filePath}'`);
  }

  // Write to the exact path provided (preserves casing for new files)
  const targetPath = path.join(resolvedDir, path.basename(filePath));
  fs.writeFileSync(targetPath, data, options);
}

/**
 * Case-insensitive appendFileSync
 */
export function appendFileSync(filePath: string, data: string | Buffer, options?: fs.WriteFileOptions): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    // If file doesn't exist, create it (writeFileSync behavior)
    writeFileSync(filePath, data, options);
    return;
  }

  fs.appendFileSync(resolved, data, options);
}

/**
 * Case-insensitive unlinkSync (delete file)
 */
export function unlinkSync(filePath: string): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, unlink '${filePath}'`);
  }

  fs.unlinkSync(resolved);
}

/**
 * Case-insensitive mkdirSync
 * Creates directory with exact casing provided
 */
export function mkdirSync(dirPath: string, options?: fs.MakeDirectoryOptions): void {
  // Check if already exists (case-insensitive)
  const resolved = resolvePath(dirPath);

  if (resolved) {
    // Directory already exists
    if (!options || !options.recursive) {
      throw new Error(`EEXIST: file already exists, mkdir '${dirPath}'`);
    }
    return;
  }

  // Create with exact casing
  fs.mkdirSync(dirPath, options);
}

/**
 * Case-insensitive rmdirSync
 */
export function rmdirSync(dirPath: string, options?: fs.RmDirOptions): void {
  const resolved = resolvePath(dirPath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, rmdir '${dirPath}'`);
  }

  fs.rmdirSync(resolved, options);
}

/**
 * Case-insensitive renameSync
 */
export function renameSync(oldPath: string, newPath: string): void {
  const resolvedOld = resolvePath(oldPath);

  if (!resolvedOld) {
    throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
  }

  // For new path, ensure parent directory exists
  const newDir = path.dirname(newPath);
  const resolvedNewDir = resolvePath(newDir);

  if (!resolvedNewDir) {
    throw new Error(`ENOENT: no such file or directory, rename '${oldPath}' -> '${newPath}'`);
  }

  const targetPath = path.join(resolvedNewDir, path.basename(newPath));
  fs.renameSync(resolvedOld, targetPath);
}

/**
 * Case-insensitive copyFileSync
 */
export function copyFileSync(src: string, dest: string, flags?: number): void {
  const resolvedSrc = resolvePath(src);

  if (!resolvedSrc) {
    throw new Error(`ENOENT: no such file or directory, copyfile '${src}'`);
  }

  // For dest, ensure parent directory exists
  const destDir = path.dirname(dest);
  const resolvedDestDir = resolvePath(destDir);

  if (!resolvedDestDir) {
    throw new Error(`ENOENT: no such file or directory, copyfile '${src}' -> '${dest}'`);
  }

  const targetPath = path.join(resolvedDestDir, path.basename(dest));
  fs.copyFileSync(resolvedSrc, targetPath, flags);
}

/**
 * Case-insensitive accessSync
 */
export function accessSync(filePath: string, mode?: number): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, access '${filePath}'`);
  }

  fs.accessSync(resolved, mode);
}

/**
 * Case-insensitive realpathSync
 */
export function realpathSync(filePath: string): string {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, realpath '${filePath}'`);
  }

  return fs.realpathSync(resolved);
}

/**
 * Case-insensitive chmodSync
 * Changes file permissions
 */
export function chmodSync(filePath: string, mode: fs.Mode): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, chmod '${filePath}'`);
  }

  fs.chmodSync(resolved, mode);
}

/**
 * Case-insensitive rmSync
 * Modern API for removing files and directories
 */
export function rmSync(filePath: string, options?: fs.RmOptions): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, rm '${filePath}'`);
  }

  fs.rmSync(resolved, options);
}

/**
 * Case-insensitive rm, asynchronously.
 *
 * The sync version blocks the event loop for as long as the delete takes,
 * and this process serves every BBS node at once - deleting a door with a
 * few hundred files froze the whole board until it finished. fs.promises.rm
 * does the work on libuv's threadpool instead, so the board keeps answering
 * and the door's own progress display can actually paint.
 *
 * Resolves quietly when the path does not exist: removing something already
 * removed is a success.
 */
export async function rm(filePath: string, options?: fs.RmOptions): Promise<void> {
  const resolved = resolvePath(filePath);
  if (!resolved) return;
  await fs.promises.rm(resolved, options);
}

/** Case-insensitive unlink, asynchronously. See rm() for why async. */
export async function unlink(filePath: string): Promise<void> {
  const resolved = resolvePath(filePath);
  if (!resolved) return;
  await fs.promises.unlink(resolved);
}

/** Build an Error that FileManager.mapNodeErrorToAmigaDOS() can turn into IoErr=205. */
function enoent(operation: string, filePath: string): NodeJS.ErrnoException {
  const err: NodeJS.ErrnoException = new Error(
    `ENOENT: no such file or directory, ${operation} '${filePath}'`
  );
  err.code = 'ENOENT';
  err.syscall = operation;
  err.path = filePath;
  return err;
}

/**
 * Does this open() flag set create the file when it is missing?
 *
 * Callers pass either the string form ('w', 'a+', ...) or the numeric mask
 * (fs.constants.O_WRONLY | O_CREAT | O_TRUNC). FileHandle uses the numeric
 * form, so a string-only check silently treats every emulated MODE_NEWFILE
 * open as read-only and refuses to create the file.
 */
export function createsOnOpen(flags: fs.OpenMode): boolean {
  if (typeof flags === 'number') {
    return (flags & fs.constants.O_CREAT) !== 0;
  }
  return /^[wa]/.test(flags) || flags.includes('+');
}

/**
 * Case-insensitive openSync
 * Opens a file and returns a file descriptor
 *
 * Resolution order matters. The case-insensitive lookup of the FILE has to
 * run before the "create it in its parent" fallback: AmigaDOS MODE_OLDFILE
 * and MODE_READWRITE both carry O_CREAT, so creating first would drop a
 * 0-byte twin ("bulletins/bull1.txt") next to the real, differently-cased
 * file ("Bulletins/bull1.txt") on a case-sensitive filesystem, and the door
 * would then read and write the empty twin.
 */
export function openSync(filePath: string, flags: fs.OpenMode, mode?: fs.Mode): number {
  // Fast path: the exact path exists, no directory walk needed.
  if (fs.existsSync(filePath)) {
    return fs.openSync(filePath, flags, mode);
  }

  // The file may exist under different casing - open the real one.
  const resolved = resolvePath(filePath);
  if (resolved) {
    return fs.openSync(resolved, flags, mode);
  }

  // Genuinely new file: create it inside the correctly-cased parent.
  if (createsOnOpen(flags)) {
    const dir = path.dirname(filePath);
    const resolvedDir = resolvePath(dir);

    if (!resolvedDir) {
      throw enoent('open', filePath);
    }

    return fs.openSync(path.join(resolvedDir, path.basename(filePath)), flags, mode);
  }

  throw enoent('open', filePath);
}

/**
 * Case-insensitive truncateSync
 * Truncates a file to a specified length
 */
export function truncateSync(filePath: string, len?: number): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, truncate '${filePath}'`);
  }

  fs.truncateSync(resolved, len);
}

/**
 * Case-insensitive utimesSync
 * Changes file timestamps
 */
export function utimesSync(filePath: string, atime: fs.TimeLike, mtime: fs.TimeLike): void {
  const resolved = resolvePath(filePath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, utimes '${filePath}'`);
  }

  fs.utimesSync(resolved, atime, mtime);
}

/**
 * Case-insensitive linkSync
 * Creates a hard link
 */
export function linkSync(existingPath: string, newPath: string): void {
  const resolvedExisting = resolvePath(existingPath);

  if (!resolvedExisting) {
    throw new Error(`ENOENT: no such file or directory, link '${existingPath}' -> '${newPath}'`);
  }

  // For new path, ensure parent directory exists
  const newDir = path.dirname(newPath);
  const resolvedNewDir = resolvePath(newDir);

  if (!resolvedNewDir) {
    throw new Error(`ENOENT: no such file or directory, link '${existingPath}' -> '${newPath}'`);
  }

  const targetPath = path.join(resolvedNewDir, path.basename(newPath));
  fs.linkSync(resolvedExisting, targetPath);
}

/**
 * Case-insensitive symlinkSync
 * Creates a symbolic link
 */
export function symlinkSync(target: string, linkPath: string, type?: fs.symlink.Type): void {
  // For link path, ensure parent directory exists
  const linkDir = path.dirname(linkPath);
  const resolvedLinkDir = resolvePath(linkDir);

  if (!resolvedLinkDir) {
    throw new Error(`ENOENT: no such file or directory, symlink '${target}' -> '${linkPath}'`);
  }

  const targetLinkPath = path.join(resolvedLinkDir, path.basename(linkPath));

  // Note: target doesn't need to exist for symlink creation
  fs.symlinkSync(target, targetLinkPath, type);
}

/**
 * Case-insensitive readlinkSync
 * Reads the value of a symbolic link
 */
export function readlinkSync(linkPath: string, options?: fs.BufferEncodingOption): string | Buffer {
  const resolved = resolvePath(linkPath);

  if (!resolved) {
    throw new Error(`ENOENT: no such file or directory, readlink '${linkPath}'`);
  }

  if (options) {
    return fs.readlinkSync(resolved, options);
  }

  return fs.readlinkSync(resolved);
}

// Re-export constants for convenience
export const constants = fs.constants;

// Export helper functions
// findCaseInsensitive and resolvePath are already exported at top; avoid duplicate named exports here.

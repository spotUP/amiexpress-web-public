/**
 * rexxsupport.library Emulation
 *
 * Provides core AREXX functions for file I/O and system operations.
 * Used by 100+ AREXX doors for file handling.
 *
 * Functions provided (via AREXX stem variables):
 *   EXISTS(filename)     - Check if file exists
 *   STATEF(filename)     - Get file statistics
 *   DELETE(filename)     - Delete a file
 *   MAKEDIR(dirname)     - Create a directory
 *   RENAME(old, new)     - Rename a file
 *   SHOWDIR(path, type)  - List directory contents
 *   GETENV(varname)      - Get environment variable
 *   SETENV(varname, val) - Set environment variable
 *   DELAY(ticks)         - Delay execution (50 ticks = 1 second)
 *   ALLOCMEM(size)       - Allocate memory
 *   FREEMEM(addr)        - Free memory
 *
 * These are called via AREXX function host mechanism, not direct library calls.
 */

import * as path from 'path';
import * as amigafs from '../../utils/amigafs';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { RexxPathResolver } from './rexx-path';

export class RexxSupportLibrary {
  private emulator: MoiraEmulator;
  private readonly paths: RexxPathResolver;

  // Memory allocation tracking
  private allocations: Map<number, number> = new Map();
  private nextAllocAddr: number = 0xF00000;

  constructor(emulator: MoiraEmulator, bbsRoot: string) {
    this.emulator = emulator;
    this.paths = new RexxPathResolver(bbsRoot);
  }

  /**
   * EXISTS(filename)
   * Check if a file or directory exists
   * Returns: 1 if exists, 0 if not
   */
  exists(filename: string): number {
    const resolvedPath = this.resolveAmigaPath(filename);
    console.log(`[RexxSupport] EXISTS("${filename}") -> "${resolvedPath}"`);

    return amigafs.existsSync(resolvedPath) ? 1 : 0;
  }

  /**
   * STATEF(filename)
   * Get file statistics
   * Returns: "type size blocks bits day month year hours minutes seconds comment"
   *   type: FILE, DIR, or empty if not found
   *   bits: protection bits in AmigaDOS format
   */
  statef(filename: string): string {
    const resolvedPath = this.resolveAmigaPath(filename);
    console.log(`[RexxSupport] STATEF("${filename}") -> "${resolvedPath}"`);

    try {
      const stats = amigafs.statSync(resolvedPath);
      const type = stats.isDirectory() ? 'DIR' : 'FILE';
      const size = stats.size;
      const blocks = Math.ceil(size / 512);
      const bits = '----rwed'; // Default protection bits

      const date = stats.mtime;
      const day = date.getDate();
      const month = date.getMonth() + 1;
      const year = date.getFullYear();
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const seconds = date.getSeconds();

      return `${type} ${size} ${blocks} ${bits} ${day} ${month} ${year} ${hours} ${minutes} ${seconds}`;
    } catch {
      return '';
    }
  }

  /**
   * DELETE(filename)
   * Delete a file
   * Returns: 1 if successful, 0 if failed
   */
  delete(filename: string): number {
    const resolvedPath = this.resolveAmigaPath(filename);
    console.log(`[RexxSupport] DELETE("${filename}") -> "${resolvedPath}"`);

    try {
      amigafs.unlinkSync(resolvedPath);
      return 1;
    } catch {
      return 0;
    }
  }

  /**
   * MAKEDIR(dirname)
   * Create a directory
   * Returns: 1 if successful, 0 if failed
   */
  makedir(dirname: string): number {
    const resolvedPath = this.resolveAmigaPath(dirname);
    console.log(`[RexxSupport] MAKEDIR("${dirname}") -> "${resolvedPath}"`);

    try {
      amigafs.mkdirSync(resolvedPath, { recursive: true });
      return 1;
    } catch {
      return 0;
    }
  }

  /**
   * RENAME(oldname, newname)
   * Rename a file
   * Returns: 1 if successful, 0 if failed
   */
  rename(oldname: string, newname: string): number {
    const oldPath = this.resolveAmigaPath(oldname);
    const newPath = this.resolveAmigaPath(newname);
    console.log(`[RexxSupport] RENAME("${oldname}", "${newname}")`);

    try {
      amigafs.renameSync(oldPath, newPath);
      return 1;
    } catch {
      return 0;
    }
  }

  /**
   * SHOWDIR(path, type)
   * List directory contents
   * type: 'A' = all, 'F' = files only, 'D' = dirs only
   * Returns: space-separated list of names
   */
  showdir(dirpath: string, type: string = 'A'): string {
    const resolvedPath = this.resolveAmigaPath(dirpath);
    console.log(`[RexxSupport] SHOWDIR("${dirpath}", "${type}")`);

    try {
      const entries = amigafs.readdirSync(resolvedPath);
      const filtered = entries.filter(entry => {
        const fullPath = path.join(resolvedPath, entry);
        try {
          const stats = amigafs.statSync(fullPath);
          if (type === 'F') return stats.isFile();
          if (type === 'D') return stats.isDirectory();
          return true; // 'A' = all
        } catch {
          return false;
        }
      });
      return filtered.join(' ');
    } catch {
      return '';
    }
  }

  /**
   * GETENV(varname)
   * Get environment variable
   * Returns: variable value or empty string
   */
  getenv(varname: string): string {
    console.log(`[RexxSupport] GETENV("${varname}")`);
    return process.env[varname] || '';
  }

  /**
   * SETENV(varname, value)
   * Set environment variable
   * Returns: 1 if successful
   */
  setenv(varname: string, value: string): number {
    console.log(`[RexxSupport] SETENV("${varname}", "${value}")`);
    process.env[varname] = value;
    return 1;
  }

  /**
   * DELAY(ticks)
   * Delay execution (50 ticks = 1 second on NTSC Amiga)
   * This is a stub - actual delay would be async
   */
  delay(ticks: number): number {
    console.log(`[RexxSupport] DELAY(${ticks}) - ${ticks * 20}ms`);
    // In real implementation this would be async
    return 1;
  }

  /**
   * ALLOCMEM(size, flags)
   * Allocate memory
   * Returns: address or 0 if failed
   */
  allocmem(size: number, flags: number = 0): number {
    console.log(`[RexxSupport] ALLOCMEM(${size}, 0x${flags.toString(16)})`);

    const addr = this.nextAllocAddr;
    this.nextAllocAddr += size + 16; // Align to 16 bytes
    this.allocations.set(addr, size);

    return addr;
  }

  /**
   * FREEMEM(addr, size)
   * Free allocated memory
   * Returns: 1 if successful
   */
  freemem(addr: number, size: number): number {
    console.log(`[RexxSupport] FREEMEM(0x${addr.toString(16)}, ${size})`);

    if (this.allocations.has(addr)) {
      this.allocations.delete(addr);
      return 1;
    }
    return 0;
  }

  /**
   * COMPRESS(string, chars)
   * Remove specified characters from string
   */
  compress(str: string, chars: string = ' '): string {
    let result = str;
    for (const char of chars) {
      result = result.split(char).join('');
    }
    return result;
  }

  /**
   * UPPER(string)
   * Convert string to uppercase
   */
  upper(str: string): string {
    return str.toUpperCase();
  }

  /**
   * LOWER(string)
   * Convert string to lowercase
   */
  lower(str: string): string {
    return str.toLowerCase();
  }

  /**
   * TRIM(string)
   * Remove leading and trailing whitespace
   */
  trim(str: string): string {
    return str.trim();
  }

  /**
   * HASH(string)
   * Simple hash function
   */
  hash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return Math.abs(hash);
  }

  /**
   * GETCLIP(name)
   * Get clipboard contents (stub)
   */
  getclip(name: string): string {
    console.log(`[RexxSupport] GETCLIP("${name}")`);
    return '';
  }

  /**
   * SETCLIP(name, value)
   * Set clipboard contents (stub)
   */
  setclip(name: string, value: string): number {
    console.log(`[RexxSupport] SETCLIP("${name}", "${value}")`);
    return 1;
  }

  // =========================================================================
  // Path resolution helpers
  // =========================================================================

  /**
   * Map an AREXX path onto the host filesystem.
   *
   * Previously this matched the assign prefixes case-SENSITIVELY ('DOORS:',
   * 'BBS:', ...), so the lowercase forms AmigaDOS treats as identical - and
   * that real doors write, e.g. "bbs:bulletins/bull1.txt" - fell through to
   * the relative-path branch and produced "<bbsRoot>/bbs:bulletins/...".
   * It also handed the result to plain fs, with no case resolution of the
   * remaining components, so "bulletins/" never found "Bulletins/" on the
   * case-sensitive Linux container.
   *
   * Both halves now go through the shared resolver: the AREXX interpreter's
   * own assign table, then amigafs for the case walk.
   */
  private resolveAmigaPath(amigaPath: string): string {
    return this.paths.resolve(amigaPath);
  }
}

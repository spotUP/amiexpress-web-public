/**
 * rexxarplib.library Emulation
 *
 * ARP (AmigaDOS Replacement Project) extensions for AREXX.
 * Provides pattern matching, file operations, and utility functions.
 *
 * Functions provided:
 *   GETFILE(title, path, pattern)  - File requester
 *   GETPATH(title, path)           - Directory requester
 *   GETFONT(title)                 - Font requester
 *   REQUEST(title, body, buttons)  - Simple requester
 *   POSTMSG(title, message)        - Post a message
 *   FILELIST(pattern)              - List files matching pattern
 *   PATTERNMATCH(pattern, string)  - Pattern matching
 *   BASENAME(path)                 - Get filename from path
 *   DIRNAME(path)                  - Get directory from path
 *   READFILE(filename)             - Read entire file
 *   WRITEFILE(filename, content)   - Write entire file
 *   SCREENTOBACK()                 - Send screen to back
 *   SCREENTOFRONT()                - Bring screen to front
 */

import * as fs from 'fs';
import * as path from 'path';
import { MoiraEmulator } from '../cpu/MoiraEmulator';

export class RexxArpLibrary {
  private emulator: MoiraEmulator;
  private bbsRoot: string;

  constructor(emulator: MoiraEmulator, bbsRoot: string) {
    this.emulator = emulator;
    this.bbsRoot = bbsRoot;
  }

  /**
   * FILELIST(pattern, path)
   * List files matching AmigaDOS pattern
   * Returns: space-separated list of matching files
   */
  filelist(pattern: string, dirpath?: string): string {
    const basePath = dirpath ? this.resolveAmigaPath(dirpath) : this.bbsRoot;
    console.log(`[RexxArp] FILELIST("${pattern}", "${basePath}")`);

    try {
      // Convert AmigaDOS pattern to regex
      const regex = this.amigaPatternToRegex(pattern);

      // Read directory and filter by pattern
      const entries = fs.readdirSync(basePath);
      const matches = entries.filter((entry: string) => {
        try {
          const fullPath = path.join(basePath, entry);
          const stats = fs.statSync(fullPath);
          return stats.isFile() && regex.test(entry);
        } catch {
          return false;
        }
      });

      return matches.join(' ');
    } catch (err) {
      console.error(`[RexxArp] FILELIST error:`, err);
      return '';
    }
  }

  /**
   * MATCHPATTERN(pattern, string)
   * Check if string matches AmigaDOS pattern
   * Returns: 1 if matches, 0 if not
   */
  matchpattern(pattern: string, str: string): number {
    console.log(`[RexxArp] MATCHPATTERN("${pattern}", "${str}")`);

    // Convert AmigaDOS pattern to regex
    const regex = this.amigaPatternToRegex(pattern);
    return regex.test(str) ? 1 : 0;
  }

  /**
   * BASENAME(path)
   * Extract filename from path
   * Returns: filename portion
   */
  basename(filepath: string): string {
    console.log(`[RexxArp] BASENAME("${filepath}")`);

    // Handle AmigaDOS path separators (/ or :)
    const parts = filepath.split(/[\/\:]/);
    return parts[parts.length - 1] || '';
  }

  /**
   * DIRNAME(path)
   * Extract directory from path
   * Returns: directory portion
   */
  dirname(filepath: string): string {
    console.log(`[RexxArp] DIRNAME("${filepath}")`);

    const lastSlash = Math.max(filepath.lastIndexOf('/'), filepath.lastIndexOf(':'));
    if (lastSlash === -1) return '';
    return filepath.substring(0, lastSlash + 1);
  }

  /**
   * READFILE(filename)
   * Read entire file as string
   * Returns: file contents or empty string
   */
  readfile(filename: string): string {
    const resolvedPath = this.resolveAmigaPath(filename);
    console.log(`[RexxArp] READFILE("${filename}") -> "${resolvedPath}"`);

    try {
      return fs.readFileSync(resolvedPath, 'utf-8');
    } catch {
      return '';
    }
  }

  /**
   * WRITEFILE(filename, content)
   * Write string to file
   * Returns: 1 if successful, 0 if failed
   */
  writefile(filename: string, content: string): number {
    const resolvedPath = this.resolveAmigaPath(filename);
    console.log(`[RexxArp] WRITEFILE("${filename}", ${content.length} bytes)`);

    try {
      // Ensure directory exists
      const dir = path.dirname(resolvedPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }

      fs.writeFileSync(resolvedPath, content);
      return 1;
    } catch {
      return 0;
    }
  }

  /**
   * GETFILE(title, path, pattern)
   * File requester (stub - returns empty in BBS context)
   */
  getfile(title: string, dirpath: string, pattern: string): string {
    console.log(`[RexxArp] GETFILE("${title}", "${dirpath}", "${pattern}")`);
    // In BBS context, file requesters don't make sense
    return '';
  }

  /**
   * GETPATH(title, path)
   * Directory requester (stub)
   */
  getpath(title: string, dirpath: string): string {
    console.log(`[RexxArp] GETPATH("${title}", "${dirpath}")`);
    return '';
  }

  /**
   * REQUEST(title, body, buttons)
   * Simple requester (stub - returns 0)
   */
  request(title: string, body: string, buttons: string): number {
    console.log(`[RexxArp] REQUEST("${title}", "${body}", "${buttons}")`);
    // Return 0 (first/cancel button)
    return 0;
  }

  /**
   * POSTMSG(title, message)
   * Post a message (stub)
   */
  postmsg(title: string, message: string): number {
    console.log(`[RexxArp] POSTMSG("${title}", "${message}")`);
    return 1;
  }

  /**
   * SCREENTOBACK()
   * Send screen to back (stub)
   */
  screentoback(): number {
    console.log(`[RexxArp] SCREENTOBACK()`);
    return 1;
  }

  /**
   * SCREENTOFRONT()
   * Bring screen to front (stub)
   */
  screentofront(): number {
    console.log(`[RexxArp] SCREENTOFRONT()`);
    return 1;
  }

  /**
   * GETFONT(title)
   * Font requester (stub)
   */
  getfont(title: string): string {
    console.log(`[RexxArp] GETFONT("${title}")`);
    return '';
  }

  /**
   * BADDR(bptr)
   * Convert BCPL pointer to C pointer (multiply by 4)
   */
  baddr(bptr: number): number {
    return bptr << 2;
  }

  /**
   * MKBADDR(cptr)
   * Convert C pointer to BCPL pointer (divide by 4)
   */
  mkbaddr(cptr: number): number {
    return cptr >> 2;
  }

  // =========================================================================
  // Pattern conversion helpers
  // =========================================================================

  /**
   * Convert AmigaDOS pattern to regex
   */
  private amigaPatternToRegex(pattern: string): RegExp {
    let regex = pattern
      .replace(/[.+^${}()|[\]\\]/g, '\\$&') // Escape regex special chars
      .replace(/#\?/g, '.*')                 // #? -> .*
      .replace(/\?/g, '.')                   // ? -> .
      .replace(/~/g, '^');                   // ~ -> ^ (not at start)

    return new RegExp(`^${regex}$`, 'i'); // Case insensitive
  }

  private resolveAmigaPath(amigaPath: string): string {
    let resolved = amigaPath;

    // Replace Amiga volume/assign names
    if (resolved.startsWith('DOORS:')) {
      resolved = path.join(this.bbsRoot, 'Doors', resolved.substring(6));
    } else if (resolved.startsWith('BBS:')) {
      resolved = path.join(this.bbsRoot, resolved.substring(4));
    } else if (resolved.startsWith('RAM:')) {
      resolved = path.join('/tmp', resolved.substring(4));
    } else if (resolved.startsWith('T:')) {
      resolved = path.join('/tmp', resolved.substring(2));
    } else if (resolved.startsWith('SYS:')) {
      resolved = path.join(this.bbsRoot, resolved.substring(4));
    } else if (!path.isAbsolute(resolved)) {
      resolved = path.join(this.bbsRoot, resolved);
    }

    return resolved;
  }
}

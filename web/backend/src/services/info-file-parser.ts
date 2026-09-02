/**
 * Amiga .info File Parser
 *
 * Parses Amiga Workbench .info files which use the IFF ICON format.
 * Extracts tool types (key=value configuration strings) and icon bitmap data.
 *
 * Reference: Amiga ROM Kernel Reference Manual - IFF ICON Specification
 * Test data: ~/Downloads/BBS_COPY/bbsConfig.info
 */

import type { AmigaIcon } from '../types/amiga-import';
// One parser owns the .info format. This class reads through it rather than
// keeping a second, weaker understanding of the same bytes.
import { parseInfoBuffer, tooltypeMap } from '../utils/info-file.util';

/**
 * Parse result from .info file
 */
export interface InfoFileData {
  toolTypes: Map<string, string>;
  icon?: AmigaIcon;
  rawData: Buffer;
}

/**
 * Amiga .info file parser
 */
export class InfoFileParser {
  /**
   * Parse an Amiga .info file
   * @param buffer - Raw .info file data
   * @returns Parsed tool types and icon data
   */
  parse(buffer: Buffer): InfoFileData {
    const result: InfoFileData = {
      toolTypes: new Map(),
      rawData: buffer,
    };

    try {
      // Extract tool types (null-terminated strings after icon data)
      result.toolTypes = this.extractToolTypes(buffer);

      // Optionally extract icon data (if needed for display)
      // result.icon = this.extractIcon(buffer);
    } catch (error: any) {
console.error('[InfoFileParser] Parse error:', error.message);
    }

    return result;
  }

  /**
   * The tooltypes, read by the parser that OWNS the .info format.
   *
   * This used to split the file on NUL bytes and scrape KEY=VALUE out of
   * whatever came back. An Amiga icon stores its tooltypes as an array where
   * every entry carries a 4-byte LENGTH in front of it, so without reading
   * that length there is no way to know where one entry ends - and the image
   * data scrapes as text just as readily as the tooltypes do.
   *
   * Measured across this repo's 219 icons before the change: 875 keys missed,
   * 978 invented out of image data, 66 values wrong. On `Node0.info` the whole
   * array was swallowed into NODESTART's value, so `DEF_SCREENS`,
   * `CALLERS_LOG` and `PRIORITY` did not exist at all - and DEF_SCREENS is
   * what decides which screen a node shows (express.e:6251). The importer
   * reads a board's configuration through here.
   *
   * `tooltypeMap` also mirrors FindToolType (tooltypes.e:215-218): a
   * commented-out tooltype is not set, and where a key repeats the FIRST wins.
   */
  private extractToolTypes(buffer: Buffer): Map<string, string> {
    try {
      return tooltypeMap(parseInfoBuffer(buffer));
    } catch (error) {
      // A file that is not an icon at all must not take an import down with
      // it: the caller sees no tooltypes, which is what it saw before.
      console.error('[InfoFileParser] not a readable .info:', (error as Error).message);
      return new Map();
    }
  }

  /**
   * Extract icon bitmap data (optional, for display purposes)
   * IFF ICON format has icon data at specific offsets
   */
  private extractIcon(buffer: Buffer): AmigaIcon | undefined {
    try {
      // IFF ICON structure parsing would go here
      // For BBS config import, we don't need the icon graphics
      // This is a placeholder for future implementation if needed

      return undefined;
    } catch (error: any) {
console.error('[InfoFileParser] Icon extraction error:', error.message);
      return undefined;
    }
  }

  // write() lived here. It produced 256 zero bytes with a magic number and
  // raw KEY=VALUE strings - no DiskObject, no gadget, no length-prefixed
  // tooltype array - so GetDiskObject returned NIL and FindToolType found
  // nothing (tooltypes.e:215-218), while the icon it overwrote was destroyed.
  // Writing a .info goes through utils/info-file.util.ts, which edits the
  // real structure in place.

  /**
   * Parse bbsConfig.info specifically
   * Returns common BBS configuration keys
   */
  parseBBSConfig(buffer: Buffer): Map<string, string> {
    const data = this.parse(buffer);

    // Log found configuration for debugging
console.log('[InfoFileParser] Found BBS config keys:');
    for (const [key, value] of data.toolTypes) {
      // Mask sensitive values in logs
      const maskedValue = this.maskSensitive(key, value);
console.log(`  ${key}=${maskedValue}`);
    }

    return data.toolTypes;
  }

  /**
   * Mask sensitive values for logging
   */
  private maskSensitive(key: string, value: string): string {
    const sensitiveKeys = [
      'SMTP_PASSWORD',
      'SMTP_USERNAME',
      'PASSWORD',
      'SECRET',
    ];

    if (sensitiveKeys.some(sk => key.toUpperCase().includes(sk))) {
      return value.length > 0 ? '[REDACTED]' : '';
    }

    return value;
  }

  /**
   * Parse command .info file (from Commands/BBSCmd/*.info)
   * Returns command metadata and settings
   */
  parseCommandInfo(buffer: Buffer, commandName: string): Map<string, string> {
    const data = this.parse(buffer);

console.log(`[InfoFileParser] Command "${commandName}" settings:`);
    for (const [key, value] of data.toolTypes) {
console.log(`  ${key}=${value}`);
    }

    return data.toolTypes;
  }

  /**
   * Parse access level .info file (from Access/ACS.*.info)
   * Returns access level settings
   */
  parseAccessInfo(buffer: Buffer, level: number): Map<string, string> {
    const data = this.parse(buffer);

console.log(`[InfoFileParser] Access level ${level} settings:`);
    for (const [key, value] of data.toolTypes) {
console.log(`  ${key}=${value}`);
    }

    return data.toolTypes;
  }

  /**
   * Parse file area .info file (from Conf/Dir*.info)
   * Returns file area metadata
   */
  parseFileAreaInfo(buffer: Buffer, areaName: string): Map<string, string> {
    const data = this.parse(buffer);

console.log(`[InfoFileParser] File area "${areaName}" settings:`);
    for (const [key, value] of data.toolTypes) {
console.log(`  ${key}=${value}`);
    }

    return data.toolTypes;
  }
}

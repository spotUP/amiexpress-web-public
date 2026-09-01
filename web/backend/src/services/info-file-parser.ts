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
   * Extract tool types from .info file
   * Tool types are stored as null-terminated strings
   */
  private extractToolTypes(buffer: Buffer): Map<string, string> {
    const toolTypes = new Map<string, string>();

    try {
      // Convert buffer to string (ISO-8859-1 encoding for Amiga)
      const content = buffer.toString('latin1');

      // Tooltypes are null-terminated strings; iterate explicitly to mimic icon.library FindToolType.
      const entries = content.split('\x00');
      for (const rawEntry of entries) {
        // Strip leading/trailing control chars (icon library stores length bytes)
        const entry = rawEntry.replace(/^[\x00-\x1F]+/, '').trim();
        if (!entry) continue;

        // Parenthesized tooltypes are commented out
        if (entry.startsWith('(') && entry.endsWith(')')) {
          continue;
        }

        // Skip commented tooltypes
        if (entry.startsWith('!')) {
          continue;
        }

        const eqIdx = entry.indexOf('=');
        if (eqIdx === -1) {
          const keyOnly = entry.trim();
          if (!keyOnly) continue;

          const normalizedKey = keyOnly.toUpperCase();
          if (!/^[A-Z0-9_.]+$/.test(normalizedKey)) continue;
          if (toolTypes.has(normalizedKey)) continue;

          toolTypes.set(normalizedKey, '');
          continue;
        }

        if (eqIdx < 1) continue;

        const key = entry.slice(0, eqIdx).trim();
        let value = entry.slice(eqIdx + 1).trim();

        // Remove trailing control chars
        value = value.replace(/[\x00-\x1F]+$/, '');
        if (!key) continue;

        // Case-insensitive keys; preserve first occurrence like FindToolType
        const normalizedKey = key.toUpperCase();
        if (toolTypes.has(normalizedKey)) continue;

        toolTypes.set(normalizedKey, value);
      }
    } catch (error: any) {
console.error('[InfoFileParser] Tool type extraction error:', error.message);
    }

    return toolTypes;
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

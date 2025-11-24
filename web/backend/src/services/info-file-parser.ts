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
        const entry = rawEntry.trim();
        if (!entry) continue;

        // Parenthesized tooltypes are commented out
        if (entry.startsWith('(') && entry.endsWith(')')) {
          continue;
        }

        const eqIdx = entry.indexOf('=');
        if (eqIdx < 1) continue;

        const key = entry.slice(0, eqIdx).trim();
        let value = entry.slice(eqIdx + 1).trim();

        // Remove trailing control chars
        value = value.replace(/[\x00-\x1F]+$/, '');
        if (!key || value.length === 0) continue;

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

  /**
   * Create a .info file with tool types
   * @param toolTypes - Map of key-value pairs
   * @param icon - Optional icon data
   * @returns Buffer containing .info file data
   */
  write(toolTypes: Map<string, string>, icon?: AmigaIcon): Buffer {
    // For now, create a minimal .info file with just tool types
    // Full IFF ICON generation would require more complex code

    const toolTypeStrings: string[] = [];

    // Convert tool types to null-terminated strings
    for (const [key, value] of toolTypes.entries()) {
      toolTypeStrings.push(`${key}=${value}\x00`);
    }

    // Join all tool types
    const toolTypesBuffer = Buffer.from(toolTypeStrings.join(''), 'latin1');

    // Create a minimal .info file structure
    // This is a simplified version - real .info files have IFF structure
    const header = Buffer.alloc(256); // Placeholder header
    header.writeUInt32BE(0xe3100001, 0); // Magic number (simplified)

    return Buffer.concat([header, toolTypesBuffer]);
  }

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
      'REGKEY',
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

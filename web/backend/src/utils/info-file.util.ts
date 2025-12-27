/**
 * Amiga .info File Parser and Writer
 *
 * Handles Amiga Workbench icon files (.info) which contain:
 * - DiskObject structure (icon metadata)
 * - Tool Types (configuration strings)
 * - Icon images (FORM ICON chunks)
 *
 * Format based on classic AmigaOS 1.x/2.x .info files
 */

import * as fs from 'fs';
import { execSync } from 'child_process';
import { parseIFFFile, IFFFile, readBE32, writeBE32, readBE16, writeBE16 } from './iff-parser.util';

export interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

export interface InfoFile {
  filePath: string;
  diskObject: Buffer;    // Original DiskObject structure
  tooltypes: Tooltype[];
  iconData: Buffer;      // FORM ICON chunk (if present)
  rawBuffer: Buffer;     // Complete original file
}

/**
 * Find tooltypes section boundaries in .info file
 * Use strings command to locate tooltypes, then find their position in binary
 */
function findTooltypesSection(buffer: Buffer, tooltypes: Tooltype[]): { start: number; end: number } {
  // Find "FORM" marker (end of tooltypes, start of icon data)
  const formIndex = buffer.indexOf('FORM');
  const end = formIndex !== -1 ? formIndex : buffer.length;

  if (tooltypes.length === 0) {
    return { start: end, end };
  }

  // Find the first tooltype in the binary
  const firstKey = tooltypes[0].key;
  const firstLine = tooltypes[0].originalLine;

  // Search for the first tooltype string in the buffer
  let start = end;
  for (let i = 0x100; i < end - firstLine.length; i++) {
    const str = buffer.toString('utf8', i, i + firstLine.length);
    if (str === firstLine) {
      start = i;
      break;
    }
  }

  return { start, end };
}

/**
 * Parse tooltypes using strings command (reliable and matches existing code)
 */
function parseTooltypesWithStrings(filePath: string): Tooltype[] {
  const tooltypes: Tooltype[] = [];

  try {
    const output = execSync(`strings "${filePath}"`, { encoding: 'utf8' });
    const lines = output.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines
      if (!trimmed) {
        continue;
      }

      // Skip parenthesized lines (commented tooltypes)
      if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
        continue;
      }

      let cleaned = trimmed;
      let commented = false;

      // Check for comment prefix
      if (cleaned.startsWith('!')) {
        commented = true;
        cleaned = cleaned.substring(1);
      } else if (cleaned.startsWith('#') || cleaned.startsWith('+') || cleaned.startsWith('%') || cleaned.startsWith("'")) {
        // Amiga-style prefixes, not comments
        cleaned = cleaned.substring(1);
      }

      const eqIdx = cleaned.indexOf('=');
      if (eqIdx === -1) {
        const keyOnly = cleaned.trim();
        const normalized = keyOnly.toUpperCase();
        if (!/^[A-Z0-9_]{2,64}$/.test(normalized)) {
          continue;
        }

        tooltypes.push({
          key: normalized,
          value: '',
          commented,
          originalLine: trimmed
        });
        continue;
      }

      if (eqIdx < 1) continue;

      const [key, ...valueParts] = cleaned.split('=');
      const value = valueParts.join('=').trim();

      if (key) {
        tooltypes.push({
          key: key.toUpperCase().trim(),
          value,
          commented,
          originalLine: trimmed
        });
      }
    }
  } catch (error) {
    console.error(`[parseTooltypesWithStrings] Error:`, error);
  }

  return tooltypes;
}

/**
 * Parse .info file
 */
export function parseInfoFile(filePath: string): InfoFile {
  const buffer = fs.readFileSync(filePath);

  // Parse tooltypes using strings command (reliable)
  const tooltypes = parseTooltypesWithStrings(filePath);

  // Find tooltypes section boundaries
  const { start, end } = findTooltypesSection(buffer, tooltypes);

  // Extract icon data (FORM chunk if present)
  const formIndex = buffer.indexOf('FORM');
  const iconData = formIndex !== -1 ? buffer.slice(formIndex) : Buffer.alloc(0);

  // DiskObject is everything before tooltypes
  const diskObject = buffer.slice(0, start);

  return {
    filePath,
    diskObject,
    tooltypes,
    iconData,
    rawBuffer: buffer
  };
}

/**
 * Write .info file with updated tooltypes
 * Preserves DiskObject structure and icon data
 */
export function writeInfoFile(info: InfoFile): void {
  // Build new tooltypes buffer
  const tooltypeBuffers: Buffer[] = [];

  for (const tt of info.tooltypes) {
    // Build the tooltype string
    let line = '';

    if (tt.commented) {
      line = `!${tt.key}=${tt.value}`;
    } else {
      line = `${tt.key}=${tt.value}`;
    }

    // Create null-terminated string
    const strBuf = Buffer.from(line + '\0', 'utf8');
    tooltypeBuffers.push(strBuf);
  }

  // Combine buffers
  const tooltypesBuffer = Buffer.concat(tooltypeBuffers);

  // Build complete file: DiskObject + Tooltypes + Icon Data
  const newBuffer = Buffer.concat([
    info.diskObject,
    tooltypesBuffer,
    info.iconData
  ]);

  // Write to file
  fs.writeFileSync(info.filePath, newBuffer);
}

/**
 * Update a specific tooltype in .info file
 */
export function updateTooltype(info: InfoFile, key: string, value: string, commented: boolean): InfoFile {
  const upperKey = key.toUpperCase();
  const existingIndex = info.tooltypes.findIndex(tt => tt.key === upperKey);

  if (existingIndex !== -1) {
    // Update existing tooltype
    info.tooltypes[existingIndex] = {
      key: upperKey,
      value,
      commented,
      originalLine: `${commented ? '!' : ''}${upperKey}=${value}`
    };
  } else {
    // Add new tooltype
    info.tooltypes.push({
      key: upperKey,
      value,
      commented,
      originalLine: `${commented ? '!' : ''}${upperKey}=${value}`
    });
  }

  return info;
}

/**
 * Toggle tooltype comment status
 */
export function toggleTooltypeComment(info: InfoFile, key: string): InfoFile {
  const upperKey = key.toUpperCase();
  const tooltype = info.tooltypes.find(tt => tt.key === upperKey);

  if (tooltype) {
    tooltype.commented = !tooltype.commented;
    tooltype.originalLine = `${tooltype.commented ? '!' : ''}${tooltype.key}=${tooltype.value}`;
  }

  return info;
}

/**
 * Remove tooltype from .info file
 */
export function removeTooltype(info: InfoFile, key: string): InfoFile {
  const upperKey = key.toUpperCase();
  info.tooltypes = info.tooltypes.filter(tt => tt.key !== upperKey);
  return info;
}

/**
 * Add tooltype to .info file
 */
export function addTooltype(info: InfoFile, key: string, value: string, commented: boolean = false): InfoFile {
  const upperKey = key.toUpperCase();

  // Check if already exists
  if (info.tooltypes.some(tt => tt.key === upperKey)) {
    throw new Error(`Tooltype ${upperKey} already exists`);
  }

  info.tooltypes.push({
    key: upperKey,
    value,
    commented,
    originalLine: `${commented ? '!' : ''}${upperKey}=${value}`
  });

  return info;
}

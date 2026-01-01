/**
 * Amiga .info File Parser and Writer
 *
 * Handles Amiga Workbench icon files (.info) while preserving binary data
 * (images, drawer data, etc.). Supports both standard binary icons and
 * text-based representations.
 */

import * as fs from 'fs';
import { execSync } from 'child_process';

export interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  prefix: string;        // Amiga-style prefix (#, %, +, ', etc.)
  originalLine: string;
}

export interface InfoFile {
  filePath: string;
  isBinary: boolean;
  diskObject: Buffer;    // Data before tooltypes (header)
  iconData: Buffer;      // Data after tooltypes (footer)
  tooltypes: Tooltype[];
  rawBuffer: Buffer;     // Original file content
}

/**
 * Extract tooltypes from file using 'strings' command.
 * This is robust for both text and binary Amiga icons.
 */
function extractTooltypes(filePath: string): Tooltype[] {
  const tooltypes: Tooltype[] = [];
  try {
    // -a: scan whole file, -t x: show offset in hex
    const output = execSync(`strings -a -t x "${filePath}"`, { encoding: 'utf8' });
    const lines = output.split('\n');

    for (const line of lines) {
      const match = line.trim().match(/^\s*([0-9a-f]+)\s+(.+)$/i);
      if (!match) continue;

      const content = match[2].trim();
      let cleaned = content;
      let commented = false;
      let prefix = '';

      // Handle comments
      if (cleaned.startsWith('!')) {
        commented = true;
        cleaned = cleaned.substring(1);
      } else if (cleaned.startsWith('(') && cleaned.endsWith(')')) {
        commented = true;
        cleaned = cleaned.substring(1, cleaned.length - 1);
      }

      // Handle Amiga prefixes
      if (cleaned.startsWith('#') || cleaned.startsWith('+') || cleaned.startsWith('%') || cleaned.startsWith("'")) {
        prefix = cleaned.substring(0, 1);
        cleaned = cleaned.substring(1);
      }

      const eqIdx = cleaned.indexOf('=');
      if (eqIdx !== -1) {
        const key = cleaned.substring(0, eqIdx).toUpperCase().trim();
        const value = cleaned.substring(eqIdx + 1).trim();
        if (key) {
          tooltypes.push({
            key,
            value,
            commented,
            prefix,
            originalLine: content
          });
        }
      } else {
        // Flag mode: just the key
        const key = cleaned.toUpperCase().trim();
        if (key && /^[A-Z0-9_]{2,64}$/.test(key)) {
          tooltypes.push({
            key,
            value: '',
            commented,
            prefix,
            originalLine: content
          });
        }
      }
    }
  } catch (error) {
    console.error(`[InfoFileUtil] Error extracting strings:`, error);
  }
  return tooltypes;
}

/**
 * Parse .info file into components
 */
export function parseInfoFile(filePath: string): InfoFile {
  const buffer = fs.readFileSync(filePath);
  const isBinary = buffer.length > 2 && buffer[0] === 0xe3 && buffer[1] === 0x10;
  
  const tooltypes = extractTooltypes(filePath);

  if (!isBinary) {
    // For text files, just treat tooltypes as the whole content (minus FORM trailer if present)
    const formIdx = buffer.indexOf('FORM');
    const iconData = formIdx !== -1 ? buffer.slice(formIdx) : Buffer.alloc(0);
    return {
      filePath,
      isBinary: false,
      diskObject: Buffer.alloc(0),
      iconData,
      tooltypes,
      rawBuffer: buffer
    };
  }

  // BINARY MODE: Identify tooltype block boundaries
  if (tooltypes.length === 0) {
    return {
      filePath,
      isBinary: true,
      diskObject: buffer.slice(0, 78),
      iconData: buffer.slice(78),
      tooltypes: [],
      rawBuffer: buffer
    };
  }

  let firstOffset = buffer.length;
  let lastEndOffset = 0;

  for (const tt of tooltypes) {
    const idx = buffer.indexOf(tt.originalLine);
    if (idx !== -1) {
      if (idx < firstOffset) firstOffset = idx;
      const end = idx + tt.originalLine.length;
      if (end > lastEndOffset) lastEndOffset = end;
    }
  }

  let end = lastEndOffset;
  while (end < buffer.length && buffer[end] === 0) {
    end++;
  }

  return {
    filePath,
    isBinary: true,
    diskObject: buffer.slice(0, firstOffset),
    iconData: buffer.slice(end),
    tooltypes,
    rawBuffer: buffer
  };
}

/**
 * Write updated .info file
 */
export function writeInfoFile(info: InfoFile): void {
  const tooltypeBuffers: Buffer[] = [];

  for (const tt of info.tooltypes) {
    const prefix = tt.commented ? '!' : '';
    const amigaPrefix = tt.prefix || '';
    const line = `${prefix}${amigaPrefix}${tt.key}${tt.value ? '=' + tt.value : ''}`;
    tooltypeBuffers.push(Buffer.from(line + '\0', 'utf8'));
  }

  if (info.isBinary) {
    tooltypeBuffers.push(Buffer.from('\0'));
  }

  const tooltypesBuffer = Buffer.concat(tooltypeBuffers);

  let newBuffer: Buffer;
  if (info.isBinary) {
    newBuffer = Buffer.concat([
      info.diskObject,
      tooltypesBuffer,
      info.iconData
    ]);
  } else {
    const textLines = info.tooltypes.map(tt => {
      const prefix = tt.commented ? '!' : '';
      const amigaPrefix = tt.prefix || '';
      return `${prefix}${amigaPrefix}${tt.key}${tt.value ? '=' + tt.value : ''}`;
    }).join('\n') + '\n';
    
    newBuffer = Buffer.concat([
      Buffer.from(textLines, 'utf8'),
      info.iconData
    ]);
  }

  fs.writeFileSync(info.filePath, newBuffer);
}

/**
 * TooltypeEditor - Batch editor for .info files
 */
export class TooltypeEditor {
  private info: InfoFile;

  constructor(filePath: string) {
    this.info = parseInfoFile(filePath);
  }

  public getTooltypes(): Tooltype[] {
    return this.info.tooltypes;
  }

  public set(key: string, value: string, commented: boolean = false, prefix: string = ''): this {
    this.info = updateTooltype(this.info, key, value, commented, prefix);
    return this;
  }

  public add(key: string, value: string, commented: boolean = false, prefix: string = ''): this {
    return this.set(key, value, commented, prefix);
  }

  public remove(key: string): this {
    this.info = removeTooltype(this.info, key);
    return this;
  }

  public toggle(key: string): this {
    this.info = toggleTooltypeComment(this.info, key);
    return this;
  }

  public save(): void {
    writeInfoFile(this.info);
  }

  public getInfo(): InfoFile {
    return this.info;
  }
}

/**
 * Utility functions for updating tooltypes
 */
export function updateTooltype(
  info: InfoFile, 
  key: string, 
  value: string, 
  commented: boolean, 
  prefix: string = ''
): InfoFile {
  const upperKey = key.toUpperCase();
  const existingIndex = info.tooltypes.findIndex(tt => tt.key === upperKey);

  const newTt = {
    key: upperKey,
    value,
    commented,
    prefix,
    originalLine: `${commented ? '!' : ''}${prefix}${upperKey}${value ? '=' + value : ''}`
  };

  if (existingIndex !== -1) {
    // Preserve existing prefix if not provided
    if (!prefix && info.tooltypes[existingIndex].prefix) {
      newTt.prefix = info.tooltypes[existingIndex].prefix;
      newTt.originalLine = `${commented ? '!' : ''}${newTt.prefix}${upperKey}${value ? '=' + value : ''}`;
    }
    info.tooltypes[existingIndex] = newTt;
  } else {
    info.tooltypes.push(newTt);
  }
  return info;
}

export function addTooltype(
  info: InfoFile, 
  key: string, 
  value: string, 
  commented: boolean = false, 
  prefix: string = ''
): InfoFile {
  const upperKey = key.toUpperCase();
  if (info.tooltypes.some(tt => tt.key === upperKey)) {
    throw new Error(`Tooltype ${upperKey} already exists`);
  }
  return updateTooltype(info, key, value, commented, prefix);
}

export function toggleTooltypeComment(info: InfoFile, key: string): InfoFile {
  const upperKey = key.toUpperCase();
  const tt = info.tooltypes.find(tt => tt.key === upperKey);
  if (tt) {
    tt.commented = !tt.commented;
    const prefix = tt.commented ? '!' : '';
    const amigaPrefix = tt.prefix || '';
    tt.originalLine = `${prefix}${amigaPrefix}${tt.key}${tt.value ? '=' + tt.value : ''}`;
  }
  return info;
}

export function removeTooltype(info: InfoFile, key: string): InfoFile {
  const upperKey = key.toUpperCase();
  info.tooltypes = info.tooltypes.filter(tt => tt.key !== upperKey);
  return info;
}

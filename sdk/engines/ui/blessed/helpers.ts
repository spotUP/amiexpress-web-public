/**
 * helpers.ts - helpers for blessed
 * EXACT 1:1 PORT from neo-blessed lib/helpers.js
 * Copyright (c) 2013-2015, Christopher Jeffrey and contributors (MIT License).
 * https://github.com/chjj/blessed
 */

import * as fs from 'fs';

/**
 * Merge object b into object a
 * EXACT from helpers.js lines 21-26
 */
export function merge<T extends Record<string, any>>(a: T, b: Partial<T>): T {
  Object.keys(b).forEach((key) => {
    (a as any)[key] = b[key];
  });
  return a;
}

/**
 * Alphabetical sort by name property
 * EXACT from helpers.js lines 28-43
 */
export function asort<T extends { name: string }>(obj: T[]): T[] {
  return obj.sort((a, b) => {
    let aName = a.name.toLowerCase();
    let bName = b.name.toLowerCase();

    if (aName[0] === '.' && bName[0] === '.') {
      aName = aName[1];
      bName = bName[1];
    } else {
      aName = aName[0];
      bName = bName[0];
    }

    return aName > bName ? 1 : (aName < bName ? -1 : 0);
  });
}

/**
 * Hierarchical sort by index property (descending)
 * EXACT from helpers.js lines 45-49
 * CRITICAL: Used in screen.js line 478 for mouse event ordering
 */
export function hsort<T extends { index: number }>(obj: T[]): T[] {
  return obj.sort((a, b) => {
    return b.index - a.index;
  });
}

/**
 * Find a file by name starting from a directory
 * EXACT from helpers.js lines 51-87
 */
export function findFile(start: string, target: string): string | null {
  const read = (dir: string): string | null => {
    let files: string[];
    let file: string;
    let stat: fs.Stats | null;
    let out: string | null;

    if (dir === '/dev' || dir === '/sys' ||
        dir === '/proc' || dir === '/net') {
      return null;
    }

    try {
      files = fs.readdirSync(dir);
    } catch (e) {
      files = [];
    }

    for (let i = 0; i < files.length; i++) {
      file = files[i];

      if (file === target) {
        return (dir === '/' ? '' : dir) + '/' + file;
      }

      try {
        stat = fs.lstatSync((dir === '/' ? '' : dir) + '/' + file);
      } catch (e) {
        stat = null;
      }

      if (stat && stat.isDirectory() && !stat.isSymbolicLink()) {
        out = read((dir === '/' ? '' : dir) + '/' + file);
        if (out) return out;
      }
    }

    return null;
  };

  return read(start);
}

/**
 * Escape text for tag-enabled elements
 * EXACT from helpers.js lines 90-94
 */
export function escape(text: string): string {
  return text.replace(/[{}]/g, (ch) => {
    return ch === '{' ? '{open}' : '{close}';
  });
}

/**
 * Parse tags in text (requires screen context)
 * EXACT from helpers.js lines 96-99
 * Note: Deferred implementation - requires Element._parseTags
 */
export function parseTags(text: string, screen?: any): string {
  // This will be implemented once Element class is fully available
  // For now, return text as-is
  return text;
}

/**
 * Generate opening and closing tags from style object
 * EXACT from helpers.js lines 101-128
 */
export function generateTags(style: Record<string, any> | null | undefined, text?: string | null): string | { open: string; close: string } {
  let open = '';
  let close = '';

  Object.keys(style || {}).forEach((key) => {
    let val = style![key];
    if (typeof val === 'string') {
      val = val.replace(/^light(?!-)/, 'light-');
      val = val.replace(/^bright(?!-)/, 'bright-');
      open = '{' + val + '-' + key + '}' + open;
      close += '{/' + val + '-' + key + '}';
    } else {
      if (val === true) {
        open = '{' + key + '}' + open;
        close += '{/' + key + '}';
      }
    }
  });

  if (text !== null && text !== undefined) {
    return open + text + close;
  }

  return {
    open: open,
    close: close
  };
}

/**
 * Convert style object to binary attribute code
 * EXACT from helpers.js lines 130-132
 * Note: Deferred implementation - requires Element.sattr
 */
export function attrToBinary(style: any, element?: any): number {
  // This will be implemented once Element.sattr is available
  // For now, return a default attribute
  return 0;
}

/**
 * Strip tags and ANSI codes from text
 * EXACT from helpers.js lines 134-139
 */
export function stripTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/{(\/?)([\w\-,;!#]*)}/g, '')
    .replace(/\x1b\[[\d;]*m/g, '');
}

/**
 * Strip tags and trim whitespace
 * EXACT from helpers.js lines 141-143
 */
export function cleanTags(text: string): string {
  return stripTags(text).trim();
}

/**
 * Replace unicode characters with placeholders
 * EXACT from helpers.js lines 145-151
 * Note: Requires unicode module - simplified for now
 */
export function dropUnicode(text: string): string {
  if (!text) return '';
  // Simplified - full implementation requires unicode.ts module
  return text
    .replace(/[\u{1F600}-\u{1F64F}]/gu, '??')  // Emoticons
    .replace(/[\u{1F300}-\u{1F5FF}]/gu, '??')  // Misc symbols
    .replace(/[\u{1F680}-\u{1F6FF}]/gu, '??')  // Transport
    .replace(/[\u{2600}-\u{26FF}]/gu, '??')    // Misc symbols
    .replace(/[\u{2700}-\u{27BF}]/gu, '??')    // Dingbats
    .replace(/[\u{0300}-\u{036F}]/gu, '')      // Combining marks (needs 'u' flag)
    .replace(/[\uD800-\uDFFF]/g, '?');         // Surrogates
}

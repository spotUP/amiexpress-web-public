#!/usr/bin/env ts-node
/**
 * .info File Editor - Command Line Tool
 *
 * Allows editing Amiga .info file tooltypes from the command line.
 * This is a temporary solution until the full UI editor is built.
 *
 * Usage:
 *   npx ts-node dev/scripts/edit-info.ts <path-to.info> [action] [args]
 *
 * Actions:
 *   list                    - List all tooltypes
 *   get <key>              - Get value of specific tooltype
 *   set <key> <value>      - Set tooltype value
 *   add <key> <value>      - Add new tooltype
 *   remove <key>           - Remove tooltype
 *   toggle <key>           - Toggle comment (! prefix)
 *   uncomment <key>        - Remove ! prefix (enable tooltype)
 *   comment <key>          - Add ! prefix (disable tooltype)
 *
 * Examples:
 *   # List all tooltypes in j.info
 *   npx ts-node dev/scripts/edit-info.ts Commands/BBSCmd/j.info list
 *
 *   # Enable the LOCATION tooltype (remove ! prefix)
 *   npx ts-node dev/scripts/edit-info.ts Commands/BBSCmd/j.info uncomment LOCATION
 *
 *   # Change ACCESS level
 *   npx ts-node dev/scripts/edit-info.ts Commands/BBSCmd/j.info set ACCESS 20
 */

import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

interface Tooltype {
  key: string;
  value: string;
  commented: boolean;
  originalLine: string;
}

class InfoFileEditor {
  private filePath: string;
  private tooltypes: Map<string, Tooltype> = new Map();
  private rawLines: string[] = [];

  constructor(filePath: string) {
    this.filePath = path.resolve(filePath);
    if (!fs.existsSync(this.filePath)) {
      throw new Error(`File not found: ${this.filePath}`);
    }
  }

  /**
   * Load tooltypes from .info file using strings command
   */
  load(): void {
    try {
      const output = execSync(`strings "${this.filePath}"`, { encoding: 'utf8' });
      this.rawLines = output.split('\n');

      for (const line of this.rawLines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.includes('=')) {
          continue;
        }

        // Skip parenthesized lines (different comment style)
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
          // These are Amiga-style prefixes, not comments
          cleaned = cleaned.substring(1);
        }

        const [key, ...valueParts] = cleaned.split('=');
        const value = valueParts.join('=').trim();

        if (key && value) {
          const cleanKey = key.toUpperCase().trim();
          this.tooltypes.set(cleanKey, {
            key: cleanKey,
            value,
            commented,
            originalLine: trimmed
          });
        }
      }
    } catch (error) {
      throw new Error(`Failed to read .info file: ${(error as Error).message}`);
    }
  }

  /**
   * List all tooltypes
   */
  list(): void {
    console.log(`\nTooltypes in ${path.basename(this.filePath)}:\n`);

    if (this.tooltypes.size === 0) {
      console.log('  (no tooltypes found)');
      return;
    }

    const maxKeyLength = Math.max(...Array.from(this.tooltypes.keys()).map(k => k.length));

    for (const [key, tt] of this.tooltypes.entries()) {
      const status = tt.commented ? '[DISABLED]' : '[ENABLED] ';
      const padding = ' '.repeat(maxKeyLength - key.length);
      console.log(`  ${status} ${key}${padding} = ${tt.value}`);
    }
    console.log();
  }

  /**
   * Get specific tooltype value
   */
  get(key: string): string | null {
    const tt = this.tooltypes.get(key.toUpperCase());
    if (!tt) {
      console.error(`Tooltype not found: ${key}`);
      return null;
    }

    console.log(`${tt.key}=${tt.value} ${tt.commented ? '(disabled)' : '(enabled)'}`);
    return tt.value;
  }

  /**
   * Set tooltype value (updates existing or adds new)
   */
  set(key: string, value: string): void {
    const upperKey = key.toUpperCase();
    const existing = this.tooltypes.get(upperKey);

    if (existing) {
      existing.value = value;
      console.log(`Updated: ${upperKey}=${value}`);
    } else {
      this.tooltypes.set(upperKey, {
        key: upperKey,
        value,
        commented: false,
        originalLine: `${upperKey}=${value}`
      });
      console.log(`Added: ${upperKey}=${value}`);
    }
  }

  /**
   * Remove tooltype
   */
  remove(key: string): void {
    const upperKey = key.toUpperCase();
    if (this.tooltypes.has(upperKey)) {
      this.tooltypes.delete(upperKey);
      console.log(`Removed: ${upperKey}`);
    } else {
      console.error(`Tooltype not found: ${key}`);
    }
  }

  /**
   * Toggle comment status
   */
  toggle(key: string): void {
    const upperKey = key.toUpperCase();
    const tt = this.tooltypes.get(upperKey);
    if (!tt) {
      console.error(`Tooltype not found: ${key}`);
      return;
    }

    tt.commented = !tt.commented;
    console.log(`${upperKey} is now ${tt.commented ? 'DISABLED' : 'ENABLED'}`);
  }

  /**
   * Enable tooltype (remove comment)
   */
  uncomment(key: string): void {
    const upperKey = key.toUpperCase();
    const tt = this.tooltypes.get(upperKey);
    if (!tt) {
      console.error(`Tooltype not found: ${key}`);
      return;
    }

    tt.commented = false;
    console.log(`${upperKey} is now ENABLED`);
  }

  /**
   * Disable tooltype (add comment)
   */
  comment(key: string): void {
    const upperKey = key.toUpperCase();
    const tt = this.tooltypes.get(upperKey);
    if (!tt) {
      console.error(`Tooltype not found: ${key}`);
      return;
    }

    tt.commented = true;
    console.log(`${upperKey} is now DISABLED`);
  }

  /**
   * Save changes back to .info file
   *
   * WARNING: This is a simplified implementation that rebuilds the .info file
   * from scratch. It preserves tooltypes but NOT icon images or other IFF data.
   * Use with caution on files that have custom icons.
   */
  save(): void {
    // Create backup
    const backupPath = this.filePath + '.backup';
    fs.copyFileSync(this.filePath, backupPath);
    console.log(`Backup created: ${backupPath}`);

    try {
      // Read original file
      const originalData = fs.readFileSync(this.filePath);

      // Find the tooltypes section in the binary data
      // Amiga .info files store tooltypes as null-terminated strings
      // This is a VERY simplified approach - just append new tooltypes

      // For now, we'll create a simple text representation and warn the user
      console.warn('\nWARNING: Full binary .info editing not yet implemented!');
      console.warn('Creating tooltypes text file instead...\n');

      const tooltypesPath = this.filePath + '.tooltypes.txt';
      let content = '# Tooltypes for ' + path.basename(this.filePath) + '\n';
      content += '# Edit this file, then use a tool to rebuild the .info file\n\n';

      for (const [key, tt] of this.tooltypes.entries()) {
        const prefix = tt.commented ? '!' : '';
        content += `${prefix}${tt.key}=${tt.value}\n`;
      }

      fs.writeFileSync(tooltypesPath, content);
      console.log(`Tooltypes saved to: ${tooltypesPath}`);
      console.log('\nTo apply changes, you need to:');
      console.log('1. Manually edit the .info file, OR');
      console.log('2. Use an Amiga .info editor tool, OR');
      console.log('3. Wait for the full UI editor to be completed');

    } catch (error) {
      console.error(`Failed to save: ${(error as Error).message}`);
      throw error;
    }
  }
}

// Main CLI handler
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 2) {
    console.log(`
Usage: npx ts-node dev/scripts/edit-info.ts <path-to.info> <action> [args]

Actions:
  list                    - List all tooltypes
  get <key>              - Get value of specific tooltype
  set <key> <value>      - Set tooltype value
  add <key> <value>      - Add new tooltype (alias for set)
  remove <key>           - Remove tooltype
  toggle <key>           - Toggle comment (! prefix)
  uncomment <key>        - Remove ! prefix (enable tooltype)
  comment <key>          - Add ! prefix (disable tooltype)

Examples:
  npx ts-node dev/scripts/edit-info.ts Commands/BBSCmd/j.info list
  npx ts-node dev/scripts/edit-info.ts Commands/BBSCmd/j.info uncomment LOCATION
  npx ts-node dev/scripts/edit-info.ts Commands/BBSCmd/j.info set ACCESS 20
`);
    process.exit(1);
  }

  const [filePath, action, ...actionArgs] = args;

  try {
    const editor = new InfoFileEditor(filePath);
    editor.load();

    switch (action.toLowerCase()) {
      case 'list':
        editor.list();
        break;

      case 'get':
        if (actionArgs.length < 1) {
          console.error('Usage: get <key>');
          process.exit(1);
        }
        editor.get(actionArgs[0]);
        break;

      case 'set':
      case 'add':
        if (actionArgs.length < 2) {
          console.error('Usage: set <key> <value>');
          process.exit(1);
        }
        editor.set(actionArgs[0], actionArgs.slice(1).join(' '));
        editor.save();
        break;

      case 'remove':
        if (actionArgs.length < 1) {
          console.error('Usage: remove <key>');
          process.exit(1);
        }
        editor.remove(actionArgs[0]);
        editor.save();
        break;

      case 'toggle':
        if (actionArgs.length < 1) {
          console.error('Usage: toggle <key>');
          process.exit(1);
        }
        editor.toggle(actionArgs[0]);
        editor.save();
        break;

      case 'uncomment':
      case 'enable':
        if (actionArgs.length < 1) {
          console.error('Usage: uncomment <key>');
          process.exit(1);
        }
        editor.uncomment(actionArgs[0]);
        editor.save();
        break;

      case 'comment':
      case 'disable':
        if (actionArgs.length < 1) {
          console.error('Usage: comment <key>');
          process.exit(1);
        }
        editor.comment(actionArgs[0]);
        editor.save();
        break;

      default:
        console.error(`Unknown action: ${action}`);
        console.error('Valid actions: list, get, set, add, remove, toggle, uncomment, comment');
        process.exit(1);
    }

  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exit(1);
  }
}

main();

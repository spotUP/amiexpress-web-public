#!/usr/bin/env ts-node
/**
 * CLI .info File Editor
 * Command-line tool for editing Amiga .info file tooltypes
 *
 * Usage:
 *   info-editor <file.info> list                              - List all tooltypes
 *   info-editor <file.info> get <KEY>                         - Get value of a tooltype
 *   info-editor <file.info> set <KEY> <VALUE>                 - Set/add a tooltype
 *   info-editor <file.info> delete <KEY>                      - Delete a tooltype
 *   info-editor <file.info> enable <KEY>                      - Enable (uncomment) a tooltype
 *   info-editor <file.info> disable <KEY>                     - Disable (comment) a tooltype
 *   info-editor <file.info> toggle <KEY>                      - Toggle comment status
 *   info-editor <file.info> backup [restore]                  - Create or restore backup
 *
 * Options:
 *   --no-backup    Skip automatic backup before modifications
 *   --verbose      Show detailed operation logs
 *   --json         Output in JSON format (for list/get commands)
 */

import { parseInfoFile, writeInfoFile, toggleTooltypeComment, updateTooltype, Tooltype } from '../utils/info-file.util.js';
import * as fs from 'fs';
import * as path from 'path';

interface Options {
  noBackup: boolean;
  verbose: boolean;
  json: boolean;
}

function parseArgs(): { file: string; command: string; args: string[]; options: Options } {
  const args = process.argv.slice(2);

  const options: Options = {
    noBackup: args.includes('--no-backup'),
    verbose: args.includes('--verbose'),
    json: args.includes('--json')
  };

  // Filter out flags
  const cleanArgs = args.filter(a => !a.startsWith('--'));

  if (cleanArgs.length < 2) {
    showHelp();
    process.exit(1);
  }

  const file = cleanArgs[0];
  const command = cleanArgs[1];
  const cmdArgs = cleanArgs.slice(2);

  return { file, command, args: cmdArgs, options };
}

function showHelp(): void {
  console.log(`
[INFO EDITOR] - Amiga .info File Tooltype Editor

USAGE:
  info-editor <file.info> <command> [args] [options]

COMMANDS:
  list                     List all tooltypes with status
  get <KEY>               Get value of a specific tooltype
  set <KEY> <VALUE>       Set or add a tooltype (creates if missing)
  delete <KEY>            Delete a tooltype completely
  enable <KEY>            Enable (uncomment) a tooltype
  disable <KEY>           Disable (comment out) a tooltype
  toggle <KEY>            Toggle comment status of a tooltype
  backup                  Create backup of .info file
  restore                 Restore from backup file

OPTIONS:
  --no-backup             Skip automatic backup before modifications
  --verbose               Show detailed operation logs
  --json                  Output in JSON format (for list/get)

EXAMPLES:
  info-editor j.info list
  info-editor j.info get LOCATION
  info-editor j.info set STACK 20000
  info-editor j.info disable LOCATION
  info-editor j.info enable LOCATION
  info-editor j.info delete OLDKEY
  info-editor j.info backup
  info-editor j.info restore
  info-editor j.info list --json

NOTES:
  - KEY names are case-insensitive (converted to uppercase)
  - Automatic backup created before modifications (unless --no-backup)
  - Backup files have .backup extension
  - Preserves icon image data and DiskObject structure
  `);
}

function log(options: Options, message: string): void {
  if (options.verbose) {
    console.log(`[VERBOSE] ${message}`);
  }
}

function createBackup(filePath: string, options: Options): string {
  const backupPath = filePath + '.backup';
  fs.copyFileSync(filePath, backupPath);
  log(options, `Backup created: ${backupPath}`);
  return backupPath;
}

function listTooltypes(filePath: string, options: Options): void {
  const info = parseInfoFile(filePath);

  if (options.json) {
    console.log(JSON.stringify(info.tooltypes, null, 2));
    return;
  }

  console.log(`\n[INFO FILE] ${path.basename(filePath)}`);
  console.log(`[TOOLTYPES] Found ${info.tooltypes.length} tooltypes:\n`);

  for (const tt of info.tooltypes) {
    const status = tt.commented ? '[DISABLED]' : '[ENABLED] ';
    const comment = tt.commented ? '!' : ' ';
    console.log(`  ${status} ${comment}${tt.key}=${tt.value}`);
  }

  console.log(`\n[DISK OBJECT] ${info.diskObject.length} bytes`);
  console.log(`[ICON DATA] ${info.iconData.length} bytes`);
  console.log(`[TOTAL SIZE] ${info.rawBuffer.length} bytes\n`);
}

function getTooltype(filePath: string, key: string, options: Options): void {
  const info = parseInfoFile(filePath);
  const upperKey = key.toUpperCase();
  const tt = info.tooltypes.find(t => t.key === upperKey);

  if (!tt) {
    console.error(`[ERROR] Tooltype '${upperKey}' not found`);
    process.exit(1);
  }

  if (options.json) {
    console.log(JSON.stringify(tt, null, 2));
    return;
  }

  const status = tt.commented ? 'DISABLED' : 'ENABLED';
  console.log(`\n[${status}] ${tt.key}=${tt.value}\n`);
}

function setTooltype(filePath: string, key: string, value: string, options: Options): void {
  if (!options.noBackup) {
    createBackup(filePath, options);
  }

  const info = parseInfoFile(filePath);
  const upperKey = key.toUpperCase();

  log(options, `Setting ${upperKey}=${value}`);

  // Use updateTooltype which adds if missing, updates if exists
  const modifiedInfo = updateTooltype(info, upperKey, value, false);

  writeInfoFile(modifiedInfo);
  console.log(`[OK] Tooltype ${upperKey} set to: ${value}`);

  // Verify
  const verifyInfo = parseInfoFile(filePath);
  const verifyTT = verifyInfo.tooltypes.find(t => t.key === upperKey);
  if (verifyTT) {
    log(options, `Verified: ${verifyTT.key}=${verifyTT.value} (commented: ${verifyTT.commented})`);
  }
}

function deleteTooltype(filePath: string, key: string, options: Options): void {
  if (!options.noBackup) {
    createBackup(filePath, options);
  }

  const info = parseInfoFile(filePath);
  const upperKey = key.toUpperCase();

  log(options, `Deleting ${upperKey}`);

  const ttIndex = info.tooltypes.findIndex(t => t.key === upperKey);
  if (ttIndex === -1) {
    console.error(`[ERROR] Tooltype '${upperKey}' not found`);
    process.exit(1);
  }

  info.tooltypes.splice(ttIndex, 1);
  writeInfoFile(info);
  console.log(`[OK] Tooltype ${upperKey} deleted`);
}

function enableTooltype(filePath: string, key: string, options: Options): void {
  if (!options.noBackup) {
    createBackup(filePath, options);
  }

  const info = parseInfoFile(filePath);
  const upperKey = key.toUpperCase();

  log(options, `Enabling ${upperKey}`);

  const tt = info.tooltypes.find(t => t.key === upperKey);
  if (!tt) {
    console.error(`[ERROR] Tooltype '${upperKey}' not found`);
    process.exit(1);
  }

  if (!tt.commented) {
    console.log(`[INFO] Tooltype ${upperKey} is already enabled`);
    return;
  }

  tt.commented = false;
  tt.originalLine = `${tt.key}=${tt.value}`;
  writeInfoFile(info);
  console.log(`[OK] Tooltype ${upperKey} enabled`);
}

function disableTooltype(filePath: string, key: string, options: Options): void {
  if (!options.noBackup) {
    createBackup(filePath, options);
  }

  const info = parseInfoFile(filePath);
  const upperKey = key.toUpperCase();

  log(options, `Disabling ${upperKey}`);

  const tt = info.tooltypes.find(t => t.key === upperKey);
  if (!tt) {
    console.error(`[ERROR] Tooltype '${upperKey}' not found`);
    process.exit(1);
  }

  if (tt.commented) {
    console.log(`[INFO] Tooltype ${upperKey} is already disabled`);
    return;
  }

  tt.commented = true;
  tt.originalLine = `!${tt.key}=${tt.value}`;
  writeInfoFile(info);
  console.log(`[OK] Tooltype ${upperKey} disabled`);
}

function toggleTooltype(filePath: string, key: string, options: Options): void {
  if (!options.noBackup) {
    createBackup(filePath, options);
  }

  const info = parseInfoFile(filePath);
  const modifiedInfo = toggleTooltypeComment(info, key);

  writeInfoFile(modifiedInfo);

  const upperKey = key.toUpperCase();
  const tt = modifiedInfo.tooltypes.find(t => t.key === upperKey);
  if (tt) {
    const newStatus = tt.commented ? 'disabled' : 'enabled';
    console.log(`[OK] Tooltype ${upperKey} is now ${newStatus}`);
  }
}

function restoreBackup(filePath: string, options: Options): void {
  const backupPath = filePath + '.backup';

  if (!fs.existsSync(backupPath)) {
    console.error(`[ERROR] Backup file not found: ${backupPath}`);
    process.exit(1);
  }

  fs.copyFileSync(backupPath, filePath);
  console.log(`[OK] Restored from backup: ${backupPath}`);
}

function main(): void {
  try {
    const { file, command, args, options } = parseArgs();

    // Validate file exists (except for restore command)
    if (command !== 'restore' && !fs.existsSync(file)) {
      console.error(`[ERROR] File not found: ${file}`);
      process.exit(1);
    }

    // Validate file extension
    if (!file.toLowerCase().endsWith('.info')) {
      console.error(`[ERROR] File must have .info extension: ${file}`);
      process.exit(1);
    }

    log(options, `Command: ${command}, File: ${file}`);

    switch (command.toLowerCase()) {
      case 'list':
        listTooltypes(file, options);
        break;

      case 'get':
        if (args.length < 1) {
          console.error('[ERROR] get command requires KEY argument');
          process.exit(1);
        }
        getTooltype(file, args[0], options);
        break;

      case 'set':
        if (args.length < 2) {
          console.error('[ERROR] set command requires KEY and VALUE arguments');
          process.exit(1);
        }
        setTooltype(file, args[0], args.slice(1).join(' '), options);
        break;

      case 'delete':
      case 'remove':
        if (args.length < 1) {
          console.error('[ERROR] delete command requires KEY argument');
          process.exit(1);
        }
        deleteTooltype(file, args[0], options);
        break;

      case 'enable':
        if (args.length < 1) {
          console.error('[ERROR] enable command requires KEY argument');
          process.exit(1);
        }
        enableTooltype(file, args[0], options);
        break;

      case 'disable':
        if (args.length < 1) {
          console.error('[ERROR] disable command requires KEY argument');
          process.exit(1);
        }
        disableTooltype(file, args[0], options);
        break;

      case 'toggle':
        if (args.length < 1) {
          console.error('[ERROR] toggle command requires KEY argument');
          process.exit(1);
        }
        toggleTooltype(file, args[0], options);
        break;

      case 'backup':
        createBackup(file, options);
        console.log(`[OK] Backup created: ${file}.backup`);
        break;

      case 'restore':
        restoreBackup(file, options);
        break;

      default:
        console.error(`[ERROR] Unknown command: ${command}`);
        showHelp();
        process.exit(1);
    }

  } catch (error) {
    console.error('\n[ERROR] Operation failed:', (error as Error).message);
    if (process.argv.includes('--verbose')) {
      console.error((error as Error).stack);
    }
    process.exit(1);
  }
}

main();

/**
 * ACS Access File Loader
 * 1:1 with express.e Access/ directory tooltype-based permission system
 *
 * Reads Access/ACS.*.info and Access/Default.info files to build
 * the permission map used by checkSecurity() for its final fallback.
 *
 * express.e references:
 *   - findAcsLevel() lines 3025-3035: scan down from secLevel/5*5
 *   - checkSecurity() line 8488: checkToolTypeExists(TOOLTYPE_DEFAULT_ACCESS, ...)
 *   - checkSecurity() line 8497: checkToolTypeExists(TOOLTYPE_ACCESS, acsLevel, ...)
 */

import * as fs from 'fs';
import * as path from 'path';
import { parseInfoFile } from './info-file.util';
import * as amigafs from './amigafs';

// Known name mismatches between ACS file tooltypes and ACS_PERMISSION_NAMES
const PERMISSION_ALIASES: Record<string, string> = {
  'ACS.ATTACH_FILE': 'ACS.ATTACH_FILES',
  'ACS.ATTACH_FILES': 'ACS.ATTACH_FILE',
};

interface AcsPermissionEntry {
  granted: boolean;  // true = allowed, false = explicitly denied
  value?: string;    // value part of KEY=VALUE if present
}

// Per-level permission maps: level -> (permName -> entry)
let acsLevelPermissions: Map<number, Map<string, AcsPermissionEntry>> = new Map();
// Default access permissions (from Access/Default.info)
let defaultAccessPermissions: Map<string, AcsPermissionEntry> = new Map();
// Sorted list of available ACS levels (descending for fast scan)
let availableAcsLevels: number[] = [];
// Whether the loader has been initialized
let loaded = false;

/**
 * Parse tooltypes from an .info file into a permission map.
 * Tooltype present + not commented + value !== 'NO' = granted
 * Tooltype commented or value === 'NO' = denied
 */
function parsePermissions(filePath: string): Map<string, AcsPermissionEntry> {
  const perms = new Map<string, AcsPermissionEntry>();

  try {
    const info = parseInfoFile(filePath);
    for (const tt of info.tooltypes) {
      // Only process ACS.* tooltypes
      if (!tt.key.startsWith('ACS.')) continue;

      const granted = !tt.commented && tt.value.toUpperCase() !== 'NO';
      perms.set(tt.key, { granted, value: tt.value || undefined });

      // Also register under alias if one exists
      const alias = PERMISSION_ALIASES[tt.key];
      if (alias && !perms.has(alias)) {
        perms.set(alias, { granted, value: tt.value || undefined });
      }
    }
  } catch (err) {
    console.error(`[ACS] Failed to parse ${filePath}:`, err);
  }

  return perms;
}

/**
 * Load all ACS access files from the Access/ directory.
 * Called once at startup. Fail-closed: if loading fails, no permissions are granted.
 *
 * @param bbsRoot - Root directory of the BBS (contains Access/ subdirectory)
 */
export function loadAcsAccessFiles(bbsRoot: string): void {
  const accessDir = path.join(bbsRoot, 'Access');

  acsLevelPermissions = new Map();
  defaultAccessPermissions = new Map();
  availableAcsLevels = [];

  if (!fs.existsSync(accessDir)) {
    console.warn('[ACS] Access/ directory not found -- all ACS file lookups will deny');
    loaded = true;
    return;
  }

  // Load Default.info if it exists
  const defaultPath = path.join(accessDir, 'Default.info');
  if (amigafs.existsSync(defaultPath)) {
    defaultAccessPermissions = parsePermissions(defaultPath);
    console.log(`[ACS] Loaded Default.info: ${defaultAccessPermissions.size} permissions`);
  }

  // Scan for ACS.*.info files
  const files = fs.readdirSync(accessDir);
  for (const file of files) {
    const match = file.match(/^ACS\.(\d+)\.info$/i);
    if (!match) continue;

    const level = parseInt(match[1], 10);
    if (isNaN(level) || level < 0 || level > 255) continue;

    const filePath = path.join(accessDir, file);
    const perms = parsePermissions(filePath);
    acsLevelPermissions.set(level, perms);

    console.log(`[ACS] Loaded ACS.${level}.info: ${perms.size} permissions`);
  }

  // Sort levels descending for fast downward scan in findAcsLevel
  availableAcsLevels = Array.from(acsLevelPermissions.keys()).sort((a, b) => b - a);

  console.log(`[ACS] Available ACS levels: ${availableAcsLevels.sort((a, b) => a - b).join(', ')}`);
  // Re-sort descending after logging
  availableAcsLevels.sort((a, b) => b - a);

  loaded = true;
}

/**
 * Check if ACS access files have been loaded.
 */
export function isAcsLoaded(): boolean {
  return loaded;
}

/**
 * Find the appropriate ACS level for a given security level.
 * 1:1 with express.e findAcsLevel() lines 3025-3035:
 *   level := secStatus/5*5
 *   REPEAT: try ACS.<level>.info, if not found and level>0 then level-=5
 *   UNTIL level<=0 OR found
 *
 * @param secLevel - User's security level (0-255)
 * @returns ACS level with a matching file, or -1 if none found
 */
export function findAcsLevel(secLevel: number): number {
  if (!loaded) return -1;

  // Start at secLevel rounded down to nearest 5 (express.e: secStatus/5*5)
  let level = Math.floor(secLevel / 5) * 5;

  while (level > 0) {
    if (acsLevelPermissions.has(level)) return level;
    level -= 5;
  }

  // Check level 0
  if (acsLevelPermissions.has(0)) return 0;

  return -1;
}

/**
 * Check if a permission is granted in the default access file (Access/Default.info).
 * express.e line 8488: checkToolTypeExists(TOOLTYPE_DEFAULT_ACCESS, 0, permName)
 *
 * @param permName - Full permission name (e.g., "ACS.DOWNLOAD")
 * @returns true if the permission is granted in Default.info
 */
export function checkDefaultAccess(permName: string): boolean {
  const entry = defaultAccessPermissions.get(permName);
  if (entry) return entry.granted;

  // Try alias
  const alias = PERMISSION_ALIASES[permName];
  if (alias) {
    const aliasEntry = defaultAccessPermissions.get(alias);
    if (aliasEntry) return aliasEntry.granted;
  }

  return false;
}

/**
 * Check if a permission is granted for a specific ACS level.
 * express.e line 8497: checkToolTypeExists(TOOLTYPE_ACCESS, acsLevel, permName)
 *
 * @param acsLevel - The ACS level to check (from findAcsLevel)
 * @param permName - Full permission name (e.g., "ACS.ACCOUNT_EDITING")
 * @returns true if the permission is granted at this ACS level
 */
export function checkAcsPermission(acsLevel: number, permName: string): boolean {
  if (acsLevel === -1) return false;

  const perms = acsLevelPermissions.get(acsLevel);
  if (!perms) return false;

  const entry = perms.get(permName);
  if (entry) return entry.granted;

  // Try alias
  const alias = PERMISSION_ALIASES[permName];
  if (alias) {
    const aliasEntry = perms.get(alias);
    if (aliasEntry) return aliasEntry.granted;
  }

  return false;
}

/**
 * Get all available ACS levels (sorted ascending).
 */
export function getAvailableAcsLevels(): number[] {
  return [...availableAcsLevels].sort((a, b) => a - b);
}

/**
 * Get all permissions for a specific ACS level (for debugging/admin UI).
 */
export function getAcsLevelPermissions(level: number): Map<string, AcsPermissionEntry> | undefined {
  return acsLevelPermissions.get(level);
}

/**
 * Reset loader state (for testing).
 */
export function resetAcsLoader(): void {
  acsLevelPermissions = new Map();
  defaultAccessPermissions = new Map();
  availableAcsLevels = [];
  loaded = false;
}

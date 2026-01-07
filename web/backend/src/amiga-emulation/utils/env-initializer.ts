/**
 * ENV File Initializer - Creates common AmigaOS environment files
 *
 * AmigaOS environment variables can be accessed two ways:
 * 1. In-memory (GetVar/SetVar) - handled by EnvironmentManager
 * 2. ENV: device files (Lock/Open/Read) - handled by this initializer
 *
 * Many doors expect certain ENV files to exist on disk (in RAM:ENV/).
 * This module ensures those files are created and populated.
 */

import * as fs from 'fs';
import * as path from 'path';

export interface ENVConfig {
  nodeId: number;
  totalNodes?: number;
  bbsName?: string;
  sysop?: string;
}

/**
 * Initialize ENV: device files for a BBS session
 * Creates common environment files that Amiga doors expect
 *
 * @param envPath Path to ENV directory (typically /tmp/ram/ENV)
 * @param config Configuration for ENV variables
 */
export function initializeENVFiles(envPath: string, config: ENVConfig): void {
  // Ensure ENV directory exists
  if (!fs.existsSync(envPath)) {
    fs.mkdirSync(envPath, { recursive: true });
  }

  const { nodeId, totalNodes = 8, bbsName = 'AmiExpress Web', sysop = 'Sysop' } = config;

  console.log(`[ENV Initializer] Creating ENV files for node ${nodeId}`);

  // Standard AmigaDOS environment files
  createENVFile(envPath, 'PATH', 'Work:,S:,C:,Doors:');
  createENVFile(envPath, 'PROMPT', '%N.%S>');
  createENVFile(envPath, 'RC', '0');
  createENVFile(envPath, 'Result2', '0');

  // Kickstart and Workbench versions (from real Amiga ENV)
  // These match Kickstart 3.1 (v39.106) and Workbench 3.1 (v39.29)
  createENVFile(envPath, 'Kickstart', '39.106');
  createENVFile(envPath, 'Workbench', '39.29');

  // BBS-specific environment files
  createENVFile(envPath, 'BBS_NAME', bbsName);
  createENVFile(envPath, 'SYSOP_NAME', sysop);
  createENVFile(envPath, 'NODE_NUMBER', String(nodeId));

  // JoinCnf password failure tracking files (one per node)
  // Doors like JoinCnf use these to track failed password attempts
  for (let i = 1; i <= totalNodes; i++) {
    createENVFile(envPath, `JC_PWFAIL.${i}`, '0');
  }

  // Node statistics files (used by doors like MultiTop, Bulls, etc.)
  // Format from real Amiga: "<username padded to 35 chars> -<status>"
  // Example logged in:  "sysopuser                          -0 "
  // Example logged out: "                                   -22"
  for (let i = 1; i <= totalNodes; i++) {
    // -22 appears to mean "not logged in" or "waiting for call"
    const emptyNode = ' '.repeat(35) + '-22';
    createENVFile(envPath, `STATS@${i}`, emptyNode);
  }

  // Door usage tracking (some doors create these)
  createENVFile(envPath, 'LAST_DOOR', '');
  createENVFile(envPath, 'DOOR_COUNT', '0');

  console.log(`[ENV Initializer] Created ENV files in ${envPath}`);
}

/**
 * Create or update an ENV file
 * @param envPath Path to ENV directory
 * @param name Variable name (becomes filename)
 * @param value Variable value (file contents)
 */
function createENVFile(envPath: string, name: string, value: string): void {
  const filePath = path.join(envPath, name);

  try {
    fs.writeFileSync(filePath, value, { encoding: 'utf-8' });
    console.log(`[ENV Initializer] Created ENV:${name} = "${value}"`);
  } catch (error) {
    console.error(`[ENV Initializer] Failed to create ENV:${name}:`, error);
  }
}

/**
 * Clean up ENV files (call when node session ends)
 * @param envPath Path to ENV directory
 */
export function cleanupENVFiles(envPath: string): void {
  if (!fs.existsSync(envPath)) {
    return;
  }

  try {
    const files = fs.readdirSync(envPath);
    for (const file of files) {
      // Only clean up files we created, not system-wide ENV files
      if (file.startsWith('JC_PWFAIL.') || file.startsWith('STATS@') ||
          ['LAST_DOOR', 'DOOR_COUNT', 'NODE_NUMBER'].includes(file)) {
        fs.unlinkSync(path.join(envPath, file));
      }
    }
    console.log(`[ENV Initializer] Cleaned up ENV files in ${envPath}`);
  } catch (error) {
    console.error(`[ENV Initializer] Failed to clean up ENV files:`, error);
  }
}

/**
 * Update node statistics file (called when node state changes)
 * Format matches real Amiga: "<username padded to 35 chars> -<status>"
 *
 * @param envPath Path to ENV directory
 * @param nodeId Node number (1-8)
 * @param username Username (empty string if not logged in)
 * @param statusCode Status code (-22 = waiting, -0 = active, etc.)
 */
export function updateNodeStats(
  envPath: string,
  nodeId: number,
  username: string = '',
  statusCode: number = -22
): void {
  const statsFile = `STATS@${nodeId}`;

  // Pad username to exactly 35 characters
  const paddedUsername = username.padEnd(35, ' ');

  // Format: "username (35 chars) -statusCode"
  const value = paddedUsername + statusCode.toString();

  createENVFile(envPath, statsFile, value);
}

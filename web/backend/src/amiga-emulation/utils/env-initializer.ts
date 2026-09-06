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
import * as amigafs from '../../utils/amigafs';
import {
  hostVars,
  AE_HOST_VAR,
  AE_HOST_VERSION_VAR,
  AE_CONNECTION_VAR,
  AE_CLIENT_VAR,
  AE_CAPS_VAR,
  type HostFacts,
} from './host-vars';

export interface ENVConfig {
  nodeId: number;
  /**
   * ENVARC: - the on-disk archive half of the environment
   * (`amigaEnvArchiveDir(bbsRoot)`). Its contents are copied into ENV: for
   * names ENV: does not already hold, the way the Startup-Sequence's
   * `Copy ENVARC: ENV: ALL` does at boot. Omit it and no seeding happens.
   */
  envArcPath?: string;
  totalNodes?: number;
  bbsName?: string;
  sysop?: string;
  /**
   * Where the door is running and what this caller reads (utils/host-vars.ts).
   * Omitted, no AE_* files are written - and a door that finds none is
   * looking at what classic AmiExpress looks like, which is the safe answer.
   */
  host?: HostFacts;
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

  // The boot step first: whatever the archive holds becomes visible in ENV:
  // before anything else writes there. Must run BEFORE the standard vars
  // below, which deliberately overwrite their own names every session.
  if (config.envArcPath) {
    seedEnvFromArchive(envPath, config.envArcPath);
  }

  const { nodeId, totalNodes = 8, bbsName = 'AmiExpress Web', sysop = 'Sysop' } = config;

  console.log(`[ENV Initializer] Creating ENV files for node ${nodeId}`);

  // Standard AmigaDOS environment files
  createENVFile(envPath, 'PATH', 'Work:,S:,C:,Doors:');
  createENVFile(envPath, 'PROMPT', '%N.%S>');
  createENVFile(envPath, 'RC', '0');
  createENVFile(envPath, 'Result2', '0');

  // Kickstart and Workbench versions (from real Amiga ENV)
  createENVFile(envPath, 'Kickstart', '39.106');
  createENVFile(envPath, 'Workbench', '39.29');

  // BBS name and sysop
  createENVFile(envPath, 'BBS_NAME', bbsName);
  createENVFile(envPath, 'BBSNAME', bbsName);
  createENVFile(envPath, 'SYSOP', sysop);
  createENVFile(envPath, 'SYSOP_NAME', sysop);

  // Node number (all common variable names used by various doors)
  createENVFile(envPath, 'NODE_NUMBER', String(nodeId));
  createENVFile(envPath, 'AXNODE', String(nodeId));
  createENVFile(envPath, 'AMX_NODE', String(nodeId));
  createENVFile(envPath, 'NODE', String(nodeId));
  createENVFile(envPath, 'AXNODENUM', String(nodeId));
  createENVFile(envPath, 'BBSNODE', String(nodeId));

  // Connection info
  createENVFile(envPath, 'BAUD', '115200');
  createENVFile(envPath, 'SERIALRATE', '115200');

  // Where the door is running. AE_HOST and its version are the same for
  // every caller; what a CALLER can be sent is not, and this directory is
  // shared by every node - so those carry the node number, the way
  // JC_PWFAIL.<node> below already does.
  if (config.host) {
    const vars = hostVars(config.host);
    createENVFile(envPath, AE_HOST_VAR, vars[AE_HOST_VAR]);
    createENVFile(envPath, AE_HOST_VERSION_VAR, vars[AE_HOST_VERSION_VAR]);
    for (const name of [AE_CONNECTION_VAR, AE_CLIENT_VAR, AE_CAPS_VAR]) {
      createENVFile(envPath, `${name}.${nodeId}`, vars[name]);
    }
  }

  // JoinCnf password failure tracking files (one per node)
  // Doors like JoinCnf use these to track failed password attempts
  for (let i = 1; i <= totalNodes; i++) {
    createENVFile(envPath, `JC_PWFAIL.${i}`, '0');
  }

  // Node statistics files (used by doors like MultiTop, Bulls, WarOLM, etc.)
  // Format: 35-char space-padded username + '-' + 2-digit status code (38 bytes)
  // Seed only when absent — setEnvStat (acs.util.ts) owns live updates after
  // login. Clobbering here on every DosLibrary init wiped logged-in users back
  // to status 22 (AWAITCONNECT), so WarOLM saw all nodes as "Awating Connect"
  // with '=====' placeholders instead of real handles/locations.
  for (let i = 1; i <= totalNodes; i++) {
    const statsPath = path.join(envPath, `STATS@${i}`);
    if (!fs.existsSync(statsPath)) {
      const emptyNode = ' '.repeat(35) + '-22';
      createENVFile(envPath, `STATS@${i}`, emptyNode);
    }
  }

  // Door usage tracking (some doors create these)
  createENVFile(envPath, 'LAST_DOOR', '');
  createENVFile(envPath, 'DOOR_COUNT', '0');

  console.log(`[ENV Initializer] Created ENV files in ${envPath}`);
}

/**
 * `Copy ENVARC: ENV: ALL` - the Startup-Sequence step that makes an archived
 * environment variable visible again after a reboot.
 *
 * A name already present in ENV: WINS: on a real Amiga the copy happens once,
 * at boot, before anything writes to ENV:, so nothing live is ever clobbered
 * by the archive. Our ENV: directory outlives a single door session, so
 * "already there" is the same guarantee - a door that wrote ENV: five minutes
 * ago keeps its value, and only a wiped /tmp (a container restart) falls back
 * to the archive.
 *
 * Directories are copied through, because ENVARC: is a tree on a real Amiga
 * (Sys/, Wanderer/, ...) and `ALL` recurses.
 *
 * The archive directory is CREATED when missing: a door's
 * `Open('ENVARC:x', MODE_NEWFILE)` fails outright if the parent is not there,
 * which is how the persistent half went missing in the first place.
 */
function seedEnvFromArchive(envPath: string, envArcPath: string): void {
  try {
    if (!amigafs.existsSync(envArcPath)) {
      amigafs.mkdirSync(envArcPath, { recursive: true });
      return; // nothing archived yet
    }
  } catch (error) {
    console.error(`[ENV Initializer] Failed to create ENVARC: at ${envArcPath}:`, error);
    return;
  }

  let copied = 0;
  const walk = (fromDir: string, toDir: string): void => {
    let entries: string[];
    try {
      entries = amigafs.readdirSync(fromDir);
    } catch {
      return;
    }
    for (const entry of entries) {
      const from = path.join(fromDir, entry);
      const to = path.join(toDir, entry);
      try {
        if (amigafs.statSync(from).isDirectory()) {
          if (!amigafs.existsSync(to)) {
            amigafs.mkdirSync(to, { recursive: true });
          }
          walk(from, to);
          continue;
        }
        // amigafs.existsSync is case-insensitive, matching AmigaOS: an
        // archived "GWall.cfg" must not overwrite a live "gwall.cfg".
        if (amigafs.existsSync(to)) continue;
        amigafs.copyFileSync(from, to);
        copied += 1;
      } catch (error) {
        console.error(`[ENV Initializer] Failed to copy ENVARC:${entry} into ENV::`, error);
      }
    }
  };
  walk(envArcPath, envPath);

  if (copied > 0) {
    console.log(`[ENV Initializer] Copied ${copied} archived variable(s) from ENVARC: (${envArcPath}) into ENV:`);
  }
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

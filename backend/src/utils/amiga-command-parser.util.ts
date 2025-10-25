/**
 * Amiga Command File Parser
 * Parses AmiExpress .info files (tooltypes) and .CMD files
 *
 * Maintains 100% Amiga compatibility for importing real BBS data
 * Based on express.e:4630-4820 command loading system
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// Door/Command types from axenums.e:15
export enum DoorType {
  XIM = 'XIM',   // eXpress Internal Module
  AIM = 'AIM',   // Amiga Internal Module
  SIM = 'SIM',   // Standard Internal Module (script)
  TIM = 'TIM',   // Text Internal Module
  IIM = 'IIM',   // Interactive Internal Module
  MCI = 'MCI',   // MCI command
  AEM = 'AEM',   // AmiExpress Module
  SUP = 'SUP'    // Support module
}

// Command types from axenums.e:11
export enum CommandType {
  BBSCMD = 'BBSCMD',
  SYSCMD = 'SYSCMD',
  CUSTOM = 'CUSTOM'
}

// Tooltype levels (express.e:4630-4670)
export enum ToolTypeLevel {
  CONFCMD = 'CONFCMD',       // Conference-specific command
  NODECMD = 'NODECMD',       // Node-specific command
  BBSCMD = 'BBSCMD',         // Global BBS command
  CONFSYSCMD = 'CONFSYSCMD', // Conference-specific sysop command
  NODESYSCMD = 'NODESYSCMD', // Node-specific sysop command
  SYSCMD = 'SYSCMD'          // Global sysop command
}

export interface CommandDefinition {
  name: string;
  type: DoorType;
  location: string;
  access?: number;          // Minimum security level (express.e:4693)
  password?: string;        // Command password (express.e:4697-4709)
  priority?: string;        // Task priority (express.e:4746-4751)
  stack?: number;           // Stack size (express.e:4753)
  resident?: boolean;       // Keep in memory (express.e:4755)
  expertMode?: boolean;     // Expert mode flag (express.e:4757)
  trapOn?: boolean;         // Trap mode (express.e:4759)
  silent?: boolean;         // Silent mode (express.e:4761)
  banner?: string;          // Banner screen (express.e:4763)
  mimicVer?: string;        // Mimic version (express.e:4765)
  logInputs?: boolean;      // Log inputs (express.e:4767)
  scriptCheck?: boolean;    // Check script flag (express.e:4772)
  multiNode?: boolean;      // Multi-node support
  quickMode?: boolean;      // Quick mode (express.e:4739)
  internal?: string;        // Internal command (express.e:4711)
  passParameters?: number;  // Pass parameters mode (express.e:4712)
}

/**
 * Parse Amiga .info file tooltypes
 *
 * Uses `strings` command to extract tooltypes from binary .info file
 * Format: KEY=VALUE pairs (one per line)
 */
export function parseInfoFile(filePath: string): Map<string, string> {
  const tooltypes = new Map<string, string>();

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      console.error(`[parseInfoFile] File does not exist: ${filePath}`);
      return tooltypes;
    }

    console.log(`[parseInfoFile] Parsing: ${filePath}`);

    // Use strings command to extract tooltypes from binary .info file
    // This maintains Amiga compatibility
    try {
      const output = execSync(`strings "${filePath}"`, { encoding: 'utf8' });
      const lines = output.split('\n');
      console.log(`[parseInfoFile] Found ${lines.length} lines from strings command`);

      for (const line of lines) {
        const trimmed = line.trim();

        // Skip empty lines and non-tooltype lines
        if (!trimmed || !trimmed.includes('=')) {
          continue;
        }

        // Parse KEY=VALUE format
        // Remove leading '+' if present (express.e uses +LOCATION format)
        const cleanLine = trimmed.startsWith('+') ? trimmed.substring(1) : trimmed;
        const [key, ...valueParts] = cleanLine.split('=');
        const value = valueParts.join('=').trim(); // Handle values with '=' in them

        if (key && value) {
          console.log(`[parseInfoFile]   Tooltype: ${key.toUpperCase()}=${value}`);
          tooltypes.set(key.toUpperCase(), value);
        }
      }

      console.log(`[parseInfoFile] Extracted ${tooltypes.size} tooltypes`);
    } catch (cmdError) {
      console.error(`[parseInfoFile] strings command failed:`, cmdError);
      throw cmdError;
    }
  } catch (error) {
    console.error(`[parseInfoFile] Error parsing .info file ${filePath}:`, error);
  }

  return tooltypes;
}

/**
 * Parse Amiga .CMD file
 *
 * Format: *COMMAND_NAME TYPE LOCATION
 * Example: *WEEK XM050Doors:WeekConfTop/WeekConfTop.XIM
 */
export function parseCmdFile(filePath: string): CommandDefinition | null {
  try {
    if (!fs.existsSync(filePath)) {
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || !trimmed.startsWith('*')) {
        continue;
      }

      // Parse: *COMMAND_NAME TYPE+ACCESS LOCATION
      // Example: *WEEK     XM050Doors:WeekConfTop/WeekConfTop.XIM
      const parts = trimmed.substring(1).split(/\s+/).filter(p => p.length > 0);

      if (parts.length >= 2) {
        const name = parts[0];
        const typeAndAccess = parts[1];
        // Location might be part of the same token (e.g., "XM050Doors:...")
        let location = parts.slice(2).join(' ');

        // Check if location is embedded in typeAndAccess
        const locationMatch = typeAndAccess.match(/^([A-Z]{2,3})(\d*)(.+)$/);
        if (locationMatch && locationMatch[3]) {
          location = locationMatch[3];
        }

        // Parse type (first 2-3 chars) and access level (remaining digits)
        let type = DoorType.XIM;
        let access = 0;

        if (typeAndAccess.length >= 2) {
          // Match type and access: e.g., "XM050" or "XIM050"
          const parseMatch = typeAndAccess.match(/^([A-Z]{2,3})(\d+)/i);
          if (parseMatch) {
            const typeStr = parseMatch[1].toUpperCase();
            if (typeStr === 'XM' || typeStr === 'XI' || typeStr === 'XIM') {
              type = DoorType.XIM;
            } else if (typeStr === 'AM' || typeStr === 'AI' || typeStr === 'AIM') {
              type = DoorType.AIM;
            } else if (typeStr === 'SM' || typeStr === 'SI' || typeStr === 'SIM') {
              type = DoorType.SIM;
            } else if (typeStr === 'TM' || typeStr === 'TI' || typeStr === 'TIM') {
              type = DoorType.TIM;
            } else if (typeStr === 'IM' || typeStr === 'II' || typeStr === 'IIM') {
              type = DoorType.IIM;
            } else if (typeStr === 'MC' || typeStr === 'MCI') {
              type = DoorType.MCI;
            }

            // Extract access level
            if (parseMatch[2]) {
              access = parseInt(parseMatch[2], 10);
            }
          }
        }

        // Convert Amiga paths to Unix paths
        location = location.replace(/^DOORS:/i, 'doors/').replace(/:/g, '/');

        return {
          name,
          type,
          location,
          access
        };
      }
    }
  } catch (error) {
    console.error(`Error parsing .CMD file ${filePath}:`, error);
  }

  return null;
}

/**
 * Load command definition from .info file
 * Implements express.e:4630-4820 command loading logic
 */
export function loadCommandFromInfo(filePath: string): CommandDefinition | null {
  const tooltypes = parseInfoFile(filePath);

  if (tooltypes.size === 0) {
    return null;
  }

  // Extract command name from filename (remove .info extension)
  const name = path.basename(filePath, '.info').toUpperCase();

  // Required field: LOCATION
  const location = tooltypes.get('LOCATION');
  if (!location) {
    return null;
  }

  // Get TYPE (default to SIM if not specified - express.e:4676)
  let type = DoorType.SIM;
  const typeStr = tooltypes.get('TYPE');
  if (typeStr) {
    type = (DoorType[typeStr.toUpperCase() as keyof typeof DoorType]) || DoorType.SIM;
  }

  // Build command definition
  const cmd: CommandDefinition = {
    name,
    type,
    location: location.replace('DOORS:', 'doors/').replace(':', '/'), // Convert Amiga paths to Unix
  };

  // Optional fields (express.e:4693-4767)
  const access = tooltypes.get('ACCESS');
  if (access) {
    cmd.access = parseInt(access, 10);
  }

  const password = tooltypes.get('PASSWORD');
  if (password) {
    cmd.password = password;
  }

  const priority = tooltypes.get('PRIORITY');
  if (priority) {
    cmd.priority = priority;
  }

  const stack = tooltypes.get('STACK');
  if (stack) {
    cmd.stack = parseInt(stack, 10);
  }

  cmd.resident = tooltypes.get('RESIDENT') === 'YES';
  cmd.expertMode = tooltypes.get('EXPERT_MODE') === 'YES';
  cmd.trapOn = tooltypes.get('TRAPON') === 'YES';
  cmd.silent = tooltypes.get('SILENT') === 'YES';
  cmd.multiNode = tooltypes.get('MULTINODE') === 'YES';
  cmd.quickMode = tooltypes.get('QUICKMODE') === 'YES';
  cmd.scriptCheck = tooltypes.get('SCRIPTCHECK') === 'YES';
  cmd.logInputs = tooltypes.get('LOG_INPUTS') === 'YES';

  const banner = tooltypes.get('BANNER');
  if (banner) {
    cmd.banner = banner;
  }

  const mimicVer = tooltypes.get('MIMICVER');
  if (mimicVer) {
    cmd.mimicVer = mimicVer;
  }

  const internal = tooltypes.get('INTERNAL');
  if (internal) {
    cmd.internal = internal;

    const passParams = tooltypes.get('PASS_PARAMETERS');
    if (passParams) {
      cmd.passParameters = parseInt(passParams, 10);
    }
  }

  return cmd;
}

/**
 * Scan command directory for available commands
 * Implements express.e:4630-4670 command lookup hierarchy
 *
 * Priority order (highest to lowest):
 * 1. Conference-specific commands (CONFCMD)
 * 2. Node-specific commands (NODECMD)
 * 3. Global BBS commands (BBSCMD)
 */
export function scanCommandDirectory(
  baseDir: string,
  commandType: CommandType,
  conferenceId?: number,
  nodeId?: number
): Map<string, CommandDefinition> {
  const commands = new Map<string, CommandDefinition>();

  // Build search paths in priority order
  const searchPaths: string[] = [];

  if (commandType === CommandType.BBSCMD) {
    if (conferenceId) {
      searchPaths.push(path.join(baseDir, `Conf${String(conferenceId).padStart(2, '0')}`, 'Commands', 'BBSCmd'));
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'BBSCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'BBSCmd'));
  } else if (commandType === CommandType.SYSCMD) {
    if (conferenceId) {
      searchPaths.push(path.join(baseDir, `Conf${String(conferenceId).padStart(2, '0')}`, 'Commands', 'SysCmd'));
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'SysCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'SysCmd'));
  }

  // Scan each directory for .info files
  for (const dirPath of searchPaths) {
    console.log(`  Scanning ${commandType} directory: ${dirPath}`);
    if (!fs.existsSync(dirPath)) {
      console.log(`    Directory does not exist, skipping`);
      continue;
    }

    const files = fs.readdirSync(dirPath);
    console.log(`    Found ${files.length} file(s): ${files.join(', ')}`);
    for (const file of files) {
      if (file.endsWith('.info') || file.endsWith('.Info')) {
        const fullPath = path.join(dirPath, file);
        console.log(`    Parsing .info file: ${fullPath}`);
        const cmd = loadCommandFromInfo(fullPath);

        if (cmd) {
          console.log(`      Loaded command: ${cmd.name} → ${cmd.location}`);
          // Only add if not already found (maintains priority order)
          if (!commands.has(cmd.name)) {
            commands.set(cmd.name, cmd);
          } else {
            console.log(`      Command ${cmd.name} already loaded (skipping due to priority)`);
          }
        } else {
          console.log(`      Failed to parse .info file`);
        }
      }
    }
  }

  return commands;
}

/**
 * Find command definition by name
 * Implements the command lookup logic from express.e:4630-4670
 */
export function findCommand(
  baseDir: string,
  commandName: string,
  commandType: CommandType,
  conferenceId?: number,
  nodeId?: number
): CommandDefinition | null {
  const commands = scanCommandDirectory(baseDir, commandType, conferenceId, nodeId);
  return commands.get(commandName.toUpperCase()) || null;
}

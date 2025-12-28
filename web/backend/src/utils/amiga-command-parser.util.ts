/**
 * Amiga Command File Parser
 * Parses AmiExpress .info files (tooltypes) and .CMD files
 *
 * Maintains 100% Amiga compatibility for importing real BBS data
 * Based on express.e:4630-4820 command loading system
 */

import * as fs from 'fs';
import * as amigafs from './amigafs';
import * as path from 'path';
import { existsSync } from 'fs';
import { execSync } from 'child_process';
import { SysopDebugUtil, DebugSeverity } from './sysop-debug.util';

// Door/Command types from axenums.e:15
export enum DoorType {
  XIM = 'XIM',       // eXpress Internal Module
  AIM = 'AIM',       // Amiga Internal Module
  SIM = 'SIM',       // Standard Internal Module (script)
  TIM = 'TIM',       // Text Internal Module
  IIM = 'IIM',       // Interactive Internal Module
  MCI = 'MCI',       // MCI command
  AEM = 'AEM',       // AmiExpress Module
  SUP = 'SUP',       // Support module
  TS = 'TS',         // TypeScript door (AmiExpress-Web extension)
  PYTHON = 'PYTHON', // Python door (AmiExpress-Web extension)
  PY = 'PY',         // Python door shorthand (AmiExpress-Web extension)
  AREXX = 'AREXX',   // ARexx door (AmiExpress-Web extension)
  REXX = 'REXX'      // REXX door shorthand (AmiExpress-Web extension)
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
  mciText?: string;         // MCI text for MCI type doors (express.e:4295)
  args?: string;            // Command-line arguments to pass to door (ARGS tooltype)
  toolTypes?: Record<string, string>; // All parsed tooltypes (uppercased keys)
  overclockFactor?: number; // CPU overclocking multiplier (OVERCLOCK tooltype: 0=auto, 1-50=specific, -1=disable)
  pagination?: number; // Pagination override (PAGINATION tooltype: 0=door handles, >0=auto-pause at N lines, -1=use user setting)
}

/**
 * Parse Amiga .info file tooltypes
 *
 * Uses `strings` command to extract tooltypes from binary .info file
 * Format: KEY=VALUE pairs (one per line)
 *
 * @param session - Optional BBS session for sysop debug messages
 * @param socket - Optional socket for sysop debug messages
 */
export function parseInfoFile(filePath: string, session?: any, socket?: any): Map<string, string> {
  const tooltypes = new Map<string, string>();

  try {
    // Check if file exists
    if (!amigafs.existsSync(filePath)) {
      SysopDebugUtil.debugFileError(socket, session, 'read', filePath, new Error('File does not exist'), DebugSeverity.WARNING);
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

        // Commented-out tooltypes are wrapped in parentheses; skip them
        if (trimmed.startsWith('(') && trimmed.endsWith(')')) {
          continue;
        }

        // Parse KEY=VALUE format
        // Remove leading '+', '#', '%', or '\'' if present (express.e uses +LOCATION, Amiga .info files use #LOCATION, %LOCATION, or 'LOCATION)
        let cleanLine = trimmed;
        if (cleanLine.startsWith('+') || cleanLine.startsWith('#') || cleanLine.startsWith('%') || cleanLine.startsWith("'")) {
          cleanLine = cleanLine.substring(1);
        }

        const [key, ...valueParts] = cleanLine.split('=');
        const value = valueParts.join('=').trim(); // Handle values with '=' in them

        if (key && value) {
          const cleanKey = key.toUpperCase().trim();
          console.log(`[parseInfoFile]   Tooltype: ${cleanKey}=${value}`);
          tooltypes.set(cleanKey, value);
        }
      }

      console.log(`[parseInfoFile] Extracted ${tooltypes.size} tooltypes`);
    } catch (cmdError) {
      SysopDebugUtil.debug(socket, session, 'Command Parser', `strings command failed for ${filePath}`, { error: (cmdError as Error).message }, DebugSeverity.CRITICAL);
      console.error(`[parseInfoFile] strings command failed:`, cmdError);
      throw cmdError;
    }
  } catch (error) {
    SysopDebugUtil.debugFileError(socket, session, 'parse', filePath, error as Error, DebugSeverity.CRITICAL);
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
export function parseCmdFile(filePath: string, session?: any, socket?: any): CommandDefinition | null {
  try {
    if (!amigafs.existsSync(filePath)) {
      return null;
    }

    const content = amigafs.readFileSync(filePath, 'utf8').toString();
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();

      // Skip empty lines and comments
      if (!trimmed || !trimmed.startsWith('*')) {
        continue;
      }

      // Parse: *COMMAND_NAME TYPE+ACCESS LOCATION
      // Example: *WEEK     XM050Doors:WeekConfTop/WeekConfTop.XIM
      const parts = trimmed.substring(1).split(/\s+/).filter((p: string) => p.length > 0);

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
    SysopDebugUtil.debugFileError(socket, session, 'parse', filePath, error as Error, DebugSeverity.CRITICAL);
    console.error(`Error parsing .CMD file ${filePath}:`, error);
  }

  return null;
}

function getConferenceDirNames(confNumber: number): string[] {
  const names = [`Conf${confNumber}`];
  const padded = `Conf${String(confNumber).padStart(2, '0')}`;
  if (!names.includes(padded)) {
    names.push(padded);
  }
  return names;
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

  // Preserve all tooltypes for downstream consumers (uppercased keys)
  const toolTypeObject = Object.fromEntries(tooltypes.entries());

  // Required field: LOCATION
  const locationKey = tooltypes.get('LOCATION') || tooltypes.get('PATH');
  if (!locationKey) {
    return null;
  }

  // Get TYPE (default to SIM if not specified - express.e:4676)
  let type = DoorType.SIM;
  const typeStr = tooltypes.get('TYPE');
  if (typeStr) {
    type = (DoorType[typeStr.toUpperCase() as keyof typeof DoorType]) || DoorType.SIM;
  }

  // Build command definition
  const normalizedLocation = locationKey
    .replace('DOORS:', 'doors/')
    .replace('Doors:', 'doors/')
    .replace(':', '/');

  const cmd: CommandDefinition = {
    name,
    type,
    location: normalizedLocation, // Convert Amiga paths to Unix
    toolTypes: toolTypeObject,
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

  // Parse OVERCLOCK tooltype (CPU overclocking factor)
  // 0 = auto (10x for batch, 0x for interactive)
  // 1-50 = specific multiplier
  // -1 = force disable (even for batch doors)
  const overclock = tooltypes.get('OVERCLOCK');
  if (overclock) {
    const factor = parseInt(overclock, 10);
    if (!isNaN(factor)) {
      cmd.overclockFactor = factor;
      console.log(`[loadCommandFromInfo] OVERCLOCK=${factor} for ${cmd.name || cmd.location}`);
    }
  }

  // Parse PAGINATION tooltype (pagination behavior)
  // 0 or not set = door handles its own pagination (default)
  // >0 = auto-pause after N lines
  // -1 = use user's screen height setting
  const pagination = tooltypes.get('PAGINATION');
  if (pagination) {
    const lines = parseInt(pagination, 10);
    if (!isNaN(lines)) {
      cmd.pagination = lines;
      console.log(`[loadCommandFromInfo] PAGINATION=${lines} for ${cmd.name || cmd.location}`);
    }
  }

  cmd.resident = tooltypes.get('RESIDENT') === 'YES';
  // EXPRESS.E treats EXPERT_MODE as a flag; presence triggers doorExpertMode
  cmd.expertMode = tooltypes.has('EXPERT_MODE');
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

  // MCI_TEXT for MCI type doors (express.e:4295)
  const mciText = tooltypes.get('MCI_TEXT');
  if (mciText && type === DoorType.MCI) {
    cmd.mciText = mciText;
  }

  // ARGS for command-line arguments to pass to door
  const args = tooltypes.get('ARGS');
  if (args) {
    cmd.args = args;
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
      for (const confName of getConferenceDirNames(conferenceId)) {
        const legacyPath = path.join(baseDir, 'BBS', confName, 'Commands', 'BBSCmd');
        const rootPath = path.join(baseDir, confName, 'Commands', 'BBSCmd');
        searchPaths.push(rootPath);
        if (amigafs.existsSync(legacyPath)) {
          searchPaths.push(legacyPath);
        }
      }
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'BBSCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'BBSCmd'));
  } else if (commandType === CommandType.SYSCMD) {
    if (conferenceId) {
      for (const confName of getConferenceDirNames(conferenceId)) {
        const legacyPath = path.join(baseDir, 'BBS', confName, 'Commands', 'SysCmd');
        const rootPath = path.join(baseDir, confName, 'Commands', 'SysCmd');
        searchPaths.push(rootPath);
        if (amigafs.existsSync(legacyPath)) {
          searchPaths.push(legacyPath);
        }
      }
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'SysCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'SysCmd'));
  }

  // Scan each directory for .info files
  for (const dirPath of searchPaths) {
    console.log(`  Scanning ${commandType} directory: ${dirPath}`);
    if (!amigafs.existsSync(dirPath)) {
      console.log(`    Directory does not exist, skipping`);
      continue;
    }

    const files = amigafs.readdirSync(dirPath);
    console.log(`    Found ${files.length} file(s): ${files.join(', ')}`);
    for (const file of files) {
      if (file.endsWith('.info') || file.endsWith('.Info')) {
        const fullPath = path.join(dirPath, file);
        console.log(`    Parsing .info file: ${fullPath}`);
        const cmd = loadCommandFromInfo(fullPath);

        if (cmd) {
          console.log(`      Loaded command: ${cmd.name} → ${cmd.location}`);

          const existing = commands.get(cmd.name);

          if (!existing) {
            commands.set(cmd.name, cmd);
          } else if (existing.type !== DoorType.TS && cmd.type === DoorType.TS) {
            console.log(`      Replacing ${cmd.name} with TypeScript door version`);
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

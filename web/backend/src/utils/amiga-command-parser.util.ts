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
 * Native binary parser - no longer relies on external 'strings' command.
 * Scans for the tooltypes section in the binary .info file and extracts strings.
 *
 * @param session - Optional BBS session for sysop debug messages
 * @param socket - Optional socket for sysop debug messages
 */
export function parseInfoFile(filePath: string, session?: any, socket?: any): Map<string, string> {
  const tooltypes = new Map<string, string>();

  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      return tooltypes;
    }

    const buffer = fs.readFileSync(filePath);
    if (buffer.length < 40) return tooltypes; // Too small to be a valid .info file

    // Amiga .info files are binary. The tooltypes section starts after the 
    // DiskObject structure. We look for printable strings that look like KEY=VALUE
    // but a more robust way is to just extract all printable ASCII sequences.
    const extractedStrings: string[] = [];
    let currentString = '';

    for (let i = 0; i < buffer.length; i++) {
      const charCode = buffer[i];
      // Printable ASCII range (including space)
      if (charCode >= 32 && charCode <= 126) {
        currentString += String.fromCharCode(charCode);
      } else {
        if (currentString.length >= 2) {
          extractedStrings.push(currentString);
        }
        currentString = '';
      }
    }
    if (currentString.length >= 2) extractedStrings.push(currentString);

    for (const line of extractedStrings) {
      const trimmed = line.trim();

      // Commented-out tooltypes
      if ((trimmed.startsWith('(') && trimmed.endsWith(')')) || trimmed.startsWith('!')) {
        continue;
      }

      // Remove leading junk commonly found in binary buffers before strings
      let cleanLine = trimmed.replace(/^[^a-zA-Z0-9+(%#']+/g, '');
      if (cleanLine.startsWith('+') || cleanLine.startsWith('#') || cleanLine.startsWith('%') || cleanLine.startsWith("'")) {
        cleanLine = cleanLine.substring(1);
      }

      const eqIdx = cleanLine.indexOf('=');
      if (eqIdx !== -1) {
        const key = cleanLine.substring(0, eqIdx).toUpperCase().trim();
        const value = cleanLine.substring(eqIdx + 1).trim();
        // Validation: Amiga tooltype keys are usually alphanumeric + underscore, 2-32 chars
        if (key && /^[A-Z0-9_]{2,32}$/.test(key)) {
          tooltypes.set(key, value);
        }
      } else {
        // Flag mode: just the key
        const key = cleanLine.toUpperCase().trim();
        if (key && /^[A-Z0-9_]{2,32}$/.test(key)) {
          tooltypes.set(key, 'YES');
        }
      }
    }
  } catch (error) {
    SysopDebugUtil.debugFileError(socket, session, 'parse', filePath, error as Error, DebugSeverity.WARNING);
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
  // reference-board data uses unpadded ConfX; avoid padded variants to prevent Conf01 creation
  return [`Conf${confNumber}`];
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

  // Extract command name from BBSCMD or SYSCMD tooltype, or fall back to filename.
  // Many .info files don't have explicit BBSCMD/SYSCMD - the filename IS the command.
  // e.g., AEDOOR.info -> AEDOOR, WHO.info -> WHO
  const commandNameFromTooltype = tooltypes.get('BBSCMD') || tooltypes.get('SYSCMD');
  const baseName = path.basename(filePath);
  const nameFromFile = baseName.replace(/\.info$/i, '').toUpperCase();
  const name = commandNameFromTooltype ? commandNameFromTooltype.toUpperCase() : nameFromFile;

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

  // Build command definition - use case-insensitive replacement for DOORS: prefix
  const normalizedLocation = locationKey
    .replace(/^doors:/i, 'doors/')
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
        searchPaths.push(path.join(baseDir, confName, 'Commands', 'BBSCmd'));
      }
    }
    if (nodeId) {
      searchPaths.push(path.join(baseDir, `Node${nodeId}`, 'Commands', 'BBSCmd'));
    }
    searchPaths.push(path.join(baseDir, 'Commands', 'BBSCmd'));
  } else if (commandType === CommandType.SYSCMD) {
    if (conferenceId) {
      for (const confName of getConferenceDirNames(conferenceId)) {
        searchPaths.push(path.join(baseDir, confName, 'Commands', 'SysCmd'));
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
    for (const file of files) {
      if (file.endsWith('.info') || file.endsWith('.Info')) {
        const fullPath = path.join(dirPath, file);
        const cmd = loadCommandFromInfo(fullPath);

        if (cmd) {
          const existing = commands.get(cmd.name);

          if (!existing || cmd.type) {
            commands.set(cmd.name, cmd);
          }
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

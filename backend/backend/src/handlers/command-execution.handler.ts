/**
 * Command Execution Handler
 * Handles SYSCMD and BBSCMD command lookup and execution
 *
 * 1:1 port from express.e:4614-4807 runCommand(), runSysCommand(), runBbsCommand()
 */

import * as path from 'path';
import {
  scanCommandDirectory,
  findCommand,
  CommandDefinition,
  CommandType,
  DoorType
} from '../utils/amiga-command-parser.util';
import { checkSecurity } from '../utils/acs.util';
import { ACSPermission } from '../constants/acs-permissions';
import { AnsiUtil } from '../utils/ansi.util';
import { ErrorHandler } from '../utils/error-handling.util';
import { LoggedOnSubState } from '../constants/bbs-states';

// Result codes from express.e
const RESULT_SUCCESS = 0;
const RESULT_FAILURE = -1;
const RESULT_NOT_ALLOWED = -2;

// Dependencies injected from index.ts
let _executeDoor: any = null;
let _processInternalCommand: any = null;

export function setCommandExecutionDependencies(
  executeDoor: any,
  processInternalCommand: any
) {
  _executeDoor = executeDoor;
  _processInternalCommand = processInternalCommand;
}

// Command cache - loaded once at startup
const commandCache: {
  syscmd: Map<string, CommandDefinition>;
  bbscmd: Map<string, CommandDefinition>;
} = {
  syscmd: new Map(),
  bbscmd: new Map()
};

/**
 * Load all command definitions from disk
 * Called once at startup
 *
 * @param baseDir - BBS base directory
 * @param conferenceId - Current conference ID (optional)
 * @param nodeId - Node ID
 */
export function loadCommands(
  baseDir: string,
  conferenceId?: number,
  nodeId: number = 0
): void {
  console.log('Loading command definitions...');

  // express.e:4630-4650 - Load BBSCMD (priority: CONFCMD > NODECMD > BBSCMD)
  const bbsCommands = scanCommandDirectory(baseDir, CommandType.BBSCMD, conferenceId, nodeId);
  console.log(`  Loaded ${bbsCommands.size} BBS commands`);
  for (const [name, cmd] of bbsCommands) {
    commandCache.bbscmd.set(name.toUpperCase(), cmd);
  }

  // express.e:4652-4670 - Load SYSCMD (priority: CONFSYSCMD > NODESYSCMD > SYSCMD)
  const sysCommands = scanCommandDirectory(baseDir, CommandType.SYSCMD, conferenceId, nodeId);
  console.log(`  Loaded ${sysCommands.size} system commands`);
  for (const [name, cmd] of sysCommands) {
    commandCache.syscmd.set(name.toUpperCase(), cmd);
  }

  console.log(`Total commands loaded: ${commandCache.bbscmd.size + commandCache.syscmd.size}`);
}

/**
 * Run a system command (SYSCMD)
 * 1:1 port from express.e:4813-4817 runSysCommand()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param cmd - Command name
 * @param params - Command parameters
 * @returns Result code
 */
export async function runSysCommand(
  socket: any,
  session: any,
  cmd: string,
  params: string = ''
): Promise<number> {
  console.log(`[SYSCMD] Executing: ${cmd} ${params}`);

  // express.e:4814-4815 - Debug logging
  // debugLog(LOG_DEBUG, "execute syscmd: ${cmd} ${params}")

  // express.e:4817 - Call runCommand with CMDTYPE_SYSCMD
  return runCommand(socket, session, CommandType.SYSCMD, cmd, params);
}

/**
 * Run a BBS command (BBSCMD)
 * 1:1 port from express.e:4807-4811 runBbsCommand()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param cmd - Command name
 * @param params - Command parameters
 * @returns Result code
 */
export async function runBbsCommand(
  socket: any,
  session: any,
  cmd: string,
  params: string = ''
): Promise<number> {
  console.log(`[BBSCMD] Executing: ${cmd} ${params}`);

  // express.e:4808-4809 - Debug logging
  // debugLog(LOG_DEBUG, "execute bbscmd: ${cmd} ${params}")

  // express.e:4811 - Call runCommand with CMDTYPE_BBSCMD
  return runCommand(socket, session, CommandType.BBSCMD, cmd, params);
}

/**
 * Run a command (main command execution logic)
 * 1:1 port from express.e:4614-4807 runCommand()
 *
 * @param socket - Socket.io socket
 * @param session - BBS session
 * @param cmdType - Command type (SYSCMD or BBSCMD)
 * @param cmd - Command name
 * @param params - Command parameters
 * @returns Result code
 */
async function runCommand(
  socket: any,
  session: any,
  cmdType: CommandType,
  cmd: string,
  params: string
): Promise<number> {
  const cmdUpper = cmd.toUpperCase();

  // express.e:4630-4670 - Find command in cache
  let commandDef: CommandDefinition | null = null;

  if (cmdType === CommandType.SYSCMD) {
    commandDef = commandCache.syscmd.get(cmdUpper) || null;
  } else if (cmdType === CommandType.BBSCMD) {
    commandDef = commandCache.bbscmd.get(cmdUpper) || null;
  }

  // express.e:4647, 4669 - Command not found
  if (!commandDef) {
    console.log(`  Command not found: ${cmd}`);
    return RESULT_FAILURE;
  }

  console.log(`  Found command: ${commandDef.name} (${commandDef.type})`);

  // express.e:4700-4708 - Check access level
  const userSecLevel = session.user?.secLevel || 0;
  const requiredAccess = commandDef.access || 0;

  if (requiredAccess === 0) {
    // express.e:4703 - Access 0 means available to all
    console.log(`  Access: 0 (public)`);
  } else if (userSecLevel < requiredAccess) {
    // express.e:4705-4707 - User doesn't have sufficient access
    console.log(`  Access denied: user level ${userSecLevel} < required ${requiredAccess}`);
    socket.emit('ansi-output', AnsiUtil.errorLine('You do not have access to that command.'));
    return RESULT_NOT_ALLOWED;
  } else {
    console.log(`  Access granted: user level ${userSecLevel} >= required ${requiredAccess}`);
  }

  // express.e:4710-4731 - Check password if required
  if (commandDef.password) {
    console.log(`  Command requires password`);
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Enter Password >: ');

    // For now, we'll skip password checking and just return failure
    // In a full implementation, we would wait for password input
    console.log(`  Password checking not yet implemented - denying access`);
    socket.emit('ansi-output', AnsiUtil.errorLine('Invalid password!'));
    return RESULT_NOT_ALLOWED;
  }

  // express.e:4733-4748 - Check for INTERNAL command (recursive processing)
  // INTERNAL commands redirect to other internal commands
  // For now, we'll skip this and proceed to door execution

  // express.e:4750-4807 - Execute the door/command
  console.log(`  Executing ${commandDef.type} door: ${commandDef.location}`);

  // Set environment status (express.e:4710)
  // setEnvStat(ENV_DOORS)

  // Execute the door using the door handler
  if (_executeDoor) {
    // Convert Amiga paths to Unix paths if needed
    let location = commandDef.location;
    if (location.includes(':')) {
      location = location.replace(/:/g, '/');
    }

    const doorConfig = {
      name: commandDef.name,
      type: commandDef.type,
      location: location,
      access: commandDef.access || 0,
      parameters: params,
      // express.e:4758-4770 - Additional door options
      priority: commandDef.priority || 'SAME',
      stack: commandDef.stack || 20000,
      resident: commandDef.resident || false,
      expertMode: commandDef.expertMode || false
    };

    try {
      await _executeDoor(socket, session, doorConfig);
      return RESULT_SUCCESS;
    } catch (error) {
      console.error(`  Error executing door:`, error);
      socket.emit('ansi-output', AnsiUtil.errorLine('Error executing command.'));
      return RESULT_FAILURE;
    }
  } else {
    console.warn(`  executeDoor not available - command execution skipped`);
    socket.emit('ansi-output', AnsiUtil.errorLine('Command execution not available.'));
    return RESULT_FAILURE;
  }
}

/**
 * Get command cache for debugging
 */
export function getCommandCache() {
  return {
    syscmd: Array.from(commandCache.syscmd.entries()),
    bbscmd: Array.from(commandCache.bbscmd.entries())
  };
}

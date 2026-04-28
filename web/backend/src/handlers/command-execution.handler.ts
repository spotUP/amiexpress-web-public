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
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { BBSSession } from '../index';

// Result codes from express.e
const RESULT_SUCCESS = 0;
const RESULT_FAILURE = -1;
const RESULT_NOT_ALLOWED = -2;

/**
 * Debug log helper - logs to console AND sysop terminal/session log
 * When a sysop is logged in, debug messages appear in both backend.log and session log
 */
function debugLog(socket: any, session: any, message: string, category: string = "CMD") {
  // Always log to console (backend.log)
console.log(message);

  // If sysop logged in, also send to terminal and session log
  if (socket && session?.user?.secLevel && session.user.secLevel >= 200) {
    SysopDebugUtil.debug(socket, session, category, message.replace(/^\[.*?\]\s*/, ''));
  }
}

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
export const commandCache: {
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
  // express.e:4630-4650 - Load BBSCMD (priority: CONFCMD > NODECMD > BBSCMD)
  const bbsCommands = scanCommandDirectory(baseDir, CommandType.BBSCMD, conferenceId, nodeId);
  for (const [name, cmd] of bbsCommands) {
    commandCache.bbscmd.set(name.toUpperCase(), cmd);
  }

  // express.e:4652-4670 - Load SYSCMD (priority: CONFSYSCMD > NODESYSCMD > SYSCMD)
  const sysCommands = scanCommandDirectory(baseDir, CommandType.SYSCMD, conferenceId, nodeId);
  for (const [name, cmd] of sysCommands) {
    commandCache.syscmd.set(name.toUpperCase(), cmd);
  }

  process.stdout.write(`[loadCommands] ${commandCache.bbscmd.size + commandCache.syscmd.size} commands loaded\n`);
}

/**
 * Hot-reload all door commands without restarting the server
 * Clears command cache and re-scans all .info files
 *
 * @param baseDir - BBS base directory
 * @param conferenceId - Current conference ID (optional)
 * @param nodeId - Node ID
 */
export async function reloadDoorCommands(
  baseDir: string,
  conferenceId?: number,
  nodeId: number = 0
): Promise<{ success: boolean; message: string; doorsReloaded: number }> {
  try {
    // Clear existing BBSCMD cache (keep SYSCMD)
    const beforeCount = commandCache.bbscmd.size;
    commandCache.bbscmd.clear();

    // Reload commands from disk
    loadCommands(baseDir, conferenceId, nodeId);

    // Reinitialize doors from updated command cache
    const { initializeDoors } = require('./door.handler');
    await initializeDoors();

    const afterCount = commandCache.bbscmd.size;
    const message = `Reloaded ${afterCount} door commands (was ${beforeCount})`;

    return {
      success: true,
      message,
      doorsReloaded: afterCount
    };
  } catch (error) {
    const errorMsg = `Failed to reload doors: ${(error as Error).message}`;

    return {
      success: false,
      message: errorMsg,
      doorsReloaded: 0
    };
  }
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
  // Note: Don't log "Executing" here - only log when command is actually found
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
  // Note: Don't log "Executing" here - only log when command is actually found
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

  // express.e:28247-28256 - Check EXTERNAL commands FIRST (SYSCMD/BBSCMD)
  // Then fall back to internal commands if not found
  let commandDef: CommandDefinition | null = null;

  if (cmdType === CommandType.SYSCMD) {
    commandDef = commandCache.syscmd.get(cmdUpper) || null;
  } else if (cmdType === CommandType.BBSCMD) {
    commandDef = commandCache.bbscmd.get(cmdUpper) || null;
  }

  // If no external command found in cache, return FAILURE
  // Internal commands are handled by processCommand() as the last fallback
  // in the priority chain: SYSCMD -> BBSCMD -> Internal
  if (!commandDef) {
    return RESULT_FAILURE;
  }

  // Log "Executing" only AFTER command is found (not before lookup like old code did)
  debugLog(socket, session, `Executing: ${cmdUpper} ${params}`.trim());

  // express.e:4700-4708 - Check access level
  // Screen-triggered commands during the connect flow (AWAIT state) need to run
  // before a user has logged in. When session.user is undefined but the screen
  // handler queued a command, temporarily treat the call as privileged so
  // await-screen animations like V-AWAIT can still execute.
  const isScreenAutoCommand = !session.user && session.executingScreenCommand;
  const userSecLevel = isScreenAutoCommand ? Number.MAX_SAFE_INTEGER : (session.user?.secLevel || 0);
  const requiredAccess = commandDef.access || 0;

  if (requiredAccess !== 0 && userSecLevel < requiredAccess) {
    // express.e:4705-4707 - User doesn't have sufficient access
    SysopDebugUtil.debug(
      socket,
      session,
      'COMMAND',
      `Access denied for command: ${cmd}`,
      { userSecLevel, requiredAccess, username: session.user?.username },
      DebugSeverity.WARNING
    );
    // Only show error message if NOT a screen-initiated command
    // Screen commands (from ~CC_, ~XC_, ~XI MCI codes) should fail silently
    // because the user didn't explicitly type them
    // express.e:3037-3039 higherAccess() — exact string match
    if (!session.executingScreenCommand) {
      socket.emit('ansi-output', '\r\nCommand requires higher access.\r\n');
    }
    return RESULT_NOT_ALLOWED;
  }

  // express.e:4710-4731 - Check password if required (express.e:4716-4730)
  if (commandDef.password) {
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', 'Enter Password >: ');

    // Store command for execution after password validation
    session.tempData.passwordProtectedCommand = {
      commandDef,
      commandName: cmd
    };

    session.subState = LoggedOnSubState.COMMAND_PASSWORD_INPUT;
    return RESULT_SUCCESS; // Wait for password input
  }

  // express.e:4733-4748 - Internal commands are now checked BEFORE external doors
  // (see lines 208-217 above - internal commands take priority)

  // express.e:4750-4807 - Execute the door/command
  SysopDebugUtil.debug(socket, session, 'COMMAND', `Executing ${commandDef.type} door: ${commandDef.location}`, { type: commandDef.type, location: commandDef.location });

  // Cache command + params for XIM BB_MAINLINE replies (express.e:3794-3800).
  session.currentCommand = cmdUpper;
  // IMPORTANT: doorParams must be FULL command line (command + params) for EXPRESS_VERSION
  // See XIM_CRITICAL_REQUIREMENTS.md #2. This may be overwritten by door.handler.ts:2240.
  const fullCommandLine = cmdUpper + (params ? ' ' + params : '');
  session.commandParams = fullCommandLine;
  session.doorParams = fullCommandLine;

  // Set environment status (express.e:4710)
  // For file scan commands (FR, F, N, CS, SCAN, NSU), set ENV_FILES (8)
  // This is critical for doors like AquaScan to know the BBS context
  const isFileScanCommand = ['FR', 'F', 'N', 'CS', 'SCAN', 'NSU'].includes(cmdUpper);
  if (isFileScanCommand) {
    session.currentStat = 8; // ENV_FILES
  }

  // Execute the door using the door handler
  if (_executeDoor) {
    // Convert Amiga paths to Unix paths if needed
    let location = commandDef.location;
    if (location.includes(':')) {
      location = location.replace(/:/g, '/');
    }

    const doorConfig = {
      id: commandDef.name.toLowerCase(),
      name: commandDef.name,
      command: commandDef.name.toUpperCase(),
      description: `${commandDef.type} door`,
      type: commandDef.type,
      path: location, // Door execution expects 'path', not 'location'
      accessLevel: commandDef.access || 0,
      enabled: true,
      parameters: params ? [params] : [],
      // express.e:4758-4770 - Additional door options
      priority: commandDef.priority || 'SAME',
      stack: commandDef.stack || 20000,
      resident: commandDef.resident || false,
      // doorExpertMode flag (EXPERT_MODE presence) express.e:4770
      expertMode: commandDef.expertMode || false,
      // express.e:4295 - MCI_TEXT for MCI type doors
      mciText: commandDef.mciText,
      quickMode: commandDef.quickMode,
      silent: commandDef.silent,
      trapOn: commandDef.trapOn,
      multiNode: commandDef.multiNode,
      logInputs: commandDef.logInputs,
      scriptCheck: commandDef.scriptCheck,
      banner: commandDef.banner,
      mimicVer: commandDef.mimicVer,
      passParameters: commandDef.passParameters,
      internal: commandDef.internal,
      args: commandDef.args,
      toolTypes: commandDef.toolTypes
    };

    try {
      // Express.e sets doorExpertMode when EXPERT_MODE tooltype is present
      session.doorExpertMode = Boolean(commandDef.expertMode);
      await _executeDoor(socket, session, doorConfig);
      return RESULT_SUCCESS;
    } catch (error) {
console.error(`  Error executing door:`, error);
      SysopDebugUtil.debug(
        socket,
        session,
        'COMMAND',
        `Error executing command: ${cmd}`,
        {
          error: (error as Error).message,
          doorType: commandDef.type,
          doorPath: location
        },
        DebugSeverity.CRITICAL
      );
      socket.emit('ansi-output', AnsiUtil.errorLine('Error executing command.'));
      return RESULT_FAILURE;
    }
  } else {
console.warn(`  executeDoor not available - command execution skipped`);
    SysopDebugUtil.debug(
      socket,
      session,
      'COMMAND',
      `executeDoor not available - cannot execute command: ${cmd}`,
      { cmdType, doorType: commandDef.type },
      DebugSeverity.CRITICAL
    );
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

/**
 * Handle password input for password-protected commands
 * express.e:4716-4730
 */
export async function handleCommandPasswordInput(socket: any, session: BBSSession, password: string): Promise<void> {
  const { AnsiUtil } = require('../utils/ansi.util');
  const { LoggedOnSubState } = require('../constants/bbs-states');

  if (!session.tempData.passwordProtectedCommand) {
console.error('[CommandPassword] No password-protected command in session');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  const { commandDef, commandName } = session.tempData.passwordProtectedCommand;

  // express.e:4725 - Case-insensitive password comparison (StriCmp)
  if (password.toLowerCase() !== commandDef.password.toLowerCase()) {
    // express.e:4726-4728 - Invalid password
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('InValid Password!'));
    socket.emit('ansi-output', '\r\n');

    // Clean up and return to menu
    delete session.tempData.passwordProtectedCommand;
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Password is correct - execute the command
console.log(`[CommandPassword] Password correct, executing command: ${commandName}`);

  // Clean up password data
  delete session.tempData.passwordProtectedCommand;

  // Execute the door using the same pattern as runCommand (lines 283-357)
  if (!_executeDoor) {
console.warn(`[CommandPassword] executeDoor not available - command execution skipped`);
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine('Command execution not available.'));
    socket.emit('ansi-output', '\r\n');
    session.subState = LoggedOnSubState.DISPLAY_MENU;
    return;
  }

  // Convert Amiga paths to Unix paths if needed
  let location = commandDef.location;
  if (location.includes(':')) {
    location = location.replace(/:/g, '/');
  }

  const doorConfig = {
    id: commandDef.name.toLowerCase(),
    name: commandDef.name,
    command: commandDef.name.toUpperCase(),
    description: `${commandDef.type} door`,
    type: commandDef.type,
    path: location,
    accessLevel: commandDef.access || 0,
    enabled: true,
    parameters: [],
    priority: commandDef.priority || 'SAME',
    stack: commandDef.stack || 20000,
    resident: commandDef.resident || false,
    expertMode: commandDef.expertMode || false,
    mciText: commandDef.mciText,
    quickMode: commandDef.quickMode,
    silent: commandDef.silent,
    trapOn: commandDef.trapOn,
    multiNode: commandDef.multiNode,
    logInputs: commandDef.logInputs,
    scriptCheck: commandDef.scriptCheck,
    banner: commandDef.banner,
    mimicVer: commandDef.mimicVer,
    passParameters: commandDef.passParameters,
    internal: commandDef.internal,
    args: commandDef.args,
    toolTypes: commandDef.toolTypes
  };

  try {
    session.doorExpertMode = Boolean(commandDef.expertMode);
    await _executeDoor(socket, session, doorConfig);
  } catch (error: any) {
console.error(`[CommandPassword] Error executing command ${commandName}:`, error);
    socket.emit('ansi-output', '\r\n');
    socket.emit('ansi-output', AnsiUtil.errorLine(`Error executing command: ${error.message}`));
    socket.emit('ansi-output', '\r\n');
  }

  // Return to menu after command execution
  session.subState = LoggedOnSubState.DISPLAY_MENU;
}

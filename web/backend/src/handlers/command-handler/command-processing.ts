/**
 * Command Processing
 * Handles command priority system and command execution
 * Based on express.e:28228-28257 (command priority)
 */

import { BBSSession } from '../../index';
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand
} from '../command-execution.handler';

const COMMAND_RESULT_SUCCESS = 'SUCCESS';
const COMMAND_RESULT_FAILURE = 'FAILURE';
const COMMAND_RESULT_NOT_ALLOWED = 'NOT_ALLOWED';

/**
 * Execute SysCommand (express.e:4807-4811)
 * Wrapper for command-execution handler
 */
export async function runSysCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for SYSCMD lookup and execution
  const result = await execSysCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return COMMAND_RESULT_SUCCESS;
  if (result === -2) return COMMAND_RESULT_NOT_ALLOWED;
  return COMMAND_RESULT_FAILURE;
}

/**
 * Execute BbsCommand (express.e:4807-4811)
 * Wrapper for command-execution handler
 */
export async function runBbsCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for BBSCMD lookup and execution
  const result = await execBbsCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return COMMAND_RESULT_SUCCESS;
  if (result === -2) return COMMAND_RESULT_NOT_ALLOWED;
  return COMMAND_RESULT_FAILURE;
}

/**
 * Process command with priority system (express.e:28229-28257)
 * Priority: SysCommand → BbsCommand → InternalCommand
 *
 * allowSyscmd=FALSE matches express.e default: SYSCMD is never searched for interactive
 * user menu input. Pass allowSyscmd=TRUE only for internal BBS system calls (batch
 * scripts, AREXX, door callbacks, ~CC_ MCI codes) — express.e:28249.
 */
export async function processCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string,
  processBBSCommand: (socket: any, session: BBSSession, command: string, params: string) => Promise<void>,
  allowSyscmd: boolean = false
): Promise<string> {
console.log(`[CommandPriority] Processing command: ${command} with params: ${params} allowSyscmd: ${allowSyscmd}`);

  // Try SysCommand first — only when allowSyscmd=TRUE (express.e:28249)
  // Interactive user menu input always uses allowSyscmd=FALSE (express.e:28229 default)
  if (allowSyscmd) {
    const sysResult = await runSysCommand(socket, session, command, params);
    if (sysResult === COMMAND_RESULT_SUCCESS) {
console.log('[CommandPriority] Executed as SysCommand');
      return COMMAND_RESULT_SUCCESS;
    }
    if (sysResult === COMMAND_RESULT_NOT_ALLOWED) {
console.log('[CommandPriority] SysCommand denied by permissions');
      return COMMAND_RESULT_NOT_ALLOWED;
    }
  }

  // Try BbsCommand second
  const bbsResult = await runBbsCommand(socket, session, command, params);
  if (bbsResult === COMMAND_RESULT_SUCCESS) {
console.log('[CommandPriority] Executed as BbsCommand');
    return COMMAND_RESULT_SUCCESS;
  }
  if (bbsResult === COMMAND_RESULT_NOT_ALLOWED) {
console.log('[CommandPriority] BbsCommand denied by permissions');
    return COMMAND_RESULT_NOT_ALLOWED;
  }

  // Try InternalCommand last
console.log('[CommandPriority] Trying as InternalCommand');
  await processBBSCommand(socket, session, command, params);
  return COMMAND_RESULT_SUCCESS;
}

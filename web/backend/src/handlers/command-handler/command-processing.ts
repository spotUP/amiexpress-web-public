/**
 * Command Processing
 * Handles command priority system and command execution
 * Based on express.e:28228-28257 (command priority)
 */

import { BBSSession } from '../../index';
import { CommandResult } from './types';
import {
  runSysCommand as execSysCommand,
  runBbsCommand as execBbsCommand
} from '../command-execution.handler';

/**
 * Execute SysCommand (express.e:4807-4811)
 * Wrapper for command-execution handler
 */
export async function runSysCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for SYSCMD lookup and execution
  const result = await execSysCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return CommandResult.SUCCESS;
  if (result === -2) return CommandResult.NOT_ALLOWED;
  return CommandResult.FAILURE;
}

/**
 * Execute BbsCommand (express.e:4807-4811)
 * Wrapper for command-execution handler
 */
export async function runBbsCommand(socket: any, session: BBSSession, command: string, params: string): Promise<string> {
  // Use the command-execution handler for BBSCMD lookup and execution
  const result = await execBbsCommand(socket, session, command, params);

  // Convert numeric result codes to strings for compatibility
  if (result === 0) return CommandResult.SUCCESS;
  if (result === -2) return CommandResult.NOT_ALLOWED;
  return CommandResult.FAILURE;
}

/**
 * Process command with priority system (express.e:28229-28257)
 * Priority: SysCommand → BbsCommand → InternalCommand
 */
export async function processCommand(
  socket: any,
  session: BBSSession,
  command: string,
  params: string,
  processBBSCommand: (socket: any, session: BBSSession, command: string, params: string) => Promise<void>
): Promise<string> {
  console.log(`[CommandPriority] Processing command: ${command} with params: ${params}`);

  // Try SysCommand first
  const sysResult = await runSysCommand(socket, session, command, params);
  if (sysResult === CommandResult.SUCCESS) {
    console.log('[CommandPriority] Executed as SysCommand');
    return CommandResult.SUCCESS;
  }
  if (sysResult === CommandResult.NOT_ALLOWED) {
    console.log('[CommandPriority] SysCommand denied by permissions');
    return CommandResult.NOT_ALLOWED;
  }

  // Try BbsCommand second
  const bbsResult = await runBbsCommand(socket, session, command, params);
  if (bbsResult === CommandResult.SUCCESS) {
    console.log('[CommandPriority] Executed as BbsCommand');
    return CommandResult.SUCCESS;
  }
  if (bbsResult === CommandResult.NOT_ALLOWED) {
    console.log('[CommandPriority] BbsCommand denied by permissions');
    return CommandResult.NOT_ALLOWED;
  }

  // Try InternalCommand last
  console.log('[CommandPriority] Trying as InternalCommand');
  await processBBSCommand(socket, session, command, params);
  return CommandResult.SUCCESS;
}

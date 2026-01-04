import { appendFileSync } from 'fs';
import * as path from 'path';
import { XIMCommand, XIMMessage } from '../amiga-emulation/xim/types';

const projectRoot = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');
const doorLogPath = path.join(projectRoot, 'logs', 'door-68k.log');

function ensureDoorLogLine(line: string) {
  try {
    appendFileSync(doorLogPath, line + '\n', { encoding: 'utf8' });
  } catch (error) {
console.error('[DoorLogging] Failed to write door log:', error);
  }
}

function sanitizeString(value: string | undefined | null): string {
  if (!value) return '';
  return value
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n')
    .replace(/\x1b/g, '\\x1b');
}

export function logDoorMessage(msg: XIMMessage, commandName?: string) {
  const timestamp = new Date().toISOString();
  const resolvedName =
    commandName ??
    XIMCommand[msg.command] ??
    `CMD_${msg.command.toString(16).padStart(2, '0')}`;
  const nodeInfo = msg.nodeId !== undefined ? ` node=${msg.nodeId}` : '';
  const basePrefix = `[DoorMsg] ${timestamp}${nodeInfo}`;

  ensureDoorLogLine(
    `${basePrefix} msg request: ${msg.command} (${resolvedName})`
  );
  ensureDoorLogLine(`${basePrefix} data: ${msg.data}`);
  ensureDoorLogLine(
    `${basePrefix} string: ${sanitizeString(msg.string)}`
  );
}

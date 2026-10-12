import { appendFileSync, mkdirSync } from 'fs';
import * as path from 'path';
import { XIMCommand, XIMMessage } from '../amiga-emulation/xim/types';
import { getSystemTime } from '../utils/date-time.util';
import { boardRoot } from './board-root.util';

// The board writes this log, so it lives under the board's root. Resolved per
// call: the root can change at runtime (admin, tests).
const doorLogPath = (): string => path.join(boardRoot(), 'logs', 'door-68k.log');

export function ensureDoorLogLine(line: string) {
  try {
    const file = doorLogPath();
    mkdirSync(path.dirname(file), { recursive: true });
    appendFileSync(file, line + '\n', { encoding: 'utf8' });
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
  const timestamp = getSystemTime().toISOString();
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

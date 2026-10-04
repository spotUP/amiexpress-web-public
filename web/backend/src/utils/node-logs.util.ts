/**
 * Node-specific logging utilities (ErrorLog, DoorLog)
 *
 * From express.e:
 * - errorLog (lines 8968-8992): Logs errors to Node{N}/ErrorLog
 * - doorLog (lines 9392-9419): Logs door start/exit to Node{N}/DoorLog
 */

import * as fs from 'fs';
import * as path from 'path';

import { DoorType } from './amiga-command-parser.util';

/**
 * The number DoorLog writes for a door type: its position in axenums.e:15,
 *
 *   ENUM DOORTYPE_XIM, DOORTYPE_AIM, DOORTYPE_SIM, DOORTYPE_TIM,
 *        DOORTYPE_IIM, DOORTYPE_MCI, DOORTYPE_AEM, DOORTYPE_SUP
 *
 * so XIM 0, AIM 1, SIM 2. The board's door-type enum
 * (amiga-command-parser.util DoorType) carries the names; this is only their
 * order. The port's own table had SIM=1 and AIM=2, so every SIM door - the
 * default type - logged `- 1 -` where express.e writes `- 2 -`.
 */
const DOORLOG_TYPE_ORDER: readonly string[] = [
  DoorType.XIM, DoorType.AIM, DoorType.SIM, DoorType.TIM,
  DoorType.IIM, DoorType.MCI, DoorType.AEM, DoorType.SUP,
  // WEB_: not in axenums.e:15 - the FAME and DayDream compat layers. They
  // take the next free numbers, as they always have here.
  DoorType.FIM, DoorType.DD,
];

/**
 * express.e:4312 `IF type=DOORTYPE_AIM THEN type:=DOORTYPE_XIM` runs before
 * doorLog(type,cmd) at 4332, so an AIM door is logged as XIM (0). An unknown
 * type logs as XIM, as the port always did.
 */
export function doorLogTypeNumber(type: string): number {
  const upper = String(type || '').toUpperCase();
  const folded = upper === DoorType.AIM ? DoorType.XIM : upper;
  const at = DOORLOG_TYPE_ORDER.indexOf(folded);
  return at < 0 ? 0 : at;
}

/**
 * Format date/time like express.e formatLongDateTime
 * Format: "Day DD-Mon-YYYY HH:MM:SS" (e.g., "Sun 19-Oct-2025 10:42:11")
 */
function formatLongDateTime(date: Date): string {
  const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayName = days[date.getDay()];
  const dayNum = date.getDate().toString().padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  const secs = date.getSeconds().toString().padStart(2, '0');
  return `${dayName} ${dayNum}-${month}-${year} ${hours}:${mins}:${secs}`;
}

/**
 * Format date like express.e formatLongDate
 * Format: "DD-Mon-YYYY"
 */
function formatLongDate(date: Date): string {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = date.getDate().toString().padStart(2, '0');
  const month = months[date.getMonth()];
  const year = date.getFullYear();
  return `${day}-${month}-${year}`;
}

/**
 * Format time like express.e formatLongTime
 * Format: "HH:MM:SS"
 */
function formatLongTime(date: Date): string {
  const hours = date.getHours().toString().padStart(2, '0');
  const mins = date.getMinutes().toString().padStart(2, '0');
  const secs = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${mins}:${secs}`;
}

/**
 * Get the Node directory path
 */
function getNodeDir(bbsRoot: string, nodeId: number): string {
  return path.join(bbsRoot, `Node${nodeId}`);
}

/**
 * Ensure Node directory exists
 */
function ensureNodeDir(bbsRoot: string, nodeId: number): string {
  const nodeDir = getNodeDir(bbsRoot, nodeId);
  if (!fs.existsSync(nodeDir)) {
    fs.mkdirSync(nodeDir, { recursive: true });
  }
  return nodeDir;
}

/**
 * Log error to Node{N}/ErrorLog
 *
 * express.e:8968-8992:
 * Format: "{date} {time} {message}"
 */
export function errorLog(bbsRoot: string, nodeId: number, message: string): void {
  try {
    const nodeDir = ensureNodeDir(bbsRoot, nodeId);
    const logPath = path.join(nodeDir, 'ErrorLog');
    const now = new Date();
    const dateStr = formatLongDate(now);
    const timeStr = formatLongTime(now);
    const line = `${dateStr} ${timeStr} ${message}\n`;
    fs.appendFileSync(logPath, line);
  } catch (err) {
    console.error('[errorLog] Failed to write:', err);
  }
}

/**
 * Log door activity to Node{N}/DoorLog
 *
 * express.e:9392-9419:
 * Format: "[{datetime}[25]] {username} - {type} - {doorname or Exiting}"
 *
 * @param bbsRoot - BBS root directory
 * @param nodeId - Node number
 * @param doorType - axenums.e:15 door-type number (doorLogTypeNumber)
 * @param username - loggedOnUser.name, or empty when nobody is (express.e:9407)
 * @param doorName - Door name (empty string means "Exiting")
 */
export function doorLog(
  bbsRoot: string,
  nodeId: number,
  doorType: number,
  username: string,
  doorName: string = ''
): void {
  try {
    const nodeDir = ensureNodeDir(bbsRoot, nodeId);
    const logPath = path.join(nodeDir, 'DoorLog');
    const now = new Date();
    const dateTimeStr = formatLongDateTime(now).padEnd(25);

    // express.e format uses numeric door type (\d), not string name
    let line: string;
    if (doorName.length > 0) {
      // Door starting
      line = `[${dateTimeStr}] ${username} - ${doorType} - ${doorName}\n`;
    } else {
      // Door exiting
      line = `[${dateTimeStr}] ${username} - ${doorType} - Exiting\n`;
    }

    fs.appendFileSync(logPath, line);
  } catch (err) {
    console.error('[doorLog] Failed to write:', err);
  }
}

/**
 * Log door start
 */
export function logDoorStart(
  bbsRoot: string,
  nodeId: number,
  doorType: number,
  username: string,
  doorName: string
): void {
  doorLog(bbsRoot, nodeId, doorType, username, doorName);
}

/**
 * Log door exit
 */
export function logDoorExit(
  bbsRoot: string,
  nodeId: number,
  doorType: number,
  username: string
): void {
  doorLog(bbsRoot, nodeId, doorType, username, '');
}

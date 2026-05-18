/**
 * Download/Upload Logging Utility
 * Port from express.e:9475+ logUDFile(), udLog(), callersLog()
 *
 * Logs download and upload activity to system logs
 */

import * as fs from 'fs';
import * as path from 'path';
import { User } from '../types';
import { getACSConfig, LevelFlags } from './acs.util';
import { config } from '../config';
import { getSystemTime } from '../utils/date-time.util';

/**
 * Log download activity
 * Port from express.e:9475-9491 logUDFile()
 *
 * @param user User downloading
 * @param filename File being downloaded
 * @param fileSize Size in bytes
 * @param isFree Whether this is a free download (doesn't count against ratio)
 */
export async function logDownload(
  user: User,
  filename: string,
  fileSize: number,
  isFree: boolean = false,
  nodeId: number = 0
): Promise<void> {

  const username = user.username || 'Unknown';
  const timestamp = getSystemTime().toISOString();

  // express.e:9478 - Format log message
  const message = isFree
    ? `[${timestamp}] ${username} - Downloading Free ${filename} ${fileSize} bytes`
    : `[${timestamp}] ${username} - Downloading ${filename} ${fileSize} bytes`;

  // Log to console (in web version, console is our primary log)
console.log(`[DOWNLOAD] ${message}`);

  // Write to UDLog file if logging is enabled
  // express.e:9489 - udLog(tempStr)
  await writeToUDLog(message, nodeId);

  // Write to CallersLog
  // express.e:9488 - callersLog(tempStr)
  await writeToCallersLog(username, message, nodeId);
}

/**
 * Log upload activity
 * Port from express.e:9475-9491 logUDFile() with dl=FALSE
 *
 * @param user User uploading
 * @param filename File being uploaded
 * @param fileSize Size in bytes
 * @param isResume Whether this is a resumed upload
 */
export async function logUpload(
  user: User,
  filename: string,
  fileSize: number,
  isResume: boolean = false,
  nodeId: number = 0
): Promise<void> {

  const username = user.username || 'Unknown';
  const timestamp = getSystemTime().toISOString();

  // express.e:9484 - Format upload message
  const message = isResume
    ? `[${timestamp}] ${username} - Resuming upload ${filename} ${fileSize} bytes`
    : `[${timestamp}] ${username} - Uploading ${filename} ${fileSize} bytes`;

console.log(`[UPLOAD] ${message}`);

  await writeToUDLog(message, nodeId);
  await writeToCallersLog(username, message, nodeId);
}

/**
 * Write to UDLog (Upload/Download log)
 * Port from express.e:9520-9540 udLog()
 */
export async function writeToUDLog(message: string, nodeId: number): Promise<void> {
  if (!getACSConfig().acLvl[LevelFlags.DO_UD_LOG]) return;
  try {
    const dataDir = config.get('dataDir');
    const nodeDir = path.join(dataDir, `Node${nodeId || 0}`);
    const logDir = fs.existsSync(nodeDir) ? nodeDir : path.join(process.cwd(), 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'UDLog');

    // Append to log file
    fs.appendFileSync(logFile, message + '\n');
  } catch (error) {
console.error('[UDLOG] Error writing to log:', error);
  }
}

/**
 * Write to CallersLog
 * Port from express.e:9493-9518 callersLog()
 */
export async function writeToCallersLog(username: string, message: string, nodeId: number): Promise<void> {
  if (!getACSConfig().acLvl[LevelFlags.DO_CALLERSLOG]) return;
  try {
    const dataDir = config.get('dataDir');
    const nodeDir = path.join(dataDir, `Node${nodeId || 0}`);
    const logDir = fs.existsSync(nodeDir) ? nodeDir : path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'CallersLog');

    // Append to log file
    fs.appendFileSync(logFile, `${username}: ${message}\n`);
  } catch (error) {
console.error('[CALLERSLOG] Error writing to log:', error);
  }
}

/**
 * Write divider to UDLog
 * Port from express.e:9542-9544 udLogDivider()
 */
export async function logDivider(): Promise<void> {
  const divider = '**************************************************************';
  await writeToUDLog(divider, 0);
}

/**
 * Write a "user session header" to UDLog the first time the user does
 * any U/D activity this session. Port of express.e:16023
 * displayUserToCallersLog(1) — the udonly=TRUE branch:
 *
 *   udLogDivider()
 *   <date> (<time>) [<slot>] <name> (<connectString>) <location>
 *
 * Gated by session.beenUDd so subsequent uploads/downloads in the
 * same session don't re-emit the header. Matches express.e:19046-19049
 * (and the mirror at 20242-20245 in downloadAFile).
 */
export async function writeUDSessionHeader(session: any): Promise<void> {
  if (session.beenUDd) return;
  session.beenUDd = true;

  const user = session.user;
  if (!user) return;

  const nodeId = session.nodeId || 1;
  // Divider first
  const divider = '**************************************************************';
  await writeToUDLog(divider, nodeId);

  // Build the session header line
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const datestr = `${pad(now.getDate())}-${['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'][now.getMonth()]}-${now.getFullYear() % 100}`;
  const timestr = `${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
  const slot = user.slotNumber || 0;
  const name = user.name || user.username || 'unknown';
  const connectString = session.connectString || (session.connectionType || 'telnet').toUpperCase();
  const location = user.location || 'Unknown';
  const newMarker = (user.timesCalled || 0) === 0 ? 'NEW ' : '';
  const line = `${datestr} (${timestr}) ${newMarker}[${slot}] ${name} (${connectString}) ${location}`;
  await writeToUDLog(line, nodeId);
}

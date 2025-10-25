/**
 * Download/Upload Logging Utility
 * Port from express.e:9475+ logUDFile(), udLog(), callersLog()
 *
 * Logs download and upload activity to system logs
 */

import * as fs from 'fs';
import * as path from 'path';
import { User } from '../types';

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
  isFree: boolean = false
): Promise<void> {

  const username = user.username || 'Unknown';
  const timestamp = new Date().toISOString();

  // express.e:9478 - Format log message
  const message = isFree
    ? `[${timestamp}] ${username} - Downloading Free ${filename} ${fileSize} bytes`
    : `[${timestamp}] ${username} - Downloading ${filename} ${fileSize} bytes`;

  // Log to console (in web version, console is our primary log)
  console.log(`[DOWNLOAD] ${message}`);

  // Write to UDLog file if logging is enabled
  // express.e:9489 - udLog(tempStr)
  await writeToUDLog(message);

  // Write to CallersLog
  // express.e:9488 - callersLog(tempStr)
  await writeToCallersLog(username, message);
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
  isResume: boolean = false
): Promise<void> {

  const username = user.username || 'Unknown';
  const timestamp = new Date().toISOString();

  // express.e:9484 - Format upload message
  const message = isResume
    ? `[${timestamp}] ${username} - Resuming upload ${filename} ${fileSize} bytes`
    : `[${timestamp}] ${username} - Uploading ${filename} ${fileSize} bytes`;

  console.log(`[UPLOAD] ${message}`);

  await writeToUDLog(message);
  await writeToCallersLog(username, message);
}

/**
 * Write to UDLog (Upload/Download log)
 * Port from express.e:9520-9540 udLog()
 */
async function writeToUDLog(message: string): Promise<void> {
  try {
    // In web version, we use a logs directory instead of Amiga-style Node paths
    const logDir = path.join(process.cwd(), 'logs');

    // Create logs directory if it doesn't exist
    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'udlog.txt');

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
async function writeToCallersLog(username: string, message: string): Promise<void> {
  try {
    const logDir = path.join(process.cwd(), 'logs');

    if (!fs.existsSync(logDir)) {
      fs.mkdirSync(logDir, { recursive: true });
    }

    const logFile = path.join(logDir, 'callerslog.txt');

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
  await writeToUDLog(divider);
}

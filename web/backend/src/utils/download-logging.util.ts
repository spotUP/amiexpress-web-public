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
import { leftField } from '@amiexpress/bbs-door-sdk/formats/estringf';

/**
 * Log one file going out - express.e:9475-9491 logUDFile(dl=TRUE):
 *
 *   StringF(tempStr,'\t\sDownloading \s \d bytes',
 *           IF zModemInfo.freeDFlag THEN 'Free ' ELSE '',fileName,filesize)
 *   callersLog(tempStr)
 *   udLog(tempStr)
 *
 * GLCUpdater and SAmiLog read the summary that follows a `Downloading ` line.
 *
 * @param isFree Whether this is a free download (doesn't count against ratio)
 */
export async function logDownload(
  user: User,
  filename: string,
  fileSize: number,
  isFree: boolean = false,
  nodeId: number = 0
): Promise<void> {
  const line = `\t${isFree ? 'Free ' : ''}Downloading ${filename} ${fileSize} bytes`;
console.log(`[DOWNLOAD] ${user.username || 'Unknown'}${line}`);
  await writeToCallersLog(line, nodeId);
  await writeToUDLog(line, nodeId);
}

/** express.e FilePart(): the name after the last `/` or `:`. */
function filePart(name: string): string {
  return name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf(':')) + 1);
}

/**
 * One file coming in - express.e:9480-9486 logUDFile(dl=FALSE):
 *
 *   StringF(tempStr,'\tUploading \s[12] \d bytes',FilePart(fileName),filesize)
 *
 * `\s[12]` is NOT "at least twelve": the E compiler emits it as
 * `%-12.12s` - left-justified, padded AND cut to exactly twelve. Read from
 * the string table of a real express binary
 * (Documentation/7-Reference Sources/reference-boardBBS/express:
 * `\tUploading %-12.12s %-ld bytes`) and from that board's own CallersLog
 * (`\tUploading AYS1995.LHA  277169 bytes` - eleven characters, one pad).
 * It is the SDK's E `leftField`.
 *
 * GLCUpdater.e:691 credits a summary only when the line before it carries
 * `Uploading ` (or `Upload moved`); SAmiLog sets its upload flag from it.
 */
export function formatUploadingLine(filename: string, size: number): string {
  return `\tUploading ${leftField(filePart(filename), 12)} ${size} bytes`;
}

/** logUDFile(FALSE): the line goes to the CallersLog and the UDLog (express.e:9488-9489). */
export async function logUpload(filename: string, size: number, nodeId: number): Promise<void> {
  const line = formatUploadingLine(filename, size);
  await writeToCallersLog(line, nodeId);
  await writeToUDLog(line, nodeId);
}

/**
 * One FTP upload finished - express.e:15071-15093 ftpUploadFileEnd, which
 * logs the file AND its own one-file summary, to the CallersLog only:
 *
 *   '\tUploading \s \d bytes'          (no field width here: the full name)
 *   '\t 1 file(s), \dk bytes, \d minute(s). \d second(s), \d cps, N/A % efficiency.'
 *
 * kbytes are Shr(transPos-resumePos,10); the seconds are ulTTTM ticks / 50,
 * whole seconds.
 */
export function formatFtpUploadLines(fileName: string, bytes: number, resumePos: number, seconds: number, cps: number): [string, string] {
  const secs = Math.max(0, Math.floor(seconds));
  return [
    `\tUploading ${fileName} ${bytes} bytes`,
    `\t 1 file(s), ${Math.floor((bytes - resumePos) / 1024)}k bytes, ${Math.floor(secs / 60)} minute(s). ${secs % 60} second(s), ${cps} cps, N/A % efficiency.`,
  ];
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
 * Write a line to the node's CallersLog - express.e:9493-9518 callersLog(),
 * through the board's one writer. The line goes in as given.
 */
export async function writeToCallersLog(message: string, nodeId: number): Promise<void> {
  const { callersLogManager } = require('../services/CallersLogManager');
  callersLogManager.logActivity(nodeId, message);
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

  // express.e:16034-16042, the same line the logon wrote to the CallersLog.
  const { formatCallerLogonLine, SOCKET_CONNECT_STRING } = require('../services/CallersLogManager');
  const line = formatCallerLogonLine({
    slotNumber: user.slotNumber ?? 0,
    name: user.username,
    connectString: SOCKET_CONNECT_STRING,
    location: user.location ?? '',
    isNew: (user.calls ?? 0) === 0,
  });
  await writeToUDLog(line, nodeId);
}

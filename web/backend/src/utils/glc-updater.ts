/**
 * Global Last Callers Updater - TypeScript Implementation
 *
 * Sends caller log entries to the Global Last Callers server (scenewall.bbs.io:1541).
 * Ported from Amiga E version.
 *
 * Usage:
 * - Run from logoff script for each node
 * - Reads CallersLog and sends new entries to global server
 * - Tracks last processed entry to avoid duplicates
 *
 * Original: Documentation/7-Reference Sources/AmiExpressEDoorSources/Global Last Callers/GLCUpdater.e
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.env.BBS_ROOT || path.resolve(process.cwd(), '../..');

interface GLCUpdaterOptions {
  bbsName: string;
  callersLog: string;
  ignoreLocal?: boolean;
  ignoreSysop?: boolean;
  ignoreSysopUser?: boolean;
  processAll?: boolean;
  timeZone?: string;
  serverHost?: string;
  serverPort?: number;
  timeout?: number;
  retries?: number;
  stealth?: boolean;
}

interface CallerEntry {
  username: string;
  location: string;
  dateOn: string;
  timeOn: string;
  timeOff: string;
  actions: string;
  upload: number;
  download: number;
  topCPS: number;
  uploadFiles: string[];
  downloadFiles: string[];
  confNums: number[];
  confUploads: number[];
  isLocal: boolean;
  isSysop: boolean;
  userId: number;
}

/**
 * Parse a caller log entry line
 */
function parseCallerEntry(line: string): CallerEntry | null {
  // CallersLog format (from AmiExpress):
  // Username|Location|DateOn|TimeOn|TimeOff|Actions|Upload KB|Download KB|CPS|Files...

  const parts = line.split('|');
  if (parts.length < 9) {
    return null;
  }

  return {
    username: parts[0] || '',
    location: parts[1] || '',
    dateOn: parts[2] || '',
    timeOn: parts[3] || '',
    timeOff: parts[4] || '',
    actions: parts[5] || '',
    upload: parseInt(parts[6]) || 0,
    download: parseInt(parts[7]) || 0,
    topCPS: parseInt(parts[8]) || 0,
    uploadFiles: parts[9] ? parts[9].split(',').filter(f => f.length > 0) : [],
    downloadFiles: parts[10] ? parts[10].split(',').filter(f => f.length > 0) : [],
    confNums: parts[11] ? parts[11].split(',').map(n => parseInt(n)).filter(n => !isNaN(n)) : [],
    confUploads: parts[12] ? parts[12].split(',').map(n => parseInt(n)).filter(n => !isNaN(n)) : [],
    isLocal: (parts[5] || '').includes('L'),
    isSysop: (parts[5] || '').includes('S'),
    userId: parseInt(parts[13]) || 0,
  };
}

/**
 * Check if entry should be ignored
 */
function shouldIgnoreEntry(entry: CallerEntry, options: GLCUpdaterOptions): boolean {
  if (options.ignoreLocal && entry.isLocal) {
    return true;
  }

  if (options.ignoreSysop && entry.isSysop) {
    return true;
  }

  if (options.ignoreSysopUser && entry.userId === 1) {
    return true;
  }

  return false;
}

/**
 * Clean string for JSON encoding
 */
function cleanString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/[\x80-\xFF]/g, (ch) => {
      const code = ch.charCodeAt(0);
      return `\\u${code.toString(16).padStart(4, '0')}`;
    });
}

/**
 * Send caller entry to Global Last Callers server
 */
async function postCallerEntry(
  entry: CallerEntry,
  options: GLCUpdaterOptions
): Promise<boolean> {
  const serverHost = options.serverHost || 'scenewall.bbs.io';
  const serverPort = options.serverPort || 1541;
  const timeout = (options.timeout || 10) * 1000;

  // Build JSON payload
  const userName = cleanString(entry.username);
  const location = cleanString(entry.location);
  const bbsName = cleanString(options.bbsName);
  const timeZone = options.timeZone || '';

  const confNumsJson = entry.confNums.length > 0
    ? `"confnums": [${entry.confNums.join(',')}],`
    : '';

  const confUploadsJson = entry.confUploads.length > 0
    ? `"confuploads": [${entry.confUploads.join(',')}]`
    : '';

  const uploadFilesJson = entry.uploadFiles.length > 0
    ? `,"uploadfiles": [${entry.uploadFiles.map(f => `"${cleanString(f)}"`).join(',')}]`
    : ',"uploadfiles": null';

  const downloadFilesJson = entry.downloadFiles.length > 0
    ? `,"downloadfiles": [${entry.downloadFiles.map(f => `"${cleanString(f)}"`).join(',')}]`
    : ',"downloadfiles": null';

  const stealthJson = options.stealth ? 1 : 0;

  const linedata = `{"Username": "${userName}","location": "${location}","Bbsname": "${bbsName}","Timezone": "${timeZone}","Dateon": "${entry.dateOn}","TimeOn": "${entry.timeOn}","TimeOff": "${entry.timeOff}","Actions": "${entry.actions}","Upload": ${entry.upload},"Download": ${entry.download},"TopCPS": ${entry.topCPS},${confNumsJson}${confUploadsJson}${uploadFilesJson}${downloadFilesJson},"Stealth": ${stealthJson}}`;

  const contentLength = Buffer.byteLength(linedata);
  const requestData = `POST /GlobalLastCallers/api/GlobalLastCallers HTTP/1.0\r\nHost: ${serverHost}\r\nContent-Type: application/json\r\nContent-Length: ${contentLength}\r\nConnection: close\r\n\r\n${linedata}`;

  return new Promise((resolve, reject) => {
    const options_http = {
      hostname: serverHost,
      port: serverPort,
      method: 'POST',
      path: '/GlobalLastCallers/api/GlobalLastCallers',
      timeout,
      headers: {
        'Host': serverHost,
        'Content-Type': 'application/json',
        'Content-Length': contentLength,
        'Connection': 'close'
      }
    };

    const req = http.request(options_http, (res) => {
      let data = '';

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        const statusCode = res.statusCode || 0;
        if (statusCode >= 200 && statusCode < 300) {
          resolve(true);
        } else {
console.error(`[GLCUpdater] Server returned status ${statusCode}`);
          resolve(false);
        }
      });
    });

    req.on('error', (err) => {
console.error(`[GLCUpdater] HTTP request failed: ${err.message}`);
      resolve(false);
    });

    req.on('timeout', () => {
      req.destroy();
console.error('[GLCUpdater] HTTP request timed out');
      resolve(false);
    });

    req.write(linedata);
    req.end();
  });
}

/**
 * Get last processed line number from tracking file
 */
function getLastProcessedLine(callersLog: string): number {
  const trackingFile = `${callersLog}.glc_last`;

  try {
    if (fs.existsSync(trackingFile)) {
      const content = fs.readFileSync(trackingFile, 'utf-8').trim();
      const lineNum = parseInt(content);
      return isNaN(lineNum) ? 0 : lineNum;
    }
  } catch (err) {
console.error(`[GLCUpdater] Error reading tracking file: ${err}`);
  }

  return 0;
}

/**
 * Save last processed line number to tracking file
 */
function saveLastProcessedLine(callersLog: string, lineNum: number): void {
  const trackingFile = `${callersLog}.glc_last`;

  try {
    fs.writeFileSync(trackingFile, lineNum.toString(), 'utf-8');
  } catch (err) {
console.error(`[GLCUpdater] Error writing tracking file: ${err}`);
  }
}

/**
 * Process callers log and send new entries to server
 */
export async function processCallersLog(options: GLCUpdaterOptions): Promise<number> {
  const callersLogPath = path.isAbsolute(options.callersLog)
    ? options.callersLog
    : path.join(PROJECT_ROOT, options.callersLog);

  if (!fs.existsSync(callersLogPath)) {
console.error(`[GLCUpdater] Callers log not found: ${callersLogPath}`);
    return 0;
  }

  // Read entire log file
  const logContent = fs.readFileSync(callersLogPath, 'utf-8');
  const lines = logContent.split('\n').filter(line => line.trim().length > 0);

  // Get last processed line
  const lastProcessed = options.processAll ? 0 : getLastProcessedLine(callersLogPath);
  const startLine = lastProcessed;

  let processed = 0;
  let sent = 0;

  for (let i = startLine; i < lines.length; i++) {
    const entry = parseCallerEntry(lines[i]);

    if (!entry) {
      continue;
    }

    processed++;

    // Check if entry should be ignored
    if (shouldIgnoreEntry(entry, options)) {
      continue;
    }

    // Send to server
    const success = await postCallerEntry(entry, options);

    if (success) {
      sent++;
      saveLastProcessedLine(callersLogPath, i + 1);
    } else {
console.error(`[GLCUpdater] Failed to send entry for ${entry.username}`);
    }

    // Small delay to avoid overwhelming server
    await new Promise(resolve => setTimeout(resolve, 100));
  }

console.log(`[GLCUpdater] Processed ${processed} entries, sent ${sent} to server`);

  return sent;
}

/**
 * Main entry point for GLCUpdater
 */
export async function runGLCUpdater(args: string[]): Promise<void> {
  // Parse arguments
  const options: GLCUpdaterOptions = {
    bbsName: '',
    callersLog: '',
    ignoreLocal: false,
    ignoreSysop: false,
    ignoreSysopUser: false,
    processAll: false
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === 'IGNORELOCAL') {
      options.ignoreLocal = true;
    } else if (arg === 'IGNORESYSOP') {
      options.ignoreSysop = true;
    } else if (arg === 'IGNORESYSOPUSER') {
      options.ignoreSysopUser = true;
    } else if (arg === 'PROCESSALL') {
      options.processAll = true;
    } else if (arg.startsWith('TIMEZONE=')) {
      options.timeZone = arg.substring(9);
    } else if (!options.bbsName) {
      options.bbsName = arg;
    } else if (!options.callersLog) {
      options.callersLog = arg;
    }
  }

  if (!options.bbsName || !options.callersLog) {
console.error('[GLCUpdater] Usage: GLCUpdater BBSNAME CALLERSLOG [IGNORELOCAL] [IGNORESYSOP] [IGNORESYSOPUSER] [PROCESSALL] [TIMEZONE=zone]');
    return;
  }

  await processCallersLog(options);
}

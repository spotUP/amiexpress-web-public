import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { BBSState } from '../constants/bbs-states';
import { getSystemTime } from '../utils/date-time.util';
import { renderedRows } from '../screens/screen-rows';
import type { BBSSession } from '../index';

const DATA_DIR = config.get('dataDir');
const STORE_VERSION = '*SALv002';
const VERSION_LENGTH = Buffer.byteLength(STORE_VERSION); // 8
const CLEAR_DATE_BYTES = 4;
const RESERVED_BYTES = 36;
const DAILY_COUNT = 8;
const DAILY_ENTRY_BYTES = 74;
const RECORD_BYTES = 118;
const USER_COUNT = 20;

/**
 * Callers the height fit may never trim below - see OutputOptions.minCallers.
 * A bulletin that has been squeezed down to one caller has stopped being a
 * Last Callers list, so the fit gives up and lets the screen run long instead.
 */

const DEFAULT_MIN_CALLERS = 5;
const USER_ENTRY_BYTES = 144;
const STORE_SIZE_BYTES = 3638;
const LEGACY_SAMPLE_PATH = path.join(DATA_DIR, 'Utils', 'samilog', 'SAmiLog.Store');

const USERS_OFFSET =
  VERSION_LENGTH +
  CLEAR_DATE_BYTES +
  RESERVED_BYTES +
  DAILY_COUNT * DAILY_ENTRY_BYTES +
  RECORD_BYTES;
const TOTAL_USER_BYTES = USER_COUNT * USER_ENTRY_BYTES;
const RECORDS_OFFSET = VERSION_LENGTH + CLEAR_DATE_BYTES + RESERVED_BYTES + DAILY_COUNT * DAILY_ENTRY_BYTES;

const DEFAULT_ENTRY = {
  name: '[-----USER-----] ',
  location: '[----LOCATION!----] ',
  node: '0',
  usage: '-:-- ',
  upKb: '   0 ',
  upFiles: '   0 ',
  dnKb: '   0\n',  // CRITICAL: Must have newline per SAmiLog.Store format
  dnFiles: '   0\n',  // CRITICAL: Must have newline per SAmiLog.Store format
  onTime: '--:--:-- ',
  offTime: '--:--:-- ',
  avgCps: '   0 ',
  baud: '-----',  // 5 chars, no null terminator in this field
  flag1: 0,
  flag2: 0,
  flag3: 0
};

const DEFAULT_NAME = DEFAULT_ENTRY.name.trim();
const AMIGA_EPOCH = Date.UTC(1978, 0, 1);

const ANSI_RESET = '\x1b[0m';
const ANSI_YELLOW_UL = '\x1b[0;4;33m';
const ANSI_BLUE_BG_YELLOW_UL = '\x1b[44;4;33m';
const ANSI_BLUE = '\x1b[34m';
const ANSI_GREEN = '\x1b[32m';
const ANSI_YELLOW = '\x1b[33m';
const ANSI_MAGENTA = '\x1b[35m';
const ANSI_CYAN = '\x1b[36m';
const ANSI_WHITE = '\x1b[37m';
const ANSI_RED = '\x1b[31m';

// ... (existing imports)

export interface UpdateOptions {
  ignoreSysop?: boolean;
  createMiniLog?: boolean;
}

export interface OutputOptions {
  noAnsi?: boolean;
  logoffTimes?: boolean;
  fullNodes?: boolean;
  showFiles?: boolean;
  noTexts?: boolean;
  noRecords?: boolean;
  /**
   * Make the whole bulletin fit this many rows, by listing fewer callers.
   *
   * The bulletin is a PICTURE with a table in it - the header art, the credits
   * bar, the column rule, the daily and record bars and the tailer are all
   * fixed furniture, and the only part that can give is how many callers are
   * listed. At 20 callers it came to 38 lines against a 25-row screen, so the
   * board paginated it and put `(Pause)...More(y/n/ns)?` through the middle of
   * the table (the sysop, 2026-09-14).
   *
   * The furniture is not a constant: the header and tailer are files a sysop
   * edits, so a taller logo has to cost caller rows rather than overflow. That
   * is why this is measured from the assembled output instead of subtracting a
   * hard-coded chrome height.
   *
   * The OLDEST callers go first, which costs nothing: the store is newest-first
   * and the limit already takes from the front.
   */
  fitRows?: number;
  /**
   * Callers the fit may never trim below. Default 8.
   *
   * Fitting has a floor because the furniture does not shrink. Measured on
   * this board: about ELEVEN rows go to the credits bar, the column header and
   * its rule, the daily and record bars and the tailer, whatever the art does.
   * A 24-row budget therefore has thirteen rows to share between the logo and
   * the list - a 4-row logo leaves nine callers, a 6-row logo seven, and the
   * 12-row logo this board ships leaves ONE.
   *
   * A Last Callers screen showing one caller is not a Last Callers screen, so
   * the floor wins and the bulletin stays tall (and still paginates) rather
   * than degrading into a logo with a single row under it. Shortening the logo
   * is what buys the fit, which is why the sysop asked for it to be editable.
   */
  minCallers?: number;
}

function stripAnsi(text: string): string {
  return text.replace(/\x1b\[[0-9;]*m/g, '').replace(/\x1b\[[0-9]*C/g, '');
}

// Helper to parse CallersLog line (duplicated from glc-updater to avoid dependency)
interface SessionEntry {
  username: string;
  location: string;
  nodeStr: string;
  dateOn: string;
  timeOn: string;   // HH:MM
  timeOff: string;  // HH:MM
  uploadBytes: number;
  downloadBytes: number;
  uploadFiles: number;
  downloadFiles: number;
  uploadFailed: number;
  downloadFailed: number;
  flag1: number;
  flag2: number;
}

/**
 * Parse the last complete session block from the CallersLog.
 *
 * AmiExpress CallersLog format (written by CallersLogManager):
 *   ******...  (64-asterisk divider, written before each session)
 *   DD-Mon-YY HH:MM [N] username (connType) location
 *   DD-Mon-YY HH:MM Door: X
 *   DD-Mon-YY HH:MM Door exit: X
 *   DD-Mon-YY HH:MM Logoff: username
 *   ******...  (start of next session)
 *   ...
 *
 * At logoff time the batch runs; the current session's events are present
 * after the last divider but no closing divider exists yet.
 */
function parseLastSession(lines: string[]): SessionEntry | null {
  // Find the last ***** divider
  let lastDividerIdx = -1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].startsWith('***')) {
      lastDividerIdx = i;
      break;
    }
  }
  if (lastDividerIdx === -1) return null;

  const sessionLines = lines.slice(lastDividerIdx + 1).filter(l => l.trim().length > 0);
  if (sessionLines.length === 0) return null;

  // Login line: DD-Mon-YY HH:MM [N] username (connType) location
  const loginMatch = sessionLines[0].match(
    /^(\d{2}-\w{3}-\d{2}) (\d{2}:\d{2}) \[(\d+)\] (\S+) \(([^)]+)\)\s*(.*?)\s*$/
  );
  if (!loginMatch) return null;

  const [, dateOn, timeOn, nodeStr, username, connType, locationRaw] = loginMatch;
  const location = locationRaw || 'Unknown';

  let timeOff = timeOn;
  let uploadBytes = 0;
  let downloadBytes = 0;
  let uploadFiles = 0;
  let downloadFiles = 0;
  let uploadFailed = 0;
  let downloadFailed = 0;
  let flag1 = 0;
  let flag2 = 0;

  if (connType.toUpperCase().includes('LOCAL')) flag1 |= (1 << 5); // Local

  for (let i = 1; i < sessionLines.length; i++) {
    const line = sessionLines[i];

    // Keep timeOff updated to the timestamp of each event line
    const tsMatch = line.match(/^(\d{2}-\w{3}-\d{2}) (\d{2}:\d{2}) /);
    if (tsMatch) timeOff = tsMatch[2];

    // Loss carrier
    if (/loss carrier/i.test(line)) flag1 |= (1 << 2);

    // Hack / password fail
    if (/hack|password fail/i.test(line)) flag1 |= (1 << 1);

    // Sysop page (door O = page sysop)
    if (/door:\s+o\b/i.test(line)) flag1 |= (1 << 3);

    // Sysop command (door S = sysop)
    if (/door:\s+s\b/i.test(line)) flag1 |= (1 << 4);

    // Upload with byte count: "Uploading filename SIZE bytes"
    // (written by download-logging.util.ts when DO_CALLERSLOG ACS is enabled)
    const upMatch = line.match(/[Uu]ploading\s+\S+\s+(\d+)\s+bytes/);
    if (upMatch && !/fail/i.test(line)) {
      uploadBytes += parseInt(upMatch[1], 10);
      uploadFiles++;
      flag2 |= (1 << 0); // Upload
    } else if (/upload(?:ing)?\s*(?:fail|failed)/i.test(line)) {
      uploadFailed++;
      flag2 |= (1 << 1); // UpFail
    }

    // Download with byte count: "Downloading filename SIZE bytes"
    const dnMatch = line.match(/[Dd]ownloading\s+\S+\s+(\d+)\s+bytes/);
    if (dnMatch && !/fail/i.test(line)) {
      downloadBytes += parseInt(dnMatch[1], 10);
      downloadFiles++;
      flag2 |= (1 << 2); // Download
    } else if (/download(?:ing)?\s*(?:fail|failed)/i.test(line)) {
      downloadFailed++;
      flag2 |= (1 << 3); // DnFail
    }
  }

  return {
    username, location, nodeStr, dateOn, timeOn, timeOff,
    uploadBytes, downloadBytes,
    uploadFiles, downloadFiles,
    uploadFailed, downloadFailed,
    flag1, flag2,
  };
}

function parseTime(timeStr: string): number {
  const [h, m, s] = timeStr.split(':').map(n => parseInt(n) || 0);
  const now = getSystemTime();
  now.setHours(h, m, s, 0);
  return now.getTime();
}

/**
 * Update SAmiLog.Store from the Node's CallersLog
 */
export async function updateStoreFromCallersLog(nodeId: number, options: UpdateOptions): Promise<void> {
  try {
    ensureStoreExists();
    const storePath = getStorePath();
    const buffer = fs.readFileSync(storePath);

    // Read CallersLog
    const callersLogPath = path.join(DATA_DIR, `Node${nodeId}`, 'CallersLog');
    if (!fs.existsSync(callersLogPath)) {
console.warn(`[SamiLog] CallersLog not found for Node ${nodeId}`);
      return;
    }

    const logContent = fs.readFileSync(callersLogPath, 'latin1');
    const lines = logContent.split('\n');
    if (lines.length === 0) return;

    const entry = parseLastSession(lines);
    if (!entry) {
console.warn('[SamiLog] Could not parse last session from CallersLog');
      return;
    }

    // Ignore sysop check — sysop username is 'sysop' (case-insensitive)
    if (options.ignoreSysop && entry.username.toLowerCase() === 'sysop') {
console.log('[SamiLog] Ignoring Sysop call');
      return;
    }

    const { flag1, flag2, uploadBytes, downloadBytes, uploadFiles, downloadFiles } = entry;

    // Duration: timeOn and timeOff are HH:MM
    let durationStr = '-:-- ';
    try {
      const start = parseTime(entry.timeOn + ':00');
      const end   = parseTime(entry.timeOff + ':00');
      let diffMs = end - start;
      if (diffMs < 0) diffMs += 24 * 60 * 60 * 1000; // midnight wrap
      const totalMins = Math.floor(diffMs / 60000);
      const hours = Math.floor(totalMins / 60);
      const mins  = totalMins % 60;
      durationStr = `${hours}:${mins.toString().padStart(2, '0')} `;
    } catch (e) { /* ignore */ }

    // Shift entries 0-18 → 1-19 in rolling 20-user list
    for (let i = USER_COUNT - 1; i > 0; i--) {
      const srcOffset  = USERS_OFFSET + (i - 1) * USER_ENTRY_BYTES;
      const destOffset = USERS_OFFSET + i * USER_ENTRY_BYTES;
      buffer.copy(buffer, destOffset, srcOffset, srcOffset + USER_ENTRY_BYTES);
    }

    // onTime / offTime stored as HH:MM:SS (8 chars) + trailing space = 9 chars
    const onTimeFmt  = entry.timeOn  + ':00 ';
    const offTimeFmt = entry.timeOff + ':00 ';

    const newEntryObj = {
      name:     entry.username,
      location: entry.location,
      node:     entry.nodeStr,
      usage:    durationStr.padStart(5, ' '),
      upKb:     formatKiloBytes(uploadBytes, false),
      upFiles:  formatCount(uploadFiles),
      dnKb:     formatKiloBytes(downloadBytes, true),
      dnFiles:  formatCount(downloadFiles) + '\n',
      onTime:   onTimeFmt,
      offTime:  offTimeFmt,
      avgCps:   '   0 ',
      baud:     '19200',
      flag1,
      flag2,
      flag3:    0,
    };

    writeEntry(buffer, USERS_OFFSET, newEntryObj as any);

    // Update Daily Stats
    const todayAmiga = getDaysSinceAmigaEpoch();
    const dailyOffset    = VERSION_LENGTH + CLEAR_DATE_BYTES + RESERVED_BYTES;
    const todayDateOffset = dailyOffset;

    const storeDate = buffer.readUInt32BE(todayDateOffset);

    if (storeDate !== todayAmiga) {
      // The day that just ended breaks the records it beat, before it
      // becomes yesterday.
      breakRecords(buffer, dailyOffset);
      // New day — shift daily slots 0-6 → 1-7
      for (let i = DAILY_COUNT - 1; i > 0; i--) {
        const src = dailyOffset + (i - 1) * DAILY_ENTRY_BYTES;
        const dst = dailyOffset + i * DAILY_ENTRY_BYTES;
        buffer.copy(buffer, dst, src, src + DAILY_ENTRY_BYTES);
      }
      buffer.fill(0, dailyOffset, dailyOffset + DAILY_ENTRY_BYTES);
      buffer.writeUInt32BE(todayAmiga, todayDateOffset);
    }

    // Struct: Date(4), Calls(2), UpK(4), UpFiles(2), UpFail(2), DnK(4), DnFiles(2), DnFail(2), Mins(4)
    const currentCalls = buffer.readUInt16BE(dailyOffset + 4);
    buffer.writeUInt16BE(currentCalls + 1, dailyOffset + 4);

    const currentUpK = buffer.readUInt32BE(dailyOffset + 6);
    buffer.writeUInt32BE(currentUpK + Math.round(uploadBytes / 1024), dailyOffset + 6);

    const currentUpFiles = buffer.readUInt16BE(dailyOffset + 10);
    buffer.writeUInt16BE(currentUpFiles + uploadFiles, dailyOffset + 10);

    const currentDnK = buffer.readUInt32BE(dailyOffset + 14);
    buffer.writeUInt32BE(currentDnK + Math.round(downloadBytes / 1024), dailyOffset + 14);

    const currentDnFiles = buffer.readUInt16BE(dailyOffset + 18);
    buffer.writeUInt16BE(currentDnFiles + downloadFiles, dailyOffset + 18);

    // Mins
    const minsUsed = parseInt(durationStr.split(':')[0]) * 60 + parseInt(durationStr.split(':')[1]);
    const currentMins = buffer.readUInt32BE(dailyOffset + 22);
    buffer.writeUInt32BE(currentMins + (isNaN(minsUsed) ? 0 : minsUsed), dailyOffset + 22);

    fs.writeFileSync(storePath, buffer);

    if (options.createMiniLog) {
      updateMiniCallersLog(newEntryObj, todayAmiga, storeDate !== todayAmiga, buffer);
    }

  } catch (err) {
console.error('[SamiLog] Update failed:', err);
  }
}

function updateMiniCallersLog(entry: any, todayAmiga: number, isNewDay: boolean, storeBuffer: Buffer): void {
  const miniLogPath = path.join(DATA_DIR, 'Mini_Callerslog');
  let output = '';

  if (isNewDay) {
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const date = new Date(AMIGA_EPOCH + todayAmiga * 24 * 60 * 60 * 1000);
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' }); 
    const dd = date.getDate().toString().padStart(2, '0');
    const mmm = months[date.getMonth()];
    const yy = date.getFullYear().toString().slice(-2);
    const dateStr = `${dd}-${mmm}-${yy}`; 

    output += '----------------------------------------------------------------------------\n';
    output += `)=-{ SuperAmiLog MiniCallerslog }-------------------{ ${dayName} }-{ ${dateStr} }-=( \n`;
    output += '----------------------------------------------------------------------------\n';
  }

  const baud = formatBaud(entry.baud).padStart(4);
  const node = entry.node.padStart(2);
  const name = entry.name.padEnd(17).substring(0, 17);
  const location = entry.location.padEnd(20).substring(0, 20);
  const actions = formatActions(entry.flag1, entry.flag2);
  const duration = entry.usage.trim().padStart(4);
  const upK = formatTraffic(parseInt(entry.upKb)).padStart(4);
  const dnK = formatTraffic(parseInt(entry.dnKb)).padStart(5);
  
  // User Line
  output += `${ANSI_RED}${baud}${node}${ANSI_WHITE} ${ANSI_GREEN}${name}${ANSI_YELLOW}${location}${ANSI_BLUE}${entry.onTime}  ${ANSI_MAGENTA}${actions}${ANSI_CYAN} ${duration} ${ANSI_RED}${upK} ${ANSI_GREEN}${dnK}${ANSI_RESET}\n`;
  
  const plainOutput = output.replace(/\x1b\[[0-9;]*m/g, '');
  fs.appendFileSync(miniLogPath, plainOutput, 'latin1');
}

/**
 * Create SAmiLog.Store file (-C)
 */
export async function clearStore(): Promise<void> {
  try {
    const storePath = getStorePath();
    const buffer = Buffer.alloc(STORE_SIZE_BYTES, 0);
    buffer.write(STORE_VERSION, 0, 'latin1');
    buffer.writeUInt32BE(getDaysSinceAmigaEpoch(), 8); // SX_Clear_Date
    
    // Write default user entries
    for (let i = 0; i < USER_COUNT; i++) {
      const offset = USERS_OFFSET + i * USER_ENTRY_BYTES;
      writeEntry(buffer, offset, DEFAULT_ENTRY as any);
    }
    
    fs.writeFileSync(storePath, buffer);
console.log('[SamiLog] Storage file cleared/created');
  } catch (err) {
console.error('[SamiLog] Failed to clear store:', err);
  }
}

/**
 * Strip Mini_Callerslog to X days (-S)
 */
export async function stripMiniLog(days: number): Promise<void> {
  try {
    const miniLogPath = path.join(DATA_DIR, 'Mini_Callerslog');
    if (!fs.existsSync(miniLogPath)) return;
    
    const content = fs.readFileSync(miniLogPath, 'latin1');
    const lines = content.split('\n');
    
    // Count Date Bars from end
    const dateBarPattern = /^\)=-{ SuperAmiLog MiniCallerslog }---/;
    let dateBarCount = 0;
    let cutoffIndex = -1;
    
    for (let i = lines.length - 1; i >= 0; i--) {
      if (dateBarPattern.test(lines[i])) {
        dateBarCount++;
        if (dateBarCount > days) {
          cutoffIndex = i;
          break;
        }
      }
    }
    
    if (cutoffIndex !== -1) {
      const stripped = lines.slice(cutoffIndex).join('\n');
      fs.writeFileSync(miniLogPath, stripped, 'latin1');
console.log(`[SamiLog] Stripped Mini_Callerslog to ${days} days`);
    }
  } catch (err) {
console.error('[SamiLog] Failed to strip log:', err);
  }
}

/**
 * Create Docs file (-D)
 */
export async function createDocs(filePath: string): Promise<void> {
  try {
    const guidePath = path.join(DATA_DIR, 'Utils', 'samilog', 'SAmiLog.Guide');
    if (fs.existsSync(guidePath)) {
      const content = fs.readFileSync(guidePath, 'latin1');
      fs.writeFileSync(filePath, content, 'latin1');
    } else {
      fs.writeFileSync(filePath, 'SAmiLog Guide not found.', 'latin1');
    }
  } catch (err) {
console.error('[SamiLog] Failed to create docs:', err);
  }
}

const REFRESH_INTERVAL_MS = 60 * 1000;

function getStorePath(): string {
  return path.join(DATA_DIR, 'Utils', 'samilog', 'SAmiLog.Store');
}

function getBaselineCandidates(): string[] {
  return [
    path.join(
      DATA_DIR,
      'Source',
      'Documentation',
      'reference-boardBBS',
      'Utils',
      'samilog',
      'SAmiLog.Store'
    ),
    LEGACY_SAMPLE_PATH
  ];
}

interface BaselineResult {
  buffer: Buffer;
  path: string;
}

function loadBaselineStore(): BaselineResult | null {
  for (const candidate of getBaselineCandidates()) {
    if (fs.existsSync(candidate)) {
      return { buffer: fs.readFileSync(candidate), path: candidate };
    }
  }

console.warn('[SamiLog] Baseline store not found in any known location.');
  return null;
}

function ensureStoreExists(): void {
  const storePath = getStorePath();
  if (fs.existsSync(storePath)) {
    return;
  }

  fs.mkdirSync(path.dirname(storePath), { recursive: true });
  const baseline = loadBaselineStore();
  if (baseline) {
    fs.writeFileSync(storePath, baseline.buffer);
console.log(`[SamiLog] Seeded storage file from ${baseline.path}`);
    return;
  }

  const placeholder = Buffer.alloc(STORE_SIZE_BYTES, 0);
  placeholder.write(STORE_VERSION, 0, 'latin1');
  fs.writeFileSync(storePath, placeholder);
console.warn('[SamiLog] Created blank placeholder store (baseline missing)');
}

function sanitizeString(value: string): string {
  return value.replace(/\r|\n/g, ' ').trim();
}

function writeStringField(buffer: Buffer, offset: number, length: number, value: string) {
  const field = Buffer.alloc(length);
  const text = value.slice(0, Math.max(0, length - 1));
  field.write(text, 0, 'utf-8');
  field.copy(buffer, offset);
}

function writeCharField(buffer: Buffer, offset: number, char: string) {
  buffer.write(char.length > 0 ? char[0] : '\x00', offset, 'ascii');
}

function writeByte(buffer: Buffer, offset: number, value: number) {
  buffer.writeUInt8(value & 0xff, offset);
}

function formatTimeOfDay(timestamp?: number): string {
  if (!timestamp) {
    return '--:--:-- ';
  }

  const date = new Date(timestamp);
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  return `${hours}:${minutes}:${seconds} `;
}

function formatDuration(startTime?: number): string {
  if (!startTime) return '-:-- ';
  const elapsed = Math.max(0, Date.now() - startTime);
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')} `.slice(-5).padStart(5, ' ');
}

function formatCount(value: number): string {
  return value.toString().padStart(5, ' ');
}

function formatKiloBytes(bytes: number, includeNewline: boolean = false): string {
  const kb = Math.floor(bytes / 1024);
  const formatted = kb.toString().padStart(4, ' ');
  return includeNewline ? formatted + '\n' : formatted + ' ';
}

function buildEntry(session?: BBSSession) {
  if (!session) {
    return DEFAULT_ENTRY;
  }

  const user = session.user;
  const connectionStart = session.connectionStart || session.loginTime;
  const name = sanitizeString(user?.username || 'Awaiting Login') || 'Awaiting Login';
  const location = sanitizeString(user?.location || session.connectionHostname || 'Unknown') || 'Unknown';
  const nodeStr = (session.nodeId ?? 0).toString();
  const uploadsBytes = user?.bytesUpload ?? user?.uploadBytes ?? 0;
  const downloadsBytes = user?.bytesDownload ?? user?.downloadBytes ?? 0;
  const uploadsCount = user?.uploads ?? 0;
  const downloadsCount = user?.downloads ?? 0;
  const baud = session.connectionBaud ?? 14400;

  let flag1 = 0;
  if (user?.newUser) {
    flag1 |= 1 << 0; // New caller
  }
  if (session.connectionType === 'web') {
    flag1 |= 1 << 5; // Local call (treat web as local console)
  }

  let flag2 = 0;
  if (uploadsCount > 0 || uploadsBytes > 0) flag2 |= 1 << 0;
  if (downloadsCount > 0 || downloadsBytes > 0) flag2 |= 1 << 2;

  return {
    name,
    location,
    node: nodeStr.slice(-1) || '0',
    usage: formatDuration(connectionStart),
    upKb: formatKiloBytes(uploadsBytes, false),  // No newline for upload KB
    upFiles: formatCount(uploadsCount),
    dnKb: formatKiloBytes(downloadsBytes, true),  // CRITICAL: Newline required for download KB
    dnFiles: formatCount(downloadsCount) + '\n',  // CRITICAL: Newline required for download files
    onTime: formatTimeOfDay(connectionStart),
    offTime: session.state === BBSState.LOGGEDON ? '--:--:-- ' : '--:--:-- ',
    avgCps: '   0 ',
    baud: baud.toString().padStart(5, ' '),  // 5 chars exactly (writeStringField will not add null for baud)
    flag1,
    flag2,
    flag3: 0
  };
}

function writeEntry(buffer: Buffer, offset: number, entry: ReturnType<typeof buildEntry>) {
  let cursor = offset;
  writeStringField(buffer, cursor, 18, entry.name); cursor += 18;
  writeStringField(buffer, cursor, 21, entry.location); cursor += 21;
  writeCharField(buffer, cursor, entry.node); cursor += 1;
  writeStringField(buffer, cursor, 6, entry.usage); cursor += 6;
  writeStringField(buffer, cursor, 6, entry.upKb); cursor += 6;
  writeStringField(buffer, cursor, 6, entry.upFiles); cursor += 6;
  writeStringField(buffer, cursor, 6, entry.dnKb); cursor += 6;
  writeStringField(buffer, cursor, 6, entry.dnFiles); cursor += 6;
  writeStringField(buffer, cursor, 10, entry.onTime); cursor += 10;
  writeStringField(buffer, cursor, 10, entry.offTime); cursor += 10;
  writeStringField(buffer, cursor, 6, entry.avgCps); cursor += 6;
  buffer.write(entry.baud.padEnd(5, ' ').slice(0, 5), cursor, 'latin1'); cursor += 5;
  writeByte(buffer, cursor, entry.flag1); cursor += 1;
  writeByte(buffer, cursor, entry.flag2); cursor += 1;
  writeByte(buffer, cursor, entry.flag3); cursor += 1;
  buffer.fill(0, cursor, cursor + 40);
}

function getDaysSinceAmigaEpoch(): number {
  const diffMs = Date.now() - AMIGA_EPOCH;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

ensureStoreExists();

/**
 * Triggered at startup/login to guarantee the storage file exists.
 * Actual updates are handled by batch scheduler parsing 'typescript:samilog' commands.
 */
export async function triggerSamiLogRefresh(): Promise<void> {
  ensureStoreExists();
}

/**
 * Read a user entry from the SAmiLog.Store buffer
 */
function readEntry(buffer: Buffer, index: number): {
  name: string;
  location: string;
  node: string;
  usage: string;
  upKb: string;
  upFiles: string;
  dnKb: string;
  dnFiles: string;
  onTime: string;
  offTime: string;
  avgCps: string;
  baud: string;
  flag1: number;
  flag2: number;
  isDefault: boolean;
} {
  const offset = USERS_OFFSET + index * USER_ENTRY_BYTES;

  const name = buffer.toString('latin1', offset, offset + 18).replace(/\u0000/g, '').trim();
  const location = buffer.toString('latin1', offset + 18, offset + 39).replace(/\u0000/g, '').trim();
  const node = buffer.toString('latin1', offset + 39, offset + 40).replace(/\u0000/g, '') || '0';
  const usage = buffer.toString('latin1', offset + 40, offset + 46).replace(/\u0000/g, '').trim();
  const upKb = buffer.toString('latin1', offset + 46, offset + 52).replace(/\u0000/g, '').trim();
  const upFiles = buffer.toString('latin1', offset + 52, offset + 58).replace(/\u0000/g, '').trim();
  const dnKb = buffer.toString('latin1', offset + 58, offset + 64).replace(/\u0000|\n/g, '').trim();
  const dnFiles = buffer.toString('latin1', offset + 64, offset + 70).replace(/\u0000|\n/g, '').trim();
  const onTime = buffer.toString('latin1', offset + 70, offset + 80).replace(/\u0000/g, '').trim();
  const offTime = buffer.toString('latin1', offset + 80, offset + 90).replace(/\u0000/g, '').trim();
  const avgCps = buffer.toString('latin1', offset + 90, offset + 96).replace(/\u0000/g, '').trim();
  const baud = buffer.toString('latin1', offset + 96, offset + 101).replace(/\u0000/g, '').trim();
  const flag1 = buffer.readUInt8(offset + 101);
  const flag2 = buffer.readUInt8(offset + 102);

  const isDefault = name === DEFAULT_NAME || name === '[-----USER-----]' || !name;

  return { name, location, node, usage, upKb, upFiles, dnKb, dnFiles, onTime, offTime, avgCps, baud, flag1, flag2, isDefault };
}

/**
 * Read Daily Stats from SAmiLog.Store buffer
 */
function readDailyStats(buffer: Buffer): {
  calls: number;
  yesterdayCalls: number;
  upKBytes: number;
  upFiles: number;
  dnKBytes: number;
  dnFiles: number;
  usedMins: number;
} {
  // Read "Today" stats (first entry in daily array)
  // Offset = VERSION + CLEAR + RESERVED
  const offset = VERSION_LENGTH + CLEAR_DATE_BYTES + RESERVED_BYTES;
  
  // Daily Stats Structure (74 bytes):
  // Date(4), Calls(2), UpK(4), UpFiles(2), UpFail(2), DnK(4), DnFiles(2), DnFail(2), Mins(4)...
  
  const calls = buffer.readUInt16BE(offset + 4);
  const upKBytes = buffer.readUInt32BE(offset + 6);
  const upFiles = buffer.readUInt16BE(offset + 10);
  const dnKBytes = buffer.readUInt32BE(offset + 14);
  const dnFiles = buffer.readUInt16BE(offset + 18);
  const usedMins = buffer.readUInt32BE(offset + 22);

  // Read "Yesterday" stats (second entry, index 1)
  // Offset + 74 bytes
  const yesterdayOffset = offset + DAILY_ENTRY_BYTES;
  const yesterdayCalls = buffer.readUInt16BE(yesterdayOffset + 4);

  return { calls, yesterdayCalls, upKBytes, upFiles, dnKBytes, dnFiles, usedMins };
}

/**
 * THE RECORDS, as SAmiLog v2 stores them (DOCS/Storage.DOC, the v002 layout
 * this file carries - `*SALv002`): each value followed by the day it was set,
 * a longword of days since 1978. Words for counts, longwords for kilobytes
 * and minutes, 78 bytes of records and 40 reserved.
 *
 * The port read and wrote its own shape instead - a date first, then every
 * value as a longword - so the board's real records (275 calls, 3745
 * downloads, 21 GB uploaded, set on the Amiga between 2021 and 2025) read
 * back as noise and the records line showed 9999 calls and zero downloads
 * (sysop's board, 2026-09-28). `daily` is the same field's offset in a day's
 * stats (SD_*), which a finished day is compared by.
 */
const RECORD_FIELDS = [
  { key: 'calls', size: 2, daily: 4 },
  { key: 'upKBytes', size: 4, daily: 6 },
  { key: 'upFiles', size: 2, daily: 10 },
  { key: 'upFails', size: 2, daily: 12 },
  { key: 'dnKBytes', size: 4, daily: 14 },
  { key: 'dnFiles', size: 2, daily: 18 },
  { key: 'dnFails', size: 2, daily: 20 },
  { key: 'usedMins', size: 4, daily: 22 },
  { key: 'newUsers', size: 2, daily: 26 },
  { key: 'hacks', size: 2, daily: 28 },
  { key: 'drops', size: 2, daily: 30 },
  { key: 'pages', size: 2, daily: 32 },
] as const;

type RecordKey = typeof RECORD_FIELDS[number]['key'];

/** Where each record's value and its date sit, from RECORDS_OFFSET. */
const RECORD_AT: Record<RecordKey, { value: number; date: number; size: 2 | 4; daily: number }> = (() => {
  const at = {} as Record<RecordKey, { value: number; date: number; size: 2 | 4; daily: number }>;
  let offset = 0;
  for (const f of RECORD_FIELDS) {
    at[f.key] = { value: offset, date: offset + f.size, size: f.size, daily: f.daily };
    offset += f.size + 4;
  }
  return at;
})();

function readUnsigned(buffer: Buffer, offset: number, size: 2 | 4): number {
  return size === 2 ? buffer.readUInt16BE(offset) : buffer.readUInt32BE(offset);
}

function writeUnsigned(buffer: Buffer, offset: number, size: 2 | 4, value: number): void {
  const max = size === 2 ? 0xffff : 0xffffffff;
  const clamped = Math.max(0, Math.min(max, Math.floor(value)));
  if (size === 2) buffer.writeUInt16BE(clamped, offset);
  else buffer.writeUInt32BE(clamped, offset);
}

/** A record's value and the day (days since 1978) it was set. */
function readRecord(buffer: Buffer, key: RecordKey): { value: number; date: number } {
  const at = RECORD_AT[key];
  return {
    value: readUnsigned(buffer, RECORDS_OFFSET + at.value, at.size),
    date: buffer.readUInt32BE(RECORDS_OFFSET + at.date),
  };
}

/**
 * A finished day breaks the records it beat (Command_U, "Update Records -
 * Check if any were broken"): value and that day's date. Run when the day
 * rolls over, on the day that just ended - never on today's running totals,
 * so a record is a whole day's figure, as SAmiLog keeps it.
 */
function breakRecords(buffer: Buffer, dayOffset: number): void {
  const dayDate = buffer.readUInt32BE(dayOffset);
  if (dayDate === 0) return; // a fresh file has no finished day
  for (const f of RECORD_FIELDS) {
    const at = RECORD_AT[f.key];
    const day = readUnsigned(buffer, dayOffset + at.daily, at.size);
    if (day > readUnsigned(buffer, RECORDS_OFFSET + at.value, at.size)) {
      writeUnsigned(buffer, RECORDS_OFFSET + at.value, at.size, day);
      buffer.writeUInt32BE(dayDate, RECORDS_OFFSET + at.date);
    }
  }
}

/**
 * Read Records (All-time stats) from SAmiLog.Store buffer
 */
function readRecords(buffer: Buffer): {
  calls: number;
  upKBytes: number;
  upFiles: number;
  dnKBytes: number;
  dnFiles: number;
  usedMins: number;
} {
  return {
    calls: readRecord(buffer, 'calls').value,
    upKBytes: readRecord(buffer, 'upKBytes').value,
    upFiles: readRecord(buffer, 'upFiles').value,
    dnKBytes: readRecord(buffer, 'dnKBytes').value,
    dnFiles: readRecord(buffer, 'dnFiles').value,
    usedMins: readRecord(buffer, 'usedMins').value,
  };
}

function formatBaud(baudStr: string): string {
  const baud = parseInt(baudStr.trim(), 10);
  if (isNaN(baud)) return '-----';
  if (baud >= 1000) {
    // 19200 -> 19.2
    return (baud / 1000).toFixed(1);
  }
  return baud.toString();
}

function formatTraffic(kbytes: number, useMbForRecords: boolean = false): string {
  if (kbytes === 0) return useMbForRecords ? '0mb' : '   0';
  
  if (useMbForRecords) {
    // Records line uses 'mb' suffix
    const mb = Math.floor(kbytes / 1024);
    return `${mb}mb`;
  }

  // Standard column format (Up-K / Dn-K)
  if (kbytes > 9999) {
    return Math.floor(kbytes / 1024) + 'mb';
  }
  return kbytes.toString();
}

function formatActions(flag1: number, flag2: number): string {
  // Action string format: [HCPDUS]
  // Matches Reference: H=Pos1, C=Pos2, P=Pos3, D=Pos4, U=Pos5, S=Pos6
  
  // Pos 1: Hack (Flag1 Bit 1)
  const h = (flag1 & (1 << 1)) ? 'H' : '-';
  
  // Pos 2: Carrier (Flag1 Bit 2)
  const c = (flag1 & (1 << 2)) ? 'C' : '-';
  
  // Pos 3: Page (Flag1 Bit 3)
  const p = (flag1 & (1 << 3)) ? 'P' : '-';
  
  // Pos 4: Download (Flag2 Bit 2=Down, Bit 3=Fail)
  // Logic: If Fail -> 'd', Else If Down -> 'D', Else '-'
  let d = '-';
  if (flag2 & (1 << 3)) d = 'd';
  else if (flag2 & (1 << 2)) d = 'D';
  
  // Pos 5: Upload (Flag2 Bit 0=Up, Bit 1=Fail)
  // Logic: If Fail -> 'u', Else If Up -> 'U', Else '-'
  let u = '-';
  if (flag2 & (1 << 1)) u = 'u';
  else if (flag2 & (1 << 0)) u = 'U';

  // Pos 6: Sysop (Flag1 Bit 4)
  const s = (flag1 & (1 << 4)) ? 'S' : '-';
  
  // Use parentheses instead of brackets to avoid [H being interpreted as ANSI cursor home
  return `(${h}${c}${p}${d}${u}${s})`;
}

function formatDurationHMM(usageStr: string): string {
  // usageStr is "H:MM "
  const parts = usageStr.trim().split(':');
  if (parts.length >= 2) {
    return parts[0] + ':' + parts[1];
  }
  return usageStr.trim();
}

function getRandomLine(): string {
  try {
    const linesPath = path.join(DATA_DIR, 'Utils', 'samilog', 'samilog.lines');
    if (fs.existsSync(linesPath)) {
      const content = fs.readFileSync(linesPath, 'latin1');
      const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
      if (lines.length > 0) {
        return lines[Math.floor(Math.random() * lines.length)];
      }
    }
  } catch (e) {
    // ignore
  }
  return 'Super-AmiLog TypeScript Port';
}

/**
 * Generate a formatted Last Callers bulletin from SAmiLog.Store
 */
export function generateBulletin(limit: number = 20, options: OutputOptions = {}): string {
  try {
    const storePath = getStorePath();
    if (!fs.existsSync(storePath)) {
      return 'No callers logged yet.\n';
    }

    const buffer = fs.readFileSync(storePath);
    if (buffer.length < USERS_OFFSET + TOTAL_USER_BYTES) {
      return 'No callers logged yet.\n';
    }

    // Read templates unless Option T (No Texts) is used
    const utilsDir = path.join(DATA_DIR, 'Utils', 'samilog');
    let header = options.noTexts ? '' : '';
    let tailer = options.noTexts ? '' : '';
    
    if (!options.noTexts) {
      try {
        const suffix = options.noAnsi ? '' : '.gr';
        const headerGr = path.join(utilsDir, `samilog.header.txt${suffix}`);
        const headerTxt = path.join(utilsDir, 'samilog.header.txt');
        if (fs.existsSync(headerGr)) {
          header = fs.readFileSync(headerGr, 'latin1');
        } else if (fs.existsSync(headerTxt)) {
          header = fs.readFileSync(headerTxt, 'latin1');
        }

        const tailerGr = path.join(utilsDir, `samilog.tailer.txt${suffix}`);
        const tailerTxt = path.join(utilsDir, 'samilog.tailer.txt');
        if (fs.existsSync(tailerGr)) {
          tailer = fs.readFileSync(tailerGr, 'latin1');
        } else if (fs.existsSync(tailerTxt)) {
          tailer = fs.readFileSync(tailerTxt, 'latin1');
        }
      } catch (e) {
console.warn('[SamiLog] Failed to read templates:', e);
      }
    }

    // Default clear screen if no header found and not noTexts
    if (!header && !options.noTexts) header = '\x0c';

    // Read entries
    const entries: ReturnType<typeof readEntry>[] = [];
    for (let i = 0; i < USER_COUNT && entries.length < limit; i++) {
      const entry = readEntry(buffer, i);
      if (!entry.isDefault) {
        entries.push(entry);
      }
    }

    /*
     * 1. Header (ASCII Art), AND THE NEWLINE IT MAY NOT CARRY.
     *
     * `Utils/samilog/samilog.header.txt.gr` on the live board ends
     * `...________/   \x1b[0m` with no newline after it, so the credits line
     * was written onto the END of the art's last row: 80 columns of art plus
     * 76 of credits made one 156-column row, which a telnet caller's 80-column
     * screen wrapped, and every row under it came out one line low (sysop,
     * 2026-09-22: "one line is to long and the first line is offset").
     *
     * The art is the sysop's and a trailing newline is not something a drawing
     * program promises. The JOIN is this tool's, so the tool makes it.
     */
    let output = header;
    if (output.length > 0 && !output.endsWith('\n')) output += '\n';

    // 2. Credits Line (with optional ANSI)
    const creditsLine = ` Super-AmiLog by P0T-NOoDLE of ANTHROX                    (C)1993 Gods'Gift `;
    if (options.noAnsi) {
      output += creditsLine + '\n\n';
    } else {
      output += `${ANSI_YELLOW_UL}${' '.repeat(76)}${ANSI_RESET}\n`;
      output += `${ANSI_BLUE_BG_YELLOW_UL}${creditsLine}${ANSI_RESET}\n\n`;
    }

    // 3. Column Headers
    output += 'Baud N Name             Group / Location    On-Time  Actions  H:MM Up-K Dn-K\n';
    if (options.noAnsi) {
      output += '-'.repeat(76) + '\n';
    } else {
      output += `${ANSI_BLUE}${'-'.repeat(76)}${ANSI_RESET}\n`;
    }

    // 4. Entries
    for (const e of entries) {
      // Option F: Full Nodes
      let col1, col2;
      if (options.fullNodes) {
        col1 = `Node ${e.node}`.padEnd(7);
        col2 = '';
      } else {
        col1 = formatBaud(e.baud).padStart(4);
        col2 = e.node.padStart(2);
      }

      const name = e.name.padEnd(17).substring(0, 17);
      // Escape brackets in location to avoid ANSI sequence conflicts (e.g., [33m[d gets parsed as escape)
      const escapedLocation = e.location.replace(/\[/g, '(').replace(/\]/g, ')');
      const location = escapedLocation.padEnd(20).substring(0, 20);
      
      // Option L: Logoff Times
      const time = (options.logoffTimes ? e.offTime : e.onTime).trim().padEnd(8);
      
      const actions = formatActions(e.flag1, e.flag2);
      const duration = formatDurationHMM(e.usage).padStart(4);
      
      // Option S: Show Files
      // Column widths: Up-K = 4 chars, Dn-K = 4 chars (no trailing space on last column)
      let upStat, dnStat;
      if (options.showFiles) {
        upStat = e.upFiles.trim().padStart(4);
        dnStat = e.dnFiles.trim().padStart(4);
      } else {
        const upKbNum = parseInt(e.upKb.trim()) || 0;
        const dnKbNum = parseInt(e.dnKb.trim()) || 0;
        upStat = formatTraffic(upKbNum).padStart(4);
        dnStat = formatTraffic(dnKbNum).padStart(4);
      }

      // Column format: time(8) + 1space + actions(8) + 1space + duration(4) + 1space + up(4) + 1space + dn(4) = 76
      // Note: Header "On-Time" is 7 chars + 2 spaces = 9, so data time(8) + 1 space = 9 to align
      if (options.noAnsi) {
        output += `${col1}${col2} ${name}${location}${time} ${actions} ${duration} ${upStat} ${dnStat}\n`;
      } else {
        output += `${ANSI_RED}${col1}${col2}${ANSI_WHITE} ${ANSI_GREEN}${name}${ANSI_YELLOW}${location}${ANSI_BLUE}${time} ${ANSI_MAGENTA}${actions}${ANSI_CYAN} ${duration} ${ANSI_RED}${upStat} ${ANSI_GREEN}${dnStat}${ANSI_RESET}\n`;
      }
    }

    if (options.noAnsi) {
      output += '-'.repeat(76) + '\n';
    } else {
      output += `${ANSI_BLUE}${'-'.repeat(76)}${ANSI_RESET}\n`;
    }
    
    // 5. Random Line
    const randomLine = getRandomLine();
    const padding = Math.max(0, Math.floor((76 - randomLine.length) / 2));
    if (options.noAnsi) {
      output += ' '.repeat(padding) + randomLine + '\n';
    } else {
      output += ' '.repeat(padding) + ANSI_BLUE_BG_YELLOW_UL + randomLine + ANSI_RESET + ' '.repeat(padding) + '\n';
    }
    
    // 6. Version
    output += '                                                                      v2.00 \n';

    // 7. Stats Bars - Original format is 76 chars:
    // " Calls: 0000 / Y'day: 0000 | U: 0000 / 00000k | D: 0000 / 00000k | Hrs: 000 "
    const daily = readDailyStats(buffer);
    const records = readRecords(buffer);

    // Format KB values with fixed 5-digit width (max 99999k = 97MB)
    const formatKb5 = (kb: number): string => Math.min(kb, 99999).toString().padStart(5);

    let bar1 = ` Calls: ${Math.min(daily.calls, 9999).toString().padStart(4)} / Y'day: ${Math.min(daily.yesterdayCalls, 9999).toString().padStart(4)} | U: ${Math.min(daily.upFiles, 9999).toString().padStart(4)} / ${formatKb5(daily.upKBytes)}k | D: ${Math.min(daily.dnFiles, 9999).toString().padStart(4)} / ${formatKb5(daily.dnKBytes)}k | Hrs: ${Math.min(Math.floor(daily.usedMins/60), 999).toString().padStart(3)} `;
    if (options.noAnsi) bar1 = bar1.replace(/\|/g, '-');
    output += bar1 + '\n';

    if (!options.noRecords) {
      // Records line is slightly different format, also 76 chars:
      // " The Records - Calls: 0000 | U: 0000 / 00000k | D: 0000 / 00000k | Hrs: 000 "
      let bar2 = ` The Records - Calls: ${Math.min(records.calls, 9999).toString().padStart(4)} | U: ${Math.min(records.upFiles, 9999).toString().padStart(4)} / ${formatKb5(records.upKBytes)}k | D: ${Math.min(records.dnFiles, 9999).toString().padStart(4)} / ${formatKb5(records.dnKBytes)}k | Hrs: ${Math.min(Math.floor(records.usedMins/60), 999).toString().padStart(3)} `;
      if (options.noAnsi) bar2 = bar2.replace(/\|/g, '-');
      output += bar2 + '\n';
    }

    // 8. Tailer
    // The same join, at the other end: a tailer whose art carries no leading
    // newline would otherwise land on the last caller's row.
    if (tailer.length > 0 && !output.endsWith('\n')) output += '\n';
    output += tailer;

    /*
     * Too tall for the glass? List fewer callers and assemble it again.
     *
     * Measured, not calculated: the header and the tailer are files the sysop
     * edits, so their height is only known once they have been read. Every
     * caller is exactly one line, so the overflow IS the number of callers to
     * drop and the second pass lands exactly on the budget - no loop, and
     * `fitRows` is cleared on the way in so it cannot recur.
     *
     * A bulletin that is all furniture still shows one caller; trimming to
     * nothing would leave a Last Callers screen with no callers on it.
     */
    if (options.fitRows && options.fitRows > 0 && entries.length > 1) {
      const floor = Math.max(1, options.minCallers ?? DEFAULT_MIN_CALLERS);
      const overflow = renderedRows(output) - options.fitRows;
      if (overflow > 0 && entries.length > floor) {
        /*
         * One fewer at a time, until it fits or the floor stops it.
         *
         * The first version subtracted the overflow in a single step, on the
         * reasoning that a caller is exactly one row. It is - but the rest of
         * the screen is not fixed: the tailer does not end in a newline, so
         * the row count does not fall by exactly the number of rows removed,
         * and the second pass landed one row over the budget. A screen built
         * to avoid a page break, one row too tall to avoid it.
         *
         * Stepping avoids reasoning about that at all: the loop asks the
         * question the loader asks, and stops when the answer is yes. It runs
         * at most once per caller, at logoff, on a file of twenty entries.
         */
        let count = entries.length;
        while (count > floor) {
          count--;
          const shorter = generateBulletin(count, { ...options, fitRows: undefined });
          if (renderedRows(shorter) <= options.fitRows) return shorter;
        }
        return generateBulletin(floor, { ...options, fitRows: undefined });
      }
    }

    return output;
  } catch (err) {
console.error('[SamiLog] Error generating bulletin:', err);
    return 'Error reading caller data.\n';
  }
}

function formatDateAmiga(amigaDays: number): string {
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const date = new Date(AMIGA_EPOCH + amigaDays * 24 * 60 * 60 * 1000);
  const dd = date.getDate().toString().padStart(2, '0');
  const mmm = months[date.getMonth()];
  const yy = date.getFullYear().toString().slice(-2);
  return `${dd}-${mmm}-${yy}`;
}

/**
 * Generate Weekly Stats table (-W)
 */
export function generateWeeklyStats(options: OutputOptions = {}): string {
  try {
    const storePath = getStorePath();
    const buffer = fs.readFileSync(storePath);
    
    let output = options.noAnsi ? '' : '\x0c';
    output += 'S-AmiLog: The Best Looking & Fastest Multi-Node Last Callers Util For /X\n';
    output += '-'.repeat(76) + '\n';
    output += '    Day  Calls  News Hacks Drops Pages  Hrs  Uplds UpBytes  Dnlds DnBytes\n';
    output += '-'.repeat(76) + '\n';

    const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    let totCalls=0, totNews=0, totHacks=0, totDrops=0, totPages=0, totMins=0, totUpF=0, totUpB=0, totDnF=0, totDnB=0;

    for (let i = 0; i < 7; i++) {
      const off = VERSION_LENGTH + CLEAR_DATE_BYTES + RESERVED_BYTES + i * DAILY_ENTRY_BYTES;
      const date = buffer.readUInt32BE(off);
      if (date === 0) continue;
      
      const dayName = days[new Date(AMIGA_EPOCH + date * 24 * 60 * 60 * 1000).getDay()];
      const calls = buffer.readUInt16BE(off + 4);
      const upK = buffer.readUInt32BE(off + 6);
      const upF = buffer.readUInt16BE(off + 10);
      const dnK = buffer.readUInt32BE(off + 14);
      const dnF = buffer.readUInt16BE(off + 18);
      const mins = buffer.readUInt32BE(off + 22);
      const news = buffer.readUInt16BE(off + 26);
      const hacks = buffer.readUInt16BE(off + 28);
      const drops = buffer.readUInt16BE(off + 30);
      const pages = buffer.readUInt16BE(off + 32);

      totCalls+=calls; totNews+=news; totHacks+=hacks; totDrops+=drops; totPages+=pages;
      totMins+=mins; totUpF+=upF; totUpB+=upK; totDnF+=dnF; totDnB+=dnK;

      const line = `    ${dayName} ${calls.toString().padStart(6)} ${news.toString().padStart(5)} ${hacks.toString().padStart(5)} ${drops.toString().padStart(5)} ${pages.toString().padStart(5)} ${Math.floor(mins/60).toString().padStart(4)} ${upF.toString().padStart(6)} ${formatTraffic(upK).padStart(7)} ${dnF.toString().padStart(6)} ${formatTraffic(dnK).padStart(7)}\n`;
      output += options.noAnsi ? line : `${ANSI_GREEN}${line}${ANSI_RESET}`;
    }

    output += '-'.repeat(76) + '\n';
    const totalLine = `   TOTAL ${totCalls.toString().padStart(6)} ${totNews.toString().padStart(5)} ${totHacks.toString().padStart(5)} ${totDrops.toString().padStart(5)} ${totPages.toString().padStart(5)} ${Math.floor(totMins/60).toString().padStart(4)} ${totUpF.toString().padStart(6)} ${formatTraffic(totUpB).padStart(7)} ${totDnF.toString().padStart(6)} ${formatTraffic(totDnB).padStart(7)}\n`;
    output += options.noAnsi ? totalLine : `${ANSI_YELLOW}${totalLine}${ANSI_RESET}`;
    
    return output;
  } catch (err) {
    return 'Error generating weekly stats.\n';
  }
}

/**
 * Generate Record Stats table (-R)
 */
export function generateRecordStats(options: OutputOptions = {}): string {
  try {
    const storePath = getStorePath();
    const buffer = fs.readFileSync(storePath);

    let output = options.noAnsi ? '' : '\x0c';
    output += '  Area       Record   Date\n';
    output += '-'.repeat(30) + '\n';

    const fields: Array<{ label: string; key: RecordKey; traffic?: boolean; hrs?: boolean }> = [
      { label: 'Calls', key: 'calls' },
      { label: 'Up Bytes', key: 'upKBytes', traffic: true },
      { label: 'Up Files', key: 'upFiles' },
      { label: 'Dn Bytes', key: 'dnKBytes', traffic: true },
      { label: 'Dn Files', key: 'dnFiles' },
      { label: 'Hours Used', key: 'usedMins', hrs: true },
      { label: 'New Users', key: 'newUsers' },
      { label: 'Hacks', key: 'hacks' },
      { label: 'Drops', key: 'drops' },
      { label: 'Pages', key: 'pages' },
    ];

    fields.forEach(f => {
      const { value: val, date } = readRecord(buffer, f.key);
      let valStr = val.toString();
      if (f.traffic) valStr = formatTraffic(val, true);
      if (f.hrs) valStr = Math.floor(val/60).toString();

      const line = `${f.label.padEnd(12)} ${valStr.padStart(8)}   ${formatDateAmiga(date)}\n`;
      output += options.noAnsi ? line : `${ANSI_CYAN}${line}${ANSI_RESET}`;
    });

    return output;
  } catch (err) {
    return 'Error generating record stats.\n';
  }
}

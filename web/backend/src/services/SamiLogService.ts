import * as fs from 'fs';
import * as path from 'path';

import { config } from '../config';
import { BBSState } from '../constants/bbs-states';
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
const CALLS_COUNT_OFFSET = RECORDS_OFFSET;
const CALLS_DATE_OFFSET = CALLS_COUNT_OFFSET + 2;

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
  writeStringField(buffer, cursor, 5, entry.baud); cursor += 5;
  writeByte(buffer, cursor, entry.flag1); cursor += 1;
  writeByte(buffer, cursor, entry.flag2); cursor += 1;
  writeByte(buffer, cursor, entry.flag3); cursor += 1;
  buffer.fill(0, cursor, cursor + 40);
}

function countNonDefaultEntries(buffer: Buffer): number {
  let count = 0;
  for (let i = 0; i < USER_COUNT; i++) {
    const entryOffset = USERS_OFFSET + i * USER_ENTRY_BYTES;
    const name = buffer
      .toString('ascii', entryOffset, entryOffset + 18)
      .replace(/\u0000/g, '')
      .trim();
    if (name && name !== DEFAULT_NAME) {
      count++;
    }
  }
  return count;
}

function getDaysSinceAmigaEpoch(): number {
  const diffMs = Date.now() - AMIGA_EPOCH;
  return Math.floor(diffMs / (24 * 60 * 60 * 1000));
}

export async function refreshSamiLogStore(activeSessions: BBSSession[]): Promise<void> {
  try {
    ensureStoreExists();

    const storePath = getStorePath();
    let buffer: Buffer;
    if (!fs.existsSync(storePath)) {
      const baseline = loadBaselineStore();
      if (!baseline) {
        console.warn('[SamiLog] Storage file not found and no baseline available:', storePath);
        return;
      }
      buffer = Buffer.from(baseline.buffer);
      fs.writeFileSync(storePath, buffer);
      console.log(`[SamiLog] Seeded storage file from ${baseline.path}`);
    } else {
      buffer = fs.readFileSync(storePath);
      if (countNonDefaultEntries(buffer) === 0) {
        const baseline = loadBaselineStore();
        if (baseline) {
          buffer = Buffer.from(baseline.buffer);
          console.log('[SamiLog] Store empty, reloaded baseline contents');
        }
      }
    }

    console.log(`[SamiLog] Refreshing store with ${activeSessions.length} session(s)`);

    if (buffer.length < USERS_OFFSET + TOTAL_USER_BYTES) {
      console.warn('[SamiLog] Storage file is smaller than expected, skipping update');
      return;
    }

    const sortedSessions = activeSessions
      .filter(session => !!session)
      .sort((a, b) => (a.nodeId || 0) - (b.nodeId || 0))
      .slice(0, USER_COUNT);

    sortedSessions.forEach((session, index) => {
      const entry = buildEntry(session);
      const entryOffset = USERS_OFFSET + index * USER_ENTRY_BYTES;
      writeEntry(buffer, entryOffset, entry);
      if (index === 0) {
        console.log(`[SamiLog] Entry #1 -> name="${entry.name}" node=${entry.node} usage=${entry.usage}`);
      }
    });

    const totalEntries = countNonDefaultEntries(buffer);
    buffer.writeUInt16BE(totalEntries, CALLS_COUNT_OFFSET);
    buffer.writeUInt32BE(getDaysSinceAmigaEpoch(), CALLS_DATE_OFFSET);

    fs.writeFileSync(storePath, buffer);
    console.log('[SamiLog] Storage file updated');
  } catch (error) {
    console.error('[SamiLog] Failed to prepare SAmiLog.Store:', error);
  }
}

ensureStoreExists();

/**
 * Triggered at startup/login to guarantee the storage file exists.
 * Actual updates are handled by the 68K SAmiLog binary via SamiLogRunner.
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

  const isDefault = name === DEFAULT_NAME || name === '[-----USER-----]' || !name;

  return { name, location, node, usage, upKb, upFiles, dnKb, dnFiles, onTime, offTime, avgCps, baud, isDefault };
}

/**
 * Generate a formatted Last Callers bulletin from SAmiLog.Store
 *
 * Output format matches original SAmiLog design file output:
 * - Header with column labels
 * - Each caller on one line with stats
 *
 * @param limit Maximum number of entries to include (default 20)
 * @returns Formatted bulletin string
 */
export function generateBulletin(limit: number = 20): string {
  try {
    const storePath = getStorePath();

    if (!fs.existsSync(storePath)) {
      console.log('[SamiLog] Store not found, returning empty bulletin');
      return 'No callers logged yet.\r\n';
    }

    const buffer = fs.readFileSync(storePath);

    if (buffer.length < USERS_OFFSET + TOTAL_USER_BYTES) {
      console.warn('[SamiLog] Store file too small');
      return 'No callers logged yet.\r\n';
    }

    // Read all entries and filter out defaults
    const entries: ReturnType<typeof readEntry>[] = [];
    for (let i = 0; i < USER_COUNT && entries.length < limit; i++) {
      const entry = readEntry(buffer, i);
      if (!entry.isDefault) {
        entries.push(entry);
      }
    }

    if (entries.length === 0) {
      return 'No callers logged yet.\r\n';
    }

    // Build formatted output
    // Header matching SAmiLog style
    const header =
      'Last Callers\r\n' +
      '============\r\n' +
      'Name              Location              Node Time   Up KB  Dn KB  On Time   Baud\r\n' +
      '----------------- --------------------- ---- ------ ------ ------ --------- -----\r\n';

    const lines = entries.map(e => {
      const name = e.name.substring(0, 17).padEnd(17);
      const location = e.location.substring(0, 21).padEnd(21);
      const node = e.node.padStart(4);
      const usage = e.usage.padStart(6);
      const upKb = e.upKb.padStart(6);
      const dnKb = e.dnKb.padStart(6);
      const onTime = e.onTime.padStart(9);
      const baud = e.baud.padStart(5);
      return `${name} ${location} ${node} ${usage} ${upKb} ${dnKb} ${onTime} ${baud}`;
    });

    return header + lines.join('\r\n') + '\r\n';
  } catch (err) {
    console.error('[SamiLog] Error generating bulletin:', err);
    return 'Error reading caller data.\r\n';
  }
}

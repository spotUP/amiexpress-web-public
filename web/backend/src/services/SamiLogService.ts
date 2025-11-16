import * as fs from 'fs';
import * as path from 'path';

import type { BBSSession } from '../index';
import { BBSState } from '../constants/bbs-states';
import { config } from '../config';

const STORE_VERSION = '*SALv002';
const VERSION_LENGTH = Buffer.byteLength(STORE_VERSION); // 8
const CLEAR_DATE_BYTES = 4;
const RESERVED_BYTES = 36;
const DAILY_COUNT = 8;
const DAILY_ENTRY_BYTES = 74;
const RECORD_BYTES = 118;
const USER_COUNT = 20;
const USER_ENTRY_BYTES = 144;
const USERS_OFFSET =
  VERSION_LENGTH +
  CLEAR_DATE_BYTES +
  RESERVED_BYTES +
  DAILY_COUNT * DAILY_ENTRY_BYTES +
  RECORD_BYTES;
const TOTAL_USER_BYTES = USER_COUNT * USER_ENTRY_BYTES;

const DEFAULT_ENTRY = {
  name: '[-----USER-----] ',
  location: '[----LOCATION!----] ',
  node: '0',
  usage: '-:-- ',
  upKb: '   0 ',
  upFiles: '   0 ',
  dnKb: '   0',
  dnFiles: '   0',
  onTime: '--:--:-- ',
  offTime: '--:--:-- ',
  avgCps: '   0 ',
  baud: '2400',
  flag1: 0,
  flag2: 0,
  flag3: 0
};

const REFRESH_INTERVAL_MS = 60 * 1000;

function getStorePath(): string {
  const baseDir = config.get('dataDir');
  return path.join(baseDir, 'S', 'SAmiLog.Store');
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

function formatKiloBytes(bytes: number): string {
  const kb = Math.floor(bytes / 1024);
  return kb.toString().padStart(4, ' ').concat(' ');
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
    upKb: formatKiloBytes(uploadsBytes),
    upFiles: formatCount(uploadsCount),
    dnKb: formatKiloBytes(downloadsBytes),
    dnFiles: formatCount(downloadsCount),
    onTime: formatTimeOfDay(connectionStart),
    offTime: session.state === BBSState.LOGGEDON ? '--:--:-- ' : '--:--:-- ',
    avgCps: '   0 ',
    baud: baud.toString().padStart(5, ' '),
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

export async function refreshSamiLogStore(activeSessions: BBSSession[]): Promise<void> {
  try {
    const storePath = getStorePath();
    if (!fs.existsSync(storePath)) {
      console.warn('[SamiLog] Storage file not found:', storePath);
      return;
    }

    console.log(`[SamiLog] Refreshing store with ${activeSessions.length} session(s)`);

    const buffer = fs.readFileSync(storePath);
    if (buffer.length < USERS_OFFSET + TOTAL_USER_BYTES) {
      console.warn('[SamiLog] Storage file is smaller than expected, skipping update');
      return;
    }

    const sortedSessions = activeSessions
      .filter(session => !!session)
      .sort((a, b) => (a.nodeId || 0) - (b.nodeId || 0));

    for (let i = 0; i < USER_COUNT; i++) {
      const entry = buildEntry(sortedSessions[i]);
      const entryOffset = USERS_OFFSET + i * USER_ENTRY_BYTES;
      writeEntry(buffer, entryOffset, entry);
      if (i === 0) {
        console.log(`[SamiLog] Entry #1 -> name="${entry.name}" node=${entry.node} usage=${entry.usage}`);
      }
    }

    fs.writeFileSync(storePath, buffer);
    console.log('[SamiLog] Storage file updated');
  } catch (error) {
    console.error('[SamiLog] Failed to refresh storage file:', error);
  }
}

export async function triggerSamiLogRefresh(): Promise<void> {
  try {
    const { sessions } = require('../server/session-manager');
    const activeSessions: BBSSession[] = Array.from(sessions.values());
    await refreshSamiLogStore(activeSessions);
  } catch (error) {
    console.error('[SamiLog] Unable to trigger refresh:', error);
  }
}

setInterval(() => {
  triggerSamiLogRefresh().catch(error => {
    console.error('[SamiLog] Periodic refresh failed:', error);
  });
}, REFRESH_INTERVAL_MS);

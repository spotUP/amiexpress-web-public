/**
 * The drives a board stores files on, read from Drives.info.
 *
 * DRIVE.n keeps the meaning express.e:17400-17424 gave it - a place with a
 * capacity - and the sub-keys are additive, so a real AmiExpress binary still
 * reads this file. The SECRET is deliberately not here: Drives.info sits under
 * the board root where every door can read it and every backup carries it.
 */
import * as fs from 'fs';
import * as path from 'path';
import { readTooltypeMap } from '../utils/info-file.util';

export type VolumeClass = 'FREE' | 'PAID';
export type EgressPosture = 'FREE' | 'METERED' | '3X';

export interface StorageVolume {
  driveNumber: number;
  kind: 'local' | 's3';
  path: string;
  endpoint?: string;
  region?: string;
  quotaBytes?: number;
  egress: EgressPosture;
  volumeClass: VolumeClass;
  retentionDays?: number;
  keyId?: string;
  /**
   * The provider's monthly request ceiling, from DRIVE.n.REQUESTS - Oracle's
   * free tier caps at 50,000/month, well before its 10 GB does. Undefined
   * means the provider publishes no such cap, which VolumeSet already
   * distinguishes from "has a budget and is over it" (see `isOutOfRequests`).
   */
  requestBudget?: number;
}

/**
 * Whether two volume records name the SAME underlying drive - Task 12
 * review (the carry-forward and rebase follow-ups): used to decide whether
 * it is safe to carry a live counter, an uploaded-size correction, or a
 * cached NameIndex forward across a rebuild. A drive number reused for a
 * genuinely different bucket (a different path or endpoint) must not
 * inherit a stranger's counters, corrections, or cached listing - it must
 * start clean and be re-resolved against the new target.
 */
export function sameVolumeIdentity(a: StorageVolume, b: StorageVolume): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'local') return a.path === b.path;
  return a.path === b.path && a.endpoint === b.endpoint;
}

const UNITS: Record<string, number> = { K: 1024, M: 1024 ** 2, G: 1024 ** 3, T: 1024 ** 4 };

export function parseQuota(text: string): number {
  const match = /^(\d+)([KMGT])?$/i.exec(text.trim());
  if (!match) {
    throw new Error(
      `Unreadable quota "${text}" - expected a number with an optional K, M, G or T suffix`
    );
  }
  const scale = match[2] ? UNITS[match[2].toUpperCase()] : 1;
  return Number(match[1]) * scale;
}

/**
 * `parseQuota` for one drive's line, so the throw names the line to fix.
 *
 * A present-but-EMPTY quota is an error, not "unbounded". The tooltype parser
 * trims, so `DRIVE.2.QUOTA=` and a line of spaces both arrive here as '', and
 * reading that as no-limit is how a metered bucket runs up a bill on a typo.
 * A drive that is genuinely unbounded says so by having no QUOTA key at all.
 */
function parseDriveQuota(driveNumber: number, text: string): number {
  const key = `DRIVE.${driveNumber}.QUOTA`;
  if (text.trim() === '') {
    throw new Error(
      `${key} is present but empty - write a size such as 10G, or delete the line to leave the drive unbounded`
    );
  }
  try {
    return parseQuota(text);
  } catch (err) {
    throw new Error(`${key}: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/**
 * Days a drive keeps a file, from DRIVE.n.RETENTION.
 *
 * `90` and `90D` both mean ninety days. Zero means zero - delete on the sweep -
 * and is NOT the same as an absent key, which means keep for ever; collapsing
 * both to undefined made a deliberate 0 and a typo look identical. Anything
 * else throws naming the line, the same posture QUOTA has.
 */
function parseDriveRetentionDays(driveNumber: number, text: string): number {
  const key = `DRIVE.${driveNumber}.RETENTION`;
  const match = /^(\d+)\s*(?:D|DAYS)?$/i.exec(text.trim());
  if (!match) {
    throw new Error(
      `${key} is unreadable ("${text}") - write a whole number of days, such as 90 or 90D`
    );
  }
  return Number(match[1]);
}

/**
 * `DRIVE.n.REQUESTS`, a whole number of API calls per month. Same posture as
 * QUOTA and RETENTION: present-but-unreadable throws naming the line, rather
 * than silently leaving the ceiling unenforced.
 */
function parseDriveRequestBudget(driveNumber: number, text: string): number {
  const key = `DRIVE.${driveNumber}.REQUESTS`;
  const match = /^(\d+)$/.exec(text.trim());
  if (!match) {
    throw new Error(`${key} is unreadable ("${text}") - write a whole number of requests per month, such as 50000`);
  }
  return Number(match[1]);
}

export function parseVolumes(bbsRoot: string): StorageVolume[] {
  const drivesInfo = path.join(bbsRoot, 'Drives.info');
  if (!fs.existsSync(drivesInfo)) return [];

  const tools = readTooltypeMap(drivesInfo);
  const volumes: StorageVolume[] = [];

  for (let n = 1; n <= 50; n++) {
    const target = tools.get(`DRIVE.${n}`);
    if (!target) break; // A gap ends the list, exactly as freeDiskSpace() does.

    const isS3 = target.toLowerCase().startsWith('s3://');
    const quota = tools.get(`DRIVE.${n}.QUOTA`);
    const egress = tools.get(`DRIVE.${n}.EGRESS`)?.toUpperCase();
    const cls = tools.get(`DRIVE.${n}.CLASS`)?.toUpperCase();
    const retention = tools.get(`DRIVE.${n}.RETENTION`);
    const requests = tools.get(`DRIVE.${n}.REQUESTS`);

    volumes.push({
      driveNumber: n,
      kind: isS3 ? 's3' : 'local',
      path: isS3 ? target.slice('s3://'.length) : target,
      endpoint: tools.get(`DRIVE.${n}.ENDPOINT`),
      region: tools.get(`DRIVE.${n}.REGION`),
      quotaBytes: quota === undefined ? undefined : parseDriveQuota(n, quota),
      // An unmarked bucket is assumed to cost money and meter egress: guessing
      // "free" is the guess that shows up on an invoice.
      egress: egress === 'FREE' || egress === '3X' ? egress : 'METERED',
      volumeClass: cls === 'FREE' ? 'FREE' : 'PAID',
      retentionDays: retention === undefined ? undefined : parseDriveRetentionDays(n, retention),
      keyId: tools.get(`DRIVE.${n}.KEYID`),
      requestBudget: requests === undefined ? undefined : parseDriveRequestBudget(n, requests),
    });
  }

  return volumes;
}

export function readVolumeSecret(bbsRoot: string, driveNumber: number): string | null {
  const fromEnv = process.env[`BBS_STORAGE_${driveNumber}_SECRET`];
  if (fromEnv) return fromEnv;

  const keyPath = path.join(bbsRoot, 'Storage', `${driveNumber}.key`);
  if (!fs.existsSync(keyPath)) return null;
  return fs.readFileSync(keyPath, 'utf8').trim() || null;
}

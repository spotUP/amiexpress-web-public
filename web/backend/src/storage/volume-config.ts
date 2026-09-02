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

    volumes.push({
      driveNumber: n,
      kind: isS3 ? 's3' : 'local',
      path: isS3 ? target.slice('s3://'.length) : target,
      endpoint: tools.get(`DRIVE.${n}.ENDPOINT`),
      region: tools.get(`DRIVE.${n}.REGION`),
      quotaBytes: quota ? parseQuota(quota) : undefined,
      // An unmarked bucket is assumed to cost money and meter egress: guessing
      // "free" is the guess that shows up on an invoice.
      egress: egress === 'FREE' || egress === '3X' ? egress : 'METERED',
      volumeClass: cls === 'FREE' ? 'FREE' : 'PAID',
      retentionDays: retention ? Number(/^\d+/.exec(retention)?.[0] ?? '0') || undefined : undefined,
      keyId: tools.get(`DRIVE.${n}.KEYID`),
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

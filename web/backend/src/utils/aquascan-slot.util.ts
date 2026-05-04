/**
 * AquaScan.UserData per-user slot helper
 *
 * AquaScan stores its per-user "scan since" DateStamp in
 * `Doors/AquaScan/AquaScan.UserData` — 16 bytes per user slot:
 *   offset 0  : ds_Days (UINT32 BE)
 *   offset 4  : ds_Minute (UINT32 BE)
 *   offset 8  : ds_Tick (UINT32 BE)
 *   offset 12 : padding
 *
 * Slot is `(slotNumber - 1) * 16`. AquaScan is a 68K binary that has no
 * Write() LVO call for this file; the BBS owns it. On first login a
 * fresh user has all-zero bytes at their slot, which AquaScan formats as
 * "00:00:00" — that's the user-visible mojibake. seedAquaScanSlot()
 * writes a real DateStamp on first login if the slot is zero, so the
 * very first AquaScan run shows the user's newSinceDate / lastLogin
 * instead of midnight 1978.
 */

import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { dateTimeToDateStamp, getSystemTime } from './date-time.util';

const SLOT_SIZE = 16;

/**
 * Resolve a user's slot number using the same precedence as DT_SLOTNUMBER:
 *   1. session.userSlotNumber (set by door launch)
 *   2. user.slotnumber (DB column, lowercase)
 *   3. user.slotNumber (camelCase alias)
 * Returns 0 if none are set.
 */
export function resolveUserSlot(user: any, sessionSlot?: number | undefined): number {
  if (Number.isFinite(sessionSlot) && (sessionSlot as number) > 0) return sessionSlot as number;
  const fromUser = Number(user?.slotnumber ?? user?.slotNumber ?? 0);
  return Number.isFinite(fromUser) && fromUser > 0 ? fromUser : 0;
}

/**
 * Seed a user's AquaScan.UserData slot if currently zero. Returns the
 * DateStamp written, or null if no seed was needed (slot non-zero) or
 * the file/slot doesn't exist yet.
 *
 * Called on login. Idempotent — only seeds when the slot is zero, so
 * subsequent logins after AquaScan has run are no-ops.
 */
export function seedAquaScanSlot(user: any): { days: number; minutes: number; ticks: number } | null {
  const slotNum = resolveUserSlot(user);
  if (slotNum <= 0) return null;

  const userDataPath = path.join(config.get('dataDir'), 'Doors', 'AquaScan', 'AquaScan.UserData');
  if (!fs.existsSync(userDataPath)) return null;

  const slotOffset = (slotNum - 1) * SLOT_SIZE;
  const stat = fs.statSync(userDataPath);
  if (slotOffset + 12 > stat.size) return null;

  const slotBuf = Buffer.alloc(12);
  const fdRead = fs.openSync(userDataPath, 'r');
  fs.readSync(fdRead, slotBuf, 0, 12, slotOffset);
  fs.closeSync(fdRead);

  const isZero = slotBuf.readUInt32BE(0) === 0 && slotBuf.readUInt32BE(4) === 0;
  if (!isZero) return null;

  const seedDate = user?.newSinceDate || user?.lastLogin || getSystemTime();
  const ds = dateTimeToDateStamp(seedDate);
  const writeBuf = Buffer.alloc(12);
  writeBuf.writeUInt32BE(ds.days, 0);
  writeBuf.writeUInt32BE(ds.minutes, 4);
  writeBuf.writeUInt32BE(ds.ticks, 8);

  const fdWrite = fs.openSync(userDataPath, 'r+');
  fs.writeSync(fdWrite, writeBuf, 0, 12, slotOffset);
  fs.closeSync(fdWrite);

  return ds;
}

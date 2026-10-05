/**
 * Exclusive AmigaDOS-style locks that the board and every emulated door share.
 *
 * WHY THIS EXISTS. express.e guards a message base with an exclusive
 * `Lock(<msgBaseLocation>MailLock, ACCESS_WRITE)` (lockMsgBase,
 * express.e:11944-11964) and `UnLock` (e.g. :11939). The FILE is only the
 * thing being locked: lockMsgBase creates it when it is missing (IoErr 205,
 * createFile :11966-11970), never writes it, and never deletes it. Whether the
 * base is busy is a question about who holds a HANDLE, and AmigaOS drops a
 * handle when its holder goes away - so a killed writer can never leave the
 * base locked.
 *
 * This port used to fake that with a timestamp written into the file. Two
 * writers stamped it on two clocks (the board in UTC milliseconds, the SUBS
 * door in express.e's getSystemTime form, local wall clock + 21600 s), so a
 * lock the door left behind refused every board post in the conference for
 * about eight hours, and the door read a live board lock as eight hours stale
 * and posted over it (thoughts/shared/research/2026-10-04_subs-coexistence-
 * proposal.md, conflict 1).
 *
 * Every node and every emulated door run in this one Node process, so the
 * handle table can be a plain map: the board's writer and the emulator's
 * dos.library `Lock(…, ACCESS_WRITE)` both go through it, and the emulator
 * drops whatever a door still held when the door ends - exactly what AmigaOS
 * does. The file's contents mean nothing to anybody.
 */
import * as fs from 'fs';
import * as path from 'path';

/** Who holds a lock. Any object or string: compared by identity. */
export type LockOwner = unknown;

const held = new Map<string, LockOwner>();

/**
 * One key per file however it was named. AmigaDOS names are case-insensitive
 * (RULES.md 11), and the board and the emulator reach the same MailLock
 * through different roots (config dataDir vs the BBS: assign), so the key is
 * the real path, lower-cased.
 */
export function lockKey(filePath: string): string {
  let resolved = path.resolve(filePath);
  try {
    resolved = fs.realpathSync(resolved);
  } catch {
    // Not there yet: the resolved name is the best key there is.
  }
  return resolved.toLowerCase();
}

/**
 * Take an exclusive lock, or say who has it. `true` when this owner now holds
 * it. A second exclusive lock on the same file is refused even for the same
 * owner, as AmigaOS refuses it (ERROR_OBJECT_IN_USE).
 */
export function tryLockExclusive(filePath: string, owner: LockOwner): boolean {
  const key = lockKey(filePath);
  if (held.has(key)) return false;
  held.set(key, owner);
  return true;
}

/** Release a lock this owner holds. A lock somebody else holds is left alone. */
export function unlockExclusive(filePath: string, owner: LockOwner): void {
  const key = lockKey(filePath);
  if (held.get(key) === owner) held.delete(key);
}

/** Drop everything an owner still holds - a door that ended without UnLock. */
export function releaseAllHeldBy(owner: LockOwner): void {
  for (const [key, who] of held.entries()) {
    if (who === owner) held.delete(key);
  }
}

/** Whether anybody holds the file. */
export function isLockedExclusive(filePath: string): boolean {
  return held.has(lockKey(filePath));
}

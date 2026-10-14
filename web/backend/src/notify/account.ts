/**
 * What a user MAY do, read where the board reads it.
 *
 * AmiExpress keeps accounts on disk (user.data / user.keys), and the SQL users
 * row is a mirror that can lag it (a sysop edits a level in the user editor, a
 * caller is moved to another access area). So "may this person enter this
 * conference" and "is this person a sysop" are answered from the disk record,
 * for an offline user too - never from users.seclevel / users.confaccess.
 *
 * SQL is used for one thing only: the slot number that finds the record. The
 * record must carry the same name, or the slot is stale and the user is
 * treated as unknown (fail closed: no notification is better than one to
 * someone who lost access).
 *
 * Conference access is express.e checkConfAccess (accountHasConfAccess in
 * handlers/message/msg-names.ts) over the record's conferenceAccess, which
 * also resolves an access AREA name (Access/AREA.<name>.info). The sysop test
 * is the socket guard's SYSOP_LEVEL over the record's secStatus. The ACS
 * permission files (Access/ACS.<level>.info, findAcsLevel) grant commands, not
 * conferences or the sysop level, so they play no part here.
 */
import type Database from 'better-sqlite3';
import { SYSOP_LEVEL } from '../server/socket-guard';
import type { DiskAccount } from '../handlers/message/msg-names';

/** The user's disk record, or null when there is none or it is not theirs. */
export function readDiskAccount(db: Database.Database, userId: string): DiskAccount | null {
  const row = db.prepare('SELECT username, slotnumber FROM users WHERE id = ?').get(userId) as { username: string; slotnumber: number | null } | undefined;
  if (!row || !row.slotnumber) return null;
  // Lazy: msg-names pulls in most of the message system.
  const { loadAccount } = require('../handlers/message/msg-names') as typeof import('../handlers/message/msg-names');
  const acct = loadAccount(row.slotnumber);
  if (!acct || acct.keys.userName.trim().toLowerCase() !== row.username.trim().toLowerCase()) return null;
  return acct;
}

/** express.e checkConfAccess for this user, from the disk record. */
export function diskHasConfAccess(db: Database.Database, userId: string, conferenceId: number): boolean {
  const acct = readDiskAccount(db, userId);
  if (!acct) return false;
  const { accountHasConfAccess } = require('../handlers/message/msg-names') as typeof import('../handlers/message/msg-names');
  return accountHasConfAccess(acct, conferenceId);
}

/** The sysop test, from the disk record's security level. */
export function diskIsSysop(db: Database.Database, userId: string): boolean {
  const acct = readDiskAccount(db, userId);
  return !!acct && acct.user.secStatus >= SYSOP_LEVEL;
}

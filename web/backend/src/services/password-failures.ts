/**
 * The account's password-failure counter, for every place a password is
 * checked.
 *
 * express.e:1008-1018 (checkUserPassword): a wrong password bumps
 * userMisc.invalidAttempts and locks the account at MAX_PASSWORD_FAILS; a
 * right one zeroes the count. The counter and the lock are
 * UserDatabaseManager's (user.misc on disk), the limit is the board's
 * MAX_PASSWORD_FAILS tooltype (getMaxPasswordFails). The BBS logon, FTP and
 * both chat logins ask a password, and each one used to carry its own copy of
 * these two calls - or, for chat, none at all, which made /api/chat/login an
 * unmetered place to guess a caller's password that the board's lockout never
 * saw.
 *
 * Neither call may ever break a login: a record that cannot be read or
 * written is logged and the login goes on.
 */
import { userDatabaseManager } from './UserDatabaseManager';
import { getMaxPasswordFails } from './password-policy.util';

/** The account a password was tried against, or nothing (an unknown name). */
type Account = { slotNumber?: number | null } | null | undefined;

function slotOf(account: Account): number | null {
  const slot = account?.slotNumber;
  return typeof slot === 'number' && slot > 0 ? slot : null;
}

/**
 * A wrong password for this account. Returns true when it locked the account.
 * `where` names the logon in the warning ("AUTH", "FTP", "CHAT").
 */
export function countWrongPassword(account: Account, where: string): boolean {
  const slot = slotOf(account);
  if (slot === null) return false;
  try {
    return userDatabaseManager.recordPasswordFailure(slot, getMaxPasswordFails());
  } catch (err) {
    console.warn(`[${where}] Could not record password failure:`, err);
    return false;
  }
}

/** A right password for this account: the count goes back to 0 (express.e:1018). */
export function clearWrongPasswords(account: Account, where: string): void {
  const slot = slotOf(account);
  if (slot === null) return;
  try {
    userDatabaseManager.clearPasswordFailures(slot);
  } catch (err) {
    console.warn(`[${where}] Could not clear password failures:`, err);
  }
}

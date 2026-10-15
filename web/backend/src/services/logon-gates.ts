/**
 * The account gates of a logon: the questions the board asks about an
 * account AFTER its password has been accepted, before it lets the caller on.
 *
 * express.e asks them of every caller (29701 deleted, 29768 secStatus <= 1,
 * 29775 accountLocked, 29785-29845 password expiry / forced reset), and this
 * port answers them in `login-post.service` for web, telnet and SSH. FTP is
 * the fourth way onto the board, and it asked none of them: an account the
 * sysop had deleted, locked or set to level 0 still logged in over FTP with
 * its old password and took files.
 *
 * So the answers live here, once. `login-post.service` asks each one at the
 * point in its flow where express asks it (with its screens, comment door and
 * password-change prompt around them), and FTP - which has no screen to show
 * and no prompt to change a password at - asks `accountRefusal` for the first
 * one that says no.
 *
 * Everything is read off the account's own record on disk (user.data /
 * user.misc), which is the board's truth; the SQL row is a mirror.
 */
import { config } from '../config';
import { getBoardConfig } from './bbs-config-file.service';
import { userDatabaseManager } from './UserDatabaseManager';
import { decodeAmigaDateToUnix } from '../utils/date-time.util';
import { loadAccount } from './load-account';
import type { User } from '../database/types';

/** The fields of a loaded account the gates read. */
export interface GatedAccount {
  slotNumber?: number;
  accountDeleted?: boolean;
  secLevel: number;
}

/** The user.misc lock state (express.e userMisc). */
export interface LogonMisc {
  accountLocked: number;
  forcePwdReset: number;
  pwdLastUpdated: number;
}

export type AccountRefusal =
  | 'lockout'
  | 'deleted-account'
  | 'account-locked'
  | 'password-change-required';

const NO_MISC: LogonMisc = { accountLocked: 0, forcePwdReset: 0, pwdLastUpdated: 0 };

/**
 * express.e:29701 - `IF(loggedOnUser.slotNumber=0)`. DELETE writes the
 * record's slotNumber as 0 (express.e:21365) and leaves the record where it
 * was, so the account still authenticates; this is what refuses it.
 */
export function isAccountDeleted(account: Pick<GatedAccount, 'slotNumber' | 'accountDeleted'>): boolean {
  return !account.slotNumber || account.slotNumber === 0 || account.accountDeleted === true;
}

/**
 * express.e:29768-29773 - `IF (loggedOnUser.secStatus<=1)`: the screen the
 * board shows before hanging up, or null when the level may log on.
 */
export function securityLockoutScreen(secLevel: number): 'LOCKOUT0' | 'LOCKOUT1' | null {
  // `<= 1`, not `> 1` negated: an account with no level read is not locked
  // out, exactly as login-post's `user.secLevel <= 1` answered for it.
  if (!(secLevel <= 1)) return null;
  return secLevel === 0 ? 'LOCKOUT0' : 'LOCKOUT1';
}

/**
 * The account's user.misc lock fields, off the disk. A record that cannot be
 * read has no lock to report - the same answer login-post always gave.
 */
export function readLogonMisc(slotNumber: number | undefined): LogonMisc {
  if (!slotNumber || slotNumber < 1) return NO_MISC;
  try {
    const disk = userDatabaseManager.readUserFromDisk(slotNumber);
    if (!disk) return NO_MISC;
    return {
      accountLocked: disk.misc.accountLocked,
      forcePwdReset: disk.misc.forcePwdReset,
      // Unix seconds here; user.misc holds express.e's getSystemTime() form.
      pwdLastUpdated: decodeAmigaDateToUnix(disk.misc.pwdLastUpdated),
    };
  } catch (err) {
    console.warn(`[LOGIN] Could not read user.misc for slot ${slotNumber}:`, err);
    return NO_MISC;
  }
}

/** `PASSWORD_EXPIRY_DAYS` from the board's config; 0 (never) when unset. */
export function passwordExpiryDays(bbsRoot: string = config.get('dataDir')): number {
  try {
    const sysConf = getBoardConfig(bbsRoot);
    if (sysConf && typeof sysConf.password_expiry_days === 'number') {
      return sysConf.password_expiry_days;
    }
  } catch {
    /* non-fatal: no config is no expiry */
  }
  return 0;
}

/**
 * express.e:29785-29795 - the password has outlived PASSWORD_EXPIRY_DAYS, or
 * the sysop set forcePwdReset.
 */
export function passwordChangeRequired(
  misc: LogonMisc,
  expiryDays: number,
  nowSecs: number = Math.floor(Date.now() / 1000),
): boolean {
  const expired = expiryDays > 0
    && misc.pwdLastUpdated > 0
    && misc.pwdLastUpdated + expiryDays * 86400 < nowSecs;
  return expired || misc.forcePwdReset !== 0;
}

/**
 * The first account gate that refuses this logon, in login-post's order, or
 * null when every gate lets it through. For a transport that can do nothing
 * but say no - FTP has no screen to show and no prompt to change a password
 * at, so a password that must be changed is a refusal there too.
 */
export function accountRefusal(
  account: GatedAccount,
  misc: LogonMisc = readLogonMisc(account.slotNumber),
  expiryDays: number = passwordExpiryDays(),
  nowSecs?: number,
): AccountRefusal | null {
  const standing = standingRefusal(account, misc);
  if (standing !== null) return standing;
  if (passwordChangeRequired(misc, expiryDays, nowSecs)) return 'password-change-required';
  return null;
}

/**
 * The gates that say an account may not be on the board AT ALL - level 0/1,
 * deleted, locked - in login-post's order. The password-change gate is not
 * one of them: it is a prompt at the next logon, not a ban.
 */
export function standingRefusal(
  account: GatedAccount,
  misc: LogonMisc = readLogonMisc(account.slotNumber),
): Exclude<AccountRefusal, 'password-change-required'> | null {
  if (securityLockoutScreen(account.secLevel) !== null) return 'lockout';
  if (isAccountDeleted(account)) return 'deleted-account';
  if (misc.accountLocked) return 'account-locked';
  return null;
}

/**
 * A TOKEN'S CALLER, asked again every time the token is used.
 *
 * A token is minted at a logon that passed every gate, and it outlives that
 * logon by hours (access) or weeks (refresh). An account the sysop deleted,
 * locked or set to level 0 after the token was minted kept every door it
 * opened: the socket connect, the admin API, the refresh that mints the next
 * one. So whatever accepts a token as a caller asks this of the account's
 * record as it is NOW (loadAccount: the disk, over the row).
 *
 * Returns the refusal, or null with the account the token may act as.
 */
export function tokenHolderRefusal(
  row: User,
): { refusal: Exclude<AccountRefusal, 'password-change-required'>; account?: undefined }
  | { refusal: null; account: User } {
  const account = loadAccount(row).user;
  const refusal = standingRefusal(account);
  return refusal === null ? { refusal: null, account } : { refusal };
}

/**
 * THE NODE GATES: the questions a logon asks about the NODE the caller came in
 * on, once he has one. express.e asks both in its BBS logon and in its FTP
 * logon (ftpd's account load runs inside express.e):
 *
 *   reserved node      BBS 29129-29135, FTP 28733-28743
 *   already online     BBS 29715-29727, FTP 28756-28765 (checkUserOnLine(1))
 *
 * login-post asks them for web, telnet and SSH with its screens around them;
 * FTP asks them right after it takes a node and answers 420.
 */

/**
 * express.e:28734 / 29131 - `StriCmp(userName, reservedName)`: a sysop
 * reserved this node (F4, or the admin) and this is not the caller he
 * reserved it for.
 */
export function nodeReservedForAnother(nodeId: number, username: string): boolean {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { isReservationMatch } = require('./node-reservation.service') as typeof import('./node-reservation.service');
  return !isReservationMatch(nodeId, username);
}

/**
 * express.e checkUserOnLine(1): the node this account is already on, other
 * than `exceptNodeId`, or null.
 *
 * Every node the board has, whichever way its caller came in: a BBS node by
 * its `node<n>.user` record with a caller still reachable behind it
 * (userAlreadyOnNode + nodeHasReachableCaller - a record whose caller is gone
 * is a ghost, cleaned up, never a refusal), and an FTP node by the FTP
 * presence list, which holds exactly the FTP sessions that have a node.
 * express.e's checkUserOnLine walks every node's name the same way; an FTP
 * session there IS a node.
 *
 * `socketIsAlive` answers for a web caller's socket (see
 * nodeHasReachableCaller); a caller that has no socket.io namespace to ask
 * passes one that says no, and only web callers are affected by it.
 */
export function accountOnlineElsewhere(
  username: string,
  exceptNodeId: number,
  socketIsAlive: (socketId: string) => boolean,
  bbsRoot: string = config.get('dataDir'),
): number | null {
  /* eslint-disable @typescript-eslint/no-var-requires */
  const { userAlreadyOnNode } = require('./user-already-online') as typeof import('./user-already-online');
  const { nodeHasReachableCaller } = require('../server/session-emitter-registry') as typeof import('../server/session-emitter-registry');
  const { ftpCallersOnline } = require('../ftp/ftp-presence') as typeof import('../ftp/ftp-presence');
  /* eslint-enable @typescript-eslint/no-var-requires */

  const onBbsNode = userAlreadyOnNode(
    bbsRoot,
    username,
    exceptNodeId,
    (nodeId) => nodeHasReachableCaller(nodeId, socketIsAlive),
  );
  if (onBbsNode !== null) return onBbsNode;

  const wanted = String(username ?? '').replace(/\0/g, '').trim().toLowerCase();
  if (wanted === '') return null;
  const onFtp = ftpCallersOnline().find((caller) =>
    caller.nodeId !== exceptNodeId && caller.username.trim().toLowerCase() === wanted);
  return onFtp ? onFtp.nodeId : null;
}

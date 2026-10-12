/**
 * The account of a caller who is on: express.e's loggedOnUser.
 *
 * express.e loads the record off the disk at logon (loadAccount 7977, called
 * at 29664 - services/load-account.ts), changes it IN MEMORY for the whole
 * call - a setting in W, a download, a post, the time used - and writes it to
 * the slot only where it calls saveAccount for it:
 *
 *   - logoff, 8207 (after timeLastOn 8202 and addMsgPointers 8204);
 *   - W, on leaving the menu (25893) and after a new name (25928);
 *   - the end of a new account's questions (30118);
 *   - a refused password (29741).
 *
 * The row in SQL is a mirror of the record. It is written from the record
 * when the record is saved, never the other way round (rowFieldsFromAccount).
 */

import type { User } from '../database/types';
import { db } from '../database';
import { userFileManager } from './UserFileManager';
import { RECORD_FIELDS, changedRecordFields, rowFieldsFromAccount } from './load-account';
import { getSystemTime } from '../utils/date-time.util';

/** The part of a session the account lives on. */
export interface AccountSession {
  user?: User;
  currentConf?: number;
  currentMsgBase?: number;
  /** express.e:136 newSinceFlag - N ran during this call (27902). */
  newSinceFlag?: boolean;
  /** The logoff's saveAccount has run: the account in memory is the sum, not a conference's. */
  accountSavedAtLogoff?: boolean;
}

function isRecordField(field: string): boolean {
  return (RECORD_FIELDS as readonly string[]).includes(field);
}

/**
 * The caller changes his own account during his call. It changes in memory
 * (the session's user), as loggedOnUser does; the record goes to disk at the
 * next saveAccount. What the record does not hold - the password hash, the
 * web preferences - has nowhere else to live than the row, and goes there now.
 */
export async function changeAccount(session: AccountSession, updates: Partial<User>): Promise<void> {
  const user = session.user;
  if (!user) return;
  Object.assign(user, updates);
  const rowOnly: Partial<User> = {};
  for (const [field, value] of Object.entries(updates)) {
    if (!isRecordField(field)) (rowOnly as Record<string, unknown>)[field] = value;
  }
  if (Object.keys(rowOnly).length > 0) {
    await db.updateUser(String(user.id), rowOnly, { syncDisk: false });
  }
}

/**
 * express.e:8025 saveAccount for the caller on this session: his record, as it
 * is in memory, at his slot - then the row copies it.
 */
export async function saveAccount(user: User): Promise<void> {
  const slot = Number(user.slotNumber) || 0;
  if (slot < 1) return;
  // Only the fields the caller changed since the account loaded (against its
  // row merged with the record): the rest of the record is left as it is.
  const row = await db.getUserById(String(user.id));
  userFileManager.updateUserDataFile(changedRecordFields(user, row), slot);
  await db.updateUser(String(user.id), rowFieldsFromAccount(user), { syncDisk: false });
}

/**
 * express.e:8197-8207, the account's part of a logoff:
 *
 *   IF(newSinceFlag) THEN loggedOnUser.newSinceDate:=getSystemTime()   8197
 *   saveMsgPointers(currentConf,currentMsgBase)                        8200
 *   loggedOnUser.timeLastOn:=getSystemTime()                           8202
 *   addMsgPointers()                                                   8204
 *   masterSavePointers(loggedOnUser)                                   8205
 *   saveAccount(loggedOnUser,...)                                      8207
 *
 * The pointers themselves are already in the caller's Conf.DB records (the
 * port writes each one as it moves), so masterSavePointers has nothing left
 * to do. Runs once per session: after addMsgPointers the account in memory
 * holds every conference's sum, and a second saveMsgPointers would write that
 * sum into one conference.
 */
export async function saveAccountAtLogoff(session: AccountSession): Promise<void> {
  const user = session.user;
  if (!user || session.accountSavedAtLogoff) return;
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { saveConferenceAccount, addMsgPointers } = require('../utils/message-pointers.util') as typeof import('../utils/message-pointers.util');

  if (session.newSinceFlag) user.newSinceDate = getSystemTime();
  saveConferenceAccount(session, Number(session.currentConf) || 0);
  user.lastLogin = getSystemTime();
  addMsgPointers(session);
  session.accountSavedAtLogoff = true;
  await saveAccount(user);
}

/**
 * Every node this account is on takes a save of it made elsewhere - the
 * fields saved, nothing else, so what the caller has changed since his logon
 * and not saved yet stays his. express.e copies a door's saved record into
 * loggedOnUser the same way (doorMsgSaveAccount 4587-4591).
 */
export function applyToOnlineAccount(userId: string, fields: Partial<User>): void {
  applyWhere(user => String(user.id) === String(userId), fields);
}

/** applyToOnlineAccount for a save addressed by the record's slot. */
export function applyToOnlineSlot(slot: number, fields: Partial<User>): void {
  applyWhere(user => Number(user.slotNumber) === slot, fields);
}

function applyWhere(match: (user: User) => boolean, fields: Partial<User>): void {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sessions } = require('../server/session-manager') as typeof import('../server/session-manager');
  for (const session of sessions.values()) {
    const user = session.user as User | undefined;
    if (!user || !match(user)) continue;
    Object.assign(user, fields);
  }
}

/**
 * The board is being stopped (a deploy): every caller still on gets his
 * logoff's save, as a node shut down under a caller logs him off first.
 * Synchronous up to the row write, so it is done before the process exits.
 */
export function saveOnlineAccounts(): number {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { sessions } = require('../server/session-manager') as typeof import('../server/session-manager');
  let saved = 0;
  for (const session of sessions.values()) {
    if (!session.user || (session as AccountSession).accountSavedAtLogoff) continue;
    saveAccountAtLogoff(session as AccountSession).catch(err => {
      console.error(`[SHUTDOWN] could not save ${session.user?.username}'s account:`, err);
    });
    saved++;
  }
  return saved;
}

/**
 * loadAccount at logon: the caller's record comes off the DISK.
 *
 * express.e:29664 - `stat:=loadAccount(userNum,loggedOnUser,loggedOnUserKeys,
 * loggedOnUserMisc)` reads user.data / user.keys / user.misc at the slot
 * (loadAccount, express.e:7977-8022), and the session runs on that. Nothing is
 * written back at logon for an existing caller: the record goes back to disk at
 * logoff (express.e:8207), after `timeLastOn:=getSystemTime()` (8202).
 *
 * This port did the reverse. It read the users ROW and wrote it over the slot
 * (login-post.service), so whatever only the disk knew was destroyed on every
 * login: the post count (the table has no column for it), the time used today
 * (the row is only written by the new-day reset), and anything a door's
 * SAVE_ACCOUNT, AREXX or the sysop had changed in the record.
 *
 * What still comes from the row is what genuinely lives there: the id, the
 * password hash, the web-only preferences, and the few user.data fields this
 * port's writer stamped with a constant until now (see KEPT_FROM_ROW), where
 * the disk does not hold the caller's value yet.
 */

import type { User } from '../database/types';
import { userFileManager } from './UserFileManager';

/**
 * The fields loadAccount owns: in user.data / user.keys / user.misc, read by
 * the board as express.e reads them, and written faithfully by the port's
 * writer (UserFileManager.userToFileStruct) so a write and a read return the
 * same value.
 */
const FROM_DISK = [
  'secLevel',
  'uploads',
  'downloads',
  'bytesUpload',
  'bytesDownload',
  'ratio',
  'ratioType',
  'timeTotal',
  'timeLimit',
  'timeUsed',
  'chatLimit',
  'chatUsed',
  'lastLogin',
  'calls',
  'callsToday',
  'messagesPosted',
  'newUser',
  'screenType',
  'protocol',
  'editor',
  'zoomType',
  'autoRejoin',
  'confAccess',
  'uuCP',
  'topUploadCPS',
  'topDownloadCPS',
  'byteLimit',
  'userFlags',
  'accountDeleted',
  // Its own field (express.e:96 in the record): N's default date (27855),
  // moved only by a logoff after N (8197) or a conference's record under
  // conference accounting (4906).
  'newSinceDate',
  // The record's own (axobjects.e:61-65), written as held since 2026-10-12.
  'msgBaseRJoin',
  'todaysBytesLimit',
  'uucpa',
  // express.e:11344 secBulletin, the W command's choice - the record's own.
  'computerIndex',
] as const satisfies readonly (keyof User)[];

/**
 * Text fields, with the width the record gives them (CHAR[n], one byte for
 * the terminator). The disk value wins unless it is just the row's value cut
 * to that width: then the disk holds nothing newer, only less.
 */
const TEXT_FROM_DISK: ReadonlyArray<readonly [keyof User, number]> = [
  ['realname', 26],
  ['location', 30],
  ['phone', 13],
  ['email', 50],
];

/*
 * KEPT_FROM_ROW, and why each is not on the lists above:
 *
 * - linesPerScreen, dailyBytesDld, credit*: the writer put a constant in
 *   these (79, 0, 0) until this change, so every record on the board holds the
 *   constant, not the caller's value. The writer is fixed; the row stays the
 *   source until a record can be told apart from the old constant.
 * - expert: the old writer's byte was 1 for 'X' and 'N' alike. Taken from the
 *   disk only when the byte is one of the two letters (byteToExpert gives '').
 * - baud: user.keys holds the last connect speed, this port's column is the
 *   caller's modem-emulation choice. Different facts under one name.
 * - ansi, computer, areaName, availableForChat, quietNode, internetName and
 *   the web preferences: not in the record, or not written to it.
 * - Lock fields (accountLocked, invalidAttempts, forcePwdReset,
 *   pwdLastUpdated): read off user.misc by the logon gates themselves, and
 *   left undefined on the session so a later write keeps the disk's values.
 */

/**
 * Every User field the record holds - user.data, user.keys and user.misc as
 * UserFileManager writes them. While the caller is on, these are express.e's
 * loggedOnUser: changed in memory (changeAccount) and written to the slot only
 * where express.e calls saveAccount (account.service). The row copies them
 * from the record, never the other way round.
 */
export const RECORD_FIELDS: readonly (keyof User)[] = [
  ...FROM_DISK,
  ...TEXT_FROM_DISK.map(([field]) => field),
  'username',
  'expert',
  'confRJoin',
  'linesPerScreen',
  'dailyBytesDld',
  'creditDays',
  'creditAmount',
  'creditStartDate',
  'creditTotalToDate',
  'creditTotalDate',
  'creditTracking',
];

/** The record at this account's slot, merged over its row. */
export function loadAccount(row: User): { user: User; fromDisk: boolean } {
  const slot = row.slotNumber;
  if (!slot || slot < 1) return { user: row, fromDisk: false };

  const disk = userFileManager.readUserBySlot(slot);
  // A slot whose record is someone else's is a row that points at the wrong
  // place, not a newer copy of this caller; using it would log him in as
  // another account. AmigaDOS names compare without case (StriCmp).
  if (!disk || disk.username.trim().toLowerCase() !== String(row.username ?? '').trim().toLowerCase()) {
    if (disk) {
      console.warn(`[LOGIN] slot ${slot} holds "${disk.username}", not "${row.username}" - using the database row`);
    }
    return { user: row, fromDisk: false };
  }

  const user: User = { ...row };
  const target = user as unknown as Record<string, unknown>;
  const source = disk as unknown as Record<string, unknown>;
  for (const field of FROM_DISK) {
    if (source[field] !== undefined) target[field] = source[field];
  }
  // autoRejoin and confRJoin are the same field (user.data confRJoin).
  user.confRJoin = user.autoRejoin;

  for (const [field, width] of TEXT_FROM_DISK) {
    const onDisk = String(source[field] ?? '');
    const inRow = String(target[field] ?? '');
    if (onDisk !== inRow.substring(0, width - 1)) target[field] = onDisk;
  }

  if (disk.expert === 'X' || disk.expert === 'N') user.expert = disk.expert;

  return { user, fromDisk: true };
}

/**
 * The row's copy of an account's record: every record field, so the mirror
 * says what the board is acting on. Taken at logon from the record loaded off
 * the disk, and at every saveAccount from the record just written. Disk-only
 * fields are dropped by updateUser itself.
 */
export function rowFieldsFromAccount(user: User): Partial<User> {
  const fields: Partial<User> = {};
  const source = user as unknown as Record<string, unknown>;
  const target = fields as unknown as Record<string, unknown>;
  for (const field of RECORD_FIELDS) {
    if (source[field] !== undefined) target[field] = source[field];
  }
  for (const [field] of TEXT_FROM_DISK) target[field] = source[field];
  return fields;
}

/** Equal as the record holds them: dates by instant, everything else by value. */
function sameValue(a: unknown, b: unknown): boolean {
  if (a instanceof Date || b instanceof Date) {
    return new Date(a as Date | number).getTime() === new Date(b as Date | number).getTime();
  }
  return a === b;
}

/**
 * The record fields a caller holding a WHOLE account has changed: those that
 * differ from the account as it loads from this row (the record merged over
 * it), plus the disk-only fields it names. A save writes these and nothing
 * else, so a field the account only carries because the row supplied it (an
 * expert byte the row spells 'N', a rejoin the row defaults) is never written
 * over what the record holds. Without a row, every named field is a change.
 */
export function changedRecordFields(account: Partial<User>, row: User | null | undefined): Partial<User> {
  if (!row) {
    // No row to measure against: the record as it stands is the baseline.
    const slot = Number(account.slotNumber) || 0;
    const onDisk = slot > 0 ? userFileManager.readUserBySlot(slot) : null;
    return onDisk ? fieldsDifferingFrom(account, onDisk) : { ...account };
  }
  const baseline = loadAccount(row).user as unknown as Record<string, unknown>;
  const source = account as unknown as Record<string, unknown>;
  const changed: Record<string, unknown> = {};
  for (const [field, value] of Object.entries(source)) {
    if (value === undefined) continue;
    if ((RECORD_FIELDS as readonly string[]).includes(field) && sameValue(value, baseline[field])) continue;
    changed[field] = value;
  }
  return changed as Partial<User>;
}

/** The fields of `next` whose value is not the one `base` holds. */
export function fieldsDifferingFrom(next: Partial<User>, base: Partial<User>): Partial<User> {
  const changed: Record<string, unknown> = {};
  const before = base as unknown as Record<string, unknown>;
  for (const [field, value] of Object.entries(next as unknown as Record<string, unknown>)) {
    if (value !== undefined && !sameValue(value, before[field])) changed[field] = value;
  }
  return changed as Partial<User>;
}

/**
 * What a door is handed for a caller on `slot`: express.e's loggedOnUser,
 * which is the record as loadAccount read it plus what the session changed
 * since (a door's loadAccount copies the struct, 4556; node<n>.user is
 * Write(fh,loggedOnUser,SIZEOF user), 2935-2950).
 *
 * Starts from the slot's own bytes - password, rejoin, padding and all - and
 * lays over them the fields where the session's account differs from the
 * account as it loads from that record: the same overlay a save uses
 * (UserFileManager.overlaidRecords), so there is no second mapper. A slot
 * with no record of this caller (a new account not yet saved) has nothing to
 * start from and gets a whole record built from the account.
 */
export function sessionRecords(user: User, slot: number): { user: Buffer; keys: Buffer } {
  const loaded = slot > 0 ? loadAccount({ ...user, slotNumber: slot }) : null;
  if (!loaded || !loaded.fromDisk) {
    return { user: userFileManager.userRecord(user, slot), keys: userFileManager.userKeysRecord(user, slot) };
  }
  const changed = fieldsDifferingFrom(user, loaded.user);
  const patch = userFileManager.userFieldsToPatch(changed, slot, userFileManager.readRecordStructs(slot));
  return userFileManager.overlaidRecords(slot, patch);
}

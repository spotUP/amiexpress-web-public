/**
 * User Repository
 * Handles all user-related database operations
 */

import * as crypto from 'crypto';
import { userFileManager } from '../services/UserFileManager';
import { userDatabaseManager } from '../services/UserDatabaseManager';
import type { User } from './types';
import { normalizeForComparison, sanitizeInput } from '../utils/input-normalizer.util';
import { SysopDebugUtil, DebugSeverity } from '../utils/sysop-debug.util';
import { BaseRepository } from './BaseRepository';
import { loadAccount, RECORD_FIELDS } from '../services/load-account';

// Helper function to map field names to column names
function fieldToColumn(field: string): string {
  const map: { [key: string]: string } = {
    passwordHash: 'passwordhash',
    secLevel: 'seclevel',
    bytesUpload: 'bytesupload',
    bytesDownload: 'bytesdownload',
    ratioType: 'ratiotype',
    timeTotal: 'timetotal',
    timeLimit: 'timelimit',
    timeUsed: 'timeused',
    chatLimit: 'chatlimit',
    chatUsed: 'chatused',
    lastLogin: 'lastlogin',
    firstLogin: 'firstlogin',
    callsToday: 'callstoday',
    newUser: 'newuser',
    linesPerScreen: 'linesperscreen',
    screenType: 'screentype',
    zoomType: 'zoomtype',
    availableForChat: 'availableforchat',
    quietNode: 'quietnode',
    autoRejoin: 'autorejoin',
    confRJoin: 'autorejoin',
    confAccess: 'confaccess',
    areaName: 'areaname',
    topUploadCPS: 'topuploadcps',
    topDownloadCPS: 'topdownloadcps',
    byteLimit: 'bytelimit',
    userFlags: 'userflags',
    baud: 'baud',
    creditDays: 'credit_days',
    creditAmount: 'credit_amount',
    creditStartDate: 'credit_start_date',
    creditTotalToDate: 'credit_total_to_date',
    creditTotalDate: 'credit_total_date',
    creditTracking: 'credit_tracking',
    gdprConsentAt: 'gdpr_consent_at',
    gdprNoticeVersion: 'gdpr_notice_version',
    gdprConsentSource: 'gdpr_consent_source',
    deletedAt: 'deleted_at',
    erasedAt: 'erased_at',
    aiPersona: 'ai_persona',
  };
  return map[field] || field.toLowerCase();
}

/**
 * The same rule, for the test that pins it against the schema.
 *
 * A field with no entry in the map falls through to `toLowerCase()`, so
 * `dailyBytesDld` asks for a column called `dailybytesdld` - and nothing
 * had ever added one, which broke the first login of every new day
 * (2026-09-16). The writer's name and the schema's name have to agree, and
 * only a test that can ask BOTH will notice when they stop.
 */
export function fieldToColumnForTest(field: string): string {
  return fieldToColumn(field);
}

function expertFromColumn(value: unknown): 'X' | 'N' {
  if (value === 1 || value === '1') return 'X';
  return String(value ?? '').toUpperCase() === 'X' ? 'X' : 'N';
}

/**
 * User fields that live only in user.data / user.misc. The table has no
 * column for them, so an UPDATE naming one failed ("no such column") - the
 * account editor's Messages Posted, for one. They go to the disk write and
 * never to SQL.
 */
const DISK_ONLY_FIELDS = [
  'messagesPosted',
  'accountDeleted',
  'accountLocked',
  'invalidAttempts',
  'forcePwdReset',
  'pwdLastUpdated',
  'newSinceDate',
  'msgBaseRJoin',
  'todaysBytesLimit',
  'uucpa',
] as const;

export interface UpdateUserOptions {
  /**
   * false: write the row only. For a row that is being brought up to date
   * FROM the disk record (the logon), where writing the row back over that
   * record would be the copy running the wrong way.
   */
  syncDisk?: boolean;
}

export class UserRepository extends BaseRepository<User> {
  constructor(db: any) {
    super(db);
  }

  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    const id = crypto.randomUUID();
    const safeUsername = sanitizeInput(userData.username);

    // express.e:29624 — userNum:=tempUser.slotNumber; the login path at
    // auth-socket-handlers.ts:479 rejects slotNumber=0 / null as "That
    // account has been deleted." Assign the next available slot at
    // creation so a freshly-registered user can log in without waiting
    // for the database.ts:443-450 startup backfill. Slot allocation is
    // MAX(slotnumber)+1 — matches the express.e "highest known account
    // + 1" semantics and avoids re-using slots from deleted accounts.
    const maxSlotRow = this.get<{ maxSlot: number | null }>(
      'SELECT COALESCE(MAX(slotnumber), 0) AS maxSlot FROM users'
    );
    const nextSlot = ((maxSlotRow?.maxSlot as number) || 0) + 1;

    this.run(`
      INSERT INTO users (
        id, username, passwordhash, realname, location, phone, email,
        seclevel, uploads, downloads, bytesupload, bytesdownload, ratio,
        ratiotype, timetotal, timelimit, timeused, chatlimit, chatused,
        lastlogin, firstlogin, calls, callstoday, newuser, expert, ansi,
        linesperscreen, computer, screentype, protocol, editor, zoomtype,
        availableforchat, quietnode, autorejoin, confaccess, areaname, uucp,
        topuploadcps, topdownloadcps, bytelimit, baud, slotnumber,
        gdpr_consent_at, gdpr_notice_version, gdpr_consent_source
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `, [
      id, safeUsername, userData.passwordHash, userData.realname,
      userData.location, userData.phone, userData.email, userData.secLevel,
      userData.uploads, userData.downloads, userData.bytesUpload, userData.bytesDownload,
      userData.ratio, userData.ratioType, userData.timeTotal, userData.timeLimit,
      userData.timeUsed, userData.chatLimit, userData.chatUsed,
      userData.lastLogin ? Math.floor(userData.lastLogin.getTime() / 1000) : null,
      Math.floor(userData.firstLogin.getTime() / 1000),
      userData.calls, userData.callsToday, userData.newUser ? 1 : 0,
      (userData.expert === 'X' ? 1 : 0), userData.ansi ? 1 : 0, userData.linesPerScreen, userData.computer,
      userData.screenType, userData.protocol, userData.editor, userData.zoomType,
      userData.availableForChat ? 1 : 0, userData.quietNode ? 1 : 0, userData.autoRejoin,
      userData.confAccess, userData.areaName, userData.uuCP ? 1 : 0, userData.topUploadCPS,
      userData.topDownloadCPS, userData.byteLimit, userData.baud ?? 0, nextSlot,
      userData.gdprConsentAt ?? null,
      userData.gdprNoticeVersion ?? null,
      userData.gdprConsentSource ?? null
    ]);

    return id;
  }

  /**
   * Append a newly-registered BBS user to the Amiga disk files (user.data/keys/misc).
   * Call this ONLY from the BBS new-user registration flow after createUser() succeeds.
   * Do NOT call from tests, admin API, or web registration — those users must not pollute
   * the Amiga binary user database which is shared with 68K door binaries.
   */
  async appendUserToDisk(id: string): Promise<void> {
    const user = await this.getUserById(id);
    if (!user) return;
    // 1-indexed Amiga slot: the record being appended lands at file index
    // getUserCount(), which is slot getUserCount()+1. (Slot 0 is a deleted
    // account per express.e:21365.)
    const slotNumber = userDatabaseManager.getUserCount() + 1;
    try {
      // The board's one user.data/keys/misc writer, at the slot. A second
      // serializer here (UserDatabaseManager.userToStruct/appendUser) wrote
      // a new account differently from every later save of the same account:
      // all nine conferences instead of the access the registration granted
      // (express.e:29369 applyPreset copies PRESET.AREA), no phone number
      // (it read `phoneNumber`; the row is `phone`), conference rejoin 0,
      // today's calls 0 - until the first save rewrote it.
      userFileManager.writeUserFiles(user, slotNumber);
      // The database takes the slot the record LANDED in. createUser guessed
      // MAX(slotnumber)+1, which is a different number whenever user.data
      // ends in a deleted slot - the live board's test account came out slot
      // 50 in the database and 51 on disk (2026-09-28). The disk is what
      // AmiExpress reads, so the database follows it.
      this.run('UPDATE users SET slotnumber = ? WHERE id = ?', [slotNumber, id]);
console.log(`[Database] Appended BBS user ${user.username} to user.data/keys/misc (slot ${slotNumber})`);
    } catch (error) {
console.error(`[Database] Failed to append BBS user to disk:`, error);
      SysopDebugUtil.debug(null, null, 'Database',
        `Failed to append new BBS user "${user.username}" to disk files`,
        { error: error instanceof Error ? error.message : String(error), slotNumber },
        DebugSeverity.WARNING
      );
    }
  }

  async getUserByUsername(username: string): Promise<User | null> {
    const normalizedUsername = normalizeForComparison(username);
    const user = this.get<any>('SELECT * FROM users WHERE LOWER(username) = ?', [normalizedUsername]);

    if (!user) return null;

    return this.mapUserFromDb(user);
  }

  /**
   * Lookup a user by SLOT NUMBER, for boards that let callers log on by it.
   *
   * express.e:29598 - with USERNUMBER_LOGIN on the node's icon, a numeric
   * answer at the name prompt is a slot and is loaded with `loadAccount(userNum,
   * ...)` rather than looked up as a name. Slot 0 is a deleted account
   * (express.e:21365), so it is never a valid logon.
   */
  async getUserBySlotNumber(slotNumber: number): Promise<User | null> {
    if (!Number.isInteger(slotNumber) || slotNumber < 1) return null;

    const user = this.get<any>('SELECT * FROM users WHERE slotnumber = ?', [slotNumber]);
    if (!user) return null;

    return this.mapUserFromDb(user);
  }

  /**
   * Lookup a user by realName — express.e:11505-11514 findUserFromName
   * with NAME_TYPE_REALNAME. Used by captureRealAndInternetNames'
   * uniqueness check (express.e:28184 "Already in use!, try another.")
   * and by enterMSG's chooseAName resolution in REALNAME conferences.
   * Case-insensitive match. Returns null when no row matches.
   */
  async getUserByRealname(realname: string): Promise<User | null> {
    const trimmed = (realname || '').trim();
    if (trimmed.length === 0) return null;
    const normalized = normalizeForComparison(trimmed);
    const user = this.get<any>('SELECT * FROM users WHERE LOWER(realname) = ?', [normalized]);
    if (!user) return null;
    return this.mapUserFromDb(user);
  }

  /**
   * Lookup a user by internetName — express.e:11512-11514 findUserFromName
   * with NAME_TYPE_INTERNETNAME. Used by captureRealAndInternetNames'
   * uniqueness check on the internet-name field. Case-insensitive.
   */
  async getUserByInternetname(internetname: string): Promise<User | null> {
    const trimmed = (internetname || '').trim();
    if (trimmed.length === 0) return null;
    const normalized = normalizeForComparison(trimmed);
    const user = this.get<any>('SELECT * FROM users WHERE LOWER(internetname) = ?', [normalized]);
    if (!user) return null;
    return this.mapUserFromDb(user);
  }

  async getUserById(id: string): Promise<User | null> {
    const user = this.get<any>('SELECT * FROM users WHERE id = ?', [id]);

    if (!user) return null;

    return this.mapUserFromDb(user);
  }

  private mapUserFromDb(user: any): User {
    const safeNumber = (value: any, defaultValue: number = 0): number => {
      const num = Number(value);
      return isNaN(num) ? defaultValue : num;
    };

    return {
      id: user.id,
      slotNumber: user.slotnumber ? safeNumber(user.slotnumber) : undefined,
      username: user.username,
      passwordHash: user.passwordhash,
      realname: user.realname,
      // express.e loggedOnUserMisc.internetName — column added by migration.
      internetName: user.internetname || undefined,
      location: user.location,
      phone: user.phone,
      email: user.email,
      secLevel: safeNumber(user.seclevel, 10),
      uploads: safeNumber(user.uploads, 0),
      downloads: safeNumber(user.downloads, 0),
      bytesUpload: safeNumber(user.bytesupload, 0),
      bytesDownload: safeNumber(user.bytesdownload, 0),
      // Zeroed when the day turns (express.e:535). Written by the
      // login path since 02828601d and never read back until now, so
      // the daily download allowance reset but never actually
      // limited anything.
      dailyBytesDld: safeNumber(user.dailybytesdld, 0),
      ratio: safeNumber(user.ratio, 0),
      ratioType: safeNumber(user.ratiotype, 0),
      timeTotal: safeNumber(user.timetotal, 0),
      timeLimit: safeNumber(user.timelimit, 3600),
      timeUsed: safeNumber(user.timeused, 0),
      chatLimit: safeNumber(user.chatlimit, 0),
      chatUsed: safeNumber(user.chatused, 0),
      lastLogin: user.lastlogin ? new Date(user.lastlogin * 1000) : undefined,
      firstLogin: new Date(user.firstlogin * 1000),
      calls: safeNumber(user.calls, 0),
      callsToday: safeNumber(user.callstoday, 0),
      newUser: Boolean(user.newuser),
      // The column is INTEGER, but updateUser writes the letter, so a row
      // holds 0/1 (createUser) or 'X'/'N' (every later save). `? 'X' : 'N'`
      // read the stored 'N' as truthy, and a caller who turned expert mode
      // off was an expert again at the next login.
      expert: expertFromColumn(user.expert),
      ansi: Boolean(user.ansi),
      linesPerScreen: safeNumber(user.linesperscreen, 23),
      computer: user.computer,
      screenType: user.screentype,
      protocol: user.protocol,
      editor: user.editor,
      zoomType: user.zoomtype,
      availableForChat: Boolean(user.availableforchat),
      quietNode: Boolean(user.quietnode),
      autoRejoin: safeNumber(user.autorejoin, 1),
      confRJoin: safeNumber(user.autorejoin, 1),
      confAccess: user.confaccess,
      areaName: user.areaname,
      uuCP: Boolean(user.uucp),
      baud: safeNumber(user.baud, 0),
      topUploadCPS: safeNumber(user.topuploadcps, 0),
      topDownloadCPS: safeNumber(user.topdownloadcps, 0),
      byteLimit: safeNumber(user.bytelimit, 0),
      userFlags: safeNumber(user.userflags, 0),
      // Credit-account fields — mirror of the binary user.data struct so the
      // web runtime and the ! Credit Maintenance editor can see/edit credit.
      creditDays: safeNumber(user.credit_days, 0),
      creditAmount: safeNumber(user.credit_amount, 0),
      creditStartDate: safeNumber(user.credit_start_date, 0),
      creditTotalToDate: safeNumber(user.credit_total_to_date, 0),
      creditTotalDate: safeNumber(user.credit_total_date, 0),
      creditTracking: safeNumber(user.credit_tracking, 0),
      fontPreference: user.fontpreference || 'TopazPlus_a1200',  // Web font preference
      // Which sixteen colours his PETSCII screen is painted with. Only the
      // 80-column screen has a choice: a C64 is a VIC-II by construction, and
      // a C128's 80-column screen is the VDC's own colours, which is why that
      // is the default (sdk/petscii/c64-palette.ts).
      petsciiPalette: user.petsciipalette === 'vic' ? 'vic' : 'vdc',
      petsciiCharset: user.petsciicharset === 'swedish' ? 'swedish' : 'standard',
      themePreference: user.themepreference || 'classic',        // Door theme; classic is today's look
      // SCREEN theme - which set of board art this caller wears. Empty is
      // "no preference", which resolves to the board default and then to the
      // board's own screens. NOT the same preference as themePreference above.
      screenTheme: user.screentheme || '',
      aiPersona: user.ai_persona || '',
      gdprConsentAt: user.gdpr_consent_at || undefined,
      gdprNoticeVersion: user.gdpr_notice_version || undefined,
      gdprConsentSource: user.gdpr_consent_source || undefined,
      deletedAt: user.deleted_at || undefined,
      erasedAt: user.erased_at || undefined,
      created: new Date(user.created * 1000),
      updated: new Date(user.updated * 1000),
    } as User;
  }

  /**
   * A save of an account by someone other than the caller on it: the sysop's
   * editors, the admin, a sysop tool, an erasure, an import. express.e's
   * account editor loads the record from its slot, changes it and saves it
   * back (loadAccount 21283, saveAccount 21293-21299); the record is the
   * account, and the row only mirrors it.
   *
   * So the disk gets the RECORD at the slot with these fields changed - never
   * the row. The row was the source here, and it is stale by design: the
   * logon reads the record (load-account.ts), a call changes it in memory and
   * saves it at logoff, a door saves it with SAVE_ACCOUNT, the sysop edits it
   * by hand. Writing the whole row back put all of that back to the row's
   * values on every save, from any field: a door's raised level, the time
   * used today, the post count.
   *
   * A caller who is on holds his account in memory (express.e's loggedOnUser)
   * and writes it at logoff (8207). A save of his account changes that copy
   * too, as a door's SAVE_ACCOUNT does (4587-4597), or his logoff would put
   * the old values back.
   *
   * The caller's OWN changes during his call do not come here: they go to his
   * session (account.service changeAccount) and reach the slot where express.e
   * calls saveAccount.
   */
  async updateUser(id: string, updates: Partial<User>, options: UpdateUserOptions = {}): Promise<void> {

    const sanitizedUpdates = { ...updates };
    if (typeof sanitizedUpdates.username === 'string') {
      sanitizedUpdates.username = sanitizeInput(sanitizedUpdates.username);
    }

    const diskOnly: Partial<User> = {};
    for (const field of DISK_ONLY_FIELDS) {
      if (sanitizedUpdates[field] !== undefined) (diskOnly as Record<string, unknown>)[field] = sanitizedUpdates[field];
    }

    const fields = Object.keys(sanitizedUpdates).filter(key =>
      key !== 'id' &&
      key !== 'created' &&
      key !== 'lastLoginBeforeUpdate' &&  // Runtime-only field, not in DB schema
      !(DISK_ONLY_FIELDS as readonly string[]).includes(key)
    );

    // The record's own fields in this save. Anything else (the password hash,
    // the web preferences) lives only in the row.
    const recordUpdates: Partial<User> = {};
    for (const key of Object.keys(sanitizedUpdates)) {
      if ((RECORD_FIELDS as readonly string[]).includes(key) || (DISK_ONLY_FIELDS as readonly string[]).includes(key)) {
        (recordUpdates as Record<string, unknown>)[key] = (sanitizedUpdates as Record<string, unknown>)[key];
      }
    }
    const savesRecord = options.syncDisk !== false && Object.keys(recordUpdates).length > 0;

    if (savesRecord) {
      // Before the row changes: the record is found by the row's slot and
      // name, as they are now.
      const row = await this.getUserById(id);
      if (row && row.slotNumber) {
        try {
          const { user: account } = loadAccount(row);
          userFileManager.updateUserDataFile({ ...account, ...recordUpdates }, row.slotNumber);
console.log(`[Database] Saved account ${row.username} at slot ${row.slotNumber}: ${Object.keys(recordUpdates).join(', ')}`);
        } catch (error) {
console.error(`[Database] Failed to save the account to disk:`, error);
          SysopDebugUtil.debug(
            null,
            null,
            'Database',
            `Failed to save account "${row.username}" to disk files`,
            { error: error instanceof Error ? error.message : String(error), slotNumber: row.slotNumber },
            DebugSeverity.WARNING
          );
          // Don't throw - the row update below still runs, file write is best-effort
        }
      }
    }

    if (fields.length > 0) {
      const setClause = fields.map(f => `${fieldToColumn(f)} = ?`).join(', ');
      const values = fields.map(f => {
        const value = sanitizedUpdates[f as keyof User];
        if (value instanceof Date) return Math.floor(value.getTime() / 1000);
        if (typeof value === 'boolean') return value ? 1 : 0;
        return value;
      });

      const sql = `UPDATE users SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
      this.run(sql, [...values, id]);
    }

    if (savesRecord) {
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { applyToOnlineAccount } = require('../services/account.service') as typeof import('../services/account.service');
      applyToOnlineAccount(id, recordUpdates);
    }
  }

  async getUsers(filter?: { secLevel?: number; newUser?: boolean; limit?: number }): Promise<User[]> {

    let sql = 'SELECT * FROM users WHERE 1=1';
    const params: any[] = [];

    if (filter?.secLevel !== undefined) {
      sql += ' AND seclevel >= ?';
      params.push(filter.secLevel);
    }

    if (filter?.newUser !== undefined) {
      sql += ' AND newuser = ?';
      params.push(filter.newUser ? 1 : 0);
    }

    sql += ' ORDER BY username';

    if (filter?.limit) {
      sql += ' LIMIT ?';
      params.push(filter.limit);
    }

    const users = this.all<any>(sql, params);
    return users.map(u => this.mapUserFromDb(u));
  }

  async deleteUser(id: string): Promise<void> {

    // Get user before deletion for logging
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }

    // The account's own position in user.data. This was the user's index in
    // getUsers() + 1 - an ALPHABETICAL position - so deleting one account
    // zeroed whichever record happened to sit at that number: somebody else's.
    const slotNumber = user.slotNumber ?? 0;

    // Delete from database
    const result = this.run('DELETE FROM users WHERE id = ?', [id]);

    if (result.changes === 0) {
      throw new Error(`Failed to delete user ${id}`);
    }

console.log(`[Database] Deleted user ${user.username} (ID: ${id})`);

    // DISK-BASED: Clear user slot in user.data/keys/misc files
    if (slotNumber > 0) {
      try {
        userFileManager.deleteUserSlot(slotNumber);
console.log(`[Database] Cleared disk slot ${slotNumber} for deleted user ${user.username}`);
      } catch (error) {
console.error(`[Database] Failed to clear disk slot for user ${user.username}:`, error);
        // Don't throw - database deletion already succeeded
      }
    }
  }
}

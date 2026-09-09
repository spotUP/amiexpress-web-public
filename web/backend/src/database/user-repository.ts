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
    const slotNumber = userDatabaseManager.getUserCount();
    try {
      const userStruct = userDatabaseManager.userToStruct(user);
      userStruct.slotNumber = slotNumber;
      const keysStruct = userDatabaseManager.userToKeys(user, slotNumber);
      const miscStruct = userDatabaseManager.userToMisc(user);
      userDatabaseManager.appendUser(userStruct, keysStruct, miscStruct);
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
      expert: user.expert ? 'X' : 'N',
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

  async updateUser(id: string, updates: Partial<User>): Promise<void> {

    const sanitizedUpdates = { ...updates };
    if (typeof sanitizedUpdates.username === 'string') {
      sanitizedUpdates.username = sanitizeInput(sanitizedUpdates.username);
    }

    const fields = Object.keys(sanitizedUpdates).filter(key =>
      key !== 'id' &&
      key !== 'created' &&
      key !== 'lastLoginBeforeUpdate'  // Runtime-only field, not in DB schema
    );
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${fieldToColumn(f)} = ?`).join(', ');
    const values = fields.map(f => {
      const value = sanitizedUpdates[f as keyof User];
      if (value instanceof Date) return Math.floor(value.getTime() / 1000);
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE users SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    this.run(sql, [...values, id]);

    // CRITICAL: Sync to disk files for Amiga door compatibility
    const updatedUser = await this.getUserById(id);
    if (updatedUser && updatedUser.slotNumber) {
      try {
        userFileManager.updateUserDataFile(updatedUser, updatedUser.slotNumber);
console.log(`[Database] Synced updated user ${updatedUser.username} to disk files (slot ${updatedUser.slotNumber})`);
      } catch (error) {
console.error(`[Database] Failed to sync user update to disk:`, error);
        SysopDebugUtil.debug(
          null,
          null,
          'Database',
          `Failed to sync updated user "${updatedUser.username}" to disk files`,
          { error: error instanceof Error ? error.message : String(error), slotNumber: updatedUser.slotNumber },
          DebugSeverity.WARNING
        );
        // Don't throw - DB update succeeded, file write is best-effort
      }
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

    // Find user's slot in disk files (1-indexed position in user list)
    const allUsers = await this.getUsers({ limit: 10000 });
    const slotIndex = allUsers.findIndex(u => u.id === id);
    const slotNumber = slotIndex >= 0 ? slotIndex + 1 : -1; // Convert to 1-indexed

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

/**
 * User Repository
 * Handles all user-related database operations
 */

import * as crypto from 'crypto';
import { userFileManager } from '../services/UserFileManager';
import { userDatabaseManager } from '../services/UserDatabaseManager';
import type { User } from './types';
import { normalizeForComparison, sanitizeInput } from '../utils/input-normalizer.util';

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
    confAccess: 'confaccess',
    areaName: 'areaname',
    topUploadCPS: 'topuploadcps',
    topDownloadCPS: 'topdownloadcps',
    byteLimit: 'bytelimit',
    userFlags: 'userflags',
  };
  return map[field] || field.toLowerCase();
}

export class UserRepository {
  constructor(private db: any) {}

  async createUser(userData: Omit<User, 'id' | 'created' | 'updated'>): Promise<string> {
    if (!this.db) throw new Error('Database not initialized');

    const id = crypto.randomUUID();
    const safeUsername = sanitizeInput(userData.username);
    const stmt = this.db.prepare(`
      INSERT INTO users (
        id, username, passwordhash, realname, location, phone, email,
        seclevel, uploads, downloads, bytesupload, bytesdownload, ratio,
        ratiotype, timetotal, timelimit, timeused, chatlimit, chatused,
        lastlogin, firstlogin, calls, callstoday, newuser, expert, ansi,
        linesperscreen, computer, screentype, protocol, editor, zoomtype,
        availableforchat, quietnode, autorejoin, confaccess, areaname, uucp,
        topuploadcps, topdownloadcps, bytelimit
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id, safeUsername, userData.passwordHash, userData.realname,
      userData.location, userData.phone, userData.email, userData.secLevel,
      userData.uploads, userData.downloads, userData.bytesUpload, userData.bytesDownload,
      userData.ratio, userData.ratioType, userData.timeTotal, userData.timeLimit,
      userData.timeUsed, userData.chatLimit, userData.chatUsed,
      userData.lastLogin ? Math.floor(userData.lastLogin.getTime() / 1000) : null,
      Math.floor(userData.firstLogin.getTime() / 1000),
      userData.calls, userData.callsToday, userData.newUser ? 1 : 0,
      userData.expert ? 1 : 0, userData.ansi ? 1 : 0, userData.linesPerScreen, userData.computer,
      userData.screenType, userData.protocol, userData.editor, userData.zoomType,
      userData.availableForChat ? 1 : 0, userData.quietNode ? 1 : 0, userData.autoRejoin,
      userData.confAccess, userData.areaName, userData.uuCP ? 1 : 0, userData.topUploadCPS,
      userData.topDownloadCPS, userData.byteLimit
    );

    // CRITICAL: Write to disk files for Amiga door compatibility
    // Get the full user object we just created
    const newUser = await this.getUserById(id);
    if (newUser) {
      // Count existing users to assign slot number
      const userCount = userDatabaseManager.getUserCount();
      const slotNumber = userCount; // Next available slot
      try {
        // Write to node files (active session)
        userFileManager.writeUserFiles(newUser, slotNumber);
        console.log(`[Database] Synced new user ${newUser.username} to node files (slot ${slotNumber})`);

        // Write to main user database (user.data, user.keys, user.misc)
        const userStruct = userDatabaseManager.userToStruct(newUser);
        userStruct.slotNumber = slotNumber; // Set slot number
        const keysStruct = userDatabaseManager.userToKeys(newUser, slotNumber);
        const miscStruct = userDatabaseManager.userToMisc(newUser);

        userDatabaseManager.appendUser(userStruct, keysStruct, miscStruct);
        console.log(`[Database] Synced new user ${newUser.username} to user.data/keys/misc`);
      } catch (error) {
        console.error(`[Database] Failed to sync user to disk:`, error);
        // Don't throw - DB insert succeeded, file write is best-effort
      }
    }

    return id;
  }

  async getUserByUsername(username: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    const normalizedUsername = normalizeForComparison(username);
    const stmt = this.db.prepare('SELECT * FROM users WHERE LOWER(username) = ?');
    const user = stmt.get(normalizedUsername) as any;

    if (!user) return null;

    return this.mapUserFromDb(user);
  }

  async getUserById(id: string): Promise<User | null> {
    if (!this.db) throw new Error('Database not initialized');

    const stmt = this.db.prepare('SELECT * FROM users WHERE id = ?');
    const user = stmt.get(id) as any;

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
      username: user.username,
      passwordHash: user.passwordhash,
      realname: user.realname,
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
      timeLimit: safeNumber(user.timelimit, 0),
      timeUsed: safeNumber(user.timeused, 0),
      chatLimit: safeNumber(user.chatlimit, 0),
      chatUsed: safeNumber(user.chatused, 0),
      lastLogin: user.lastlogin ? new Date(user.lastlogin * 1000) : undefined,
      firstLogin: new Date(user.firstlogin * 1000),
      calls: safeNumber(user.calls, 0),
      callsToday: safeNumber(user.callstoday, 0),
      newUser: Boolean(user.newuser),
      expert: Boolean(user.expert),
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
      confAccess: user.confaccess,
      areaName: user.areaname,
      uuCP: Boolean(user.uucp),
      topUploadCPS: safeNumber(user.topuploadcps, 0),
      topDownloadCPS: safeNumber(user.topdownloadcps, 0),
      byteLimit: safeNumber(user.bytelimit, 0),
      userFlags: safeNumber(user.userflags, 0),
      created: new Date(user.created * 1000),
      updated: new Date(user.updated * 1000),
    } as User;
  }

  async updateUser(id: string, updates: Partial<User>): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const sanitizedUpdates = { ...updates };
    if (typeof sanitizedUpdates.username === 'string') {
      sanitizedUpdates.username = sanitizeInput(sanitizedUpdates.username);
    }

    const fields = Object.keys(sanitizedUpdates).filter(key => key !== 'id' && key !== 'created');
    if (fields.length === 0) return;

    const setClause = fields.map(f => `${fieldToColumn(f)} = ?`).join(', ');
    const values = fields.map(f => {
      const value = sanitizedUpdates[f as keyof User];
      if (value instanceof Date) return Math.floor(value.getTime() / 1000);
      if (typeof value === 'boolean') return value ? 1 : 0;
      return value;
    });

    const sql = `UPDATE users SET ${setClause}, updated = strftime('%s', 'now') WHERE id = ?`;
    const stmt = this.db.prepare(sql);
    stmt.run(...values, id);

    // CRITICAL: Sync to disk files for Amiga door compatibility
    const updatedUser = await this.getUserById(id);
    if (updatedUser) {
      // Find user's slot number (would need to track this better in production)
      const allUsers = await this.getUsers({});
      const slotNumber = allUsers.findIndex(u => u.id === id);
      if (slotNumber >= 0) {
        try {
          userFileManager.updateUserDataFile(updatedUser, slotNumber);
          console.log(`[Database] Synced updated user ${updatedUser.username} to disk files (slot ${slotNumber})`);
        } catch (error) {
          console.error(`[Database] Failed to sync user update to disk:`, error);
          // Don't throw - DB update succeeded, file write is best-effort
        }
      }
    }
  }

  async getUsers(filter?: { secLevel?: number; newUser?: boolean; limit?: number }): Promise<User[]> {
    if (!this.db) throw new Error('Database not initialized');

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

    const stmt = this.db.prepare(sql);
    const users = stmt.all(...params) as any[];
    return users.map(u => this.mapUserFromDb(u));
  }

  async deleteUser(id: string): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Get user before deletion for logging
    const user = await this.getUserById(id);
    if (!user) {
      throw new Error(`User with ID ${id} not found`);
    }

    // Delete from database
    const stmt = this.db.prepare('DELETE FROM users WHERE id = ?');
    const result = stmt.run(id);

    if (result.changes === 0) {
      throw new Error(`Failed to delete user ${id}`);
    }

    console.log(`[Database] Deleted user ${user.username} (ID: ${id})`);

    // Note: Disk file synchronization for deletions would need additional logic
    // to update user.data/keys/misc files and reindex slots
    // This is complex and would require full user database rebuild
    // For now, we only handle database deletion
  }
}

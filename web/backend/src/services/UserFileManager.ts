/**
 * UserFileManager - Manages user.data, user.keys, and user.misc binary files
 *
 * For 1:1 AmiExpress compatibility, we maintain BOTH:
 * - PostgreSQL database (fast queries, web features)
 * - Disk files (Amiga door compatibility)
 *
 * This service writes binary files matching the exact E struct layout from axobjects.e
 */

import * as fs from 'fs';
import * as path from 'path';
import { User } from '../database';

/**
 * E language struct: axobjects.e:11-68
 * SIZEOF user = 239 bytes
 */
interface UserFileStruct {
  name: string;                    // [31] CHAR
  pass: string;                    // [9] CHAR
  location: string;                // [30] CHAR
  phoneNumber: string;             // [13] CHAR
  slotNumber: number;              // INT (2 bytes)
  secStatus: number;               // INT
  secBoard: number;                // INT (File or Byte Ratio)
  secLibrary: number;              // INT (Ratio)
  secBulletin: number;             // INT (Computer Type)
  messagesPosted: number;          // INT
  newSinceDate: number;            // LONG (4 bytes)
  pwdHash: number;                 // LONG
  confRead2: number;               // LONG (not used)
  confRead3: number;               // LONG (not used)
  zoomType: number;                // INT
  unknown: number;                 // INT (not used)
  unknown2: number;                // INT (not used)
  unknown3: number;                // INT (not used)
  xferProtocol: number;            // INT
  filler2: number;                 // INT (not used)
  lcFiles: number;                 // INT (not used)
  badFiles: number;                // INT (not used)
  accountDate: number;             // LONG
  screenType: number;              // INT
  editorType: number;              // INT
  conferenceAccess: string;        // [10] CHAR
  uploads: number;                 // INT
  downloads: number;               // INT
  confRJoin: number;               // INT
  timesCalled: number;             // INT
  timeLastOn: number;              // LONG
  timeUsed: number;                // LONG
  timeLimit: number;               // LONG
  timeTotal: number;               // LONG
  bytesDownload: number;           // LONG
  bytesUpload: number;             // LONG
  dailyBytesLimit: number;         // LONG
  dailyBytesDld: number;           // LONG
  expert: number;                  // CHAR (1 byte)
  chatRemain: number;              // LONG
  chatLimit: number;               // LONG
  creditDays: number;              // LONG
  creditAmount: number;            // LONG
  creditStartDate: number;         // LONG
  creditTotalToDate: number;       // LONG
  creditTotalDate: number;         // LONG
  creditTracking: number;          // CHAR
  translatorID: number;            // CHAR
  msgBaseRJoin: number;            // INT
  confYM9: number;                 // LONG (not used)
  todaysBytesLimit: number;        // LONG
  protocol: number;                // CHAR
  uucpa: number;                   // CHAR
  lineLength: number;              // CHAR
  newUser: number;                 // CHAR
}

/**
 * E language struct: axobjects.e:70-81
 * SIZEOF userKeys = 54 bytes
 */
interface UserKeysFileStruct {
  userName: string;                // [31] CHAR
  number: number;                  // LONG
  newUser: number;                 // CHAR
  oldUpCPS: number;                // INT
  oldDnCPS: number;                // INT
  userFlags: number;               // INT
  baud: number;                    // INT
  upCPS2: number;                  // LONG
  dnCPS2: number;                  // LONG
  timesOnToday: number;            // INT
}

/**
 * E language struct: axobjects.e:83-100
 * SIZEOF userMisc = 256 bytes
 */
interface UserMiscFileStruct {
  internetName: string;            // [10] CHAR
  realName: string;                // [26] CHAR
  downloadBytesBCD: Buffer;        // [8] CHAR (BCD encoded)
  uploadBytesBCD: Buffer;          // [8] CHAR (BCD encoded)
  eMail: string;                   // [50] CHAR
  lastDlCPS: number;               // LONG
  pwdHash: string;                 // [32] CHAR (SHA256 hash)
  salt: string;                    // [8] CHAR
  pwdType: number;                 // CHAR
  forcePwdReset: number;           // CHAR
  accountLocked: number;           // CHAR
  invalidAttempts: number;         // CHAR
  pwdLastUpdated: number;          // LONG
  lastIP: number;                  // LONG
  ipMask: number;                  // LONG
  unused: Buffer;                  // [86] CHAR
}

export class UserFileManager {
  private bbsRoot: string;
  private userDataPath: string;
  private userKeysPath: string;
  private userMiscPath: string;

  // Struct sizes (must match E structs exactly)
  private readonly USER_STRUCT_SIZE = 239;
  private readonly USERKEYS_STRUCT_SIZE = 54;
  private readonly USERMISC_STRUCT_SIZE = 256;

  constructor() {
    // BBS: logical assignment points to project root
    // __dirname when compiled is /dist/services, so go 4 levels up: dist -> backend -> web -> amiexpress-web
    // But with tsx it's /src/services, so also 4 levels up: src -> backend -> web -> amiexpress-web
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    this.userDataPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.data'));
    this.userKeysPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.keys'));
    this.userMiscPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.misc'));

    console.log('[UserFileManager] Initialized');
    console.log(`  BBS root: ${this.bbsRoot}`);
    console.log(`  user.data: ${this.userDataPath}`);
    console.log(`  user.keys: ${this.userKeysPath}`);
    console.log(`  user.misc: ${this.userMiscPath}`);
  }
 
  private normalizeTargetPath(targetPath: string): string {
    return path.resolve(targetPath);
  }

  /**
   * Convert User (DB model) to UserFileStruct (binary file format)
   */
  private userToFileStruct(user: User, slotNumber: number): UserFileStruct {
    return {
      name: user.username,
      pass: '', // Password hash stored separately, not in plaintext
      location: user.location || '',
      phoneNumber: user.phone || '',
      slotNumber: slotNumber,
      secStatus: user.secLevel,
      secBoard: user.ratioType,
      secLibrary: user.ratio,
      secBulletin: 0, // Computer type
      messagesPosted: 0, // TODO: Count from messages table
      newSinceDate: Math.floor((user.lastLogin?.getTime() || Date.now()) / 1000),
      pwdHash: 0, // Old hash format not used
      confRead2: 0,
      confRead3: 0,
      zoomType: this.zoomTypeToInt(user.zoomType),
      unknown: 0,
      unknown2: 0,
      unknown3: 0,
      xferProtocol: this.protocolToInt(user.protocol),
      filler2: 0,
      lcFiles: 0,
      badFiles: 0,
      accountDate: Math.floor(user.created.getTime() / 1000),
      screenType: this.screenTypeToInt(user.screenType),
      editorType: this.editorTypeToInt(user.editor),
      conferenceAccess: user.confAccess || 'XXX',
      uploads: user.uploads,
      downloads: user.downloads,
      confRJoin: 0, // TODO: Get from session
      timesCalled: user.calls,
      timeLastOn: Math.floor((user.lastLogin?.getTime() || 0) / 1000),
      timeUsed: user.timeUsed,
      timeLimit: user.timeLimit,
      timeTotal: user.timeTotal,
      bytesDownload: user.bytesDownload,
      bytesUpload: user.bytesUpload,
      dailyBytesLimit: user.byteLimit,
      dailyBytesDld: 0, // Reset daily
      expert: user.expert ? 1 : 0,
      chatRemain: user.chatLimit - user.chatUsed,
      chatLimit: user.chatLimit,
      creditDays: 0,
      creditAmount: 0,
      creditStartDate: 0,
      creditTotalToDate: 0,
      creditTotalDate: 0,
      creditTracking: 0,
      translatorID: 0,
      msgBaseRJoin: 0, // TODO: Get from session
      confYM9: 0,
      todaysBytesLimit: user.byteLimit,
      protocol: 0,
      uucpa: user.uuCP ? 1 : 0,
      lineLength: 79,
      newUser: user.newUser ? 1 : 0,
    };
  }

  /**
   * Convert User to UserKeysFileStruct
   */
  private userToKeysStruct(user: User, slotNumber: number): UserKeysFileStruct {
    return {
      userName: user.username,
      number: slotNumber,
      newUser: user.newUser ? 1 : 0,
      oldUpCPS: Math.min(user.topUploadCPS, 65535), // Max 16-bit unsigned
      oldDnCPS: Math.min(user.topDownloadCPS, 65535),
      userFlags: user.userFlags,
      baud: 57600, // Max signed 16-bit is 32767, use 57600 as common high speed
      upCPS2: user.topUploadCPS,
      dnCPS2: user.topDownloadCPS,
      timesOnToday: user.callsToday,
    };
  }

  /**
   * Convert User to UserMiscFileStruct
   */
  private userToMiscStruct(user: User): UserMiscFileStruct {
    return {
      internetName: '', // Not used
      realName: user.realname,
      downloadBytesBCD: Buffer.alloc(8), // BCD encoding not implemented
      uploadBytesBCD: Buffer.alloc(8),
      eMail: user.email || '',
      lastDlCPS: user.topDownloadCPS,
      pwdHash: user.passwordHash.substring(0, 32),
      salt: '', // Not used with bcrypt
      pwdType: 1, // bcrypt
      forcePwdReset: 0,
      accountLocked: 0,
      invalidAttempts: 0,
      pwdLastUpdated: Math.floor(user.updated.getTime() / 1000),
      lastIP: 0,
      ipMask: 0,
      unused: Buffer.alloc(86),
    };
  }

  /**
   * Serialize UserFileStruct to binary buffer (239 bytes)
   */
  private serializeUserStruct(struct: UserFileStruct): Buffer {
    const buffer = Buffer.alloc(this.USER_STRUCT_SIZE);
    let offset = 0;

    // Strings (null-padded to fixed width)
    offset += this.writeString(buffer, offset, struct.name, 31);
    offset += this.writeString(buffer, offset, struct.pass, 9);
    offset += this.writeString(buffer, offset, struct.location, 30);
    offset += this.writeString(buffer, offset, struct.phoneNumber, 13);

    // INTs (2 bytes each, little-endian)
    offset = this.writeInt16(buffer, offset, struct.slotNumber);
    offset = this.writeInt16(buffer, offset, struct.secStatus);
    offset = this.writeInt16(buffer, offset, struct.secBoard);
    offset = this.writeInt16(buffer, offset, struct.secLibrary);
    offset = this.writeInt16(buffer, offset, struct.secBulletin);
    offset = this.writeInt16(buffer, offset, struct.messagesPosted);

    // LONGs (4 bytes each, little-endian)
    offset = this.writeInt32(buffer, offset, struct.newSinceDate);
    offset = this.writeInt32(buffer, offset, struct.pwdHash);
    offset = this.writeInt32(buffer, offset, struct.confRead2);
    offset = this.writeInt32(buffer, offset, struct.confRead3);

    // More INTs
    offset = this.writeInt16(buffer, offset, struct.zoomType);
    offset = this.writeInt16(buffer, offset, struct.unknown);
    offset = this.writeInt16(buffer, offset, struct.unknown2);
    offset = this.writeInt16(buffer, offset, struct.unknown3);
    offset = this.writeInt16(buffer, offset, struct.xferProtocol);
    offset = this.writeInt16(buffer, offset, struct.filler2);
    offset = this.writeInt16(buffer, offset, struct.lcFiles);
    offset = this.writeInt16(buffer, offset, struct.badFiles);

    // More LONGs
    offset = this.writeInt32(buffer, offset, struct.accountDate);

    // More INTs
    offset = this.writeInt16(buffer, offset, struct.screenType);
    offset = this.writeInt16(buffer, offset, struct.editorType);

    // Conference access string
    offset += this.writeString(buffer, offset, struct.conferenceAccess, 10);

    // More INTs
    offset = this.writeInt16(buffer, offset, struct.uploads);
    offset = this.writeInt16(buffer, offset, struct.downloads);
    offset = this.writeInt16(buffer, offset, struct.confRJoin);
    offset = this.writeInt16(buffer, offset, struct.timesCalled);

    // LONGs
    offset = this.writeInt32(buffer, offset, struct.timeLastOn);
    offset = this.writeInt32(buffer, offset, struct.timeUsed);
    offset = this.writeInt32(buffer, offset, struct.timeLimit);
    offset = this.writeInt32(buffer, offset, struct.timeTotal);
    offset = this.writeInt32(buffer, offset, struct.bytesDownload);
    offset = this.writeInt32(buffer, offset, struct.bytesUpload);
    offset = this.writeInt32(buffer, offset, struct.dailyBytesLimit);
    offset = this.writeInt32(buffer, offset, struct.dailyBytesDld);

    // CHAR
    buffer.writeUInt8(struct.expert, offset++);

    // Padding for alignment (E structs align LONGs to 4-byte boundaries)
    // After expert (1 byte), we need 3 bytes padding to align chatRemain (LONG)
    buffer.writeUInt8(0, offset++);
    buffer.writeUInt8(0, offset++);
    buffer.writeUInt8(0, offset++);

    // More LONGs
    offset = this.writeInt32(buffer, offset, struct.chatRemain);
    offset = this.writeInt32(buffer, offset, struct.chatLimit);
    offset = this.writeInt32(buffer, offset, struct.creditDays);
    offset = this.writeInt32(buffer, offset, struct.creditAmount);
    offset = this.writeInt32(buffer, offset, struct.creditStartDate);
    offset = this.writeInt32(buffer, offset, struct.creditTotalToDate);
    offset = this.writeInt32(buffer, offset, struct.creditTotalDate);

    // CHARs
    buffer.writeUInt8(struct.creditTracking, offset++);
    buffer.writeUInt8(struct.translatorID, offset++);

    // INT
    offset = this.writeInt16(buffer, offset, struct.msgBaseRJoin);

    // LONGs
    offset = this.writeInt32(buffer, offset, struct.confYM9);
    offset = this.writeInt32(buffer, offset, struct.todaysBytesLimit);

    // CHARs
    buffer.writeUInt8(struct.protocol, offset++);
    buffer.writeUInt8(struct.uucpa, offset++);
    buffer.writeUInt8(struct.lineLength, offset++);
    buffer.writeUInt8(struct.newUser, offset++);

    // Final padding to reach 239 bytes (E structs may have trailing padding for alignment)
    while (offset < this.USER_STRUCT_SIZE) {
      buffer.writeUInt8(0, offset++);
    }

    console.log(`[UserFileManager] Serialized user struct: ${offset} bytes (expected ${this.USER_STRUCT_SIZE})`);
    return buffer;
  }

  /**
   * Serialize UserKeysFileStruct to binary buffer (54 bytes)
   */
  private serializeUserKeysStruct(struct: UserKeysFileStruct): Buffer {
    const buffer = Buffer.alloc(this.USERKEYS_STRUCT_SIZE);
    let offset = 0;

    offset += this.writeString(buffer, offset, struct.userName, 31);
    offset = this.writeInt32(buffer, offset, struct.number);
    buffer.writeUInt8(struct.newUser, offset++);
    offset = this.writeInt16(buffer, offset, struct.oldUpCPS);
    offset = this.writeInt16(buffer, offset, struct.oldDnCPS);
    offset = this.writeInt16(buffer, offset, struct.userFlags);
    offset = this.writeInt16(buffer, offset, struct.baud);
    offset = this.writeInt32(buffer, offset, struct.upCPS2);
    offset = this.writeInt32(buffer, offset, struct.dnCPS2);
    offset = this.writeInt16(buffer, offset, struct.timesOnToday);

    console.log(`[UserFileManager] Serialized userKeys struct: ${offset} bytes (expected ${this.USERKEYS_STRUCT_SIZE})`);
    return buffer;
  }

  /**
   * Serialize UserMiscFileStruct to binary buffer (256 bytes)
   */
  private serializeUserMiscStruct(struct: UserMiscFileStruct): Buffer {
    const buffer = Buffer.alloc(this.USERMISC_STRUCT_SIZE);
    let offset = 0;

    offset += this.writeString(buffer, offset, struct.internetName, 10);
    offset += this.writeString(buffer, offset, struct.realName, 26);
    struct.downloadBytesBCD.copy(buffer, offset); offset += 8;
    struct.uploadBytesBCD.copy(buffer, offset); offset += 8;
    offset += this.writeString(buffer, offset, struct.eMail, 50);
    offset = this.writeInt32(buffer, offset, struct.lastDlCPS);
    offset += this.writeString(buffer, offset, struct.pwdHash, 32);
    offset += this.writeString(buffer, offset, struct.salt, 8);
    buffer.writeUInt8(struct.pwdType, offset++);
    buffer.writeUInt8(struct.forcePwdReset, offset++);
    buffer.writeUInt8(struct.accountLocked, offset++);
    buffer.writeUInt8(struct.invalidAttempts, offset++);
    offset = this.writeInt32(buffer, offset, struct.pwdLastUpdated);
    offset = this.writeInt32(buffer, offset, struct.lastIP);
    offset = this.writeInt32(buffer, offset, struct.ipMask);
    struct.unused.copy(buffer, offset); offset += 86;

    // Final padding to reach 256 bytes
    while (offset < this.USERMISC_STRUCT_SIZE) {
      buffer.writeUInt8(0, offset++);
    }

    console.log(`[UserFileManager] Serialized userMisc struct: ${offset} bytes (expected ${this.USERMISC_STRUCT_SIZE})`);
    return buffer;
  }

  // Helper methods for binary writing
  private writeString(buffer: Buffer, offset: number, str: string, maxLen: number): number {
    const trimmed = str.substring(0, maxLen - 1); // Leave room for null terminator
    buffer.write(trimmed, offset, maxLen, 'ascii');
    // Null-pad the rest
    for (let i = trimmed.length; i < maxLen; i++) {
      buffer.writeUInt8(0, offset + i);
    }
    return maxLen;
  }

  private writeInt16(buffer: Buffer, offset: number, value: number): number {
    // Clamp to signed 16-bit range (-32768 to 32767)
    const clamped = Math.max(-32768, Math.min(32767, value));
    buffer.writeInt16LE(clamped, offset);
    return offset + 2;
  }

  private writeInt32(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt32LE(value, offset);
    return offset + 4;
  }

  // Helper methods for E enum conversions
  private zoomTypeToInt(zoomType: string): number {
    const map: { [key: string]: number } = {
      'QWK': 0,
      'BlueWave': 1,
      'OPX': 2,
    };
    return map[zoomType] || 0;
  }

  private protocolToInt(protocol: string): number {
    const map: { [key: string]: number } = {
      '/X Zmodem': 0,
      'Zmodem': 1,
      'Ymodem': 2,
      'Xmodem': 3,
    };
    return map[protocol] || 0;
  }

  private screenTypeToInt(screenType: string): number {
    const map: { [key: string]: number } = {
      'Amiga Ansi': 0,
      'PC Ansi': 1,
      'ASCII': 2,
    };
    return map[screenType] || 0;
  }

  private editorTypeToInt(editor: string): number {
    const map: { [key: string]: number } = {
      'Prompt': 0,
      'Line': 1,
      'Full': 2,
    };
    return map[editor] || 0;
  }

  /**
   * Write all 3 user files (data/keys/misc) for a single user
   * Appends to files if they exist, creates if not
   */
  public writeUserFiles(user: User, slotNumber: number): void {
    try {
      this.ensureUserFilesReady();
      // Convert to file structs
      const userStruct = this.userToFileStruct(user, slotNumber);
      const keysStruct = this.userToKeysStruct(user, slotNumber);
      const miscStruct = this.userToMiscStruct(user);

      // Serialize to buffers
      const userBuffer = this.serializeUserStruct(userStruct);
      const keysBuffer = this.serializeUserKeysStruct(keysStruct);
      const miscBuffer = this.serializeUserMiscStruct(miscStruct);

      // Append to files (create if not exist)
      fs.appendFileSync(this.userDataPath, userBuffer);
      fs.appendFileSync(this.userKeysPath, keysBuffer);
      fs.appendFileSync(this.userMiscPath, miscBuffer);

      console.log(`[UserFileManager] Wrote user files for ${user.username} (slot ${slotNumber})`);
    } catch (error) {
      console.error(`[UserFileManager] Error writing user files:`, error);
      throw error;
    }
  }

  /**
   * Read all users from user.data file
   * Returns array of UserFileStruct
   */
  public readUserDataFile(): UserFileStruct[] {
    try {
      this.ensureUserFilesReady();
      if (!fs.existsSync(this.userDataPath)) {
        console.log('[UserFileManager] user.data does not exist, returning empty array');
        return [];
      }

      const buffer = fs.readFileSync(this.userDataPath);
      const numUsers = buffer.length / this.USER_STRUCT_SIZE;

      if (buffer.length % this.USER_STRUCT_SIZE !== 0) {
        console.warn(`[UserFileManager] user.data file size ${buffer.length} is not a multiple of ${this.USER_STRUCT_SIZE}`);
      }

      const users: UserFileStruct[] = [];
      // TODO: Implement deserialization
      // For now, just log
      console.log(`[UserFileManager] Read ${Math.floor(numUsers)} user records from user.data`);

      return users;
    } catch (error) {
      console.error('[UserFileManager] Error reading user.data:', error);
      return [];
    }
  }

  /**
   * Update a specific user's record in user.data, user.keys, and user.misc
   * Writes to the correct slot position (slots are 1-indexed in AmiExpress)
   */
  public updateUserDataFile(user: User, slotNumber: number): void {
    try {
      this.ensureUserFilesReady();
      // Convert to file structs
      const userStruct = this.userToFileStruct(user, slotNumber);
      const keysStruct = this.userToKeysStruct(user, slotNumber);
      const miscStruct = this.userToMiscStruct(user);

      // Serialize to buffers
      const userBuffer = this.serializeUserStruct(userStruct);
      const keysBuffer = this.serializeUserKeysStruct(keysStruct);
      const miscBuffer = this.serializeUserMiscStruct(miscStruct);

      // Calculate file offsets (slots are 1-indexed in AmiExpress)
      const userOffset = (slotNumber - 1) * this.USER_STRUCT_SIZE;
      const keysOffset = (slotNumber - 1) * this.USERKEYS_STRUCT_SIZE;
      const miscOffset = (slotNumber - 1) * this.USERMISC_STRUCT_SIZE;

      // Update all three files at the correct offsets
      this.updateFileAtOffset(this.userDataPath, userBuffer, userOffset);
      this.updateFileAtOffset(this.userKeysPath, keysBuffer, keysOffset);
      this.updateFileAtOffset(this.userMiscPath, miscBuffer, miscOffset);

      console.log(`[UserFileManager] Updated user files for ${user.username} (slot ${slotNumber})`);
    } catch (error) {
      console.error('[UserFileManager] Error updating user files:', error);
      throw error;
    }
  }

  /**
   * Update a file at a specific byte offset
   * Creates file if it doesn't exist, expands if needed
   */
  private updateFileAtOffset(filePath: string, buffer: Buffer, offset: number): void {
    try {
      let fd: number;

      // Open file for reading and writing, create if doesn't exist
      if (!fs.existsSync(filePath)) {
        fd = fs.openSync(filePath, 'w+');
      } else {
        fd = fs.openSync(filePath, 'r+');

        // Check if we need to expand the file
        const stats = fs.fstatSync(fd);
        const requiredSize = offset + buffer.length;

        if (stats.size < requiredSize) {
          // Expand file with zeros
          const padding = Buffer.alloc(requiredSize - stats.size);
          fs.writeSync(fd, padding, 0, padding.length, stats.size);
        }
      }

      // Write buffer at offset
      fs.writeSync(fd, buffer, 0, buffer.length, offset);
      fs.closeSync(fd);
    } catch (error) {
      console.error(`[UserFileManager] Error updating file ${filePath} at offset ${offset}:`, error);
      throw error;
    }
  }

  /**
   * Initialize empty user database files
   */
  public initializeUserFiles(): void {
    try {
      this.ensureBinaryFile(this.userDataPath, 'user.data');
      this.ensureBinaryFile(this.userKeysPath, 'user.keys');
      this.ensureBinaryFile(this.userMiscPath, 'user.misc');
    } catch (error) {
      console.error('[UserFileManager] Error initializing user files:', error);
      throw error;
    }
  }

  private ensureBinaryFile(filePath: string, label: string): void {
    try {
      if (fs.existsSync(filePath)) {
        const stats = fs.lstatSync(filePath);
        if (stats.isDirectory()) {
          const backupPath = `${filePath}.dir-backup`;
          if (fs.existsSync(backupPath)) {
            fs.rmSync(backupPath, { recursive: true, force: true });
          }
          fs.renameSync(filePath, backupPath);
          console.warn(`[UserFileManager] ${label} was a directory, moved to ${backupPath}`);
        }
      }

      if (!fs.existsSync(filePath)) {
        fs.writeFileSync(filePath, Buffer.alloc(0));
        console.log(`[UserFileManager] Created empty ${label}`);
      }
    } catch (error) {
      console.error(`[UserFileManager] Error ensuring ${label}:`, error);
      throw error;
    }
  }

  private ensureUserFilesReady(): void {
    this.ensureBinaryFile(this.userDataPath, 'user.data');
    this.ensureBinaryFile(this.userKeysPath, 'user.keys');
    this.ensureBinaryFile(this.userMiscPath, 'user.misc');
  }
}

// Export singleton instance
export const userFileManager = new UserFileManager();

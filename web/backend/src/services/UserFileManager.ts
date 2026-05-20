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
  // Correct struct sizes matching mtop.e and Amiga E alignment rules
  // See Documentation/7-Reference Sources/AmiExpressEDoorSources/MultiTop2/mtop.e
  private readonly USER_STRUCT_SIZE = 232;     // mtop reads 232 bytes per user
  private readonly USERKEYS_STRUCT_SIZE = 56;  // mtop reads 56 bytes per userKeys
  private readonly USERMISC_STRUCT_SIZE = 248; // mtop reads 248 bytes per userMisc

  constructor() {
    // BBS: logical assignment points to project root.
    // Production (Docker) sets BBS_DATA_DIR pointing at the persistent volume;
    // legacy installs may set BBS_ROOT; dev falls back to the calculated path.
    // __dirname when compiled is /dist/services and with tsx it's /src/services,
    // so go 4 levels up either way: dist|src -> backend -> web -> amiexpress-web.
    this.bbsRoot = process.env.BBS_DATA_DIR || process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    this.userDataPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.data'));
    this.userKeysPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.keys'));
    this.userMiscPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.misc'));

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
      messagesPosted: user.messagesPosted || 0, // From user record (tracked by BBS)
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
      confRJoin: user.confRJoin || user.autoRejoin || 1, // Auto-rejoin conference (default to 1)
      timesCalled: user.calls,
      timeLastOn: Math.floor((user.lastLogin?.getTime() || Date.now()) / 1000),
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
      msgBaseRJoin: 1, // Default to first message base (not stored in user record, only in session)
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
    // Convert bytesUpload/bytesDownload to BCD format for Amiga compatibility
    const downloadBytes = user.bytesDownload || (user as any).downloadBytes || 0;
    const uploadBytes = user.bytesUpload || (user as any).uploadBytes || 0;

    return {
      internetName: '', // Not used
      realName: user.realname,
      downloadBytesBCD: this.numberToBCD(downloadBytes),
      uploadBytesBCD: this.numberToBCD(uploadBytes),
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
    // 1 byte padding after phoneNumber[13] to align slotNumber (INT) to even address
    buffer.writeUInt8(0, offset++);

    // INTs (2 bytes each, big-endian for 68K)
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

    // Conference access map — 10 raw bytes, NOT null-terminated (every
    // position is a meaningful access flag). writeFixedBytes preserves
    // all 10 positions; writeString would reserve byte 10 for a null
    // terminator and lose conf-10's access.
    offset += this.writeFixedBytes(buffer, offset, struct.conferenceAccess, 10);

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

    // 68K aligns to 2-byte boundaries (even addresses), not 4-byte
    // After expert (1 byte), we need 1 byte padding to align chatRemain (LONG) to even
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

    // Offset should now be exactly 232 bytes (matching mtop expectations)
    if (offset !== this.USER_STRUCT_SIZE) {
console.warn(`[UserFileManager] User struct size mismatch: ${offset} bytes, expected ${this.USER_STRUCT_SIZE}`);
    }
console.log(`[UserFileManager] Serialized user struct: ${offset} bytes (expected ${this.USER_STRUCT_SIZE})`);
    return buffer;
  }

  /**
   * Serialize UserKeysFileStruct to binary buffer (56 bytes)
   * Layout with 68K alignment padding:
   * - userName[31] = 31 bytes (offsets 0-30)
   * - [1 byte padding to align LONG]
   * - number = 4 bytes (offsets 32-35)
   * - newUser = 1 byte (offset 36)
   * - [1 byte padding to align INT]
   * - oldUpCPS = 2 bytes (offsets 38-39)
   * - etc.
   */
  private serializeUserKeysStruct(struct: UserKeysFileStruct): Buffer {
    const buffer = Buffer.alloc(this.USERKEYS_STRUCT_SIZE);
    let offset = 0;

    offset += this.writeString(buffer, offset, struct.userName, 31);
    // 1 byte padding after userName[31] to align number (LONG) to even address
    buffer.writeUInt8(0, offset++);
    offset = this.writeInt32(buffer, offset, struct.number);
    buffer.writeUInt8(struct.newUser, offset++);
    // 1 byte padding after newUser to align oldUpCPS (INT) to even address
    buffer.writeUInt8(0, offset++);
    offset = this.writeInt16(buffer, offset, struct.oldUpCPS);
    offset = this.writeInt16(buffer, offset, struct.oldDnCPS);
    offset = this.writeInt16(buffer, offset, struct.userFlags);
    offset = this.writeInt16(buffer, offset, struct.baud);
    offset = this.writeInt32(buffer, offset, struct.upCPS2);
    offset = this.writeInt32(buffer, offset, struct.dnCPS2);
    offset = this.writeInt16(buffer, offset, struct.timesOnToday);

    if (offset !== this.USERKEYS_STRUCT_SIZE) {
console.warn(`[UserFileManager] UserKeys struct size mismatch: ${offset} bytes, expected ${this.USERKEYS_STRUCT_SIZE}`);
    }
console.log(`[UserFileManager] Serialized userKeys struct: ${offset} bytes (expected ${this.USERKEYS_STRUCT_SIZE})`);
    return buffer;
  }

  /**
   * Serialize UserMiscFileStruct to binary buffer (248 bytes)
   * Layout: 10+26+8+8+50+4+32+8+4+4+4+4+86 = 248
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
    // pwdHash[32] (SHA256 — exactly 32 hex chars, no null terminator)
    // and salt[8] (raw 8 bytes) are fixed-width like conferenceAccess.
    // writeString would steal one byte each for a null terminator and
    // silently truncate the hash / salt, breaking auth verification on
    // any future pwdType != 1 (bcrypt) configuration. Use
    // writeFixedBytes so all bytes carry data.
    offset += this.writeFixedBytes(buffer, offset, struct.pwdHash, 32);
    offset += this.writeFixedBytes(buffer, offset, struct.salt, 8);
    buffer.writeUInt8(struct.pwdType, offset++);
    buffer.writeUInt8(struct.forcePwdReset, offset++);
    buffer.writeUInt8(struct.accountLocked, offset++);
    buffer.writeUInt8(struct.invalidAttempts, offset++);
    offset = this.writeInt32(buffer, offset, struct.pwdLastUpdated);
    offset = this.writeInt32(buffer, offset, struct.lastIP);
    offset = this.writeInt32(buffer, offset, struct.ipMask);
    struct.unused.copy(buffer, offset); offset += 86;

    // Offset should now be exactly 248 bytes (matching mtop expectations)
    if (offset !== this.USERMISC_STRUCT_SIZE) {
console.warn(`[UserFileManager] UserMisc struct size mismatch: ${offset} bytes, expected ${this.USERMISC_STRUCT_SIZE}`);
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

  /**
   * Write a fixed-width byte field that is NOT a C-style null-terminated
   * string. Used for `conferenceAccess[10]` — AmiExpress treats this as
   * a 10-byte access bitmap (each byte 'X' = access, '_' = no access),
   * with ALL 10 bytes meaningful. writeString reserves byte N-1 for a
   * null terminator and that loses position 10's flag, so for any user
   * granted access to confs 1..10 the door reads only confs 1..9 from
   * binary. Bug surfaced 2026-05-20 during the live-vs-localhost
   * confaccess investigation; the SQLite-first read in door.handler.ts
   * (commit 731f63f20) bypassed the symptom, but binary write was still
   * losing data. Fix it here so future binary readers see the full map.
   */
  private writeFixedBytes(buffer: Buffer, offset: number, str: string, maxLen: number): number {
    const trimmed = str.substring(0, maxLen);
    buffer.write(trimmed, offset, maxLen, 'ascii');
    for (let i = trimmed.length; i < maxLen; i++) {
      buffer.writeUInt8(0, offset + i);
    }
    return maxLen;
  }

  private writeInt16(buffer: Buffer, offset: number, value: number): number {
    // Clamp to signed 16-bit range (-32768 to 32767)
    // Use big-endian for Amiga 68K compatibility
    const clamped = Math.max(-32768, Math.min(32767, value));
    buffer.writeInt16BE(clamped, offset);
    return offset + 2;
  }

  private writeInt32(buffer: Buffer, offset: number, value: number): number {
    // Use big-endian for Amiga 68K compatibility
    buffer.writeInt32BE(value, offset);
    return offset + 4;
  }

  // Helper methods for binary reading
  private readString(buffer: Buffer, offset: number, maxLen: number): { value: string; bytesRead: number } {
    let str = '';
    for (let i = 0; i < maxLen; i++) {
      const byte = buffer.readUInt8(offset + i);
      if (byte === 0) break; // Null terminator
      str += String.fromCharCode(byte);
    }
    return { value: str, bytesRead: maxLen };
  }

  private readInt16(buffer: Buffer, offset: number): number {
    // Use big-endian for Amiga 68K compatibility
    return buffer.readInt16BE(offset);
  }

  private readInt32(buffer: Buffer, offset: number): number {
    // Use big-endian for Amiga 68K compatibility
    return buffer.readInt32BE(offset);
  }

  // Helper methods for E enum conversions (write)
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

  // Helper methods for E enum conversions (read)
  private intToZoomType(value: number): string {
    const map: { [key: number]: string } = {
      0: 'QWK',
      1: 'BlueWave',
      2: 'OPX',
    };
    return map[value] || 'QWK';
  }

  private intToProtocol(value: number): string {
    const map: { [key: number]: string } = {
      0: '/X Zmodem',
      1: 'Zmodem',
      2: 'Ymodem',
      3: 'Xmodem',
    };
    return map[value] || '/X Zmodem';
  }

  private intToScreenType(value: number): string {
    const map: { [key: number]: string } = {
      0: 'Amiga Ansi',
      1: 'PC Ansi',
      2: 'ASCII',
    };
    return map[value] || 'Amiga Ansi';
  }

  private intToEditorType(value: number): string {
    const map: { [key: number]: string } = {
      0: 'Prompt',
      1: 'Line',
      2: 'Full',
    };
    return map[value] || 'Prompt';
  }

  /**
   * Convert a number to 8-byte BCD (Binary Coded Decimal) buffer
   * Amiga BCD format: each byte holds two decimal digits (upper nibble, lower nibble)
   * 8 bytes = 16 decimal digits, stored big-endian (most significant first)
   *
   * Example: 12345 -> [0x00, 0x00, 0x00, 0x00, 0x00, 0x01, 0x23, 0x45]
   */
  private numberToBCD(value: number): Buffer {
    const buffer = Buffer.alloc(8, 0);

    // Handle edge cases
    if (value <= 0 || !Number.isFinite(value)) {
      return buffer; // Return all zeros
    }

    // Convert to string to get decimal digits
    const str = Math.floor(value).toString();

    // Pad to 16 digits (for 8 bytes)
    const padded = str.padStart(16, '0');

    // Pack two digits per byte, starting from the left (big-endian)
    for (let i = 0; i < 8; i++) {
      const highDigit = parseInt(padded[i * 2], 10);
      const lowDigit = parseInt(padded[i * 2 + 1], 10);
      buffer[i] = (highDigit << 4) | lowDigit;
    }

    return buffer;
  }

  /**
   * Deserialize UserFileStruct from binary buffer (239 bytes)
   * Reverses serializeUserStruct()
   */
  private deserializeUserStruct(buffer: Buffer, offset: number = 0): UserFileStruct {
    let pos = offset;

    // Strings (null-padded to fixed width)
    const name = this.readString(buffer, pos, 31);
    pos += name.bytesRead;
    const pass = this.readString(buffer, pos, 9);
    pos += pass.bytesRead;
    const location = this.readString(buffer, pos, 30);
    pos += location.bytesRead;
    const phoneNumber = this.readString(buffer, pos, 13);
    pos += phoneNumber.bytesRead;
    // 1 byte padding after phoneNumber[13] to align slotNumber (INT) to even address
    pos += 1;

    // INTs (2 bytes each, big-endian for 68K)
    const slotNumber = this.readInt16(buffer, pos); pos += 2;
    const secStatus = this.readInt16(buffer, pos); pos += 2;
    const secBoard = this.readInt16(buffer, pos); pos += 2;
    const secLibrary = this.readInt16(buffer, pos); pos += 2;
    const secBulletin = this.readInt16(buffer, pos); pos += 2;
    const messagesPosted = this.readInt16(buffer, pos); pos += 2;

    // LONGs (4 bytes each, little-endian)
    const newSinceDate = this.readInt32(buffer, pos); pos += 4;
    const pwdHash = this.readInt32(buffer, pos); pos += 4;
    const confRead2 = this.readInt32(buffer, pos); pos += 4;
    const confRead3 = this.readInt32(buffer, pos); pos += 4;

    // More INTs
    const zoomType = this.readInt16(buffer, pos); pos += 2;
    const unknown = this.readInt16(buffer, pos); pos += 2;
    const unknown2 = this.readInt16(buffer, pos); pos += 2;
    const unknown3 = this.readInt16(buffer, pos); pos += 2;
    const xferProtocol = this.readInt16(buffer, pos); pos += 2;
    const filler2 = this.readInt16(buffer, pos); pos += 2;
    const lcFiles = this.readInt16(buffer, pos); pos += 2;
    const badFiles = this.readInt16(buffer, pos); pos += 2;

    // More LONGs
    const accountDate = this.readInt32(buffer, pos); pos += 4;

    // More INTs
    const screenType = this.readInt16(buffer, pos); pos += 2;
    const editorType = this.readInt16(buffer, pos); pos += 2;

    // Conference access string
    const conferenceAccess = this.readString(buffer, pos, 10);
    pos += conferenceAccess.bytesRead;

    // More INTs
    const uploads = this.readInt16(buffer, pos); pos += 2;
    const downloads = this.readInt16(buffer, pos); pos += 2;
    const confRJoin = this.readInt16(buffer, pos); pos += 2;
    const timesCalled = this.readInt16(buffer, pos); pos += 2;

    // LONGs
    const timeLastOn = this.readInt32(buffer, pos); pos += 4;
    const timeUsed = this.readInt32(buffer, pos); pos += 4;
    const timeLimit = this.readInt32(buffer, pos); pos += 4;
    const timeTotal = this.readInt32(buffer, pos); pos += 4;
    const bytesDownload = this.readInt32(buffer, pos); pos += 4;
    const bytesUpload = this.readInt32(buffer, pos); pos += 4;
    const dailyBytesLimit = this.readInt32(buffer, pos); pos += 4;
    const dailyBytesDld = this.readInt32(buffer, pos); pos += 4;

    // CHAR
    const expert = buffer.readUInt8(pos); pos++;

    // 68K aligns to 2-byte boundaries, so only 1 byte padding after expert
    pos += 1;

    // More LONGs
    const chatRemain = this.readInt32(buffer, pos); pos += 4;
    const chatLimit = this.readInt32(buffer, pos); pos += 4;
    const creditDays = this.readInt32(buffer, pos); pos += 4;
    const creditAmount = this.readInt32(buffer, pos); pos += 4;
    const creditStartDate = this.readInt32(buffer, pos); pos += 4;
    const creditTotalToDate = this.readInt32(buffer, pos); pos += 4;
    const creditTotalDate = this.readInt32(buffer, pos); pos += 4;

    // CHARs
    const creditTracking = buffer.readUInt8(pos); pos++;
    const translatorID = buffer.readUInt8(pos); pos++;

    // INT
    const msgBaseRJoin = this.readInt16(buffer, pos); pos += 2;

    // LONGs
    const confYM9 = this.readInt32(buffer, pos); pos += 4;
    const todaysBytesLimit = this.readInt32(buffer, pos); pos += 4;

    // CHARs
    const protocol = buffer.readUInt8(pos); pos++;
    const uucpa = buffer.readUInt8(pos); pos++;
    const lineLength = buffer.readUInt8(pos); pos++;
    const newUser = buffer.readUInt8(pos); pos++;

    return {
      name: name.value,
      pass: pass.value,
      location: location.value,
      phoneNumber: phoneNumber.value,
      slotNumber,
      secStatus,
      secBoard,
      secLibrary,
      secBulletin,
      messagesPosted,
      newSinceDate,
      pwdHash,
      confRead2,
      confRead3,
      zoomType,
      unknown,
      unknown2,
      unknown3,
      xferProtocol,
      filler2,
      lcFiles,
      badFiles,
      accountDate,
      screenType,
      editorType,
      conferenceAccess: conferenceAccess.value,
      uploads,
      downloads,
      confRJoin,
      timesCalled,
      timeLastOn,
      timeUsed,
      timeLimit,
      timeTotal,
      bytesDownload,
      bytesUpload,
      dailyBytesLimit,
      dailyBytesDld,
      expert,
      chatRemain,
      chatLimit,
      creditDays,
      creditAmount,
      creditStartDate,
      creditTotalToDate,
      creditTotalDate,
      creditTracking,
      translatorID,
      msgBaseRJoin,
      confYM9,
      todaysBytesLimit,
      protocol,
      uucpa,
      lineLength,
      newUser,
    };
  }

  /**
   * Deserialize UserKeysFileStruct from binary buffer (56 bytes)
   * Reverses serializeUserKeysStruct()
   */
  private deserializeUserKeysStruct(buffer: Buffer, offset: number = 0): UserKeysFileStruct {
    let pos = offset;

    const userName = this.readString(buffer, pos, 31);
    pos += userName.bytesRead;
    // 1 byte padding after userName[31] to align number (LONG) to even address
    pos += 1;
    const number = this.readInt32(buffer, pos); pos += 4;
    const newUser = buffer.readUInt8(pos); pos++;
    // 1 byte padding after newUser to align oldUpCPS (INT) to even address
    pos += 1;
    const oldUpCPS = this.readInt16(buffer, pos); pos += 2;
    const oldDnCPS = this.readInt16(buffer, pos); pos += 2;
    const userFlags = this.readInt16(buffer, pos); pos += 2;
    const baud = this.readInt16(buffer, pos); pos += 2;
    const upCPS2 = this.readInt32(buffer, pos); pos += 4;
    const dnCPS2 = this.readInt32(buffer, pos); pos += 4;
    const timesOnToday = this.readInt16(buffer, pos); pos += 2;

    return {
      userName: userName.value,
      number,
      newUser,
      oldUpCPS,
      oldDnCPS,
      userFlags,
      baud,
      upCPS2,
      dnCPS2,
      timesOnToday,
    };
  }

  /**
   * Deserialize UserMiscFileStruct from binary buffer (248 bytes)
   * Reverses serializeUserMiscStruct()
   */
  private deserializeUserMiscStruct(buffer: Buffer, offset: number = 0): UserMiscFileStruct {
    let pos = offset;

    const internetName = this.readString(buffer, pos, 10);
    pos += internetName.bytesRead;
    const realName = this.readString(buffer, pos, 26);
    pos += realName.bytesRead;
    const downloadBytesBCD = buffer.subarray(pos, pos + 8); pos += 8;
    const uploadBytesBCD = buffer.subarray(pos, pos + 8); pos += 8;
    const eMail = this.readString(buffer, pos, 50);
    pos += eMail.bytesRead;
    const lastDlCPS = this.readInt32(buffer, pos); pos += 4;
    const pwdHash = this.readString(buffer, pos, 32);
    pos += pwdHash.bytesRead;
    const salt = this.readString(buffer, pos, 8);
    pos += salt.bytesRead;
    const pwdType = buffer.readUInt8(pos); pos++;
    const forcePwdReset = buffer.readUInt8(pos); pos++;
    const accountLocked = buffer.readUInt8(pos); pos++;
    const invalidAttempts = buffer.readUInt8(pos); pos++;
    const pwdLastUpdated = this.readInt32(buffer, pos); pos += 4;
    const lastIP = this.readInt32(buffer, pos); pos += 4;
    const ipMask = this.readInt32(buffer, pos); pos += 4;
    const unused = buffer.subarray(pos, pos + 86); pos += 86;

    return {
      internetName: internetName.value,
      realName: realName.value,
      downloadBytesBCD,
      uploadBytesBCD,
      eMail: eMail.value,
      lastDlCPS,
      pwdHash: pwdHash.value,
      salt: salt.value,
      pwdType,
      forcePwdReset,
      accountLocked,
      invalidAttempts,
      pwdLastUpdated,
      lastIP,
      ipMask,
      unused,
    };
  }

  /**
   * Convert file structs back to User object
   * Reverses userToFileStruct(), userToKeysStruct(), userToMiscStruct()
   */
  private fileStructsToUser(
    userStruct: UserFileStruct,
    keysStruct: UserKeysFileStruct,
    miscStruct: UserMiscFileStruct,
    userId: string,
    fileModTime: Date
  ): User {
    return {
      id: userId,
      username: userStruct.name,
      passwordHash: miscStruct.pwdHash || '',
      realname: miscStruct.realName,
      location: userStruct.location,
      phone: userStruct.phoneNumber,
      email: miscStruct.eMail,
      secLevel: userStruct.secStatus,
      uploads: userStruct.uploads,
      downloads: userStruct.downloads,
      bytesUpload: userStruct.bytesUpload,
      bytesDownload: userStruct.bytesDownload,
      ratio: userStruct.secLibrary,
      ratioType: userStruct.secBoard,
      timeTotal: userStruct.timeTotal,
      timeLimit: userStruct.timeLimit,
      timeUsed: userStruct.timeUsed,
      chatLimit: userStruct.chatLimit,
      chatUsed: Math.max(0, userStruct.chatLimit - userStruct.chatRemain),
      lastLogin: userStruct.timeLastOn > 0 ? new Date(userStruct.timeLastOn * 1000) : undefined,
      firstLogin: new Date(userStruct.accountDate * 1000),
      calls: userStruct.timesCalled,
      callsToday: keysStruct.timesOnToday,
      messagesPosted: userStruct.messagesPosted,
      newUser: userStruct.newUser > 0,
      expert: userStruct.expert > 0 ? 'X' : 'N',
      ansi: userStruct.screenType !== 2, // Not ASCII
      linesPerScreen: userStruct.lineLength,
      computer: '', // Not stored in binary files
      screenType: this.intToScreenType(userStruct.screenType),
      protocol: this.intToProtocol(userStruct.xferProtocol),
      editor: this.intToEditorType(userStruct.editorType),
      zoomType: this.intToZoomType(userStruct.zoomType),
      availableForChat: true, // Default value
      quietNode: false, // Default value
      autoRejoin: userStruct.confRJoin,
      confAccess: userStruct.conferenceAccess,
      areaName: '', // Not stored in binary files
      uuCP: userStruct.uucpa > 0,
      topUploadCPS: keysStruct.upCPS2,
      topDownloadCPS: keysStruct.dnCPS2,
      byteLimit: userStruct.dailyBytesLimit,
      dailyBytesDld: userStruct.dailyBytesDld,
      newSinceDate: userStruct.newSinceDate > 0 ? new Date(userStruct.newSinceDate * 1000) : undefined,
      creditDays: userStruct.creditDays,
      creditAmount: userStruct.creditAmount,
      creditStartDate: userStruct.creditStartDate,
      creditTotalToDate: userStruct.creditTotalToDate,
      creditTotalDate: userStruct.creditTotalDate,
      creditTracking: userStruct.creditTracking,
      baud: keysStruct.baud,
      userFlags: keysStruct.userFlags,
      created: new Date(userStruct.accountDate * 1000),
      updated: fileModTime,
    };
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
      const numUsers = Math.floor(buffer.length / this.USER_STRUCT_SIZE);

      if (buffer.length % this.USER_STRUCT_SIZE !== 0) {
console.warn(`[UserFileManager] user.data file size ${buffer.length} is not a multiple of ${this.USER_STRUCT_SIZE}`);
      }

      const users: UserFileStruct[] = [];
      for (let i = 0; i < numUsers; i++) {
        const offset = i * this.USER_STRUCT_SIZE;
        const userStruct = this.deserializeUserStruct(buffer, offset);
        users.push(userStruct);
      }

console.log(`[UserFileManager] Read ${users.length} user records from user.data`);
      return users;
    } catch (error) {
console.error('[UserFileManager] Error reading user.data:', error);
      return [];
    }
  }

  /**
   * Read all users from all three binary files and convert to User objects
   * DISK-BASED: Returns users from user.data/keys/misc files, NOT database
   */
  public readAllUsers(): User[] {
    try {
      this.ensureUserFilesReady();

      // Check if all three files exist
      if (!fs.existsSync(this.userDataPath)) {
console.log('[UserFileManager] user.data does not exist, returning empty array');
        return [];
      }
      if (!fs.existsSync(this.userKeysPath)) {
console.log('[UserFileManager] user.keys does not exist, returning empty array');
        return [];
      }
      if (!fs.existsSync(this.userMiscPath)) {
console.log('[UserFileManager] user.misc does not exist, returning empty array');
        return [];
      }

      // Read all three files and get file stats for stable timestamps
      const userDataBuffer = fs.readFileSync(this.userDataPath);
      const userKeysBuffer = fs.readFileSync(this.userKeysPath);
      const userMiscBuffer = fs.readFileSync(this.userMiscPath);
      const userDataStats = fs.statSync(this.userDataPath);

      const numUsersData = Math.floor(userDataBuffer.length / this.USER_STRUCT_SIZE);
      const numUsersKeys = Math.floor(userKeysBuffer.length / this.USERKEYS_STRUCT_SIZE);
      const numUsersMisc = Math.floor(userMiscBuffer.length / this.USERMISC_STRUCT_SIZE);

      // All three files should have same number of records
      if (numUsersData !== numUsersKeys || numUsersData !== numUsersMisc) {
console.warn(
          `[UserFileManager] File record count mismatch: data=${numUsersData}, keys=${numUsersKeys}, misc=${numUsersMisc}`
        );
      }

      const numUsers = Math.min(numUsersData, numUsersKeys, numUsersMisc);
      const users: User[] = [];

      for (let i = 0; i < numUsers; i++) {
        const userStruct = this.deserializeUserStruct(userDataBuffer, i * this.USER_STRUCT_SIZE);
        const keysStruct = this.deserializeUserKeysStruct(userKeysBuffer, i * this.USERKEYS_STRUCT_SIZE);
        const miscStruct = this.deserializeUserMiscStruct(userMiscBuffer, i * this.USERMISC_STRUCT_SIZE);

        // Skip empty slots (username is empty)
        if (!userStruct.name || userStruct.name.trim().length === 0) {
          continue;
        }

        // Generate user ID from slot number (1-indexed in AmiExpress)
        const userId = `user-${i + 1}`;
        const user = this.fileStructsToUser(userStruct, keysStruct, miscStruct, userId, userDataStats.mtime);
        users.push(user);
      }

console.log(`[UserFileManager] Read ${users.length} users from disk files (${numUsers} total slots)`);
      return users;
    } catch (error) {
console.error('[UserFileManager] Error reading user files:', error);
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
   * Read a single user by slot number
   * @param slotNumber 1-indexed slot number (from user-N ID format)
   * @returns User object or null if slot is empty/invalid
   */
  public readUserBySlot(slotNumber: number): User | null {
    try {
      this.ensureUserFilesReady();

      if (slotNumber < 1) {
        return null;
      }

      // Check if all three files exist
      if (!fs.existsSync(this.userDataPath) ||
          !fs.existsSync(this.userKeysPath) ||
          !fs.existsSync(this.userMiscPath)) {
        return null;
      }

      const userDataBuffer = fs.readFileSync(this.userDataPath);
      const userKeysBuffer = fs.readFileSync(this.userKeysPath);
      const userMiscBuffer = fs.readFileSync(this.userMiscPath);
      const userDataStats = fs.statSync(this.userDataPath);

      const slotIndex = slotNumber - 1; // Convert to 0-indexed
      const userOffset = slotIndex * this.USER_STRUCT_SIZE;
      const keysOffset = slotIndex * this.USERKEYS_STRUCT_SIZE;
      const miscOffset = slotIndex * this.USERMISC_STRUCT_SIZE;

      // Check if slot is within file bounds
      if (userOffset + this.USER_STRUCT_SIZE > userDataBuffer.length ||
          keysOffset + this.USERKEYS_STRUCT_SIZE > userKeysBuffer.length ||
          miscOffset + this.USERMISC_STRUCT_SIZE > userMiscBuffer.length) {
        return null;
      }

      const userStruct = this.deserializeUserStruct(userDataBuffer, userOffset);
      const keysStruct = this.deserializeUserKeysStruct(userKeysBuffer, keysOffset);
      const miscStruct = this.deserializeUserMiscStruct(userMiscBuffer, miscOffset);

      // Check if slot is empty
      if (!userStruct.name || userStruct.name.trim().length === 0) {
        return null;
      }

      const userId = `user-${slotNumber}`;
      return this.fileStructsToUser(userStruct, keysStruct, miscStruct, userId, userDataStats.mtime);
    } catch (error) {
console.error(`[UserFileManager] Error reading user at slot ${slotNumber}:`, error);
      return null;
    }
  }

  /**
   * Delete a user by clearing their slot in user.data, user.keys, and user.misc
   * In AmiExpress, "deleting" a user means zeroing out the slot
   * @param slotNumber 1-indexed slot number (from user-N ID format)
   */
  public deleteUserSlot(slotNumber: number): void {
    try {
      this.ensureUserFilesReady();

      if (slotNumber < 1) {
        throw new Error(`Invalid slot number: ${slotNumber}`);
      }

      // Calculate file offsets (slots are 1-indexed)
      const userOffset = (slotNumber - 1) * this.USER_STRUCT_SIZE;
      const keysOffset = (slotNumber - 1) * this.USERKEYS_STRUCT_SIZE;
      const miscOffset = (slotNumber - 1) * this.USERMISC_STRUCT_SIZE;

      // Create zero-filled buffers to clear each slot
      const zeroUserBuffer = Buffer.alloc(this.USER_STRUCT_SIZE);
      const zeroKeysBuffer = Buffer.alloc(this.USERKEYS_STRUCT_SIZE);
      const zeroMiscBuffer = Buffer.alloc(this.USERMISC_STRUCT_SIZE);

      // Zero out all three files at the slot position
      this.updateFileAtOffset(this.userDataPath, zeroUserBuffer, userOffset);
      this.updateFileAtOffset(this.userKeysPath, zeroKeysBuffer, keysOffset);
      this.updateFileAtOffset(this.userMiscPath, zeroMiscBuffer, miscOffset);

console.log(`[UserFileManager] Deleted user at slot ${slotNumber} (zeroed out slot)`);
    } catch (error) {
console.error('[UserFileManager] Error deleting user slot:', error);
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

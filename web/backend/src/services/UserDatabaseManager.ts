import * as fs from 'fs';
import * as path from 'path';

/**
 * UserDatabaseManager - Manages AmiExpress user database files
 *
 * Handles three critical files for user door compatibility:
 * 1. user.data - Main user database (all users)
 * 2. user.keys - User keys/preferences
 * 3. user.misc - Miscellaneous user data
 *
 * References:
 * - axobjects.e:11-68 - user struct
 * - axobjects.e:70-81 - userKeys struct
 * - axobjects.e:83-135 - userMisc struct
 * - express.e:8045-8075 - Read/write user.data, user.keys, user.misc
 */

/**
 * User struct from axobjects.e:11-68
 * Total size: Calculated based on field types
 */
export interface UserStruct {
  name: string;                    // 31 bytes - ARRAY OF CHAR
  pass: string;                    // 9 bytes - ARRAY OF CHAR
  location: string;                // 30 bytes - ARRAY OF CHAR
  phoneNumber: string;             // 13 bytes - ARRAY OF CHAR
  slotNumber: number;              // 2 bytes - INT
  secStatus: number;               // 2 bytes - INT
  secBoard: number;                // 2 bytes - INT
  secLibrary: number;              // 2 bytes - INT
  secBulletin: number;             // 2 bytes - INT
  messagesPosted: number;          // 2 bytes - INT
  newSinceDate: number;            // 4 bytes - LONG
  pwdHash: number;                 // 4 bytes - LONG
  confRead2: number;               // 4 bytes - LONG (unused)
  confRead3: number;               // 4 bytes - LONG (unused)
  zoomType: number;                // 2 bytes - INT
  unknown: number;                 // 2 bytes - INT (unused)
  unknown2: number;                // 2 bytes - INT (unused)
  unknown3: number;                // 2 bytes - INT (unused)
  xferProtocol: number;            // 2 bytes - INT
  filler2: number;                 // 2 bytes - INT (unused)
  lcFiles: number;                 // 2 bytes - INT (unused)
  badFiles: number;                // 2 bytes - INT (unused)
  accountDate: number;             // 4 bytes - LONG
  screenType: number;              // 2 bytes - INT
  editorType: number;              // 2 bytes - INT
  conferenceAccess: Buffer;        // 10 bytes - ARRAY OF CHAR
  uploads: number;                 // 2 bytes - INT
  downloads: number;               // 2 bytes - INT
  confRJoin: number;               // 2 bytes - INT
  timesCalled: number;             // 2 bytes - INT
  timeLastOn: number;              // 4 bytes - LONG
  timeUsed: number;                // 4 bytes - LONG
  timeLimit: number;               // 4 bytes - LONG
  timeTotal: number;               // 4 bytes - LONG
  bytesDownload: number;           // 4 bytes - LONG
  bytesUpload: number;             // 4 bytes - LONG
  dailyBytesLimit: number;         // 4 bytes - LONG
  dailyBytesDld: number;           // 4 bytes - LONG
  expert: number;                  // 1 byte - CHAR
  chatRemain: number;              // 4 bytes - LONG
  chatLimit: number;               // 4 bytes - LONG
  creditDays: number;              // 4 bytes - LONG
  creditAmount: number;            // 4 bytes - LONG
  creditStartDate: number;         // 4 bytes - LONG
  creditTotalToDate: number;       // 4 bytes - LONG
  creditTotalDate: number;         // 4 bytes - LONG
  creditTracking: number;          // 1 byte - CHAR
  translatorID: number;            // 1 byte - CHAR
  msgBaseRJoin: number;            // 2 bytes - INT
  confYM9: number;                 // 4 bytes - LONG (unused)
  todaysBytesLimit: number;        // 4 bytes - LONG
  protocol: number;                // 1 byte - CHAR
  uucpa: number;                   // 1 byte - CHAR
  lineLength: number;              // 1 byte - CHAR
  newUser: number;                 // 1 byte - CHAR
}

/**
 * UserKeys struct from axobjects.e:70-81
 * Total size: Calculated based on field types
 */
export interface UserKeysStruct {
  userName: string;                // 31 bytes - ARRAY OF CHAR
  number: number;                  // 4 bytes - LONG
  newUser: number;                 // 1 byte - CHAR
  oldUpCPS: number;                // 2 bytes - INT
  oldDnCPS: number;                // 2 bytes - INT
  userFlags: number;               // 2 bytes - INT
  baud: number;                    // 2 bytes - INT
  upCPS2: number;                  // 4 bytes - LONG
  dnCPS2: number;                  // 4 bytes - LONG
  timesOnToday: number;            // 2 bytes - INT
}

/**
 * UserMisc struct from axobjects.e:83-135
 * Total size: Calculated based on field types
 */
export interface UserMiscStruct {
  internetName: string;            // 10 bytes - ARRAY OF CHAR
  realName: string;                // 26 bytes - ARRAY OF CHAR
  downloadBytesBCD: Buffer;        // 8 bytes - ARRAY OF CHAR
  uploadBytesBCD: Buffer;          // 8 bytes - ARRAY OF CHAR
  eMail: string;                   // 50 bytes - ARRAY OF CHAR
  lastDlCPS: number;               // 4 bytes - LONG
  pwdHash: Buffer;                 // 32 bytes - ARRAY OF CHAR
  salt: Buffer;                    // 8 bytes - ARRAY OF CHAR
  pwdType: number;                 // 1 byte - CHAR
  forcePwdReset: number;           // 1 byte - CHAR
  accountLocked: number;           // 1 byte - CHAR
  invalidAttempts: number;         // 1 byte - CHAR
  pwdLastUpdated: number;          // 4 bytes - LONG
  lastIP: number;                  // 4 bytes - LONG
  ipMask: number;                  // 4 bytes - LONG
  unused: Buffer;                  // 86 bytes - ARRAY OF CHAR
}

export class UserDatabaseManager {
  // Struct sizes calculated from field types
  private readonly USER_SIZE = 239;       // user struct size (from original Amiga format)
  private readonly USERKEYS_SIZE = 54;    // userKeys struct size
  private readonly USERMISC_SIZE = 228;   // userMisc struct size

  private bbsRoot: string;
  private userDataPath: string;
  private userKeysPath: string;
  private userMiscPath: string;

  constructor() {
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, '../../../..');
    this.userDataPath = path.join(this.bbsRoot, 'user.data');
    this.userKeysPath = path.join(this.bbsRoot, 'user.keys');
    this.userMiscPath = path.join(this.bbsRoot, 'user.misc');
  }

  /**
   * Initialize user database files
   */
  initializeUserDatabase(): void {
    // Create empty user.data if it doesn't exist
    if (!fs.existsSync(this.userDataPath)) {
      fs.writeFileSync(this.userDataPath, Buffer.alloc(0));
      console.log('[UserDatabaseManager] Created user.data');
    }

    // Create empty user.keys if it doesn't exist
    if (!fs.existsSync(this.userKeysPath)) {
      fs.writeFileSync(this.userKeysPath, Buffer.alloc(0));
      console.log('[UserDatabaseManager] Created user.keys');
    }

    // Create empty user.misc if it doesn't exist
    if (!fs.existsSync(this.userMiscPath)) {
      fs.writeFileSync(this.userMiscPath, Buffer.alloc(0));
      console.log('[UserDatabaseManager] Created user.misc');
    }
  }

  /**
   * Serialize user struct to binary buffer (232 bytes)
   */
  private serializeUser(user: UserStruct): Buffer {
    const buffer = Buffer.alloc(this.USER_SIZE);
    let offset = 0;

    // name[31]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, user.name, 31);

    // pass[9]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, user.pass, 9);

    // location[30]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, user.location, 30);

    // phoneNumber[13]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, user.phoneNumber, 13);

    // INTs (2 bytes each, little-endian)
    offset = this.writeInt16(buffer, offset, user.slotNumber);
    offset = this.writeInt16(buffer, offset, user.secStatus);
    offset = this.writeInt16(buffer, offset, user.secBoard);
    offset = this.writeInt16(buffer, offset, user.secLibrary);
    offset = this.writeInt16(buffer, offset, user.secBulletin);
    offset = this.writeInt16(buffer, offset, user.messagesPosted);

    // LONGs (4 bytes each, little-endian)
    offset = this.writeInt32(buffer, offset, user.newSinceDate);
    offset = this.writeInt32(buffer, offset, user.pwdHash);
    offset = this.writeInt32(buffer, offset, user.confRead2);
    offset = this.writeInt32(buffer, offset, user.confRead3);

    // More INTs
    offset = this.writeInt16(buffer, offset, user.zoomType);
    offset = this.writeInt16(buffer, offset, user.unknown);
    offset = this.writeInt16(buffer, offset, user.unknown2);
    offset = this.writeInt16(buffer, offset, user.unknown3);
    offset = this.writeInt16(buffer, offset, user.xferProtocol);
    offset = this.writeInt16(buffer, offset, user.filler2);
    offset = this.writeInt16(buffer, offset, user.lcFiles);
    offset = this.writeInt16(buffer, offset, user.badFiles);

    // LONGs
    offset = this.writeInt32(buffer, offset, user.accountDate);

    // INTs
    offset = this.writeInt16(buffer, offset, user.screenType);
    offset = this.writeInt16(buffer, offset, user.editorType);

    // conferenceAccess[10]: ARRAY OF CHAR
    user.conferenceAccess.copy(buffer, offset, 0, 10);
    offset += 10;

    // INTs
    offset = this.writeInt16(buffer, offset, user.uploads);
    offset = this.writeInt16(buffer, offset, user.downloads);
    offset = this.writeInt16(buffer, offset, user.confRJoin);
    offset = this.writeInt16(buffer, offset, user.timesCalled);

    // LONGs
    offset = this.writeInt32(buffer, offset, user.timeLastOn);
    offset = this.writeInt32(buffer, offset, user.timeUsed);
    offset = this.writeInt32(buffer, offset, user.timeLimit);
    offset = this.writeInt32(buffer, offset, user.timeTotal);
    offset = this.writeInt32(buffer, offset, user.bytesDownload);
    offset = this.writeInt32(buffer, offset, user.bytesUpload);
    offset = this.writeInt32(buffer, offset, user.dailyBytesLimit);
    offset = this.writeInt32(buffer, offset, user.dailyBytesDld);

    // CHARs
    buffer.writeUInt8(user.expert, offset);
    offset += 1;

    // LONGs
    offset = this.writeInt32(buffer, offset, user.chatRemain);
    offset = this.writeInt32(buffer, offset, user.chatLimit);
    offset = this.writeInt32(buffer, offset, user.creditDays);
    offset = this.writeInt32(buffer, offset, user.creditAmount);
    offset = this.writeInt32(buffer, offset, user.creditStartDate);
    offset = this.writeInt32(buffer, offset, user.creditTotalToDate);
    offset = this.writeInt32(buffer, offset, user.creditTotalDate);

    // CHARs
    buffer.writeUInt8(user.creditTracking, offset);
    offset += 1;
    buffer.writeUInt8(user.translatorID, offset);
    offset += 1;

    // INT
    offset = this.writeInt16(buffer, offset, user.msgBaseRJoin);

    // LONG
    offset = this.writeInt32(buffer, offset, user.confYM9);
    offset = this.writeInt32(buffer, offset, user.todaysBytesLimit);

    // CHARs
    buffer.writeUInt8(user.protocol, offset);
    offset += 1;
    buffer.writeUInt8(user.uucpa, offset);
    offset += 1;
    buffer.writeUInt8(user.lineLength, offset);
    offset += 1;
    buffer.writeUInt8(user.newUser, offset);

    return buffer;
  }

  /**
   * Serialize userKeys struct to binary buffer (54 bytes)
   */
  private serializeUserKeys(keys: UserKeysStruct): Buffer {
    const buffer = Buffer.alloc(this.USERKEYS_SIZE);
    let offset = 0;

    // userName[31]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, keys.userName, 31);

    // number: LONG
    offset = this.writeInt32(buffer, offset, keys.number);

    // newUser: CHAR
    buffer.writeUInt8(keys.newUser, offset);
    offset += 1;

    // oldUpCPS, oldDnCPS: INT
    offset = this.writeInt16(buffer, offset, keys.oldUpCPS);
    offset = this.writeInt16(buffer, offset, keys.oldDnCPS);

    // userFlags, baud: INT
    offset = this.writeInt16(buffer, offset, keys.userFlags);
    offset = this.writeInt16(buffer, offset, keys.baud);

    // upCPS2, dnCPS2: LONG
    offset = this.writeInt32(buffer, offset, keys.upCPS2);
    offset = this.writeInt32(buffer, offset, keys.dnCPS2);

    // timesOnToday: INT
    offset = this.writeInt16(buffer, offset, keys.timesOnToday);

    return buffer;
  }

  /**
   * Serialize userMisc struct to binary buffer (228 bytes)
   */
  private serializeUserMisc(misc: UserMiscStruct): Buffer {
    const buffer = Buffer.alloc(this.USERMISC_SIZE);
    let offset = 0;

    // internetName[10]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, misc.internetName, 10);

    // realName[26]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, misc.realName, 26);

    // downloadBytesBCD[8]: ARRAY OF CHAR
    misc.downloadBytesBCD.copy(buffer, offset, 0, 8);
    offset += 8;

    // uploadBytesBCD[8]: ARRAY OF CHAR
    misc.uploadBytesBCD.copy(buffer, offset, 0, 8);
    offset += 8;

    // eMail[50]: ARRAY OF CHAR
    offset = this.writeString(buffer, offset, misc.eMail, 50);

    // lastDlCPS: LONG
    offset = this.writeInt32(buffer, offset, misc.lastDlCPS);

    // pwdHash[32]: ARRAY OF CHAR
    misc.pwdHash.copy(buffer, offset, 0, 32);
    offset += 32;

    // salt[8]: ARRAY OF CHAR
    misc.salt.copy(buffer, offset, 0, 8);
    offset += 8;

    // CHARs
    buffer.writeUInt8(misc.pwdType, offset);
    offset += 1;
    buffer.writeUInt8(misc.forcePwdReset, offset);
    offset += 1;
    buffer.writeUInt8(misc.accountLocked, offset);
    offset += 1;
    buffer.writeUInt8(misc.invalidAttempts, offset);
    offset += 1;

    // LONGs
    offset = this.writeInt32(buffer, offset, misc.pwdLastUpdated);
    offset = this.writeInt32(buffer, offset, misc.lastIP);
    offset = this.writeInt32(buffer, offset, misc.ipMask);

    // unused[86]: ARRAY OF CHAR
    misc.unused.copy(buffer, offset, 0, 86);

    return buffer;
  }

  /**
   * Helper: Write string to buffer (null-padded)
   */
  private writeString(buffer: Buffer, offset: number, str: string, length: number): number {
    const temp = Buffer.alloc(length, 0);
    Buffer.from(str.substring(0, length), 'ascii').copy(temp);
    temp.copy(buffer, offset);
    return offset + length;
  }

  /**
   * Helper: Write INT16 (little-endian)
   */
  private writeInt16(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt16LE(value, offset);
    return offset + 2;
  }

  /**
   * Helper: Write INT32 (little-endian)
   */
  private writeInt32(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt32LE(value, offset);
    return offset + 4;
  }

  /**
   * Convert confAccess string to 10-byte buffer for user.data
   * 'X' = 0x58 (access), anything else = 0x00 (no access)
   * Note: AmiExpress stores 'X' character (0x58), not 0xFF
   */
  private confAccessToBuffer(confAccess: string | undefined): Buffer {
    const buffer = Buffer.alloc(10, 0);
    if (confAccess) {
      for (let i = 0; i < Math.min(confAccess.length, 10); i++) {
        buffer[i] = confAccess[i].toUpperCase() === 'X' ? 0x58 : 0x00;
      }
    }
    return buffer;
  }

  /**
   * Convert a number to 8-byte BCD (Binary Coded Decimal) buffer
   * Amiga BCD format: each byte holds two decimal digits (upper nibble, lower nibble)
   * 8 bytes = 16 decimal digits, stored big-endian (most significant first)
   */
  private numberToBCD(value: number): Buffer {
    const buffer = Buffer.alloc(8, 0);
    if (value <= 0 || !Number.isFinite(value)) {
      return buffer;
    }
    const str = Math.floor(value).toString();
    const padded = str.padStart(16, '0');
    for (let i = 0; i < 8; i++) {
      const highDigit = parseInt(padded[i * 2], 10);
      const lowDigit = parseInt(padded[i * 2 + 1], 10);
      buffer[i] = (highDigit << 4) | lowDigit;
    }
    return buffer;
  }

  /**
   * Append user to all three database files
   */
  appendUser(user: UserStruct, keys: UserKeysStruct, misc: UserMiscStruct): void {
    const userBuffer = this.serializeUser(user);
    const keysBuffer = this.serializeUserKeys(keys);
    const miscBuffer = this.serializeUserMisc(misc);

    fs.appendFileSync(this.userDataPath, userBuffer);
    fs.appendFileSync(this.userKeysPath, keysBuffer);
    fs.appendFileSync(this.userMiscPath, miscBuffer);

    console.log(`[UserDatabaseManager] Appended user "${user.name}" to user.data/keys/misc`);
  }

  /**
   * Update user at specific slot number
   */
  updateUser(slotNumber: number, user: UserStruct, keys: UserKeysStruct, misc: UserMiscStruct): void {
    const userBuffer = this.serializeUser(user);
    const keysBuffer = this.serializeUserKeys(keys);
    const miscBuffer = this.serializeUserMisc(misc);

    // Write to specific offset (slot * struct size)
    const userOffset = slotNumber * this.USER_SIZE;
    const keysOffset = slotNumber * this.USERKEYS_SIZE;
    const miscOffset = slotNumber * this.USERMISC_SIZE;

    // user.data
    const fdData = fs.openSync(this.userDataPath, 'r+');
    try {
      fs.writeSync(fdData, userBuffer, 0, this.USER_SIZE, userOffset);
    } finally {
      fs.closeSync(fdData);
    }

    // user.keys
    const fdKeys = fs.openSync(this.userKeysPath, 'r+');
    try {
      fs.writeSync(fdKeys, keysBuffer, 0, this.USERKEYS_SIZE, keysOffset);
    } finally {
      fs.closeSync(fdKeys);
    }

    // user.misc
    const fdMisc = fs.openSync(this.userMiscPath, 'r+');
    try {
      fs.writeSync(fdMisc, miscBuffer, 0, this.USERMISC_SIZE, miscOffset);
    } finally {
      fs.closeSync(fdMisc);
    }

    console.log(`[UserDatabaseManager] Updated user "${user.name}" at slot ${slotNumber}`);
  }

  /**
   * Get user count from file size
   */
  getUserCount(): number {
    if (!fs.existsSync(this.userDataPath)) {
      return 0;
    }

    const stats = fs.statSync(this.userDataPath);
    return Math.floor(stats.size / this.USER_SIZE);
  }

  /**
   * Read confAccess from user.data disk file by slot number
   * Returns string of X's for access (e.g., "XXXXXXXXXXXX")
   * This is used for 68K door compatibility - doors expect disk-based data
   */
  readConfAccessFromDisk(slotNumber: number): string {
    if (!fs.existsSync(this.userDataPath)) {
      return '';
    }

    const userCount = this.getUserCount();
    if (slotNumber < 0 || slotNumber >= userCount) {
      return '';
    }

    // conferenceAccess offset in user struct:
    // name(31) + pass(9) + location(30) + phoneNumber(13) + slotNumber(2) +
    // secStatus(2) + secBoard(2) + secLibrary(2) + secBulletin(2) + messagesPosted(2) +
    // newSinceDate(4) + pwdHash(4) + confRead2(4) + confRead3(4) + zoomType(2) +
    // unknown(2) + unknown2(2) + unknown3(2) + xferProtocol(2) + filler2(2) +
    // lcFiles(2) + badFiles(2) + accountDate(4) + screenType(2) + editorType(2) = 135
    const CONF_ACCESS_OFFSET = 135;
    const CONF_ACCESS_SIZE = 10;

    const userOffset = slotNumber * this.USER_SIZE;
    const fd = fs.openSync(this.userDataPath, 'r');
    try {
      const buffer = Buffer.alloc(CONF_ACCESS_SIZE);
      fs.readSync(fd, buffer, 0, CONF_ACCESS_SIZE, userOffset + CONF_ACCESS_OFFSET);

      // Convert buffer to string: 0x58 ('X') = access, anything else = no access
      let result = '';
      for (let i = 0; i < CONF_ACCESS_SIZE; i++) {
        result += buffer[i] === 0x58 ? 'X' : '_';
      }
      return result;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Write confAccess to user.data disk file by slot number
   * Used to sync SQLite changes to disk for 68K door compatibility
   */
  writeConfAccessToDisk(slotNumber: number, confAccess: string): boolean {
    if (!fs.existsSync(this.userDataPath)) {
      return false;
    }

    const userCount = this.getUserCount();
    if (slotNumber < 0 || slotNumber >= userCount) {
      return false;
    }

    const CONF_ACCESS_OFFSET = 135;
    const CONF_ACCESS_SIZE = 10;

    const userOffset = slotNumber * this.USER_SIZE;
    const buffer = this.confAccessToBuffer(confAccess);

    const fd = fs.openSync(this.userDataPath, 'r+');
    try {
      fs.writeSync(fd, buffer, 0, CONF_ACCESS_SIZE, userOffset + CONF_ACCESS_OFFSET);
      console.log(`[UserDatabaseManager] Wrote confAccess="${confAccess}" to slot ${slotNumber}`);
      return true;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Read username from user.data disk file by slot number
   * Used to find slot number by username for door compatibility
   */
  findUserSlotByName(username: string): number {
    if (!fs.existsSync(this.userDataPath)) {
      return -1;
    }

    const userCount = this.getUserCount();
    const fd = fs.openSync(this.userDataPath, 'r');
    const nameBuffer = Buffer.alloc(31);
    const searchName = username.toLowerCase();

    try {
      for (let slot = 0; slot < userCount; slot++) {
        const userOffset = slot * this.USER_SIZE;
        fs.readSync(fd, nameBuffer, 0, 31, userOffset);
        const name = nameBuffer.toString('ascii').replace(/\0+$/, '').toLowerCase();
        if (name === searchName) {
          return slot;
        }
      }
      return -1;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Convert database User to UserStruct
   */
  userToStruct(user: any): UserStruct {
    return {
      name: user.username || '',
      pass: '', // Passwords handled separately
      location: user.location || '',
      phoneNumber: user.phoneNumber || '',
      slotNumber: user.slotNumber || 0,
      secStatus: user.secLevel || 10,
      secBoard: 0,
      secLibrary: 0,
      secBulletin: 0,
      messagesPosted: 0,
      newSinceDate: 0,
      pwdHash: 0,
      confRead2: 0,
      confRead3: 0,
      zoomType: 0,
      unknown: 0,
      unknown2: 0,
      unknown3: 0,
      xferProtocol: 0,
      filler2: 0,
      lcFiles: 0,
      badFiles: 0,
      accountDate: Math.floor(new Date(user.created).getTime() / 1000),
      screenType: 0,
      editorType: 0,
      conferenceAccess: this.confAccessToBuffer(user.confAccess), // From user's confAccess string
      uploads: user.uploads || 0,
      downloads: user.downloads || 0,
      confRJoin: 0,
      timesCalled: user.calls || 0,
      timeLastOn: Math.floor(new Date(user.lastLogin).getTime() / 1000),
      timeUsed: 0,
      timeLimit: user.timeLeft || 60,
      timeTotal: 0,
      bytesDownload: 0,
      bytesUpload: 0,
      dailyBytesLimit: 0,
      dailyBytesDld: 0,
      expert: 0,
      chatRemain: 0,
      chatLimit: 0,
      creditDays: 0,
      creditAmount: 0,
      creditStartDate: 0,
      creditTotalToDate: 0,
      creditTotalDate: 0,
      creditTracking: 0,
      translatorID: 0,
      msgBaseRJoin: 0,
      confYM9: 0,
      todaysBytesLimit: 0,
      protocol: 0,
      uucpa: 0,
      lineLength: 80,
      newUser: 0
    };
  }

  /**
   * Convert database User to UserKeysStruct
   */
  userToKeys(user: any, slotNumber: number): UserKeysStruct {
    return {
      userName: user.username || '',
      number: slotNumber,
      newUser: 0,
      oldUpCPS: 0,
      oldDnCPS: 0,
      userFlags: 0,
      baud: 0,
      upCPS2: 0,
      dnCPS2: 0,
      timesOnToday: 0
    };
  }

  // ========================================
  // Disk-based user stat offsets (for 68K door compatibility)
  // ========================================
  private static readonly MESSAGES_POSTED_OFFSET = 93;   // INT (2 bytes)
  private static readonly UPLOADS_OFFSET = 145;          // INT (2 bytes)
  private static readonly DOWNLOADS_OFFSET = 147;        // INT (2 bytes)
  private static readonly TIMES_CALLED_OFFSET = 151;     // INT (2 bytes)
  private static readonly TIME_LAST_ON_OFFSET = 153;     // LONG (4 bytes)
  private static readonly TIME_USED_OFFSET = 157;        // LONG (4 bytes)
  private static readonly TIME_LIMIT_OFFSET = 161;       // LONG (4 bytes)
  private static readonly TIME_TOTAL_OFFSET = 165;       // LONG (4 bytes)
  private static readonly BYTES_DOWNLOAD_OFFSET = 169;   // LONG (4 bytes)
  private static readonly BYTES_UPLOAD_OFFSET = 173;     // LONG (4 bytes)
  private static readonly DAILY_BYTES_LIMIT_OFFSET = 177;// LONG (4 bytes)
  private static readonly DAILY_BYTES_DLD_OFFSET = 181;  // LONG (4 bytes)
  private static readonly EXPERT_OFFSET = 185;           // CHAR (1 byte)
  private static readonly LINE_LENGTH_OFFSET = 133;      // screenType INT (2 bytes) - used for line length

  /**
   * Read user statistics from user.data disk file
   * Used by 68K doors via XIM protocol - must read from disk, not database
   */
  readUserStatsFromDisk(slotNumber: number): {
    messagesPosted: number;
    uploads: number;
    downloads: number;
    timesCalled: number;
    timeLastOn: number;
    timeUsed: number;
    timeLimit: number;
    timeTotal: number;
    bytesDownload: number;
    bytesUpload: number;
    dailyBytesLimit: number;
    dailyBytesDld: number;
    expert: number;
    lineLength: number;
  } | null {
    if (!fs.existsSync(this.userDataPath)) {
      return null;
    }

    const userOffset = slotNumber * this.USER_SIZE;
    const fd = fs.openSync(this.userDataPath, 'r');

    try {
      const buffer = Buffer.alloc(200);
      fs.readSync(fd, buffer, 0, 200, userOffset);

      return {
        messagesPosted: buffer.readUInt16LE(UserDatabaseManager.MESSAGES_POSTED_OFFSET - 0) > 200 ? 0 :
          this.readInt16At(fd, userOffset + UserDatabaseManager.MESSAGES_POSTED_OFFSET),
        uploads: this.readInt16At(fd, userOffset + UserDatabaseManager.UPLOADS_OFFSET),
        downloads: this.readInt16At(fd, userOffset + UserDatabaseManager.DOWNLOADS_OFFSET),
        timesCalled: this.readInt16At(fd, userOffset + UserDatabaseManager.TIMES_CALLED_OFFSET),
        timeLastOn: this.readInt32At(fd, userOffset + UserDatabaseManager.TIME_LAST_ON_OFFSET),
        timeUsed: this.readInt32At(fd, userOffset + UserDatabaseManager.TIME_USED_OFFSET),
        timeLimit: this.readInt32At(fd, userOffset + UserDatabaseManager.TIME_LIMIT_OFFSET),
        timeTotal: this.readInt32At(fd, userOffset + UserDatabaseManager.TIME_TOTAL_OFFSET),
        bytesDownload: this.readInt32At(fd, userOffset + UserDatabaseManager.BYTES_DOWNLOAD_OFFSET),
        bytesUpload: this.readInt32At(fd, userOffset + UserDatabaseManager.BYTES_UPLOAD_OFFSET),
        dailyBytesLimit: this.readInt32At(fd, userOffset + UserDatabaseManager.DAILY_BYTES_LIMIT_OFFSET),
        dailyBytesDld: this.readInt32At(fd, userOffset + UserDatabaseManager.DAILY_BYTES_DLD_OFFSET),
        expert: this.readByteAt(fd, userOffset + UserDatabaseManager.EXPERT_OFFSET),
        lineLength: this.readInt16At(fd, userOffset + UserDatabaseManager.LINE_LENGTH_OFFSET),
      };
    } finally {
      fs.closeSync(fd);
    }
  }

  private readInt16At(fd: number, offset: number): number {
    const buf = Buffer.alloc(2);
    fs.readSync(fd, buf, 0, 2, offset);
    return buf.readUInt16LE(0);
  }

  private readInt32At(fd: number, offset: number): number {
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, offset);
    return buf.readUInt32LE(0);
  }

  private readByteAt(fd: number, offset: number): number {
    const buf = Buffer.alloc(1);
    fs.readSync(fd, buf, 0, 1, offset);
    return buf.readUInt8(0);
  }

  /**
   * Write a user stat field to user.data disk file
   * Used when 68K doors modify user stats via XIM protocol
   */
  writeUserStatToDisk(slotNumber: number, field: string, value: number): boolean {
    if (!fs.existsSync(this.userDataPath)) {
      return false;
    }

    const userOffset = slotNumber * this.USER_SIZE;
    const fd = fs.openSync(this.userDataPath, 'r+');

    try {
      let offset: number;
      let size: number;

      switch (field) {
        case 'messagesPosted':
          offset = UserDatabaseManager.MESSAGES_POSTED_OFFSET;
          size = 2;
          break;
        case 'uploads':
          offset = UserDatabaseManager.UPLOADS_OFFSET;
          size = 2;
          break;
        case 'downloads':
          offset = UserDatabaseManager.DOWNLOADS_OFFSET;
          size = 2;
          break;
        case 'timesCalled':
          offset = UserDatabaseManager.TIMES_CALLED_OFFSET;
          size = 2;
          break;
        case 'timeLastOn':
          offset = UserDatabaseManager.TIME_LAST_ON_OFFSET;
          size = 4;
          break;
        case 'timeUsed':
          offset = UserDatabaseManager.TIME_USED_OFFSET;
          size = 4;
          break;
        case 'timeLimit':
          offset = UserDatabaseManager.TIME_LIMIT_OFFSET;
          size = 4;
          break;
        case 'timeTotal':
          offset = UserDatabaseManager.TIME_TOTAL_OFFSET;
          size = 4;
          break;
        case 'bytesDownload':
          offset = UserDatabaseManager.BYTES_DOWNLOAD_OFFSET;
          size = 4;
          break;
        case 'bytesUpload':
          offset = UserDatabaseManager.BYTES_UPLOAD_OFFSET;
          size = 4;
          break;
        case 'dailyBytesLimit':
          offset = UserDatabaseManager.DAILY_BYTES_LIMIT_OFFSET;
          size = 4;
          break;
        case 'dailyBytesDld':
          offset = UserDatabaseManager.DAILY_BYTES_DLD_OFFSET;
          size = 4;
          break;
        case 'expert':
          offset = UserDatabaseManager.EXPERT_OFFSET;
          size = 1;
          break;
        case 'lineLength':
          offset = UserDatabaseManager.LINE_LENGTH_OFFSET;
          size = 2;
          break;
        default:
          console.log(`[UserDatabaseManager] Unknown stat field: ${field}`);
          return false;
      }

      const buffer = Buffer.alloc(size);
      if (size === 1) {
        buffer.writeUInt8(value, 0);
      } else if (size === 2) {
        buffer.writeUInt16LE(value, 0);
      } else {
        buffer.writeUInt32LE(value, 0);
      }

      fs.writeSync(fd, buffer, 0, size, userOffset + offset);
      console.log(`[UserDatabaseManager] Wrote ${field}=${value} to disk at slot ${slotNumber}`);
      return true;
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Convert database User to UserMiscStruct
   */
  userToMisc(user: any): UserMiscStruct {
    // Convert bytesUpload/bytesDownload to BCD format for Amiga compatibility
    const downloadBytes = user.bytesDownload || user.downloadBytes || 0;
    const uploadBytes = user.bytesUpload || user.uploadBytes || 0;

    return {
      internetName: '',
      realName: user.realName || '',
      downloadBytesBCD: this.numberToBCD(downloadBytes),
      uploadBytesBCD: this.numberToBCD(uploadBytes),
      eMail: user.email || '',
      lastDlCPS: 0,
      pwdHash: Buffer.alloc(32, 0),
      salt: Buffer.alloc(8, 0),
      pwdType: 0,
      forcePwdReset: 0,
      accountLocked: 0,
      invalidAttempts: 0,
      pwdLastUpdated: 0,
      lastIP: 0,
      ipMask: 0,
      unused: Buffer.alloc(86, 0)
    };
  }
}

// Export singleton instance
export const userDatabaseManager = new UserDatabaseManager();

import * as fs from "fs";
import * as path from "path";
import { encodeAmigaDate } from "../utils/date-time.util";
import { boardRoot } from '../utils/board-root.util';

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

export interface UserStruct {
  name: string;
  pass: string;
  location: string;
  phoneNumber: string;
  slotNumber: number;
  secStatus: number;
  secBoard: number;
  secLibrary: number;
  secBulletin: number;
  messagesPosted: number;
  newSinceDate: number;
  pwdHash: number;
  confRead2: number;
  confRead3: number;
  zoomType: number;
  unknown: number;
  unknown2: number;
  unknown3: number;
  xferProtocol: number;
  filler2: number;
  lcFiles: number;
  badFiles: number;
  accountDate: number;
  screenType: number;
  editorType: number;
  conferenceAccess: Buffer;
  uploads: number;
  downloads: number;
  confRJoin: number;
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
  chatRemain: number;
  chatLimit: number;
  creditDays: number;
  creditAmount: number;
  creditStartDate: number;
  creditTotalToDate: number;
  creditTotalDate: number;
  creditTracking: number;
  translatorID: number;
  msgBaseRJoin: number;
  confYM9: number;
  todaysBytesLimit: number;
  protocol: number;
  uucpa: number;
  lineLength: number;
  newUser: number;
}

export interface UserKeysStruct {
  userName: string;
  number: number;
  newUser: number;
  oldUpCPS: number;
  oldDnCPS: number;
  userFlags: number;
  baud: number;
  upCPS2: number;
  dnCPS2: number;
  timesOnToday: number;
}

export interface UserMiscStruct {
  internetName: string;
  realName: string;
  downloadBytesBCD: Buffer;
  uploadBytesBCD: Buffer;
  eMail: string;
  lastDlCPS: number;
  pwdHash: Buffer;
  salt: Buffer;
  pwdType: number;
  forcePwdReset: number;
  accountLocked: number;
  invalidAttempts: number;
  pwdLastUpdated: number;
  lastIP: number;
  ipMask: number;
  unused: Buffer;
}

export class UserDatabaseManager {
  private readonly USER_SIZE = 232;
  private readonly USERKEYS_SIZE = 56;
  private readonly USERMISC_SIZE = 248;

  private bbsRoot: string;
  private userDataPath: string;
  private userKeysPath: string;
  private userMiscPath: string;

  constructor() {
    // BBS_DATA_DIR FIRST, as UserFileManager reads it. Docker sets
    // BBS_DATA_DIR=/app/data/bbs and leaves BBS_ROOT empty, so this resolved
    // to /app and created an empty user.data/keys/misc there while the board's
    // real files - the ones UserFileManager reads and express.e reads - sat in
    // /app/data/bbs. Everything appended through here, including a new user
    // signing up (new-user.handler.ts:1475), went to a file nothing reads.
    this.bbsRoot = boardRoot();
    this.userDataPath = path.join(this.bbsRoot, "user.data");
    this.userKeysPath = path.join(this.bbsRoot, "user.keys");
    this.userMiscPath = path.join(this.bbsRoot, "user.misc");
  }

  initializeUserDatabase(): void {
    if (!fs.existsSync(this.userDataPath)) fs.writeFileSync(this.userDataPath, Buffer.alloc(0));
    if (!fs.existsSync(this.userKeysPath)) fs.writeFileSync(this.userKeysPath, Buffer.alloc(0));
    if (!fs.existsSync(this.userMiscPath)) fs.writeFileSync(this.userMiscPath, Buffer.alloc(0));
  }

  /**
   * Read one user's three records by Amiga slot number.
   *
   * Slots are 1-indexed: slot 1 is the first record, and slot 0 is a deleted
   * account (express.e:21365, refused at logon per express.e:29701). This
   * matches `User.slotNumber`, `UserFileManager`, and `readAllUsers`'
   * `user-N` ids. An earlier revision addressed `slotNumber * SIZE` (0-based),
   * so every password failure landed on the NEIGHBOUR's misc record: one
   * caller's typos locked the next account down, and unlocking never helped
   * because the gate read a different record than the one the failures wrote.
   */
  readUserFromDisk(slotNumber: number): { user: UserStruct; keys: UserKeysStruct; misc: UserMiscStruct } | null {
    if (!fs.existsSync(this.userDataPath)) return null;
    if (!Number.isInteger(slotNumber) || slotNumber < 1) return null;
    try {
      const userOffset = (slotNumber - 1) * this.USER_SIZE;
      const keysOffset = (slotNumber - 1) * this.USERKEYS_SIZE;
      const miscOffset = (slotNumber - 1) * this.USERMISC_SIZE;

      const userBuffer = Buffer.alloc(this.USER_SIZE);
      const keysBuffer = Buffer.alloc(this.USERKEYS_SIZE);
      const miscBuffer = Buffer.alloc(this.USERMISC_SIZE);

      const fdData = fs.openSync(this.userDataPath, "r");
      try {
        if (fs.fstatSync(fdData).size < userOffset + this.USER_SIZE) return null;
        fs.readSync(fdData, userBuffer, 0, this.USER_SIZE, userOffset);
      } finally { fs.closeSync(fdData); }

      const fdKeys = fs.openSync(this.userKeysPath, "r");
      try {
        if (fs.fstatSync(fdKeys).size < keysOffset + this.USERKEYS_SIZE) return null;
        fs.readSync(fdKeys, keysBuffer, 0, this.USERKEYS_SIZE, keysOffset);
      } finally { fs.closeSync(fdKeys); }

      const fdMisc = fs.openSync(this.userMiscPath, "r");
      try {
        if (fs.fstatSync(fdMisc).size < miscOffset + this.USERMISC_SIZE) return null;
        fs.readSync(fdMisc, miscBuffer, 0, this.USERMISC_SIZE, miscOffset);
      } finally { fs.closeSync(fdMisc); }

      return {
        user: this.parseUserStruct(userBuffer),
        keys: this.parseUserKeysStruct(keysBuffer),
        misc: this.parseUserMiscStruct(miscBuffer)
      };
    } catch (err) {
      return null;
    }
  }

  private parseUserStruct(buffer: Buffer): UserStruct {
    let offset = 0;
    const name = buffer.toString('latin1', offset, offset + 31).replace(/\0.*$/, ''); offset += 31;
    const pass = buffer.toString('latin1', offset, offset + 9).replace(/\0.*$/, ''); offset += 9;
    const location = buffer.toString('latin1', offset, offset + 30).replace(/\0.*$/, ''); offset += 30;
    const phoneNumber = buffer.toString('latin1', offset, offset + 13).replace(/\0.*$/, ''); offset += 13;
    offset += 1; // PAD
    const slotNumber = buffer.readInt16BE(offset); offset += 2;
    const secStatus = buffer.readInt16BE(offset); offset += 2;
    const secBoard = buffer.readInt16BE(offset); offset += 2;
    const secLibrary = buffer.readInt16BE(offset); offset += 2;
    const secBulletin = buffer.readInt16BE(offset); offset += 2;
    const messagesPosted = buffer.readInt16BE(offset); offset += 2;
    const newSinceDate = buffer.readInt32BE(offset); offset += 4;
    const pwdHash = buffer.readInt32BE(offset); offset += 4;
    const confRead2 = buffer.readInt32BE(offset); offset += 4;
    const confRead3 = buffer.readInt32BE(offset); offset += 4;
    const zoomType = buffer.readInt16BE(offset); offset += 2;
    const unknown = buffer.readInt16BE(offset); offset += 2;
    const unknown2 = buffer.readInt16BE(offset); offset += 2;
    const unknown3 = buffer.readInt16BE(offset); offset += 2;
    const xferProtocol = buffer.readInt16BE(offset); offset += 2;
    const filler2 = buffer.readInt16BE(offset); offset += 2;
    const lcFiles = buffer.readInt16BE(offset); offset += 2;
    const badFiles = buffer.readInt16BE(offset); offset += 2;
    const accountDate = buffer.readInt32BE(offset); offset += 4;
    const screenType = buffer.readInt16BE(offset); offset += 2;
    const editorType = buffer.readInt16BE(offset); offset += 2;
    const conferenceAccess = Buffer.alloc(10); buffer.copy(conferenceAccess, 0, offset, offset + 10); offset += 10;
    const uploads = buffer.readInt16BE(offset); offset += 2;
    const downloads = buffer.readInt16BE(offset); offset += 2;
    const confRJoin = buffer.readInt16BE(offset); offset += 2;
    const timesCalled = buffer.readInt16BE(offset); offset += 2;
    const timeLastOn = buffer.readInt32BE(offset); offset += 4;
    const timeUsed = buffer.readInt32BE(offset); offset += 4;
    const timeLimit = buffer.readInt32BE(offset); offset += 4;
    const timeTotal = buffer.readInt32BE(offset); offset += 4;
    const bytesDownload = buffer.readInt32BE(offset); offset += 4;
    const bytesUpload = buffer.readInt32BE(offset); offset += 4;
    const dailyBytesLimit = buffer.readInt32BE(offset); offset += 4;
    const dailyBytesDld = buffer.readInt32BE(offset); offset += 4;
    const expert = buffer.readUInt8(offset++);
    offset += 1; // PAD
    const chatRemain = buffer.readInt32BE(offset); offset += 4;
    const chatLimit = buffer.readInt32BE(offset); offset += 4;
    const creditDays = buffer.readInt32BE(offset); offset += 4;
    const creditAmount = buffer.readInt32BE(offset); offset += 4;
    const creditStartDate = buffer.readInt32BE(offset); offset += 4;
    const creditTotalToDate = buffer.readInt32BE(offset); offset += 4;
    const creditTotalDate = buffer.readInt32BE(offset); offset += 4;
    const creditTracking = buffer.readUInt8(offset++);
    const translatorID = buffer.readUInt8(offset++);
    const msgBaseRJoin = buffer.readInt16BE(offset); offset += 2;
    const confYM9 = buffer.readInt32BE(offset); offset += 4;
    const todaysBytesLimit = buffer.readInt32BE(offset); offset += 4;
    const protocol = buffer.readUInt8(offset++);
    const uucpa = buffer.readUInt8(offset++);
    const lineLength = buffer.readUInt8(offset++);
    const newUser = buffer.readUInt8(offset++);

    return {
      name, pass, location, phoneNumber, slotNumber, secStatus, secBoard, secLibrary, secBulletin,
      messagesPosted, newSinceDate, pwdHash, confRead2, confRead3, zoomType, unknown, unknown2, unknown3,
      xferProtocol, filler2, lcFiles, badFiles, accountDate, screenType, editorType, conferenceAccess,
      uploads, downloads, confRJoin, timesCalled, timeLastOn, timeUsed, timeLimit, timeTotal,
      bytesDownload, bytesUpload, dailyBytesLimit, dailyBytesDld, expert, chatRemain, chatLimit,
      creditDays, creditAmount, creditStartDate, creditTotalToDate, creditTotalDate, creditTracking,
      translatorID, msgBaseRJoin, confYM9, todaysBytesLimit, protocol, uucpa, lineLength, newUser
    };
  }

  private parseUserKeysStruct(buffer: Buffer): UserKeysStruct {
    let offset = 0;
    const userName = buffer.toString('latin1', offset, offset + 31).replace(/\0.*$/, ''); offset += 31;
    offset += 1; // PAD
    const number = buffer.readInt32BE(offset); offset += 4;
    const newUser = buffer.readUInt8(offset++);
    offset += 1; // PAD
    const oldUpCPS = buffer.readInt16BE(offset); offset += 2;
    const oldDnCPS = buffer.readInt16BE(offset); offset += 2;
    const userFlags = buffer.readInt16BE(offset); offset += 2;
    const baud = buffer.readInt16BE(offset); offset += 2;
    const upCPS2 = buffer.readInt32BE(offset); offset += 4;
    const dnCPS2 = buffer.readInt32BE(offset); offset += 4;
    const timesOnToday = buffer.readInt16BE(offset); offset += 2;
    return { userName, number, newUser, oldUpCPS, oldDnCPS, userFlags, baud, upCPS2, dnCPS2, timesOnToday };
  }

  private parseUserMiscStruct(buffer: Buffer): UserMiscStruct {
    let offset = 0;
    const internetName = buffer.toString('latin1', offset, offset + 10).replace(/\0.*$/, ''); offset += 10;
    const realName = buffer.toString('latin1', offset, offset + 26).replace(/\0.*$/, ''); offset += 26;
    const downloadBytesBCD = Buffer.alloc(8); buffer.copy(downloadBytesBCD, 0, offset, offset + 8); offset += 8;
    const uploadBytesBCD = Buffer.alloc(8); buffer.copy(uploadBytesBCD, 0, offset, offset + 8); offset += 8;
    const eMail = buffer.toString('latin1', offset, offset + 50).replace(/\0.*$/, ''); offset += 50;
    const lastDlCPS = buffer.readInt32BE(offset); offset += 4;
    const pwdHash = Buffer.alloc(32); buffer.copy(pwdHash, 0, offset, offset + 32); offset += 32;
    const salt = Buffer.alloc(8); buffer.copy(salt, 0, offset, offset + 8); offset += 8;
    const pwdType = buffer.readUInt8(offset++);
    const forcePwdReset = buffer.readUInt8(offset++);
    const accountLocked = buffer.readUInt8(offset++);
    const invalidAttempts = buffer.readUInt8(offset++);
    const pwdLastUpdated = buffer.readInt32BE(offset); offset += 4;
    const lastIP = buffer.readInt32BE(offset); offset += 4;
    const ipMask = buffer.readInt32BE(offset); offset += 4;
    const unused = Buffer.alloc(86); buffer.copy(unused, 0, offset, offset + 86);
    return { internetName, realName, downloadBytesBCD, uploadBytesBCD, eMail, lastDlCPS, pwdHash, salt, pwdType, forcePwdReset, accountLocked, invalidAttempts, pwdLastUpdated, lastIP, ipMask, unused };
  }

  importAllUsersFromDisk(): Array<{ user: UserStruct; keys: UserKeysStruct; misc: UserMiscStruct }> {
    const userCount = this.getUserCount();
    const result = [];
    for (let i = 0; i < userCount; i++) {
      const data = this.readUserFromDisk(i + 1);
      if (data && data.user.name.length > 0) result.push(data);
    }
    return result;
  }

  getUserCount(): number {
    if (!fs.existsSync(this.userDataPath)) return 0;
    const stats = fs.statSync(this.userDataPath);
    return Math.floor(stats.size / this.USER_SIZE);
  }

  serializeUserMisc(misc: UserMiscStruct): Buffer {
    const buffer = Buffer.alloc(this.USERMISC_SIZE);
    let offset = 0;
    offset = this.writeString(buffer, offset, misc.internetName, 10);
    offset = this.writeString(buffer, offset, misc.realName, 26);
    misc.downloadBytesBCD.copy(buffer, offset, 0, 8); offset += 8;
    misc.uploadBytesBCD.copy(buffer, offset, 0, 8); offset += 8;
    offset = this.writeString(buffer, offset, misc.eMail, 50);
    offset = this.writeInt32(buffer, offset, misc.lastDlCPS);
    misc.pwdHash.copy(buffer, offset, 0, 32); offset += 32;
    misc.salt.copy(buffer, offset, 0, 8); offset += 8;
    buffer.writeUInt8(misc.pwdType, offset++);
    buffer.writeUInt8(misc.forcePwdReset, offset++);
    buffer.writeUInt8(misc.accountLocked, offset++);
    buffer.writeUInt8(misc.invalidAttempts, offset++);
    offset = this.writeInt32(buffer, offset, misc.pwdLastUpdated);
    offset = this.writeInt32(buffer, offset, misc.lastIP);
    offset = this.writeInt32(buffer, offset, misc.ipMask);
    misc.unused.copy(buffer, offset, 0, 86);
    return buffer;
  }

  private writeString(buffer: Buffer, offset: number, str: string, length: number): number {
    const temp = Buffer.alloc(length, 0);
    Buffer.from(str.substring(0, length), "latin1").copy(temp);
    temp.copy(buffer, offset);
    return offset + length;
  }

  private writeInt32(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt32BE(value, offset);
    return offset + 4;
  }

  readConfAccessFromDisk(slotNumber: number): string {
    if (!fs.existsSync(this.userDataPath)) return "XXXXXXXXXXXXXXXXXXXXXXXXX"; // Default: full access to all 25 conferences
    const CONF_ACCESS_OFFSET = 136;
    const CONF_ACCESS_SIZE = 10; // user.data only stores 10 bytes
    const TOTAL_CONFERENCES = 25; // Doors expect 25 characters
    const fd = fs.openSync(this.userDataPath, "r");
    try {
      const buffer = Buffer.alloc(CONF_ACCESS_SIZE);
      fs.readSync(fd, buffer, 0, CONF_ACCESS_SIZE, (slotNumber - 1) * this.USER_SIZE + CONF_ACCESS_OFFSET);
      let result = "";
      // Read the 10 bytes from disk
      for (let i = 0; i < CONF_ACCESS_SIZE; i++) result += buffer[i] === 0x58 ? "X" : "_";
      // Pad to 25 characters with 'X' (full access to remaining conferences 11-25)
      while (result.length < TOTAL_CONFERENCES) result += "X";
      return result;
    } finally { fs.closeSync(fd); }
  }

  /**
   * Find user slot by username (case-insensitive)
   * Returns 1-indexed Amiga slot number, or -1 if not found.
   */
  findUserSlotByName(username: string): number {
    if (!fs.existsSync(this.userDataPath)) return -1;
    const userCount = this.getUserCount();
    const searchName = username.toLowerCase();
    for (let i = 0; i < userCount; i++) {
      const userData = this.readUserFromDisk(i + 1);
      if (userData && userData.user.name.toLowerCase() === searchName) {
        return i + 1;
      }
    }
    return -1;
  }

  /**
   * Read user stats from disk for 68K door compatibility
   * Returns stats object or null if not found
   */
  readUserStatsFromDisk(slotNumber: number): {
    messagesPosted: number;
    uploads: number;
    downloads: number;
    timesCalled: number;
    timeUsed: number;
    timeLimit: number;
    timeTotal: number;
    bytesDownload: number;
    bytesUpload: number;
    timeLastOn: number;
  } | null {
    const data = this.readUserFromDisk(slotNumber);
    if (!data) return null;
    return {
      messagesPosted: data.user.messagesPosted,
      uploads: data.user.uploads,
      downloads: data.user.downloads,
      timesCalled: data.user.timesCalled,
      timeUsed: data.user.timeUsed,
      timeLimit: data.user.timeLimit,
      timeTotal: data.user.timeTotal,
      bytesDownload: data.user.bytesDownload,
      bytesUpload: data.user.bytesUpload,
      timeLastOn: data.user.timeLastOn,
    };
  }

  /**
   * Write a single user stat to disk.
   *
   * `slotNumber` is the 1-INDEXED Amiga slot, the same as everywhere else in
   * this class since 15296b912. That change converted every read
   * (`readUserFromDisk`, `readConfAccessFromDisk`) and left this write behind,
   * so a door updating a caller's uploads wrote them into the NEXT account's
   * record while the read came back from the caller's own - the same
   * neighbour-corruption the lockout fix was about, still live on the stat
   * path. Verified before fixing: slot 1's uploads landed in record 2.
   *
   * Field offsets are the ones `parseUserStruct` reads, which is the only
   * description of this 232-byte record the port has.
   */
  writeUserStatToDisk(slotNumber: number, field: string, value: number): void {
    if (!fs.existsSync(this.userDataPath)) return;
    // Slot 0 is not a record. readUserFromDisk refuses it; so does this.
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
console.warn(`[UserDatabaseManager] writeUserStatToDisk: slot ${slotNumber} is not a 1-indexed slot`);
      return;
    }

    // Field offsets within the 232-byte user record
    const fieldOffsets: Record<string, { offset: number; size: number }> = {
      messagesPosted: { offset: 94, size: 2 },
      uploads: { offset: 146, size: 2 },
      downloads: { offset: 148, size: 2 },
      timesCalled: { offset: 152, size: 2 },
      timeUsed: { offset: 158, size: 4 },
      timeLimit: { offset: 162, size: 4 },
      timeTotal: { offset: 166, size: 4 },
      bytesDownload: { offset: 170, size: 4 },
      bytesUpload: { offset: 174, size: 4 },
      // Three fields 68K doors write through DT_ that this map did not carry,
      // so every such write was dropped with a warning and the door's change
      // never reached the record. Offsets derived from parseUserStruct above.
      timeLastOn: { offset: 154, size: 4 },
      dailyBytesLimit: { offset: 178, size: 4 },
      dailyBytesDld: { offset: 182, size: 4 },
    };

    const fieldInfo = fieldOffsets[field];
    if (!fieldInfo) {
console.warn(`[UserDatabaseManager] Unknown field: ${field}`);
      return;
    }

    const fileOffset = (slotNumber - 1) * this.USER_SIZE + fieldInfo.offset;
    const buffer = Buffer.alloc(fieldInfo.size);

    if (fieldInfo.size === 2) {
      buffer.writeInt16BE(value, 0);
    } else {
      buffer.writeInt32BE(value, 0);
    }

    const fd = fs.openSync(this.userDataPath, "r+");
    try {
      fs.writeSync(fd, buffer, 0, fieldInfo.size, fileOffset);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Clear forcePwdReset and update pwdLastUpdated in user.misc after a
   * successful forced password change.
   * express.e:29828-29829 — pwdLastUpdated:=getSystemTime(); forcePwdReset:=FALSE
   *
   * @param slotNumber - 1-based Amiga slot number
   */
  updateUserMiscAfterPasswordChange(slotNumber: number): void {
    if (!fs.existsSync(this.userMiscPath)) return;

    const diskData = this.readUserFromDisk(slotNumber);
    if (!diskData) {
console.warn(`[UserDatabaseManager] updateUserMiscAfterPasswordChange: no misc record for slot ${slotNumber}`);
      return;
    }

    diskData.misc.pwdLastUpdated = encodeAmigaDate(new Date());
    diskData.misc.forcePwdReset = 0;

    this.writeUserMisc(slotNumber, diskData.misc);
console.log(`[UserDatabaseManager] Cleared forcePwdReset and updated pwdLastUpdated for slot ${slotNumber}`);
  }

  /** One place that writes a misc record back to its slot (1-indexed). */
  private writeUserMisc(slotNumber: number, misc: UserMiscStruct): void {
    const miscBuffer = this.serializeUserMisc(misc);
    const fd = fs.openSync(this.userMiscPath, 'r+');
    try {
      fs.writeSync(fd, miscBuffer, 0, miscBuffer.length, (slotNumber - 1) * this.USERMISC_SIZE);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Count a wrong password against the account, and lock it when the board
   * says to. express.e:1008-1016:
   *
   *     userMisc.invalidAttempts := userMisc.invalidAttempts + 1
   *     maxAttempts := readToolTypeInt(..., 'MAX_PASSWORD_FAILS')
   *     IF maxAttempts >= 0
   *       IF userMisc.invalidAttempts >= maxAttempts
   *         userMisc.accountLocked := TRUE
   *         userMisc.invalidAttempts := 0
   *
   * The counter is on the USER and it is persisted, which is the whole point:
   * express's lockout survives hanging up and dialling back. This port counted
   * failures in the session instead, so `accountLocked` - which login already
   * honours (`login-post.service.ts`, express.e:29775) - could never be set by
   * anything but a sysop editing the account by hand. The gate was real and
   * nothing could ever trip it.
   *
   * A negative `maxFails` means no locking at all, which is what a board with
   * no MAX_PASSWORD_FAILS tooltype gets: `readToolTypeInt` returns -1 when the
   * key is absent (tooltypes.e:181), and express tests `maxAttempts >= 0`.
   *
   * @returns whether the account is locked as a result.
   */
  recordPasswordFailure(slotNumber: number, maxFails: number): boolean {
    if (!fs.existsSync(this.userMiscPath)) return false;

    const diskData = this.readUserFromDisk(slotNumber);
    if (!diskData) {
console.warn(`[UserDatabaseManager] recordPasswordFailure: no misc record for slot ${slotNumber}`);
      return false;
    }

    diskData.misc.invalidAttempts = (diskData.misc.invalidAttempts || 0) + 1;

    let locked = false;
    if (maxFails >= 0 && diskData.misc.invalidAttempts >= maxFails) {
      diskData.misc.accountLocked = 1;
      // express zeroes the counter as it locks, so a sysop who unlocks the
      // account does not hand it back one failure from locking again.
      diskData.misc.invalidAttempts = 0;
      locked = true;
    }

    this.writeUserMisc(slotNumber, diskData.misc);
    return locked;
  }

  /**
   * A correct password clears the count. express.e:1018 - the ELSE branch of
   * the same comparison, `userMisc.invalidAttempts := 0`.
   */
  clearPasswordFailures(slotNumber: number): void {
    if (!fs.existsSync(this.userMiscPath)) return;

    const diskData = this.readUserFromDisk(slotNumber);
    if (!diskData || !diskData.misc.invalidAttempts) return;

    diskData.misc.invalidAttempts = 0;
    this.writeUserMisc(slotNumber, diskData.misc);
  }
}

export const userDatabaseManager = new UserDatabaseManager();

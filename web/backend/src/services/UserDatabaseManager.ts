import * as fs from "fs";
import * as path from "path";

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
    this.bbsRoot = process.env.BBS_ROOT || path.join(__dirname, "../../../..");
    this.userDataPath = path.join(this.bbsRoot, "user.data");
    this.userKeysPath = path.join(this.bbsRoot, "user.keys");
    this.userMiscPath = path.join(this.bbsRoot, "user.misc");
  }

  initializeUserDatabase(): void {
    if (!fs.existsSync(this.userDataPath)) fs.writeFileSync(this.userDataPath, Buffer.alloc(0));
    if (!fs.existsSync(this.userKeysPath)) fs.writeFileSync(this.userKeysPath, Buffer.alloc(0));
    if (!fs.existsSync(this.userMiscPath)) fs.writeFileSync(this.userMiscPath, Buffer.alloc(0));
  }

  readUserFromDisk(slotNumber: number): { user: UserStruct; keys: UserKeysStruct; misc: UserMiscStruct } | null {
    if (!fs.existsSync(this.userDataPath)) return null;
    try {
      const userOffset = slotNumber * this.USER_SIZE;
      const keysOffset = slotNumber * this.USERKEYS_SIZE;
      const miscOffset = slotNumber * this.USERMISC_SIZE;

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
    const name = buffer.toString('ascii', offset, offset + 31).replace(/\0.*$/, ''); offset += 31;
    const pass = buffer.toString('ascii', offset, offset + 9).replace(/\0.*$/, ''); offset += 9;
    const location = buffer.toString('ascii', offset, offset + 30).replace(/\0.*$/, ''); offset += 30;
    const phoneNumber = buffer.toString('ascii', offset, offset + 13).replace(/\0.*$/, ''); offset += 13;
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
    const userName = buffer.toString('ascii', offset, offset + 31).replace(/\0.*$/, ''); offset += 31;
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
    const internetName = buffer.toString('ascii', offset, offset + 10).replace(/\0.*$/, ''); offset += 10;
    const realName = buffer.toString('ascii', offset, offset + 26).replace(/\0.*$/, ''); offset += 26;
    const downloadBytesBCD = Buffer.alloc(8); buffer.copy(downloadBytesBCD, 0, offset, offset + 8); offset += 8;
    const uploadBytesBCD = Buffer.alloc(8); buffer.copy(uploadBytesBCD, 0, offset, offset + 8); offset += 8;
    const eMail = buffer.toString('ascii', offset, offset + 50).replace(/\0.*$/, ''); offset += 50;
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
      const data = this.readUserFromDisk(i);
      if (data && data.user.name.length > 0) result.push(data);
    }
    return result;
  }

  getUserCount(): number {
    if (!fs.existsSync(this.userDataPath)) return 0;
    const stats = fs.statSync(this.userDataPath);
    return Math.floor(stats.size / this.USER_SIZE);
  }

  appendUser(user: UserStruct, keys: UserKeysStruct, misc: UserMiscStruct): void {
    const userBuffer = this.serializeUser(user);
    const keysBuffer = this.serializeUserKeys(keys);
    const miscBuffer = this.serializeUserMisc(misc);
    fs.appendFileSync(this.userDataPath, userBuffer);
    fs.appendFileSync(this.userKeysPath, keysBuffer);
    fs.appendFileSync(this.userMiscPath, miscBuffer);
  }

  private serializeUser(user: UserStruct): Buffer {
    const buffer = Buffer.alloc(this.USER_SIZE);
    let offset = 0;
    offset = this.writeString(buffer, offset, user.name, 31);
    offset = this.writeString(buffer, offset, user.pass, 9);
    offset = this.writeString(buffer, offset, user.location, 30);
    offset = this.writeString(buffer, offset, user.phoneNumber, 13);
    buffer.writeUInt8(0, offset++);
    offset = this.writeInt16(buffer, offset, user.slotNumber);
    offset = this.writeInt16(buffer, offset, user.secStatus);
    offset = this.writeInt16(buffer, offset, user.secBoard);
    offset = this.writeInt16(buffer, offset, user.secLibrary);
    offset = this.writeInt16(buffer, offset, user.secBulletin);
    offset = this.writeInt16(buffer, offset, user.messagesPosted);
    offset = this.writeInt32(buffer, offset, user.newSinceDate);
    offset = this.writeInt32(buffer, offset, user.pwdHash);
    offset = this.writeInt32(buffer, offset, user.confRead2);
    offset = this.writeInt32(buffer, offset, user.confRead3);
    offset = this.writeInt16(buffer, offset, user.zoomType);
    offset = this.writeInt16(buffer, offset, user.unknown);
    offset = this.writeInt16(buffer, offset, user.unknown2);
    offset = this.writeInt16(buffer, offset, user.unknown3);
    offset = this.writeInt16(buffer, offset, user.xferProtocol);
    offset = this.writeInt16(buffer, offset, user.filler2);
    offset = this.writeInt16(buffer, offset, user.lcFiles);
    offset = this.writeInt16(buffer, offset, user.badFiles);
    offset = this.writeInt32(buffer, offset, user.accountDate);
    offset = this.writeInt16(buffer, offset, user.screenType);
    offset = this.writeInt16(buffer, offset, user.editorType);
    user.conferenceAccess.copy(buffer, offset, 0, 10); offset += 10;
    offset = this.writeInt16(buffer, offset, user.uploads);
    offset = this.writeInt16(buffer, offset, user.downloads);
    offset = this.writeInt16(buffer, offset, user.confRJoin);
    offset = this.writeInt16(buffer, offset, user.timesCalled);
    offset = this.writeInt32(buffer, offset, user.timeLastOn);
    offset = this.writeInt32(buffer, offset, user.timeUsed);
    offset = this.writeInt32(buffer, offset, user.timeLimit);
    offset = this.writeInt32(buffer, offset, user.timeTotal);
    offset = this.writeInt32(buffer, offset, user.bytesDownload);
    offset = this.writeInt32(buffer, offset, user.bytesUpload);
    offset = this.writeInt32(buffer, offset, user.dailyBytesLimit);
    offset = this.writeInt32(buffer, offset, user.dailyBytesDld);
    buffer.writeUInt8(user.expert, offset++);
    buffer.writeUInt8(0, offset++);
    offset = this.writeInt32(buffer, offset, user.chatRemain);
    offset = this.writeInt32(buffer, offset, user.chatLimit);
    offset = this.writeInt32(buffer, offset, user.creditDays);
    offset = this.writeInt32(buffer, offset, user.creditAmount);
    offset = this.writeInt32(buffer, offset, user.creditStartDate);
    offset = this.writeInt32(buffer, offset, user.creditTotalToDate);
    offset = this.writeInt32(buffer, offset, user.creditTotalDate);
    buffer.writeUInt8(user.creditTracking, offset++);
    buffer.writeUInt8(user.translatorID, offset++);
    offset = this.writeInt16(buffer, offset, user.msgBaseRJoin);
    offset = this.writeInt32(buffer, offset, user.confYM9);
    offset = this.writeInt32(buffer, offset, user.todaysBytesLimit);
    buffer.writeUInt8(user.protocol, offset++);
    buffer.writeUInt8(user.uucpa, offset++);
    buffer.writeUInt8(user.lineLength, offset++);
    buffer.writeUInt8(user.newUser, offset++);
    return buffer;
  }

  private serializeUserKeys(keys: UserKeysStruct): Buffer {
    const buffer = Buffer.alloc(this.USERKEYS_SIZE);
    let offset = 0;
    offset = this.writeString(buffer, offset, keys.userName, 31);
    buffer.writeUInt8(0, offset++);
    offset = this.writeInt32(buffer, offset, keys.number);
    buffer.writeUInt8(keys.newUser, offset++);
    buffer.writeUInt8(0, offset++);
    offset = this.writeInt16(buffer, offset, keys.oldUpCPS);
    offset = this.writeInt16(buffer, offset, keys.oldDnCPS);
    offset = this.writeInt16(buffer, offset, keys.userFlags);
    offset = this.writeInt16(buffer, offset, keys.baud);
    offset = this.writeInt32(buffer, offset, keys.upCPS2);
    offset = this.writeInt32(buffer, offset, keys.dnCPS2);
    offset = this.writeInt16(buffer, offset, keys.timesOnToday);
    return buffer;
  }

  private serializeUserMisc(misc: UserMiscStruct): Buffer {
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
    Buffer.from(str.substring(0, length), "ascii").copy(temp);
    temp.copy(buffer, offset);
    return offset + length;
  }

  private writeInt16(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt16BE(value, offset);
    return offset + 2;
  }

  private writeInt32(buffer: Buffer, offset: number, value: number): number {
    buffer.writeInt32BE(value, offset);
    return offset + 4;
  }

  private numberToBCD(value: number): Buffer {
    const buffer = Buffer.alloc(8, 0);
    if (value <= 0 || !Number.isFinite(value)) return buffer;
    const str = Math.floor(value).toString().padStart(16, "0");
    for (let i = 0; i < 8; i++) {
      const highDigit = parseInt(str[i * 2], 10);
      const lowDigit = parseInt(str[i * 2 + 1], 10);
      buffer[i] = (highDigit << 4) | lowDigit;
    }
    return buffer;
  }

  readConfAccessFromDisk(slotNumber: number): string {
    if (!fs.existsSync(this.userDataPath)) return "XXXXXXXXXXXXXXXXXXXXXXXXX"; // Default: full access to all 25 conferences
    const CONF_ACCESS_OFFSET = 136;
    const CONF_ACCESS_SIZE = 10; // user.data only stores 10 bytes
    const TOTAL_CONFERENCES = 25; // Doors expect 25 characters
    const fd = fs.openSync(this.userDataPath, "r");
    try {
      const buffer = Buffer.alloc(CONF_ACCESS_SIZE);
      fs.readSync(fd, buffer, 0, CONF_ACCESS_SIZE, slotNumber * this.USER_SIZE + CONF_ACCESS_OFFSET);
      let result = "";
      // Read the 10 bytes from disk
      for (let i = 0; i < CONF_ACCESS_SIZE; i++) result += buffer[i] === 0x58 ? "X" : "_";
      // Pad to 25 characters with 'X' (full access to remaining conferences 11-25)
      while (result.length < TOTAL_CONFERENCES) result += "X";
      return result;
    } finally { fs.closeSync(fd); }
  }

  userToStruct(user: any): UserStruct {
    return {
      name: user.username || "",
      pass: "",
      location: user.location || "",
      phoneNumber: user.phoneNumber || "",
      slotNumber: user.slotNumber || 0,
      secStatus: user.secLevel || 10,
      secBoard: 0,
      secLibrary: 0,
      secBulletin: 0,
      messagesPosted: user.messagesPosted || 0,
      newSinceDate: user.newSinceDate || 0,
      pwdHash: 0,
      confRead2: 0,
      confRead3: 0,
      zoomType: user.zoomType || 0,
      unknown: 0,
      unknown2: 0,
      unknown3: 0,
      xferProtocol: 0,
      filler2: 0,
      lcFiles: 0,
      badFiles: 0,
      accountDate: Math.floor(new Date(user.created || Date.now()).getTime() / 1000),
      screenType: user.screenType || 0,
      editorType: user.editor || 0,
      conferenceAccess: Buffer.alloc(10, 0x58),
      uploads: user.uploads || 0,
      downloads: user.downloads || 0,
      confRJoin: 0,
      timesCalled: user.calls || 0,
      timeLastOn: Math.floor(new Date(user.lastLogin || Date.now()).getTime() / 1000),
      timeUsed: user.timeUsed || 0,
      timeLimit: user.timeLimit || 60,
      timeTotal: user.timeTotal || 0,
      bytesDownload: user.bytesDownload || 0,
      bytesUpload: user.bytesUpload || 0,
      dailyBytesLimit: user.byteLimit || 0,
      dailyBytesDld: 0,
      expert: user.expert === 'X' ? 1 : 0,
      chatRemain: 0,
      chatLimit: user.chatLimit || 0,
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
      protocol: (user.protocol || 'Z').charCodeAt(0),
      uucpa: user.uuCP ? 1 : 0,
      lineLength: user.linesPerScreen || 24,
      newUser: user.newUser ? 1 : 0,
    };
  }

  userToKeys(user: any, slotNumber: number): UserKeysStruct {
    return {
      userName: user.username || "",
      number: slotNumber,
      newUser: user.newUser ? 1 : 0,
      oldUpCPS: 0,
      oldDnCPS: 0,
      userFlags: 0,
      baud: user.baud || 0,
      upCPS2: user.topUploadCPS || 0,
      dnCPS2: user.topDownloadCPS || 0,
      timesOnToday: 0,
    };
  }

  userToMisc(user: any): UserMiscStruct {
    return {
      internetName: "",
      realName: user.realname || "",
      downloadBytesBCD: this.numberToBCD(user.bytesDownload || 0),
      uploadBytesBCD: this.numberToBCD(user.bytesUpload || 0),
      eMail: user.email || "",
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
      unused: Buffer.alloc(86, 0),
    };
  }

  /**
   * Find user slot by username (case-insensitive)
   * Returns 0-based slot index or -1 if not found
   */
  findUserSlotByName(username: string): number {
    if (!fs.existsSync(this.userDataPath)) return -1;
    const userCount = this.getUserCount();
    const searchName = username.toLowerCase();
    for (let i = 0; i < userCount; i++) {
      const userData = this.readUserFromDisk(i);
      if (userData && userData.user.name.toLowerCase() === searchName) {
        return i;
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
   * Write a single user stat to disk
   * Field offsets in user.data structure (232 bytes per user)
   */
  writeUserStatToDisk(slotNumber: number, field: string, value: number): void {
    if (!fs.existsSync(this.userDataPath)) return;

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
    };

    const fieldInfo = fieldOffsets[field];
    if (!fieldInfo) {
console.warn(`[UserDatabaseManager] Unknown field: ${field}`);
      return;
    }

    const fileOffset = slotNumber * this.USER_SIZE + fieldInfo.offset;
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
}

export const userDatabaseManager = new UserDatabaseManager();

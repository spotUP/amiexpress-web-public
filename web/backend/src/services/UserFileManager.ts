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
import { boardScreenTypes, screenTypeIndex } from '../screens/screen-metadata';
import { encodeAmigaDate, decodeAmigaDate, decodeAmigaDateToUnix } from '../utils/date-time.util';
import { boardRoot } from '../utils/board-root.util';

/**
 * E language struct: axobjects.e:11-68
 * SIZEOF user = 239 bytes
 */
export interface UserFileStruct {
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
export interface UserKeysFileStruct {
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

import { expertToByte, byteToExpert } from './expert-mode';

/**
 * A record with a patch overlaid, byte for byte: the bytes the patch does not
 * change are the record's own, padding and garbage included. The changed
 * bytes are found by serializing the record with and without the patch and
 * comparing the two images.
 */
function overlayBytes<T extends object>(
  raw: Buffer, patch: Partial<T>,
  serialize: (s: T) => Buffer, deserialize: (b: Buffer, o: number) => T,
): Buffer {
  const out = Buffer.from(raw);
  if (Object.keys(patch).length === 0) return out;
  const current = deserialize(raw, 0);
  const base = serialize(current);
  const next = serialize({ ...current, ...patch });
  for (let i = 0; i < raw.length; i++) if (base[i] !== next[i]) out[i] = next[i];
  return out;
}

/** Record sizes and the offsets of the fields express.e acts on - see UserFileManager.recordLayout. */
export interface UserRecordLayout {
  userSize: number;
  keysSize: number;
  miscSize: number;
  slotNumberOffset: number;
  userNewUserOffset: number;
  keysNumberOffset: number;
  keysNewUserOffset: number;
}

/** The fields of an existing account's three records that a save changes; every other byte stays. */
export interface UserRecordPatch {
  data?: Partial<UserFileStruct>;
  keys?: Partial<UserKeysFileStruct>;
  misc?: Partial<UserMiscFileStruct>;
}

export class UserFileManager {
  private bbsRoot: string;
  private userDataPath: string;
  private userKeysPath: string;
  private userMiscPath: string;

  // Struct sizes (must match E structs exactly)
  // Correct struct sizes matching mtop.e and Amiga E alignment rules
  // See Documentation/7-Reference Sources/AmiExpressEDoorSources/MultiTop2/mtop.e
  //
  // Public because the IMPORTER reads ANOTHER board's user files and has to
  // walk them the same way. It carried its own copy of these numbers and its
  // own field readers, written from the 239-byte struct listing in
  // axobjects.e:11-68 rather than from what a door actually reads - so it
  // walked 239 bytes at a 232-byte stride, ran off the end of the last
  // record, threw, and returned zero users from every board it was pointed
  // at.
  public readonly USER_STRUCT_SIZE = 232;     // mtop reads 232 bytes per user
  public readonly USERKEYS_STRUCT_SIZE = 56;  // mtop reads 56 bytes per userKeys
  public readonly USERMISC_STRUCT_SIZE = 248; // mtop reads 248 bytes per userMisc

  /** @param bbsRoot another board's root - a tool working on a copy of one; the board's own by default. */
  constructor(bbsRoot?: string) {
    // BBS: logical assignment points to project root.
    // Production (Docker) sets BBS_DATA_DIR pointing at the persistent volume;
    // legacy installs may set BBS_ROOT; dev falls back to the calculated path.
    // __dirname when compiled is /dist/services and with tsx it's /src/services,
    // so go 4 levels up either way: dist|src -> backend -> web -> amiexpress-web.
    this.bbsRoot = bbsRoot || boardRoot();
    this.userDataPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.data'));
    this.userKeysPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.keys'));
    this.userMiscPath = this.normalizeTargetPath(path.join(this.bbsRoot, 'user.misc'));

  }
 
  private normalizeTargetPath(targetPath: string): string {
    return path.resolve(targetPath);
  }

  /**
   * Convert User (DB model) to UserFileStruct (binary file format).
   * A WHOLE record: for a NEW account and the node file's in-memory copy only.
   * Saving an existing account never goes through here - it overlays the
   * fields the caller names (userFieldsToPatch / patchUserRecord).
   */
  private userToFileStruct(user: User, slotNumber: number): UserFileStruct {
    return {
      name: user.username,
      pass: '', // Password hash stored separately, not in plaintext
      location: user.location || '',
      phoneNumber: user.phone || '',
      // express.e:21364 - a DELETED account keeps its position and carries 0
      // in its own slotNumber field. The position is `slotNumber` (the offset
      // this record is written at); the field is what says it is deleted.
      slotNumber: user.accountDeleted ? 0 : slotNumber,
      secStatus: user.secLevel,
      secBoard: user.ratioType,
      secLibrary: user.ratio,
      // express.e:11344 secBulletin:=stat-1, the index into the board's computer list.
      // Disk-only: a User that does not carry one keeps the record's (updateUserDataFile).
      secBulletin: user.computerIndex ?? 0,
      // Disk-only: the users table has no column for it. updateUserDataFile
      // keeps the disk's own count when the caller's User does not carry one,
      // which is every User built from a database row.
      messagesPosted: user.messagesPosted ?? 0,
      // Every date field holds express.e's getSystemTime() value, not Unix
      // seconds (date-time.util.ts toAmigaTime).
      // Its own field, not the last logon. express.e moves it only at a
      // logoff after N (8197 `IF(newSinceFlag) THEN loggedOnUser.newSinceDate:=
      // getSystemTime()`) and, under conference accounting, from the joined
      // conference's record (4906). A User that does not carry one keeps the
      // record's (updateUserDataFile); a new account starts at 0.
      newSinceDate: encodeAmigaDate(user.newSinceDate),
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
      accountDate: encodeAmigaDate(user.created),
      screenType: this.screenTypeToInt(user.screenType),
      editorType: this.editorTypeToInt(user.editor),
      conferenceAccess: user.confAccess || 'XXX',
      uploads: user.uploads,
      downloads: user.downloads,
      confRJoin: user.confRJoin || user.autoRejoin || 1, // Auto-rejoin conference (default to 1)
      timesCalled: user.calls,
      timeLastOn: encodeAmigaDate(user.lastLogin ?? new Date()),
      timeUsed: user.timeUsed,
      timeLimit: user.timeLimit,
      timeTotal: user.timeTotal,
      bytesDownload: user.bytesDownload,
      bytesUpload: user.bytesUpload,
      dailyBytesLimit: user.byteLimit,
      dailyBytesDld: user.dailyBytesDld ?? 0,
      // A CHAR holding the letter (express.e:24595 `expert="X"`, 26116
      // `expert:="N"`). `user.expert ? 1 : 0` wrote 1 for 'N' as well, since
      // 'N' is truthy, so every account looked expert to a door and the
      // letter express.e compares against was never on disk.
      expert: expertToByte(user.expert),
      chatRemain: user.chatLimit - user.chatUsed,
      chatLimit: user.chatLimit,
      creditDays: user.creditDays ?? 0,
      creditAmount: user.creditAmount ?? 0,
      creditStartDate: encodeAmigaDate(user.creditStartDate),
      creditTotalToDate: user.creditTotalToDate ?? 0,
      creditTotalDate: encodeAmigaDate(user.creditTotalDate),
      creditTracking: user.creditTracking ?? 0,
      translatorID: 0,
      // The record's own three fields (axobjects.e:61-65), written as the
      // caller holds them. They were constants - msgBaseRJoin 1, uucpa 0/1,
      // todaysBytesLimit := dailyBytesLimit - so J's `.n` (express.e:21488),
      // a preset's PRESET.MSGBASERJOIN (29366), a join's base (5136), a UUCP
      // value above 1 (21596) and today's extra bytes (21537-21544, 19531)
      // never reached the disk. A User that does not carry one keeps the
      // record's (updateUserDataFile); a new record starts as before.
      msgBaseRJoin: user.msgBaseRJoin ?? 1,
      confYM9: 0,
      todaysBytesLimit: user.todaysBytesLimit ?? user.byteLimit,
      protocol: 0x5a, // express.e:30449 userData.protocol:="Z" at creation; nothing else sets it
      uucpa: user.uucpa ?? (user.uuCP ? 1 : 0),
      // Lines per screen, 0 = auto (express.e:11272-11314). It was a constant
      // 79, as if it were a line WIDTH, so every caller's pause length on disk
      // was 79 whatever they had chosen.
      lineLength: Math.max(0, Math.min(255, Math.trunc(user.linesPerScreen ?? 0))),
      newUser: user.newUser ? 1 : 0,
    };
  }

  /**
   * Convert User to UserKeysFileStruct
   */
  private userToKeysStruct(user: User, slotNumber: number): UserKeysFileStruct {
    return {
      userName: user.username,
      // express.e:21365 `hoozer2.number:=0` beside the record's slotNumber.
      number: user.accountDeleted ? 0 : slotNumber,
      newUser: user.newUser ? 1 : 0,
      oldUpCPS: Math.min(user.topUploadCPS, 65535), // Max 16-bit unsigned
      oldDnCPS: Math.min(user.topDownloadCPS, 65535),
      userFlags: user.userFlags,
      // express.e:30269 userKeys.baud:=onlineBaud. Disk-only; a User that does not carry one keeps the record's.
      baud: user.connectBaud ?? 57600,
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
      // EMPTY, deliberately. The field is 32 characters and a bcrypt hash is
      // 60, so what used to go here was the first half of a credential:
      // unable to verify anything, and a fragment of a real hash sitting in a
      // file doors can read. The store that authenticates is the users table
      // (db.authenticateUser), and on 2026-09-01 a password changed in the
      // admin went to this fragment while the board kept checking the row -
      // the account kept its old password and the sysop was told it had been
      // updated.
      pwdHash: '',
      salt: '', // Not used with bcrypt
      pwdType: 1, // bcrypt
      // A new record is unlocked unless the caller names a lock (express.e:1008-1018).
      forcePwdReset: user.forcePwdReset ? 1 : 0,
      accountLocked: user.accountLocked ? 1 : 0,
      invalidAttempts: Math.max(0, Math.floor(user.invalidAttempts ?? 0)),
      pwdLastUpdated: user.pwdLastUpdated !== undefined
        ? encodeAmigaDate(Math.max(0, Math.floor(user.pwdLastUpdated)))
        : encodeAmigaDate(user.updated),
      lastIP: 0,
      ipMask: 0,
      unused: Buffer.alloc(86),
    };
  }

  /**
   * The user struct exactly as express.e writes it for a logged-on caller -
   * `Write(fh,loggedOnUser,SIZEOF user)` into node<n>.user (2935-2950) - and
   * its user.keys record. One serializer for user.data and the node files: a
   * second one, with its own layout, wrote node.user 240 bytes long, and the
   * stats door that reads it (zOOsTAT) showed conference #0, 3932160
   * minutes and no time left (GOTO8O, relayed 2026-10-02).
   */
  public userRecord(user: User, slotNumber: number): Buffer {
    return this.serializeUserStruct(this.userToFileStruct(user, slotNumber));
  }

  public userKeysRecord(user: User, slotNumber: number): Buffer {
    return this.serializeUserKeysStruct(this.userToKeysStruct(user, slotNumber));
  }

  /**
   * Serialize UserFileStruct to binary buffer (239 bytes)
   */
  public serializeUserStruct(struct: UserFileStruct): Buffer {
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

    // conferenceAccess[10]: at most nine characters and a NUL - express.e
    // copies it with AstrCopy(..,10) (21334, 23792, 29369) and reads it with
    // StrLen (459-465, 8499-8512). Ten unterminated bytes ran on into
    // `uploads`, so a caller with 256+ uploads read as an access-AREA name
    // and lost every conference. A tenth X is not something express.e can
    // hold; a board past nine conferences grants access by area name.
    offset += this.writeFixedBytes(buffer, offset, struct.conferenceAccess.substring(0, 9), 10);

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
    // CHAR: E stores the low byte (`hoozer.uucpa:=uucpNumberInput(...)`).
    buffer.writeUInt8(struct.uucpa & 0xff, offset++);
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
    // An E INT store keeps the low 16 bits (57600 baud -> 0xE100), it does
    // not clamp. Big-endian for Amiga 68K compatibility.
    buffer.writeUInt16BE(value & 0xffff, offset);
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

  /**
   * The four names this port knows, and a slot number for everything else.
   *
   * `xferProtocol` is an INDEX into the BOARD's own XprTypes list
   * (express.e:15618, :11388), not a global protocol id - so what slot 8 means
   * depends on the board an account came from, and naming it would be
   * inventing a fact. Slots outside the four we can name round-trip as
   * `/X <n>`: `intToProtocol` writes that, this reads it back, and an imported
   * account keeps the number it arrived with.
   *
   * Before this, every unknown slot read as `/X Zmodem` and was written back
   * as 0 on the next save - a one-way, silent loss of the caller's setting.
   */
  private protocolToInt(protocol: string): number {
    const map: { [key: string]: number } = {
      '/X Zmodem': 0,
      'Zmodem': 1,
      'Ymodem': 2,
      'Xmodem': 3,
    };
    if (protocol in map) return map[protocol];
    const slot = /^\/X (\d+)$/.exec(String(protocol ?? '').trim());
    if (slot) {
      const index = Number(slot[1]);
      // The field is an INT on disk; a number that would not survive the write
      // is not a slot that board had either.
      if (Number.isInteger(index) && index >= 0 && index <= 32767) return index;
    }
    return 0;
  }

  // user.data's screenType is an index into ScreenTypes.info (express.e:11366
  // `loggedOnUser.screenType:=stat-1`); the same lookup the screen loader uses.
  private screenTypeToInt(screenType: string): number {
    return screenTypeIndex(screenType, boardScreenTypes(this.bbsRoot));
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

  /** The other direction. See `protocolToInt` for why `/X <n>` exists. */
  private intToProtocol(value: number): string {
    const map: { [key: number]: string } = {
      0: '/X Zmodem',
      1: 'Zmodem',
      2: 'Ymodem',
      3: 'Xmodem',
    };
    if (value in map) return map[value];
    if (Number.isInteger(value) && value > 0) return `/X ${value}`;
    return '/X Zmodem';
  }

  // The TITLE this board gives that index, which is what the port stores; an
  // index the board has no entry for is kept as the number, so it survives.
  private intToScreenType(value: number): string {
    return boardScreenTypes(this.bbsRoot)[value]?.title ?? String(value);
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
  public deserializeUserStruct(buffer: Buffer, offset: number = 0): UserFileStruct {
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
  public deserializeUserKeysStruct(buffer: Buffer, offset: number = 0): UserKeysFileStruct {
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
  public deserializeUserMiscStruct(buffer: Buffer, offset: number = 0): UserMiscFileStruct {
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
      // Never from disk: see userToMiscStruct. A user read from user.misc has
      // no usable credential, and pretending otherwise is what let a
      // half-hash look like an answer.
      passwordHash: '',
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
      lastLogin: userStruct.timeLastOn > 0 ? decodeAmigaDate(userStruct.timeLastOn) : undefined,
      firstLogin: decodeAmigaDate(userStruct.accountDate) ?? new Date(0),
      calls: userStruct.timesCalled,
      callsToday: keysStruct.timesOnToday,
      messagesPosted: userStruct.messagesPosted,
      newUser: userStruct.newUser > 0,
      // '' when the byte is neither letter: the old writer's 1, which it wrote
      // for 'X' and 'N' alike, says nothing about the caller's choice.
      expert: byteToExpert(userStruct.expert),
      ansi: userStruct.screenType !== 2, // Not ASCII
      linesPerScreen: userStruct.lineLength,
      computer: '', // The name is the row's; the record holds the index (computerIndex)
      computerIndex: userStruct.secBulletin,
      connectBaud: keysStruct.baud,
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
      uucpa: userStruct.uucpa,
      msgBaseRJoin: userStruct.msgBaseRJoin,
      todaysBytesLimit: userStruct.todaysBytesLimit,
      topUploadCPS: keysStruct.upCPS2,
      topDownloadCPS: keysStruct.dnCPS2,
      byteLimit: userStruct.dailyBytesLimit,
      dailyBytesDld: userStruct.dailyBytesDld,
      newSinceDate: userStruct.newSinceDate > 0 ? decodeAmigaDate(userStruct.newSinceDate) : undefined,
      creditDays: userStruct.creditDays,
      creditAmount: userStruct.creditAmount,
      creditStartDate: decodeAmigaDateToUnix(userStruct.creditStartDate),
      creditTotalToDate: userStruct.creditTotalToDate,
      creditTotalDate: decodeAmigaDateToUnix(userStruct.creditTotalDate),
      creditTracking: userStruct.creditTracking,
      // express.e:29701 - a record whose own slotNumber field is 0 is a
      // deleted account. The position it sits at stays its slot.
      accountDeleted: userStruct.slotNumber === 0,
      baud: keysStruct.baud,
      userFlags: keysStruct.userFlags,
      created: decodeAmigaDate(userStruct.accountDate) ?? new Date(0),
      updated: fileModTime,
      // Lockout state, straight off user.misc. The admin lists it and the
      // unlock button writes it; the login gate reads the same record.
      // Absent here until now, which is why no admin surface could show it.
      forcePwdReset: miscStruct.forcePwdReset,
      accountLocked: miscStruct.accountLocked,
      invalidAttempts: miscStruct.invalidAttempts,
      pwdLastUpdated: decodeAmigaDateToUnix(miscStruct.pwdLastUpdated),
    };
  }

  /**
   * Write all 3 user files (data/keys/misc) for a single user
   * Appends to files if they exist, creates if not
   */
  public writeUserFiles(user: User, slotNumber: number): void {
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
      throw new Error(`writeUserFiles: invalid slot ${slotNumber}`);
    }
    // A slot that already holds an account is never rebuilt: the User names
    // the fields it carries and the rest of the record stays as it is.
    if (this.recordExists(slotNumber)) {
      this.updateUserDataFile(user, slotNumber);
      return;
    }
    this.writeNewRecord(user, slotNumber);
  }

  /** A whole record for a slot that holds no account: express.e's new-account values for what `user` does not carry. */
  private writeNewRecord(user: User, slotNumber: number): void {
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

      // AT THE SLOT, NEVER APPENDED. These three files are arrays indexed by
      // slot: record N is slot N+1, and every other read here computes its
      // offset that way. This APPENDED, so a slot number was accepted and
      // then ignored - each write added a record at the end instead of
      // replacing the one it named. Write a user twice and the file holds
      // two of them, the second at a position that is somebody else's slot.
      //
      // That is the duplication this board has carried from the start: 46
      // accounts in 100 populated records (live, 2026-09-13), and a lockout
      // written at coffe's slot sitting on the account that occupies that
      // offset now. updateFileAtOffset extends the file with zeroed records
      // when the slot is past the end, which is what makes a sparse slot
      // file legal.
      const index = slotNumber - 1;
      this.updateFileAtOffset(this.userDataPath, userBuffer, index * this.USER_STRUCT_SIZE);
      this.updateFileAtOffset(this.userKeysPath, keysBuffer, index * this.USERKEYS_STRUCT_SIZE);
      this.updateFileAtOffset(this.userMiscPath, miscBuffer, index * this.USERMISC_STRUCT_SIZE);

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
        // The slot IS the position in the file. The struct carries its own
        // slotNumber field but stale imports leave it wrong; the offset the
        // record was read from is the only truth a write-back can use.
        user.slotNumber = i + 1;
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

  /**
   * Where a door's raw account copy keeps the fields the board itself acts
   * on, read off this file's own serializers, so a 68K door's LOAD_ACCOUNT /
   * SAVE_ACCOUNT moves the same records the board writes.
   *
   * express.e moves whole records - `Read/Write(fh,ptr,SIZEOF user)` at
   * `(slot-1)*SIZEOF` (loadAccount 7977, saveAccount 8025) - and acts on
   * three fields of them: user.slotNumber (saveAccount 8037-8041,
   * doorMsgSaveAccount 4580), userKeys.number (4581) and the newUser byte it
   * copies from the user record into the keys record (8061). axobjects.e:
   * user is 232 bytes (pad at 83, slotNumber INT at 84), userKeys 56 (pad at
   * 31, number LONG at 32, newUser at 36), userMisc 248.
   *
   * The XIM door path kept its own numbers - 239/54/256 and slotNumber at 83
   * - so every slot past the first was read and written at the wrong place.
   * Each offset here is found by serializing two records that differ in that
   * field alone, so the layout cannot drift from the writer.
   */
  public recordLayout(): UserRecordLayout {
    if (this.layout) return this.layout;
    const probe = (fields: Partial<User>, slot: number) => {
      const user = { username: 'probe', created: new Date(0), lastLogin: new Date(0), ...fields } as unknown as User;
      return { user: this.userRecord(user, slot), keys: this.userKeysRecord(user, slot) };
    };
    /** The field's first byte: the last byte that differs, less the field's width. */
    const fieldAt = (a: Buffer, b: Buffer, width: number): number => {
      let last = -1;
      for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) last = i;
      if (last < 0) throw new Error('recordLayout: probe records do not differ');
      return last - (width - 1);
    };
    const slotA = probe({}, 1);
    const slotB = probe({}, 2);
    const fresh = probe({ newUser: true } as Partial<User>, 1);
    this.layout = {
      userSize: this.USER_STRUCT_SIZE,
      keysSize: this.USERKEYS_STRUCT_SIZE,
      miscSize: this.USERMISC_STRUCT_SIZE,
      slotNumberOffset: fieldAt(slotA.user, slotB.user, 2),
      userNewUserOffset: fieldAt(slotA.user, fresh.user, 1),
      keysNumberOffset: fieldAt(slotA.keys, slotB.keys, 4),
      keysNewUserOffset: fieldAt(slotA.keys, fresh.keys, 1),
    };
    return this.layout;
  }

  private layout: UserRecordLayout | null = null;

  /**
   * Byte offset of conferenceAccess[10] inside a user.data record.
   *
   * Locked by a unit test against serializeUserStruct with a marker string,
   * so a struct change that moves the field fails the test instead of
   * silently patching the wrong bytes.
   */
  public conferenceAccessOffset(): number {
    const marker = '@ACCESS@@';  // nine characters: the field holds nine and a NUL
    const probe = this.serializeUserStruct(
      this.userToFileStruct(
        {
          username: 'probe',
          confAccess: marker,
          created: new Date(0),
          lastLogin: new Date(0),
        } as unknown as User,
        1
      )
    );
    const at = probe.indexOf(Buffer.from(marker, 'latin1'));
    if (at < 0) throw new Error('conferenceAccessOffset: marker not found');
    return at;
  }

  /**
   * Patch ONLY the conferenceAccess bytes of one user.data record.
   *
   * The conference removal used updateUserDataFile for this, which
   * round-trips the whole account through User and back - hardcoding
   * creditDays, lineLength, baud and friends on the way, and rewriting
   * user.keys and user.misc that the caller never meant to touch. Ten bytes
   * change; ten bytes are written.
   */
  public writeConferenceAccessAt(slotNumber: number, access: string): void {
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
      throw new Error(`writeConferenceAccessAt: invalid slot ${slotNumber}`);
    }
    this.ensureUserFilesReady();
    const offset = (slotNumber - 1) * this.USER_STRUCT_SIZE + this.conferenceAccessOffset();
    const bytes = Buffer.alloc(10, 0);
    // Nine characters at most; byte ten stays the NUL express.e reads up to.
    bytes.write(access.slice(0, 9), 0, 'latin1');
    const fd = fs.openSync(this.userDataPath, 'r+');
    try {
      fs.writeSync(fd, bytes, 0, 10, offset);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * The byte offset of the auto-rejoin conference (INT16), inside one record.
   *
   * `confRJoin` is serialized right after the 10-byte conference access map and
   * the uploads/downloads INT16 pair (serializeUserStruct), so it sits 14 bytes
   * past the access map - derived from `conferenceAccessOffset()` rather than
   * hardcoded, so a struct-layout change moves both together.
   */
  public confRJoinOffset(): number {
    return this.conferenceAccessOffset() + 10 + 2 + 2;
  }

  /**
   * Rewrite ONLY a user's auto-rejoin conference position, in place.
   *
   * Surgical like `writeConferenceAccessAt`, and for the same reason: the
   * conference-removal migration must move this one INT16 without re-serialising
   * the whole record (which dropped fields the last time it was tried).
   */
  public writeRejoinAt(slotNumber: number, confRJoin: number): void {
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
      throw new Error(`writeRejoinAt: invalid slot ${slotNumber}`);
    }
    this.ensureUserFilesReady();
    const offset = (slotNumber - 1) * this.USER_STRUCT_SIZE + this.confRJoinOffset();
    const bytes = Buffer.alloc(2);
    bytes.writeInt16BE(Math.max(-32768, Math.min(32767, confRJoin)), 0);
    const fd = fs.openSync(this.userDataPath, 'r+');
    try {
      fs.writeSync(fd, bytes, 0, 2, offset);
    } finally {
      fs.closeSync(fd);
    }
  }

  /**
   * Does the slot hold an account in user.data? A blank name is an empty
   * slot (never used, or zeroed by deleteUserSlot); a deleted account keeps
   * its name and carries slotNumber 0 (express.e:21364).
   */
  private recordExists(slotNumber: number): boolean {
    try {
      if (!Number.isInteger(slotNumber) || slotNumber < 1 || !fs.existsSync(this.userDataPath)) return false;
      const offset = (slotNumber - 1) * this.USER_STRUCT_SIZE;
      const buffer = Buffer.alloc(this.USER_STRUCT_SIZE);
      const fd = fs.openSync(this.userDataPath, 'r');
      try {
        if (fs.fstatSync(fd).size < offset + this.USER_STRUCT_SIZE) return false;
        fs.readSync(fd, buffer, 0, this.USER_STRUCT_SIZE, offset);
      } finally { fs.closeSync(fd); }
      return this.deserializeUserStruct(buffer, 0).name.trim().length > 0;
    } catch {
      return false;
    }
  }

  /**
   * The record fields a caller NAMES, as struct fields. A User field that is
   * undefined is not named and maps to nothing; the rest map one-to-one onto
   * the fields of user.data / user.keys / user.misc that hold them.
   *
   * Never maps the password: the port authenticates against the users row
   * (db.authenticateUser), express.e keeps its credential in user.pwdHash /
   * userMisc.pwdHash+salt (958-1006) and the legacy `pass` field is cleared
   * at creation (30468). A save that is not a password change has no business
   * with any of them, so no User field maps to them at all.
   */
  public userFieldsToPatch(f: Partial<User>, slotNumber: number, current: { data: UserFileStruct; keys: UserKeysFileStruct }): UserRecordPatch {
    const data: Partial<UserFileStruct> = {};
    const keys: Partial<UserKeysFileStruct> = {};
    const misc: Partial<UserMiscFileStruct> = {};

    if (f.username !== undefined) { data.name = f.username; keys.userName = f.username; }
    if (f.location !== undefined) data.location = f.location;
    if (f.phone !== undefined) data.phoneNumber = f.phone;
    // express.e:21364-21365 - a DELETED account carries 0 in both slot fields.
    if (f.accountDeleted !== undefined) {
      data.slotNumber = f.accountDeleted ? 0 : slotNumber;
      keys.number = f.accountDeleted ? 0 : slotNumber;
    }
    if (f.secLevel !== undefined) data.secStatus = f.secLevel;
    if (f.ratioType !== undefined) data.secBoard = f.ratioType;
    if (f.ratio !== undefined) data.secLibrary = f.ratio;
    // express.e:11344 secBulletin:=stat-1, the index into the board's computer list.
    if (f.computerIndex !== undefined) data.secBulletin = f.computerIndex;
    if (f.messagesPosted !== undefined) data.messagesPosted = f.messagesPosted;
    if (f.newSinceDate !== undefined) data.newSinceDate = encodeAmigaDate(f.newSinceDate);
    if (f.zoomType !== undefined) data.zoomType = this.zoomTypeToInt(f.zoomType);
    if (f.protocol !== undefined) data.xferProtocol = this.protocolToInt(f.protocol);
    // accountDate (created) is set once, with the record; no save moves it.
    if (f.screenType !== undefined) data.screenType = this.screenTypeToInt(f.screenType);
    if (f.editor !== undefined) data.editorType = this.editorTypeToInt(f.editor);
    if (f.confAccess !== undefined) data.conferenceAccess = f.confAccess;
    if (f.uploads !== undefined) data.uploads = f.uploads;
    if (f.downloads !== undefined) data.downloads = f.downloads;
    // autoRejoin and confRJoin are the same field (user.data confRJoin).
    const rejoin = f.confRJoin ?? f.autoRejoin;
    if (rejoin !== undefined) data.confRJoin = rejoin;
    if (f.calls !== undefined) data.timesCalled = f.calls;
    if (f.lastLogin !== undefined) data.timeLastOn = encodeAmigaDate(f.lastLogin);
    if (f.timeUsed !== undefined) data.timeUsed = f.timeUsed;
    if (f.timeLimit !== undefined) data.timeLimit = f.timeLimit;
    if (f.timeTotal !== undefined) data.timeTotal = f.timeTotal;
    if (f.bytesDownload !== undefined) { data.bytesDownload = f.bytesDownload; misc.downloadBytesBCD = this.numberToBCD(f.bytesDownload); }
    if (f.bytesUpload !== undefined) { data.bytesUpload = f.bytesUpload; misc.uploadBytesBCD = this.numberToBCD(f.bytesUpload); }
    if (f.byteLimit !== undefined) data.dailyBytesLimit = f.byteLimit;
    if (f.dailyBytesDld !== undefined) data.dailyBytesDld = f.dailyBytesDld;
    // A CHAR holding the letter (express.e:24595 `expert="X"`, 26116 `expert:="N"`).
    if (f.expert !== undefined) data.expert = expertToByte(f.expert);
    // chatRemain is limit minus used: naming one of the two keeps the other as the record holds it.
    if (f.chatLimit !== undefined || f.chatUsed !== undefined) {
      const limit = f.chatLimit ?? current.data.chatLimit;
      const used = f.chatUsed ?? Math.max(0, current.data.chatLimit - current.data.chatRemain);
      data.chatLimit = limit;
      data.chatRemain = limit - used;
    }
    if (f.creditDays !== undefined) data.creditDays = f.creditDays;
    if (f.creditAmount !== undefined) data.creditAmount = f.creditAmount;
    if (f.creditStartDate !== undefined) data.creditStartDate = encodeAmigaDate(f.creditStartDate);
    if (f.creditTotalToDate !== undefined) data.creditTotalToDate = f.creditTotalToDate;
    if (f.creditTotalDate !== undefined) data.creditTotalDate = encodeAmigaDate(f.creditTotalDate);
    if (f.creditTracking !== undefined) data.creditTracking = f.creditTracking;
    if (f.msgBaseRJoin !== undefined) data.msgBaseRJoin = f.msgBaseRJoin;
    if (f.todaysBytesLimit !== undefined) data.todaysBytesLimit = f.todaysBytesLimit;
    // uuCP is the yes/no of the uucpa byte: the record's own value stands while it agrees.
    if (f.uucpa !== undefined) data.uucpa = f.uucpa;
    else if (f.uuCP !== undefined && (current.data.uucpa > 0) !== Boolean(f.uuCP)) data.uucpa = f.uuCP ? 1 : 0;
    // Lines per screen, 0 = auto (express.e:11272-11314).
    if (f.linesPerScreen !== undefined) data.lineLength = Math.max(0, Math.min(255, Math.trunc(f.linesPerScreen)));
    if (f.newUser !== undefined) { data.newUser = f.newUser ? 1 : 0; keys.newUser = f.newUser ? 1 : 0; }

    if (f.userFlags !== undefined) keys.userFlags = f.userFlags;
    // express.e:30269 userKeys.baud:=onlineBaud.
    if (f.connectBaud !== undefined) keys.baud = f.connectBaud;
    if (f.topUploadCPS !== undefined) { keys.oldUpCPS = Math.min(f.topUploadCPS, 65535); keys.upCPS2 = f.topUploadCPS; }
    if (f.topDownloadCPS !== undefined) { keys.oldDnCPS = Math.min(f.topDownloadCPS, 65535); keys.dnCPS2 = f.topDownloadCPS; misc.lastDlCPS = f.topDownloadCPS; }
    if (f.callsToday !== undefined) keys.timesOnToday = f.callsToday;

    if (f.realname !== undefined) misc.realName = f.realname;
    if (f.email !== undefined) misc.eMail = f.email;
    if (f.forcePwdReset !== undefined) misc.forcePwdReset = f.forcePwdReset ? 1 : 0;
    if (f.accountLocked !== undefined) misc.accountLocked = f.accountLocked ? 1 : 0;
    if (f.invalidAttempts !== undefined) misc.invalidAttempts = Math.max(0, Math.floor(f.invalidAttempts));
    // WHEN THE PASSWORD WAS LAST CHANGED - only a real password change moves it (express.e:29828-29829).
    if (f.pwdLastUpdated !== undefined) misc.pwdLastUpdated = encodeAmigaDate(Math.max(0, Math.floor(f.pwdLastUpdated)));
    return { data, keys, misc };
  }

  /**
   * Overlay a patch onto one record of one file, byte for byte: the bytes the
   * patch does not change are the file's own, padding and garbage included.
   * The changed bytes are found by serializing the record with and without the
   * patch and comparing the two images.
   */
  private overlayRecord<T extends object>(
    filePath: string, size: number, slotNumber: number, patch: Partial<T>,
    serialize: (s: T) => Buffer, deserialize: (b: Buffer, o: number) => T,
  ): void {
    if (Object.keys(patch).length === 0) return;
    const raw = this.readSlotBytes(filePath, size, slotNumber);
    this.updateFileAtOffset(filePath, overlayBytes(raw, patch, serialize, deserialize), (slotNumber - 1) * size);
  }

  /** One slot's bytes as the file holds them; zeros when the file stops short of it. */
  private readSlotBytes(file: string, size: number, slotNumber: number): Buffer {
    const buffer = Buffer.alloc(size);
    if (!fs.existsSync(file)) return buffer;
    const offset = (slotNumber - 1) * size;
    const fd = fs.openSync(file, 'r');
    try {
      if (fs.fstatSync(fd).size >= offset + size) fs.readSync(fd, buffer, 0, size, offset);
    } finally { fs.closeSync(fd); }
    return buffer;
  }

  /** The record as it is on disk, for the fields a patch is computed against. */
  public readRecordStructs(slotNumber: number): { data: UserFileStruct; keys: UserKeysFileStruct } {
    return {
      data: this.deserializeUserStruct(this.readSlotBytes(this.userDataPath, this.USER_STRUCT_SIZE, slotNumber), 0),
      keys: this.deserializeUserKeysStruct(this.readSlotBytes(this.userKeysPath, this.USERKEYS_STRUCT_SIZE, slotNumber), 0),
    };
  }

  /**
   * The user.data and user.keys records of a slot with a patch laid over them,
   * NOT written: what the files will hold after patchUserRecord(slot, patch).
   * express.e hands a door loggedOnUser - the record as loaded plus what the
   * session changed - so the node files and the door's loadAccount buffer are
   * this, and share patchUserRecord's overlay.
   */
  public overlaidRecords(slotNumber: number, patch: UserRecordPatch): { user: Buffer; keys: Buffer } {
    return {
      user: overlayBytes<UserFileStruct>(
        this.readSlotBytes(this.userDataPath, this.USER_STRUCT_SIZE, slotNumber), patch.data ?? {},
        s => this.serializeUserStruct(s), (b, o) => this.deserializeUserStruct(b, o)),
      keys: overlayBytes<UserKeysFileStruct>(
        this.readSlotBytes(this.userKeysPath, this.USERKEYS_STRUCT_SIZE, slotNumber), patch.keys ?? {},
        s => this.serializeUserKeysStruct(s), (b, o) => this.deserializeUserKeysStruct(b, o)),
    };
  }

  /**
   * Write the fields of an EXISTING account that the caller names, and
   * nothing else: read-modify-write of the slot's three records.
   */
  public patchUserRecord(slotNumber: number, patch: UserRecordPatch): void {
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
      throw new Error(`patchUserRecord: invalid slot ${slotNumber}`);
    }
    this.ensureUserFilesReady();
    this.overlayRecord<UserFileStruct>(this.userDataPath, this.USER_STRUCT_SIZE, slotNumber, patch.data ?? {},
      s => this.serializeUserStruct(s), (b, o) => this.deserializeUserStruct(b, o));
    this.overlayRecord<UserKeysFileStruct>(this.userKeysPath, this.USERKEYS_STRUCT_SIZE, slotNumber, patch.keys ?? {},
      s => this.serializeUserKeysStruct(s), (b, o) => this.deserializeUserKeysStruct(b, o));
    this.overlayRecord<UserMiscFileStruct>(this.userMiscPath, this.USERMISC_STRUCT_SIZE, slotNumber, patch.misc ?? {},
      s => this.serializeUserMiscStruct(s), (b, o) => this.deserializeUserMiscStruct(b, o));
  }

  /**
   * Save an account at its slot. An existing record takes ONLY the fields the
   * caller names (a User field that is undefined is not named); a slot with no
   * account yet gets a whole new record from `user`, express.e's new-account
   * values for everything it does not carry.
   *
   * A caller holding a whole account passes the fields it changed, not the
   * account: see load-account changedRecordFields.
   */
  public updateUserDataFile(user: Partial<User>, slotNumber: number): void {
    // Slot 1 is the first record. A slot of 0 computed offset -232, and
    // fs.writeSync with a negative position writes at the CURRENT position
    // - byte 0 - so every caller that forgot the slot serialized its user
    // over slot 1's record (the -TCB!- account, 2026-08-31). Loud refusal.
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
      throw new Error(`updateUserDataFile: invalid slot ${slotNumber} for ${user.username}`);
    }
    try {
      this.ensureUserFilesReady();
      if (!this.recordExists(slotNumber)) {
        this.writeNewRecord(user as User, slotNumber);
        return;
      }
      const patch = this.userFieldsToPatch(user, slotNumber, this.readRecordStructs(slotNumber));
      this.patchUserRecord(slotNumber, patch);
console.log(`[UserFileManager] Updated user files for ${user.username ?? `slot ${slotNumber}`} (slot ${slotNumber})`);
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
   * The three records at a slot, byte for byte: user.data, user.keys and
   * user.misc as express.e's loadAccount reads them (7984-8010). A record
   * past the end of its file comes back zero-filled, as loadAccount's short
   * read leaves its buffer.
   */
  public readSlotRecords(slotNumber: number): { user: Buffer; keys: Buffer; misc: Buffer } {
    if (!Number.isInteger(slotNumber) || slotNumber < 1) {
      throw new Error(`readSlotRecords: invalid slot ${slotNumber}`);
    }
    const read = (filePath: string, size: number): Buffer => {
      const out = Buffer.alloc(size);
      if (!fs.existsSync(filePath)) return out;
      const fd = fs.openSync(filePath, 'r');
      try {
        const got = fs.readSync(fd, out, 0, size, (slotNumber - 1) * size);
        if (got < size) out.fill(0, got);
      } finally {
        fs.closeSync(fd);
      }
      return out;
    };
    return {
      user: read(this.userDataPath, this.USER_STRUCT_SIZE),
      keys: read(this.userKeysPath, this.USERKEYS_STRUCT_SIZE),
      misc: read(this.userMiscPath, this.USERMISC_STRUCT_SIZE),
    };
  }

  /**
   * MOVE an account's records to another slot: the bytes go down whole (no
   * field is re-encoded, so nothing the serializer does not know survives
   * untouched), and only the two fields that name the position are changed -
   * the record's slotNumber (user.data) and the keys record's number - as
   * express.e's saveAccount writes them for a record at that slot (8040-8075).
   * A deleted record keeps both at 0 (express.e:21365), wherever it lands.
   */
  public moveRecordsToSlot(
    records: { user: Buffer; keys: Buffer; misc: Buffer },
    toSlot: number,
  ): void {
    if (!Number.isInteger(toSlot) || toSlot < 1) {
      throw new Error(`moveRecordsToSlot: invalid slot ${toSlot}`);
    }
    const layout = this.recordLayout();
    const user = Buffer.from(records.user);
    const keys = Buffer.from(records.keys);
    if (user.readInt16BE(layout.slotNumberOffset) !== 0) user.writeInt16BE(toSlot, layout.slotNumberOffset);
    if (keys.readInt32BE(layout.keysNumberOffset) !== 0) keys.writeInt32BE(toSlot, layout.keysNumberOffset);
    this.updateFileAtOffset(this.userDataPath, user, (toSlot - 1) * this.USER_STRUCT_SIZE);
    this.updateFileAtOffset(this.userKeysPath, keys, (toSlot - 1) * this.USERKEYS_STRUCT_SIZE);
    this.updateFileAtOffset(this.userMiscPath, Buffer.from(records.misc), (toSlot - 1) * this.USERMISC_STRUCT_SIZE);
  }

  /** The three files, for a tool that must back them up before it writes. */
  public userFilePaths(): { data: string; keys: string; misc: string } {
    return { data: this.userDataPath, keys: this.userKeysPath, misc: this.userMiscPath };
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

/**
 * UserStructures - Amiga user data structures for shared memory
 *
 * These structures match the Amiga E definitions in axobjects.e
 * and are used to share user data with 68K doors via direct memory access.
 *
 * Based on: AmiExpress-Sources/axobjects.e
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';

// Use any type for user data since Amiga user structure has many fields
// that may not exist in the database User type
type AmigaUserData = any;

/**
 * User structure - main user data (68 bytes of core data + arrays)
 * Corresponds to axobjects.e lines 11-68
 *
 * Structure layout:
 * +0x00: name[31] (31 bytes)
 * +0x1F: pass[9] (9 bytes) - legacy, not used
 * +0x28: location[30] (30 bytes)
 * +0x46: phoneNumber[13] (13 bytes)
 * +0x53: [1 byte pad to align slotNumber (INT) to even address]
 * +0x54: slotNumber (INT = 2 bytes)
 * +0x56: secStatus (INT = 2 bytes)
 * +0x58: secBoard (INT = 2 bytes)
 * +0x5A: secLibrary (INT = 2 bytes)
 * +0x5C: secBulletin (INT = 2 bytes)
 * +0x5E: messagesPosted (INT = 2 bytes)
 * +0x60: newSinceDate (LONG = 4 bytes)
 * +0x64: pwdHash (LONG = 4 bytes) - legacy
 * +0x68: confRead2 (LONG = 4 bytes) - not used
 * +0x6C: confRead3 (LONG = 4 bytes) - not used
 * +0x70: zoomType (INT = 2 bytes)
 * +0x72: unknown (INT = 2 bytes)
 * +0x74: unknown2 (INT = 2 bytes)
 * +0x76: unknown3 (INT = 2 bytes)
 * +0x78: xferProtocol (INT = 2 bytes)
 * +0x7A: filler2 (INT = 2 bytes)
 * +0x7C: lcFiles (INT = 2 bytes)
 * +0x7E: badFiles (INT = 2 bytes)
 * +0x80: accountDate (LONG = 4 bytes)
 * +0x84: screenType (INT = 2 bytes)
 * +0x86: editorType (INT = 2 bytes)
 * +0x88: conferenceAccess[10] (10 bytes)
 * +0x92: uploads (INT = 2 bytes)
 * +0x94: downloads (INT = 2 bytes)
 * +0x96: confRJoin (INT = 2 bytes)
 * +0x98: timesCalled (INT = 2 bytes)
 * +0x9A: timeLastOn (LONG = 4 bytes)
 * +0x9E: timeUsed (LONG = 4 bytes)
 * +0xA2: timeLimit (LONG = 4 bytes)
 * +0xA6: timeTotal (LONG = 4 bytes)
 * +0xAA: bytesDownload (LONG = 4 bytes)
 * +0xAE: bytesUpload (LONG = 4 bytes)
 * +0xB2: dailyBytesLimit (LONG = 4 bytes)
 * +0xB6: dailyBytesDld (LONG = 4 bytes)
 * +0xBA: expert (CHAR = 1 byte)
 * +0xBB: [1 byte pad to align chatRemain (LONG) to even address]
 * +0xBC: chatRemain (LONG = 4 bytes)
 * +0xC0: chatLimit (LONG = 4 bytes)
 * +0xC4: creditDays (LONG = 4 bytes)
 * +0xC8: creditAmount (LONG = 4 bytes)
 * +0xCC: creditStartDate (LONG = 4 bytes)
 * +0xD0: creditTotalToDate (LONG = 4 bytes)
 * +0xD4: creditTotalDate (LONG = 4 bytes)
 * +0xD8: creditTracking (CHAR = 1 byte)
 * +0xD9: translatorID (CHAR = 1 byte)
 * +0xDA: msgBaseRJoin (INT = 2 bytes)
 * +0xDC: confYM9 (LONG = 4 bytes)
 * +0xE0: todaysBytesLimit (LONG = 4 bytes)
 * +0xE4: protocol (CHAR = 1 byte)
 * +0xE5: uucpa (CHAR = 1 byte)
 * +0xE6: lineLength (CHAR = 1 byte)
 * +0xE7: newUser (CHAR = 1 byte)
 * TOTAL SIZE: 232 bytes (0xE8)
 */
export class UserStructure {
  static readonly SIZE = 232; // 0xE8 bytes

  /**
   * Write user structure to emulator memory
   */
  static writeToMemory(emulator: MoiraEmulator, addr: number, user: AmigaUserData): void {
console.log(`[UserStructure] Writing user structure at 0x${addr.toString(16)}`);

    // +0x00: name[31] - null-terminated string
    this.writeString(emulator, addr + 0x00, user.username || '', 31);

    // +0x1F: pass[9] - legacy field, write zeros
    for (let i = 0; i < 9; i++) {
      emulator.writeMemory(addr + 0x1F + i, 0);
    }

    // +0x28: location[30] - null-terminated string
    this.writeString(emulator, addr + 0x28, user.location || '', 30);

    // +0x46: phoneNumber[13] - null-terminated string
    this.writeString(emulator, addr + 0x46, user.phoneNumber || '', 13);

    // +0x53: 1 byte pad to align slotNumber (INT) to even address
    emulator.writeMemory(addr + 0x53, 0);

    // +0x54: slotNumber (INT)
    emulator.writeMemory16(addr + 0x54, user.slotNumber || 0);

    // +0x56: secStatus (INT) - security level
    emulator.writeMemory16(addr + 0x56, user.securityLevel || 0);

    // +0x58: secBoard (INT) - file/byte ratio
    emulator.writeMemory16(addr + 0x58, user.secBoard || 0);

    // +0x5A: secLibrary (INT) - ratio
    emulator.writeMemory16(addr + 0x5A, user.secLibrary || 0);

    // +0x5C: secBulletin (INT) - computer type
    emulator.writeMemory16(addr + 0x5C, user.secBulletin || 0);

    // +0x5E: messagesPosted (INT)
    emulator.writeMemory16(addr + 0x5E, user.messagesPosted || 0);

    // +0x60: newSinceDate (LONG) - timestamp
    emulator.writeMemory32(addr + 0x60, user.newSinceDate || 0);

    // +0x64: pwdHash (LONG) - legacy, write 0
    emulator.writeMemory32(addr + 0x64, 0);

    // +0x68: confRead2 (LONG) - not used
    emulator.writeMemory32(addr + 0x68, 0);

    // +0x6C: confRead3 (LONG) - not used
    emulator.writeMemory32(addr + 0x6C, 0);

    // +0x70: zoomType (INT)
    emulator.writeMemory16(addr + 0x70, user.zoomType || 0);

    // +0x72-0x76: unknown fields
    emulator.writeMemory16(addr + 0x72, 0);
    emulator.writeMemory16(addr + 0x74, 0);
    emulator.writeMemory16(addr + 0x76, 0);

    // +0x78: xferProtocol (INT)
    emulator.writeMemory16(addr + 0x78, user.xferProtocol || 0);

    // +0x7A: filler2 (INT)
    emulator.writeMemory16(addr + 0x7A, 0);

    // +0x7C: lcFiles (INT)
    emulator.writeMemory16(addr + 0x7C, 0);

    // +0x7E: badFiles (INT)
    emulator.writeMemory16(addr + 0x7E, 0);

    // +0x80: accountDate (LONG) - timestamp
    const accountDate = user.createdAt ? Math.floor(new Date(user.createdAt).getTime() / 1000) : 0;
    emulator.writeMemory32(addr + 0x80, accountDate);

    // +0x84: screenType (INT)
    emulator.writeMemory16(addr + 0x84, user.screenType || 0);

    // +0x86: editorType (INT)
    emulator.writeMemory16(addr + 0x86, user.editorType || 0);

    // +0x88: conferenceAccess[10]
    const confAccess = user.conferenceAccess || '';
    for (let i = 0; i < 10; i++) {
      emulator.writeMemory(addr + 0x88 + i, i < confAccess.length ? confAccess.charCodeAt(i) : 0);
    }

    // +0x92: uploads (INT)
    emulator.writeMemory16(addr + 0x92, user.uploads || 0);

    // +0x94: downloads (INT)
    emulator.writeMemory16(addr + 0x94, user.downloads || 0);

    // +0x96: confRJoin (INT) - last conference rejoined
    emulator.writeMemory16(addr + 0x96, user.confRJoin || 0);

    // +0x98: timesCalled (INT)
    emulator.writeMemory16(addr + 0x98, user.timesCalled || 0);

    // +0x9A: timeLastOn (LONG) - timestamp
    const timeLastOn = user.lastLoginAt ? Math.floor(new Date(user.lastLoginAt).getTime() / 1000) : 0;
    emulator.writeMemory32(addr + 0x9A, timeLastOn);

    // +0x9E: timeUsed (LONG) - seconds used this session
    emulator.writeMemory32(addr + 0x9E, user.timeUsed || 0);

    // +0xA2: timeLimit (LONG) - time limit in seconds
    emulator.writeMemory32(addr + 0xA2, user.timeLimit || 3600);

    // +0xA6: timeTotal (LONG) - total time remaining
    emulator.writeMemory32(addr + 0xA6, user.timeTotal || 3600);

    // +0xAA: bytesDownload (LONG)
    emulator.writeMemory32(addr + 0xAA, user.bytesDownload || 0);

    // +0xAE: bytesUpload (LONG)
    emulator.writeMemory32(addr + 0xAE, user.bytesUpload || 0);

    // +0xB2: dailyBytesLimit (LONG)
    emulator.writeMemory32(addr + 0xB2, user.dailyBytesLimit || 0);

    // +0xB6: dailyBytesDld (LONG) - daily bytes downloaded
    emulator.writeMemory32(addr + 0xB6, user.dailyBytesDld || 0);

    // +0xBA: expert (CHAR) - expert mode flag ("X" = expert)
    emulator.writeMemory(addr + 0xBA, user.expert === 'X' ? 1 : 0);

    // +0xBB: 1 byte pad to align chatRemain (LONG) to even address
    emulator.writeMemory(addr + 0xBB, 0);

    // +0xBC: chatRemain (LONG) - chat time remaining
    emulator.writeMemory32(addr + 0xBC, user.chatRemain || 0);

    // +0xC0: chatLimit (LONG) - chat time limit
    emulator.writeMemory32(addr + 0xC0, user.chatLimit || 0);

    // +0xC4-0xD7: credit fields (not used in web version)
    emulator.writeMemory32(addr + 0xC4, 0); // creditDays
    emulator.writeMemory32(addr + 0xC8, 0); // creditAmount
    emulator.writeMemory32(addr + 0xCC, 0); // creditStartDate
    emulator.writeMemory32(addr + 0xD0, 0); // creditTotalToDate
    emulator.writeMemory32(addr + 0xD4, 0); // creditTotalDate
    emulator.writeMemory(addr + 0xD8, 0);   // creditTracking

    // +0xD9: translatorID (CHAR)
    emulator.writeMemory(addr + 0xD9, user.translatorID || 0);

    // +0xDA: msgBaseRJoin (INT)
    emulator.writeMemory16(addr + 0xDA, user.msgBaseRJoin || 0);

    // +0xDC: confYM9 (LONG) - not used
    emulator.writeMemory32(addr + 0xDC, 0);

    // +0xE0: todaysBytesLimit (LONG)
    emulator.writeMemory32(addr + 0xE0, user.dailyBytesLimit || 0);

    // +0xE4: protocol (CHAR)
    emulator.writeMemory(addr + 0xE4, user.protocol || 0);

    // +0xE5: uucpa (CHAR)
    emulator.writeMemory(addr + 0xE5, user.uucpa || 0);

    // +0xE6: lineLength (CHAR)
    emulator.writeMemory(addr + 0xE6, user.lineLength || 80);

    // +0xE7: newUser (CHAR)
    emulator.writeMemory(addr + 0xE7, user.newUser ? 1 : 0);

console.log(`[UserStructure] Wrote user "${user.username}" to 0x${addr.toString(16)}`);
  }

  /**
   * Read user structure from emulator memory
   */
  static readFromMemory(emulator: MoiraEmulator, addr: number): Partial<AmigaUserData> {
    const user: Partial<AmigaUserData> = {};

    user.username = this.readString(emulator, addr + 0x00, 31);
    user.location = this.readString(emulator, addr + 0x28, 30);
    user.phoneNumber = this.readString(emulator, addr + 0x46, 13);
    // +0x53: pad byte (skipped)
    user.slotNumber = emulator.readMemory16(addr + 0x54);
    user.securityLevel = emulator.readMemory16(addr + 0x56);
    user.secBoard = emulator.readMemory16(addr + 0x58);
    user.secLibrary = emulator.readMemory16(addr + 0x5A);
    user.secBulletin = emulator.readMemory16(addr + 0x5C);
    user.messagesPosted = emulator.readMemory16(addr + 0x5E);
    user.newSinceDate = emulator.readMemory32(addr + 0x60);
    user.zoomType = emulator.readMemory16(addr + 0x70);
    user.xferProtocol = emulator.readMemory16(addr + 0x78);
    user.screenType = emulator.readMemory16(addr + 0x84);
    user.editorType = emulator.readMemory16(addr + 0x86);
    user.uploads = emulator.readMemory16(addr + 0x92);
    user.downloads = emulator.readMemory16(addr + 0x94);
    user.confRJoin = emulator.readMemory16(addr + 0x96);
    user.timesCalled = emulator.readMemory16(addr + 0x98);
    user.timeUsed = emulator.readMemory32(addr + 0x9E);
    user.timeLimit = emulator.readMemory32(addr + 0xA2);
    user.timeTotal = emulator.readMemory32(addr + 0xA6);
    user.bytesDownload = emulator.readMemory32(addr + 0xAA);
    user.bytesUpload = emulator.readMemory32(addr + 0xAE);
    user.dailyBytesLimit = emulator.readMemory32(addr + 0xB2);
    user.dailyBytesDld = emulator.readMemory32(addr + 0xB6);
    user.expert = emulator.readMemory(addr + 0xBA) !== 0 ? 'X' : 'N';
    // +0xBB: pad byte (skipped)
    user.chatRemain = emulator.readMemory32(addr + 0xBC);
    user.chatLimit = emulator.readMemory32(addr + 0xC0);
    user.translatorID = emulator.readMemory(addr + 0xD9);
    user.msgBaseRJoin = emulator.readMemory16(addr + 0xDA);
    user.protocol = emulator.readMemory(addr + 0xE4);
    user.uucpa = emulator.readMemory(addr + 0xE5);
    user.lineLength = emulator.readMemory(addr + 0xE6);
    user.newUser = emulator.readMemory(addr + 0xE7) !== 0;

    // Read conferenceAccess
    let confAccess = '';
    for (let i = 0; i < 10; i++) {
      const byte = emulator.readMemory(addr + 0x88 + i);
      if (byte === 0) break;
      confAccess += String.fromCharCode(byte);
    }
    user.conferenceAccess = confAccess;

    return user;
  }

  private static writeString(emulator: MoiraEmulator, addr: number, str: string, maxLen: number): void {
    const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
    for (let i = 0; i < maxLen; i++) {
      emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
    }
  }

  private static readString(emulator: MoiraEmulator, addr: number, maxLen: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
}

/**
 * UserKeys structure - user keys data
 * Corresponds to axobjects.e lines 70-81
 *
 * +0x00: userName[31] (31 bytes)
 * +0x1F: number (LONG = 4 bytes)
 * +0x23: newUser (CHAR = 1 byte)
 * +0x24: oldUpCPS (INT = 2 bytes)
 * +0x26: oldDnCPS (INT = 2 bytes)
 * +0x28: userFlags (INT = 2 bytes)
 * +0x2A: baud (INT = 2 bytes)
 * +0x2C: upCPS2 (LONG = 4 bytes)
 * +0x30: dnCPS2 (LONG = 4 bytes)
 * +0x34: timesOnToday (INT = 2 bytes)
 * TOTAL SIZE: 54 bytes (0x36)
 */
export class UserKeysStructure {
  static readonly SIZE = 54; // 0x36 bytes

  static writeToMemory(emulator: MoiraEmulator, addr: number, user: AmigaUserData): void {
console.log(`[UserKeysStructure] Writing userKeys at 0x${addr.toString(16)}`);

    // +0x00: userName[31]
    this.writeString(emulator, addr + 0x00, user.username || '', 31);

    // +0x1F: number (LONG) - user number/ID
    emulator.writeMemory32(addr + 0x1F, user.id || 0);

    // +0x23: newUser (CHAR)
    emulator.writeMemory(addr + 0x23, user.newUser ? 1 : 0);

    // +0x24: oldUpCPS (INT) - legacy, max 64k
    const oldUpCPS = Math.min(user.upCPS || 0, 65535);
    emulator.writeMemory16(addr + 0x24, oldUpCPS);

    // +0x26: oldDnCPS (INT) - legacy, max 64k
    const oldDnCPS = Math.min(user.dnCPS || 0, 65535);
    emulator.writeMemory16(addr + 0x26, oldDnCPS);

    // +0x28: userFlags (INT)
    emulator.writeMemory16(addr + 0x28, user.userFlags || 0);

    // +0x2A: baud (INT) - last online baud rate
    emulator.writeMemory16(addr + 0x2A, user.baud || 57600);

    // +0x2C: upCPS2 (LONG) - new high upload cps >64k
    emulator.writeMemory32(addr + 0x2C, user.upCPS || 0);

    // +0x30: dnCPS2 (LONG) - new high download cps >64k
    emulator.writeMemory32(addr + 0x30, user.dnCPS || 0);

    // +0x34: timesOnToday (INT)
    emulator.writeMemory16(addr + 0x34, user.timesOnToday || 0);

console.log(`[UserKeysStructure] Wrote userKeys for "${user.username}"`);
  }

  static readFromMemory(emulator: MoiraEmulator, addr: number): Partial<AmigaUserData> {
    const user: Partial<AmigaUserData> = {};

    user.username = this.readString(emulator, addr + 0x00, 31);
    user.id = emulator.readMemory32(addr + 0x1F);
    user.newUser = emulator.readMemory(addr + 0x23) !== 0;
    user.userFlags = emulator.readMemory16(addr + 0x28);
    user.baud = emulator.readMemory16(addr + 0x2A);
    user.upCPS = emulator.readMemory32(addr + 0x2C);
    user.dnCPS = emulator.readMemory32(addr + 0x30);
    user.timesOnToday = emulator.readMemory16(addr + 0x34);

    return user;
  }

  private static writeString(emulator: MoiraEmulator, addr: number, str: string, maxLen: number): void {
    const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
    for (let i = 0; i < maxLen; i++) {
      emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
    }
  }

  private static readString(emulator: MoiraEmulator, addr: number, maxLen: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
}

/**
 * UserMisc structure - miscellaneous user data
 * Corresponds to axobjects.e lines 83-100
 *
 * +0x00: internetName[10] (10 bytes)
 * +0x0A: realName[26] (26 bytes)
 * +0x24: downloadBytesBCD[8] (8 bytes)
 * +0x2C: uploadBytesBCD[8] (8 bytes)
 * +0x34: eMail[50] (50 bytes)
 * +0x66: lastDlCPS (LONG = 4 bytes)
 * +0x6A: pwdHash[32] (32 bytes)
 * +0x8A: salt[8] (8 bytes)
 * +0x92: pwdType (CHAR = 1 byte)
 * +0x93: forcePwdReset (CHAR = 1 byte)
 * +0x94: accountLocked (CHAR = 1 byte)
 * +0x95: invalidAttempts (CHAR = 1 byte)
 * +0x96: pwdLastUpdated (LONG = 4 bytes)
 * +0x9A: lastIP (LONG = 4 bytes)
 * +0x9E: ipMask (LONG = 4 bytes)
 * +0xA2: unused[86] (86 bytes)
 * TOTAL SIZE: 248 bytes (0xF8)
 */
export class UserMiscStructure {
  static readonly SIZE = 248; // 0xF8 bytes

  static writeToMemory(emulator: MoiraEmulator, addr: number, user: AmigaUserData): void {
console.log(`[UserMiscStructure] Writing userMisc at 0x${addr.toString(16)}`);

    // +0x00: internetName[10] - legacy
    this.writeString(emulator, addr + 0x00, '', 10);

    // +0x0A: realName[26]
    this.writeString(emulator, addr + 0x0A, user.realName || '', 26);

    // +0x24: downloadBytesBCD[8] - BCD format (not used in web version)
    for (let i = 0; i < 8; i++) {
      emulator.writeMemory(addr + 0x24 + i, 0);
    }

    // +0x2C: uploadBytesBCD[8] - BCD format (not used in web version)
    for (let i = 0; i < 8; i++) {
      emulator.writeMemory(addr + 0x2C + i, 0);
    }

    // +0x34: eMail[50]
    this.writeString(emulator, addr + 0x34, user.email || '', 50);

    // +0x66: lastDlCPS (LONG)
    emulator.writeMemory32(addr + 0x66, user.lastDlCPS || 0);

    // +0x6A: pwdHash[32] - write zeros (password not shared with doors)
    for (let i = 0; i < 32; i++) {
      emulator.writeMemory(addr + 0x6A + i, 0);
    }

    // +0x8A: salt[8] - write zeros
    for (let i = 0; i < 8; i++) {
      emulator.writeMemory(addr + 0x8A + i, 0);
    }

    // +0x92: pwdType (CHAR)
    emulator.writeMemory(addr + 0x92, 0);

    // +0x93: forcePwdReset (CHAR)
    emulator.writeMemory(addr + 0x93, user.forcePwdReset ? 1 : 0);

    // +0x94: accountLocked (CHAR)
    emulator.writeMemory(addr + 0x94, user.accountLocked ? 1 : 0);

    // +0x95: invalidAttempts (CHAR)
    emulator.writeMemory(addr + 0x95, user.invalidAttempts || 0);

    // +0x96: pwdLastUpdated (LONG) - timestamp
    const pwdLastUpdated = user.pwdLastUpdated ? Math.floor(new Date(user.pwdLastUpdated).getTime() / 1000) : 0;
    emulator.writeMemory32(addr + 0x96, pwdLastUpdated);

    // +0x9A: lastIP (LONG) - IP as 32-bit integer
    emulator.writeMemory32(addr + 0x9A, user.lastIP || 0);

    // +0x9E: ipMask (LONG)
    emulator.writeMemory32(addr + 0x9E, user.ipMask || 0);

    // +0xA2: unused[86] - zero out
    for (let i = 0; i < 86; i++) {
      emulator.writeMemory(addr + 0xA2 + i, 0);
    }

console.log(`[UserMiscStructure] Wrote userMisc for "${user.username}"`);
  }

  static readFromMemory(emulator: MoiraEmulator, addr: number): Partial<AmigaUserData> {
    const user: Partial<AmigaUserData> = {};

    user.realName = this.readString(emulator, addr + 0x0A, 26);
    user.email = this.readString(emulator, addr + 0x34, 50);
    user.lastDlCPS = emulator.readMemory32(addr + 0x66);
    user.forcePwdReset = emulator.readMemory(addr + 0x93) !== 0;
    user.accountLocked = emulator.readMemory(addr + 0x94) !== 0;
    user.invalidAttempts = emulator.readMemory(addr + 0x95);
    user.lastIP = emulator.readMemory32(addr + 0x9A);
    user.ipMask = emulator.readMemory32(addr + 0x9E);

    return user;
  }

  private static writeString(emulator: MoiraEmulator, addr: number, str: string, maxLen: number): void {
    const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
    for (let i = 0; i < maxLen; i++) {
      emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
    }
  }

  private static readString(emulator: MoiraEmulator, addr: number, maxLen: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }
}

/**
 * Shared User Data Manager
 * Manages the three user structures in shared memory
 */
export class SharedUserData {
  private userAddr: number = 0;
  private userKeysAddr: number = 0;
  private userMiscAddr: number = 0;

  constructor(
    private emulator: MoiraEmulator,
    private baseAddr: number = 0xF00000 // Start of shared data region
  ) {
    // Allocate memory for all three structures
    this.userAddr = baseAddr;
    this.userKeysAddr = baseAddr + UserStructure.SIZE;
    this.userMiscAddr = baseAddr + UserStructure.SIZE + UserKeysStructure.SIZE;

console.log('[SharedUserData] Allocated shared memory:');
console.log(`  loggedOnUser:     0x${this.userAddr.toString(16)} (${UserStructure.SIZE} bytes)`);
console.log(`  loggedOnUserKeys: 0x${this.userKeysAddr.toString(16)} (${UserKeysStructure.SIZE} bytes)`);
console.log(`  loggedOnUserMisc: 0x${this.userMiscAddr.toString(16)} (${UserMiscStructure.SIZE} bytes)`);
  }

  /**
   * Write all user data structures to shared memory
   */
  writeUserData(user: AmigaUserData): void {
    UserStructure.writeToMemory(this.emulator, this.userAddr, user);
    UserKeysStructure.writeToMemory(this.emulator, this.userKeysAddr, user);
    UserMiscStructure.writeToMemory(this.emulator, this.userMiscAddr, user);
  }

  /**
   * Read all user data structures from shared memory and merge changes
   */
  readUserData(): Partial<AmigaUserData> {
    const userData = UserStructure.readFromMemory(this.emulator, this.userAddr);
    const userKeys = UserKeysStructure.readFromMemory(this.emulator, this.userKeysAddr);
    const userMisc = UserMiscStructure.readFromMemory(this.emulator, this.userMiscAddr);

    return { ...userData, ...userKeys, ...userMisc };
  }

  /**
   * Get address of loggedOnUser structure
   */
  getUserAddr(): number {
    return this.userAddr;
  }

  /**
   * Get address of loggedOnUserKeys structure
   */
  getUserKeysAddr(): number {
    return this.userKeysAddr;
  }

  /**
   * Get address of loggedOnUserMisc structure
   */
  getUserMiscAddr(): number {
    return this.userMiscAddr;
  }

  /**
   * Clear all user data structures (on logoff)
   */
  clearUserData(): void {
console.log('[SharedUserData] Clearing user data structures');

    // Zero out all three structures
    for (let i = 0; i < UserStructure.SIZE; i++) {
      this.emulator.writeMemory(this.userAddr + i, 0);
    }
    for (let i = 0; i < UserKeysStructure.SIZE; i++) {
      this.emulator.writeMemory(this.userKeysAddr + i, 0);
    }
    for (let i = 0; i < UserMiscStructure.SIZE; i++) {
      this.emulator.writeMemory(this.userMiscAddr + i, 0);
    }
  }
}

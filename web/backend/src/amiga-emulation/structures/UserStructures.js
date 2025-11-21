"use strict";
/**
 * UserStructures - Amiga user data structures for shared memory
 *
 * These structures match the Amiga E definitions in axobjects.e
 * and are used to share user data with 68K doors via direct memory access.
 *
 * Based on: AmiExpress-Sources/axobjects.e
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.SharedUserData = exports.UserMiscStructure = exports.UserKeysStructure = exports.UserStructure = void 0;
/**
 * User structure - main user data (68 bytes of core data + arrays)
 * Corresponds to axobjects.e lines 11-68
 *
 * Structure layout:
 * +0x00: name[31] (31 bytes)
 * +0x1F: pass[9] (9 bytes) - legacy, not used
 * +0x28: location[30] (30 bytes)
 * +0x46: phoneNumber[13] (13 bytes)
 * +0x53: slotNumber (INT = 2 bytes)
 * +0x55: secStatus (INT = 2 bytes)
 * +0x57: secBoard (INT = 2 bytes)
 * +0x59: secLibrary (INT = 2 bytes)
 * +0x5B: secBulletin (INT = 2 bytes)
 * +0x5D: messagesPosted (INT = 2 bytes)
 * +0x5F: newSinceDate (LONG = 4 bytes)
 * +0x63: pwdHash (LONG = 4 bytes) - legacy
 * +0x67: confRead2 (LONG = 4 bytes) - not used
 * +0x6B: confRead3 (LONG = 4 bytes) - not used
 * +0x6F: zoomType (INT = 2 bytes)
 * +0x71: unknown (INT = 2 bytes)
 * +0x73: unknown2 (INT = 2 bytes)
 * +0x75: unknown3 (INT = 2 bytes)
 * +0x77: xferProtocol (INT = 2 bytes)
 * +0x79: filler2 (INT = 2 bytes)
 * +0x7B: lcFiles (INT = 2 bytes)
 * +0x7D: badFiles (INT = 2 bytes)
 * +0x7F: accountDate (LONG = 4 bytes)
 * +0x83: screenType (INT = 2 bytes)
 * +0x85: editorType (INT = 2 bytes)
 * +0x87: conferenceAccess[10] (10 bytes)
 * +0x91: uploads (INT = 2 bytes)
 * +0x93: downloads (INT = 2 bytes)
 * +0x95: confRJoin (INT = 2 bytes)
 * +0x97: timesCalled (INT = 2 bytes)
 * +0x99: timeLastOn (LONG = 4 bytes)
 * +0x9D: timeUsed (LONG = 4 bytes)
 * +0xA1: timeLimit (LONG = 4 bytes)
 * +0xA5: timeTotal (LONG = 4 bytes)
 * +0xA9: bytesDownload (LONG = 4 bytes)
 * +0xAD: bytesUpload (LONG = 4 bytes)
 * +0xB1: dailyBytesLimit (LONG = 4 bytes)
 * +0xB5: dailyBytesDld (LONG = 4 bytes)
 * +0xB9: expert (CHAR = 1 byte)
 * +0xBA: chatRemain (LONG = 4 bytes)
 * +0xBE: chatLimit (LONG = 4 bytes)
 * +0xC2: creditDays (LONG = 4 bytes)
 * +0xC6: creditAmount (LONG = 4 bytes)
 * +0xCA: creditStartDate (LONG = 4 bytes)
 * +0xCE: creditTotalToDate (LONG = 4 bytes)
 * +0xD2: creditTotalDate (LONG = 4 bytes)
 * +0xD6: creditTracking (CHAR = 1 byte)
 * +0xD7: translatorID (CHAR = 1 byte)
 * +0xD8: msgBaseRJoin (INT = 2 bytes)
 * +0xDA: confYM9 (LONG = 4 bytes)
 * +0xDE: todaysBytesLimit (LONG = 4 bytes)
 * +0xE2: protocol (CHAR = 1 byte)
 * +0xE3: uucpa (CHAR = 1 byte)
 * +0xE4: lineLength (CHAR = 1 byte)
 * +0xE5: newUser (CHAR = 1 byte)
 * TOTAL SIZE: 230 bytes (0xE6)
 */
class UserStructure {
    /**
     * Write user structure to emulator memory
     */
    static writeToMemory(emulator, addr, user) {
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
        // +0x53: slotNumber (INT)
        emulator.writeMemory16(addr + 0x53, user.slotNumber || 0);
        // +0x55: secStatus (INT) - security level
        emulator.writeMemory16(addr + 0x55, user.securityLevel || 0);
        // +0x57: secBoard (INT) - file/byte ratio
        emulator.writeMemory16(addr + 0x57, user.secBoard || 0);
        // +0x59: secLibrary (INT) - ratio
        emulator.writeMemory16(addr + 0x59, user.secLibrary || 0);
        // +0x5B: secBulletin (INT) - computer type
        emulator.writeMemory16(addr + 0x5B, user.secBulletin || 0);
        // +0x5D: messagesPosted (INT)
        emulator.writeMemory16(addr + 0x5D, user.messagesPosted || 0);
        // +0x5F: newSinceDate (LONG) - timestamp
        emulator.writeMemory32(addr + 0x5F, user.newSinceDate || 0);
        // +0x63: pwdHash (LONG) - legacy, write 0
        emulator.writeMemory32(addr + 0x63, 0);
        // +0x67: confRead2 (LONG) - not used
        emulator.writeMemory32(addr + 0x67, 0);
        // +0x6B: confRead3 (LONG) - not used
        emulator.writeMemory32(addr + 0x6B, 0);
        // +0x6F: zoomType (INT)
        emulator.writeMemory16(addr + 0x6F, user.zoomType || 0);
        // +0x71-0x75: unknown fields
        emulator.writeMemory16(addr + 0x71, 0);
        emulator.writeMemory16(addr + 0x73, 0);
        emulator.writeMemory16(addr + 0x75, 0);
        // +0x77: xferProtocol (INT)
        emulator.writeMemory16(addr + 0x77, user.xferProtocol || 0);
        // +0x79: filler2 (INT)
        emulator.writeMemory16(addr + 0x79, 0);
        // +0x7B: lcFiles (INT)
        emulator.writeMemory16(addr + 0x7B, 0);
        // +0x7D: badFiles (INT)
        emulator.writeMemory16(addr + 0x7D, 0);
        // +0x7F: accountDate (LONG) - timestamp
        const accountDate = user.createdAt ? Math.floor(new Date(user.createdAt).getTime() / 1000) : 0;
        emulator.writeMemory32(addr + 0x7F, accountDate);
        // +0x83: screenType (INT)
        emulator.writeMemory16(addr + 0x83, user.screenType || 0);
        // +0x85: editorType (INT)
        emulator.writeMemory16(addr + 0x85, user.editorType || 0);
        // +0x87: conferenceAccess[10]
        const confAccess = user.conferenceAccess || '';
        for (let i = 0; i < 10; i++) {
            emulator.writeMemory(addr + 0x87 + i, i < confAccess.length ? confAccess.charCodeAt(i) : 0);
        }
        // +0x91: uploads (INT)
        emulator.writeMemory16(addr + 0x91, user.uploads || 0);
        // +0x93: downloads (INT)
        emulator.writeMemory16(addr + 0x93, user.downloads || 0);
        // +0x95: confRJoin (INT) - last conference rejoined
        emulator.writeMemory16(addr + 0x95, user.confRJoin || 0);
        // +0x97: timesCalled (INT)
        emulator.writeMemory16(addr + 0x97, user.timesCalled || 0);
        // +0x99: timeLastOn (LONG) - timestamp
        const timeLastOn = user.lastLoginAt ? Math.floor(new Date(user.lastLoginAt).getTime() / 1000) : 0;
        emulator.writeMemory32(addr + 0x99, timeLastOn);
        // +0x9D: timeUsed (LONG) - seconds used this session
        emulator.writeMemory32(addr + 0x9D, user.timeUsed || 0);
        // +0xA1: timeLimit (LONG) - time limit in seconds
        emulator.writeMemory32(addr + 0xA1, user.timeLimit || 3600);
        // +0xA5: timeTotal (LONG) - total time remaining
        emulator.writeMemory32(addr + 0xA5, user.timeTotal || 3600);
        // +0xA9: bytesDownload (LONG)
        emulator.writeMemory32(addr + 0xA9, user.bytesDownload || 0);
        // +0xAD: bytesUpload (LONG)
        emulator.writeMemory32(addr + 0xAD, user.bytesUpload || 0);
        // +0xB1: dailyBytesLimit (LONG)
        emulator.writeMemory32(addr + 0xB1, user.dailyBytesLimit || 0);
        // +0xB5: dailyBytesDld (LONG) - daily bytes downloaded
        emulator.writeMemory32(addr + 0xB5, user.dailyBytesDld || 0);
        // +0xB9: expert (CHAR) - expert mode flag ("X" = expert)
        emulator.writeMemory(addr + 0xB9, user.expert === 'X' ? 1 : 0);
        // +0xBA: chatRemain (LONG) - chat time remaining
        emulator.writeMemory32(addr + 0xBA, user.chatRemain || 0);
        // +0xBE: chatLimit (LONG) - chat time limit
        emulator.writeMemory32(addr + 0xBE, user.chatLimit || 0);
        // +0xC2-0xD5: credit fields (not used in web version)
        emulator.writeMemory32(addr + 0xC2, 0); // creditDays
        emulator.writeMemory32(addr + 0xC6, 0); // creditAmount
        emulator.writeMemory32(addr + 0xCA, 0); // creditStartDate
        emulator.writeMemory32(addr + 0xCE, 0); // creditTotalToDate
        emulator.writeMemory32(addr + 0xD2, 0); // creditTotalDate
        emulator.writeMemory(addr + 0xD6, 0); // creditTracking
        // +0xD7: translatorID (CHAR)
        emulator.writeMemory(addr + 0xD7, user.translatorID || 0);
        // +0xD8: msgBaseRJoin (INT)
        emulator.writeMemory16(addr + 0xD8, user.msgBaseRJoin || 0);
        // +0xDA: confYM9 (LONG) - not used
        emulator.writeMemory32(addr + 0xDA, 0);
        // +0xDE: todaysBytesLimit (LONG)
        emulator.writeMemory32(addr + 0xDE, user.dailyBytesLimit || 0);
        // +0xE2: protocol (CHAR)
        emulator.writeMemory(addr + 0xE2, user.protocol || 0);
        // +0xE3: uucpa (CHAR)
        emulator.writeMemory(addr + 0xE3, user.uucpa || 0);
        // +0xE4: lineLength (CHAR)
        emulator.writeMemory(addr + 0xE4, user.lineLength || 80);
        // +0xE5: newUser (CHAR)
        emulator.writeMemory(addr + 0xE5, user.newUser ? 1 : 0);
        console.log(`[UserStructure] Wrote user "${user.username}" to 0x${addr.toString(16)}`);
    }
    /**
     * Read user structure from emulator memory
     */
    static readFromMemory(emulator, addr) {
        const user = {};
        user.username = this.readString(emulator, addr + 0x00, 31);
        user.location = this.readString(emulator, addr + 0x28, 30);
        user.phoneNumber = this.readString(emulator, addr + 0x46, 13);
        user.slotNumber = emulator.readMemory16(addr + 0x53);
        user.securityLevel = emulator.readMemory16(addr + 0x55);
        user.secBoard = emulator.readMemory16(addr + 0x57);
        user.secLibrary = emulator.readMemory16(addr + 0x59);
        user.secBulletin = emulator.readMemory16(addr + 0x5B);
        user.messagesPosted = emulator.readMemory16(addr + 0x5D);
        user.newSinceDate = emulator.readMemory32(addr + 0x5F);
        user.zoomType = emulator.readMemory16(addr + 0x6F);
        user.xferProtocol = emulator.readMemory16(addr + 0x77);
        user.screenType = emulator.readMemory16(addr + 0x83);
        user.editorType = emulator.readMemory16(addr + 0x85);
        user.uploads = emulator.readMemory16(addr + 0x91);
        user.downloads = emulator.readMemory16(addr + 0x93);
        user.confRJoin = emulator.readMemory16(addr + 0x95);
        user.timesCalled = emulator.readMemory16(addr + 0x97);
        user.timeUsed = emulator.readMemory32(addr + 0x9D);
        user.timeLimit = emulator.readMemory32(addr + 0xA1);
        user.timeTotal = emulator.readMemory32(addr + 0xA5);
        user.bytesDownload = emulator.readMemory32(addr + 0xA9);
        user.bytesUpload = emulator.readMemory32(addr + 0xAD);
        user.dailyBytesLimit = emulator.readMemory32(addr + 0xB1);
        user.dailyBytesDld = emulator.readMemory32(addr + 0xB5);
        user.expert = emulator.readMemory(addr + 0xB9) !== 0 ? 'X' : 'N';
        user.chatRemain = emulator.readMemory32(addr + 0xBA);
        user.chatLimit = emulator.readMemory32(addr + 0xBE);
        user.translatorID = emulator.readMemory(addr + 0xD7);
        user.msgBaseRJoin = emulator.readMemory16(addr + 0xD8);
        user.protocol = emulator.readMemory(addr + 0xE2);
        user.uucpa = emulator.readMemory(addr + 0xE3);
        user.lineLength = emulator.readMemory(addr + 0xE4);
        user.newUser = emulator.readMemory(addr + 0xE5) !== 0;
        // Read conferenceAccess
        let confAccess = '';
        for (let i = 0; i < 10; i++) {
            const byte = emulator.readMemory(addr + 0x87 + i);
            if (byte === 0)
                break;
            confAccess += String.fromCharCode(byte);
        }
        user.conferenceAccess = confAccess;
        return user;
    }
    static writeString(emulator, addr, str, maxLen) {
        const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
        for (let i = 0; i < maxLen; i++) {
            emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
        }
    }
    static readString(emulator, addr, maxLen) {
        const bytes = [];
        for (let i = 0; i < maxLen; i++) {
            const byte = emulator.readMemory(addr + i);
            if (byte === 0)
                break;
            bytes.push(byte);
        }
        return String.fromCharCode(...bytes);
    }
}
exports.UserStructure = UserStructure;
UserStructure.SIZE = 230; // 0xE6 bytes
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
class UserKeysStructure {
    static writeToMemory(emulator, addr, user) {
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
    static readFromMemory(emulator, addr) {
        const user = {};
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
    static writeString(emulator, addr, str, maxLen) {
        const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
        for (let i = 0; i < maxLen; i++) {
            emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
        }
    }
    static readString(emulator, addr, maxLen) {
        const bytes = [];
        for (let i = 0; i < maxLen; i++) {
            const byte = emulator.readMemory(addr + i);
            if (byte === 0)
                break;
            bytes.push(byte);
        }
        return String.fromCharCode(...bytes);
    }
}
exports.UserKeysStructure = UserKeysStructure;
UserKeysStructure.SIZE = 54; // 0x36 bytes
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
class UserMiscStructure {
    static writeToMemory(emulator, addr, user) {
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
    static readFromMemory(emulator, addr) {
        const user = {};
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
    static writeString(emulator, addr, str, maxLen) {
        const bytes = str.substring(0, maxLen - 1).split('').map(c => c.charCodeAt(0));
        for (let i = 0; i < maxLen; i++) {
            emulator.writeMemory(addr + i, i < bytes.length ? bytes[i] : 0);
        }
    }
    static readString(emulator, addr, maxLen) {
        const bytes = [];
        for (let i = 0; i < maxLen; i++) {
            const byte = emulator.readMemory(addr + i);
            if (byte === 0)
                break;
            bytes.push(byte);
        }
        return String.fromCharCode(...bytes);
    }
}
exports.UserMiscStructure = UserMiscStructure;
UserMiscStructure.SIZE = 248; // 0xF8 bytes
/**
 * Shared User Data Manager
 * Manages the three user structures in shared memory
 */
class SharedUserData {
    constructor(emulator, baseAddr = 0xF00000 // Start of shared data region
    ) {
        this.emulator = emulator;
        this.baseAddr = baseAddr;
        this.userAddr = 0;
        this.userKeysAddr = 0;
        this.userMiscAddr = 0;
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
    writeUserData(user) {
        UserStructure.writeToMemory(this.emulator, this.userAddr, user);
        UserKeysStructure.writeToMemory(this.emulator, this.userKeysAddr, user);
        UserMiscStructure.writeToMemory(this.emulator, this.userMiscAddr, user);
    }
    /**
     * Read all user data structures from shared memory and merge changes
     */
    readUserData() {
        const userData = UserStructure.readFromMemory(this.emulator, this.userAddr);
        const userKeys = UserKeysStructure.readFromMemory(this.emulator, this.userKeysAddr);
        const userMisc = UserMiscStructure.readFromMemory(this.emulator, this.userMiscAddr);
        return { ...userData, ...userKeys, ...userMisc };
    }
    /**
     * Get address of loggedOnUser structure
     */
    getUserAddr() {
        return this.userAddr;
    }
    /**
     * Get address of loggedOnUserKeys structure
     */
    getUserKeysAddr() {
        return this.userKeysAddr;
    }
    /**
     * Get address of loggedOnUserMisc structure
     */
    getUserMiscAddr() {
        return this.userMiscAddr;
    }
    /**
     * Clear all user data structures (on logoff)
     */
    clearUserData() {
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
exports.SharedUserData = SharedUserData;

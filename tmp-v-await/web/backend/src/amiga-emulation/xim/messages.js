"use strict";
/**
 * XIM Message Parsing and Validation
 *
 * Handles parsing of jhMessage structure from memory and validation.
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.XIMMessageParser = void 0;
const types_1 = require("./types");
class XIMMessageParser {
    constructor(emulator) {
        this.emulator = emulator;
    }
    /**
     * Parse XIM message from memory
     *
     * jhMessage structure from axcommon.e (express.e:543-557):
     * OBJECT jhMessage
     *   <mn_Node + mn_ReplyPort + mn_Length>  // 20 bytes (standard Message header)
     *   string[200]: ARRAY OF CHAR            // 200 bytes (offset 20-219)
     *   data: LONG                            // 4 bytes (offset 220-223)
     *   command: LONG                         // 4 bytes (offset 224-227)
     * ENDOBJECT
     *
     * CRITICAL: Command is at offset 224, NOT offset 20!
     * The string field comes FIRST after the message header.
     */
    parseMessage(msgAddr) {
        const replyPort = this.emulator.readMemory32(msgAddr + 14);
        const command = this.emulator.readMemory32(msgAddr + 224); // LONG at offset 224
        const data = this.emulator.readMemory32(msgAddr + 220); // LONG at offset 220
        const stringPtr = msgAddr + 20; // String starts at offset 20
        // Read the string (200 bytes starting at offset 20)
        const messageString = this.emulator.readString(stringPtr, 200);
        console.log('[XIMMessageParser] Parsed jhMessage:');
        console.log(`  Address: 0x${msgAddr.toString(16)}`);
        console.log(`  Reply Port: 0x${replyPort.toString(16)}`);
        console.log(`  Command: ${command} (${this.getCommandName(command)})`);
        console.log(`  Data: ${data} (0x${data.toString(16)})`);
        console.log(`  String: "${messageString}"`);
        return {
            msgAddr,
            command,
            data,
            replyPort,
            string: messageString,
        };
    }
    /**
     * Read null-terminated string from memory
     */
    readString(addr, maxLength = 200) {
        const bytes = [];
        for (let i = 0; i < maxLength; i++) {
            const byte = this.emulator.readMemory(addr + i);
            if (byte === 0)
                break;
            bytes.push(byte);
        }
        return String.fromCharCode(...bytes);
    }
    /**
     * Write null-terminated string to memory
     */
    writeString(addr, str, maxLength) {
        const bytes = [];
        for (let i = 0; i < Math.min(str.length, maxLength - 1); i++) {
            bytes.push(str.charCodeAt(i));
        }
        bytes.push(0); // Null terminator
        for (let i = 0; i < bytes.length; i++) {
            this.emulator.writeMemory(addr + i, bytes[i]);
        }
    }
    /**
     * Get human-readable command name
     */
    getCommandName(command) {
        const names = {
            [types_1.XIMCommand.JH_LI]: 'JH_LI (Line Input)',
            [types_1.XIMCommand.JH_REGISTER]: 'JH_REGISTER',
            [types_1.XIMCommand.JH_SHUTDOWN]: 'JH_SHUTDOWN',
            [types_1.XIMCommand.JH_WRITE]: 'JH_WRITE',
            [types_1.XIMCommand.JH_SM]: 'JH_SM (Send Message)',
            [types_1.XIMCommand.JH_PM]: 'JH_PM (Prompt Message)',
            [types_1.XIMCommand.JH_HK]: 'JH_HK (Hotkey)',
            [types_1.XIMCommand.JH_CO]: 'JH_CO (Console Output)',
            [types_1.XIMCommand.JH_SO]: 'JH_SO (Serial Output)',
            [types_1.XIMCommand.GETKEY]: 'GETKEY',
            // Data query commands (DT_*)
            [types_1.XIMCommand.DT_NAME]: 'DT_NAME',
            [types_1.XIMCommand.DT_PASSWORD]: 'DT_PASSWORD',
            [types_1.XIMCommand.DT_LOCATION]: 'DT_LOCATION',
            [types_1.XIMCommand.DT_PHONENUMBER]: 'DT_PHONENUMBER',
            [types_1.XIMCommand.DT_REALNAME]: 'DT_REALNAME',
            [types_1.XIMCommand.DT_SLOTNUMBER]: 'DT_SLOTNUMBER',
            [types_1.XIMCommand.DT_SECSTATUS]: 'DT_SECSTATUS',
            [types_1.XIMCommand.DT_SECBOARD]: 'DT_SECBOARD',
            [types_1.XIMCommand.DT_SECLIBRARY]: 'DT_SECLIBRARY',
            [types_1.XIMCommand.DT_SECBULLETIN]: 'DT_SECBULLETIN',
            [types_1.XIMCommand.DT_TIMELIMIT]: 'DT_TIMELIMIT',
            [types_1.XIMCommand.DT_LINELENGTH]: 'DT_LINELENGTH',
            [types_1.XIMCommand.DT_EXPERT]: 'DT_EXPERT',
            [types_1.XIMCommand.DT_MESSAGESPOSTED]: 'DT_MESSAGESPOSTED',
            [types_1.XIMCommand.DT_UPLOADS]: 'DT_UPLOADS',
            [types_1.XIMCommand.DT_DOWNLOADS]: 'DT_DOWNLOADS',
            [types_1.XIMCommand.DT_TIMESCALLED]: 'DT_TIMESCALLED',
            [types_1.XIMCommand.DT_TIMELASTON]: 'DT_TIMELASTON',
            [types_1.XIMCommand.DT_TIMEUSED]: 'DT_TIMEUSED',
            [types_1.XIMCommand.DT_TIMETOTAL]: 'DT_TIMETOTAL',
            [types_1.XIMCommand.DT_BYTESUPLOAD]: 'DT_BYTESUPLOAD',
            [types_1.XIMCommand.DT_BYTEDOWNLOAD]: 'DT_BYTEDOWNLOAD',
            [types_1.XIMCommand.DT_DAILYBYTELIMIT]: 'DT_DAILYBYTELIMIT',
            [types_1.XIMCommand.DT_DAILYBYTEDLD]: 'DT_DAILYBYTEDLD',
            [types_1.XIMCommand.ACTIVE_NODES]: 'ACTIVE_NODES',
            [types_1.XIMCommand.DT_DUMP]: 'DT_DUMP',
            [types_1.XIMCommand.DT_TIMEOUT]: 'DT_TIMEOUT',
            [types_1.XIMCommand.DT_STAMP_LASTON]: 'DT_STAMP_LASTON',
            [types_1.XIMCommand.DT_STAMP_CTIME]: 'DT_STAMP_CTIME',
            [types_1.XIMCommand.DT_CURR_TIME]: 'DT_CURR_TIME',
            [types_1.XIMCommand.DT_CONFACCESS]: 'DT_CONFACCESS',
            [types_1.XIMCommand.DT_LANGUAGE]: 'DT_LANGUAGE',
            [types_1.XIMCommand.DT_QUICKFLAG]: 'DT_QUICKFLAG',
            [types_1.XIMCommand.DT_GOODFILE]: 'DT_GOODFILE',
            [types_1.XIMCommand.DT_ANSICOLOR]: 'DT_ANSICOLOR',
            [types_1.XIMCommand.DT_ISANSI]: 'DT_ISANSI',
            [types_1.XIMCommand.DT_MSGCODE]: 'DT_MSGCODE',
            [types_1.XIMCommand.DT_FILECODE]: 'DT_FILECODE',
            [types_1.XIMCommand.DT_ADDBIT]: 'DT_ADDBIT',
            [types_1.XIMCommand.DT_REMBIT]: 'DT_REMBIT',
            [types_1.XIMCommand.DT_QUERYBIT]: 'DT_QUERYBIT',
            // BBS info commands
            [types_1.XIMCommand.DT_HOSTNAME]: 'DT_HOSTNAME',
            [types_1.XIMCommand.DT_HOSTIP]: 'DT_HOSTIP',
            // System commands
            [types_1.XIMCommand.EXPRESS_VERSION]: 'EXPRESS_VERSION',
        };
        return names[command] || `Unknown (${command})`;
    }
}
exports.XIMMessageParser = XIMMessageParser;

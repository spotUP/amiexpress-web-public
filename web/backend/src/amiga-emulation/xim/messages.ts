/**
 * XIM Message Parsing and Validation
 *
 * Handles parsing of jhMessage structure from memory and validation.
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMMessage, XIMCommand } from './types';

export class XIMMessageParser {
  private emulator: MoiraEmulator;

  constructor(emulator: MoiraEmulator) {
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
  parseMessage(msgAddr: number): XIMMessage {
    const replyPort = this.emulator.readMemory32(msgAddr + 14);
    const command = this.emulator.readMemory32(msgAddr + 224);  // LONG at offset 224
    const data = this.emulator.readMemory32(msgAddr + 220);     // LONG at offset 220
    const stringPtr = msgAddr + 20;  // String starts at offset 20

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
  readString(addr: number, maxLength: number = 200): string {
    const bytes: number[] = [];

    for (let i = 0; i < maxLength; i++) {
      const byte = this.emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }

    return String.fromCharCode(...bytes);
  }

  /**
   * Write null-terminated string to memory
   */
  writeString(addr: number, str: string, maxLength: number): void {
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
  getCommandName(command: number): string {
    const names: { [key: number]: string } = {
      [XIMCommand.JH_LI]: 'JH_LI (Line Input)',
      [XIMCommand.JH_REGISTER]: 'JH_REGISTER',
      [XIMCommand.JH_SHUTDOWN]: 'JH_SHUTDOWN',
      [XIMCommand.JH_WRITE]: 'JH_WRITE',
      [XIMCommand.JH_SM]: 'JH_SM (Send Message)',
      [XIMCommand.JH_PM]: 'JH_PM (Prompt Message)',
      [XIMCommand.JH_HK]: 'JH_HK (Hotkey)',
      [XIMCommand.JH_CO]: 'JH_CO (Console Output)',
      [XIMCommand.JH_SO]: 'JH_SO (Serial Output)',
      [XIMCommand.GETKEY]: 'GETKEY',

      // Data query commands (DT_*)
      [XIMCommand.DT_NAME]: 'DT_NAME',
      [XIMCommand.DT_PASSWORD]: 'DT_PASSWORD',
      [XIMCommand.DT_LOCATION]: 'DT_LOCATION',
      [XIMCommand.DT_PHONENUMBER]: 'DT_PHONENUMBER',
      [XIMCommand.DT_REALNAME]: 'DT_REALNAME',
      [XIMCommand.DT_SLOTNUMBER]: 'DT_SLOTNUMBER',
      [XIMCommand.DT_SECSTATUS]: 'DT_SECSTATUS',
      [XIMCommand.DT_SECBOARD]: 'DT_SECBOARD',
      [XIMCommand.DT_SECLIBRARY]: 'DT_SECLIBRARY',
      [XIMCommand.DT_SECBULLETIN]: 'DT_SECBULLETIN',
      [XIMCommand.DT_TIMELIMIT]: 'DT_TIMELIMIT',
      [XIMCommand.DT_LINELENGTH]: 'DT_LINELENGTH',
      [XIMCommand.DT_EXPERT]: 'DT_EXPERT',
      [XIMCommand.DT_MESSAGESPOSTED]: 'DT_MESSAGESPOSTED',
      [XIMCommand.DT_UPLOADS]: 'DT_UPLOADS',
      [XIMCommand.DT_DOWNLOADS]: 'DT_DOWNLOADS',
      [XIMCommand.DT_TIMESCALLED]: 'DT_TIMESCALLED',
      [XIMCommand.DT_TIMELASTON]: 'DT_TIMELASTON',
      [XIMCommand.DT_TIMEUSED]: 'DT_TIMEUSED',
      [XIMCommand.DT_TIMETOTAL]: 'DT_TIMETOTAL',
      [XIMCommand.DT_BYTESUPLOAD]: 'DT_BYTESUPLOAD',
      [XIMCommand.DT_BYTEDOWNLOAD]: 'DT_BYTEDOWNLOAD',
      [XIMCommand.DT_DAILYBYTELIMIT]: 'DT_DAILYBYTELIMIT',
      [XIMCommand.DT_DAILYBYTEDLD]: 'DT_DAILYBYTEDLD',
      [XIMCommand.ACTIVE_NODES]: 'ACTIVE_NODES',
      [XIMCommand.DT_DUMP]: 'DT_DUMP',
      [XIMCommand.DT_TIMEOUT]: 'DT_TIMEOUT',
      [XIMCommand.DT_STAMP_LASTON]: 'DT_STAMP_LASTON',
      [XIMCommand.DT_STAMP_CTIME]: 'DT_STAMP_CTIME',
      [XIMCommand.DT_CURR_TIME]: 'DT_CURR_TIME',
      [XIMCommand.DT_CONFACCESS]: 'DT_CONFACCESS',
      [XIMCommand.DT_LANGUAGE]: 'DT_LANGUAGE',
      [XIMCommand.DT_QUICKFLAG]: 'DT_QUICKFLAG',
      [XIMCommand.DT_GOODFILE]: 'DT_GOODFILE',
      [XIMCommand.DT_ANSICOLOR]: 'DT_ANSICOLOR',
      [XIMCommand.DT_ISANSI]: 'DT_ISANSI',
      [XIMCommand.DT_MSGCODE]: 'DT_MSGCODE',
      [XIMCommand.DT_FILECODE]: 'DT_FILECODE',
      [XIMCommand.DT_ADDBIT]: 'DT_ADDBIT',
      [XIMCommand.DT_REMBIT]: 'DT_REMBIT',
      [XIMCommand.DT_QUERYBIT]: 'DT_QUERYBIT',

      // BBS info commands
      [XIMCommand.DT_HOSTNAME]: 'DT_HOSTNAME',
      [XIMCommand.DT_HOSTIP]: 'DT_HOSTIP',

      // System commands
      [XIMCommand.EXPRESS_VERSION]: 'EXPRESS_VERSION',
    };

    return names[command] || `Unknown (${command})`;
  }
}

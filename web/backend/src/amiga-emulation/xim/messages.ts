/**
 * XIM Message Parsing and Validation
 *
 * Handles parsing of jhMessage structure from memory and validation.
 */

import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { DoorConstants } from "../DoorTypes";
import { XIMMessage, XIMCommand } from "./types";

export class XIMMessageParser {
  private emulator: MoiraEmulator;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Parse XIM message from memory
   *
   * Layout (see Docs/aedoor28/Assembler/Include/AMiX.i):
   *   0x00: mn_Node (Exec message header, 20 bytes incl. reply/length)
   *   0x14: string[200]
   *   0xDC: data (LONG)
   *   0xE0: command (LONG)
   *   0xE4: nodeID
   *   0xE8: lineNum
   *   0xEC: signal mask
   *   0xF0: task pointer
   *   0xF4: semaphore pointer (MultiCom)
   *   0xF8: filler1
   *   0xFC: filler2
   *   Size: 0x100 bytes
   */
  parseMessage(msgAddr: number): XIMMessage {
    const replyPort = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET
    );
    const command = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET
    );
    const data = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_DATA_OFFSET
    );
    const nodeId = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_NODE_OFFSET
    );
    const lineNumber = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_LINE_OFFSET
    );
    const signal = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_SIGNAL_OFFSET
    );
    const task = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_TASK_OFFSET
    );
    const semaphore = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_SEMAPHORE_OFFSET
    );
    const filler1 = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_FILLER1_OFFSET
    );
    const filler2 = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_FILLER2_OFFSET
    );
    const stringPtr = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_STRING_PTR_OFFSET
    );
    const filler3 = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_FILLER3_OFFSET
    );
    const stringAddr = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;

    // Read the string (200 bytes starting at offset 24)
    const messageString = this.emulator.readString(
      stringAddr,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );

    console.log("[XIMMessageParser] Parsed jhMessage:");
    console.log(`  Address: 0x${msgAddr.toString(16)}`);
    console.log(`  Reply Port: 0x${replyPort.toString(16)}`);
    console.log(`  Command: ${command} (${this.getCommandName(command)})`);
    console.log(`  Data: ${data} (0x${data.toString(16)})`);
    console.log(`  Node: ${nodeId}, Line: ${lineNumber}`);
    console.log(`  Signal: ${signal}, Task: 0x${task.toString(16)}`);
    console.log(`  Semi: 0x${semaphore.toString(16)}`);
    console.log(`  Filler1: 0x${filler1.toString(16)}, Filler2: 0x${filler2.toString(16)}`);
    console.log(`  StrPtr: 0x${stringPtr.toString(16)}, Filler3: 0x${filler3.toString(16)}`);
    console.log(`  String: "${messageString}"`);

    return {
      msgAddr,
      command,
      data,
      replyPort,
      stringAddr,
      nodeId,
      lineNumber,
      signal,
      task,
      semaphore,
      filler1,
      filler2,
      stringPtr,
      filler3,
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
   * Clear the embedded String buffer
   */
  clearString(addr: number): void {
    for (let i = 0; i < DoorConstants.MESSAGE_STRING_CAPACITY; i++) {
      this.emulator.writeMemory(addr + i, 0);
    }
  }

  /**
   * Write to the embedded message string (msg->String)
   */
  writeMessageString(msgAddr: number, value: string): void {
    this.writeString(
      msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      value,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
  }

  /**
   * Write reply data/result (msg->Data)
   */
  writeData(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
      value
    );
  }

  /**
   * Write Command (msg->Command)
   */
  writeCommand(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
      value
    );
  }

  /**
   * Write LineNum (msg->LineNum)
   */
  writeLineNumber(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_LINE_OFFSET,
      value
    );
  }

  /**
   * Write NodeID (msg->NodeID)
   */
  writeNodeId(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_NODE_OFFSET,
      value
    );
  }

  /**
   * Write semaphore/filler pointers
   */
  writeSemaphore(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_SEMAPHORE_OFFSET,
      value
    );
  }

  writeFiller1(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_FILLER1_OFFSET,
      value
    );
  }

  writeFiller2(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_FILLER2_OFFSET,
      value
    );
  }

  writeFiller3(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_FILLER3_OFFSET,
      value
    );
  }

  writeStringPointer(msgAddr: number, value: number): void {
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_STRING_PTR_OFFSET,
      value
    );
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
      [XIMCommand.JH_SG]: 'JH_SG (Show GFile)',
      [XIMCommand.JH_SF]: 'JH_SF (Show File)',
      [XIMCommand.DISPLAY_FILE]: 'JH_SF_NSF/DISPLAY_FILE',
      [XIMCommand.CHECK_TO_DISPLAY]: 'JH_SG_NSF/CHECK_TO_DISPLAY',
      [XIMCommand.JH_EF]: 'JH_EF (Edit File)',
      [XIMCommand.JH_FLAGFILE]: 'JH_FLAGFILE',
      [XIMCommand.JH_CO]: 'JH_CO (Console Output)',
      [XIMCommand.JH_SO]: 'JH_SO (Serial Output)',
      [XIMCommand.JH_MCI]: 'JH_MCI',
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
      [XIMCommand.BB_STATUS]: 'BB_STATUS',
      [XIMCommand.BB_CONFNAME]: 'BB_CONFNAME',
      [XIMCommand.BB_CONFLOCAL]: 'BB_CONFLOCAL',
      [XIMCommand.BB_LOCAL]: 'BB_LOCAL',
      [XIMCommand.BB_MAINLINE]: 'BB_MAINLINE',
      [XIMCommand.BB_NODEID]: 'BB_NODEID',
      [XIMCommand.BB_CONFNUM]: 'BB_CONFNUM',

      // System commands
      [XIMCommand.EXPRESS_VERSION]: 'EXPRESS_VERSION',
      [XIMCommand.ZMODEMSEND]: 'ZMODEMSEND',
      [XIMCommand.ZMODEMRECEIVE]: 'ZMODEMRECEIVE',
      [XIMCommand.BATCHZMODEMSEND]: 'BATCHZMODEMSEND',
      [XIMCommand.ACP_COMMAND]: 'ACP_COMMAND',
      [XIMCommand.LOAD_ACCOUNT]: 'LOAD_ACCOUNT',
      [XIMCommand.SAVE_ACCOUNT]: 'SAVE_ACCOUNT',
      [XIMCommand.LOAD_CONFDB]: 'LOAD_CONFDB',
      [XIMCommand.SAVE_CONFDB]: 'SAVE_CONFDB',
      [XIMCommand.GET_CONFNUM]: 'GET_CONFNUM',
      [XIMCommand.SEARCH_ACCOUNT]: 'SEARCH_ACCOUNT',
      [XIMCommand.APPEND_ACCOUNT]: 'APPEND_ACCOUNT',
      [XIMCommand.LAST_ACCOUNTNUM]: 'LAST_ACCOUNTNUM',
      [XIMCommand.EXT_LOAD_ACCOUNT]: 'EXT_LOAD_ACCOUNT',
      [XIMCommand.EXT_SAVE_ACCOUNT]: 'EXT_SAVE_ACCOUNT',
      [XIMCommand.NETUPLOAD]: 'NETUPLOAD',
      [XIMCommand.NETDOWNLOAD]: 'NETDOWNLOAD',
    };

    return names[command] || `Unknown (${command})`;
  }
}

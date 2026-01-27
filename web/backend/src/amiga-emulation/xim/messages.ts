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
    // CRITICAL FIX: Removed ALL bias logic - it was completely wrong!
    // There is NO duplicate copy of message fields at +0x14 offset.
    // The jhMessage structure has ONE copy of each field at the canonical offsets.
    //
    // Previous bug: readWithBias was reading from BOTH offset and offset+0x14,
    // e.g., reading TASK from 0xf0 AND 0x104 (FILLER3), causing confusion.
    //
    // Correct approach: Read directly from canonical offsets only.

    const messageLength = this.emulator.readMemory16(
      msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
    );
    const replyPort = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET
    );
    const layout = this.getMessageLayout(messageLength);
    const offsets = this.getLayoutOffsets(layout);

    const command = layout === 'short'
      ? this.emulator.readMemory16(msgAddr + offsets.command)
      : this.emulator.readMemory32(msgAddr + offsets.command);
    const data = layout === 'short'
      ? this.emulator.readMemory16(msgAddr + offsets.data)
      : this.emulator.readMemory32(msgAddr + offsets.data);
    const nodeId = layout === 'short'
      ? this.emulator.readMemory16(msgAddr + offsets.node)
      : this.emulator.readMemory32(msgAddr + offsets.node);
    const lineNumber = layout === 'short'
      ? this.emulator.readMemory16(msgAddr + offsets.line)
      : this.emulator.readMemory32(msgAddr + offsets.line);
    const signal = this.emulator.readMemory32(msgAddr + offsets.signal);
    const task = this.emulator.readMemory32(msgAddr + offsets.task);
    const hasSemaphore = this.hasFieldLength(
      messageLength,
      offsets.semaphore,
      4
    );
    const hasFiller1 = this.hasFieldLength(
      messageLength,
      offsets.filler1,
      4
    );
    const hasFiller2 = this.hasFieldLength(
      messageLength,
      offsets.filler2,
      4
    );
    const hasStringPtr = this.hasFieldLength(
      messageLength,
      offsets.stringPtr,
      4
    );
    const hasFiller3 = this.hasFieldLength(
      messageLength,
      offsets.filler3,
      4
    );
    const semaphore = hasSemaphore
      ? this.emulator.readMemory32(msgAddr + offsets.semaphore)
      : undefined;
    const filler1 = hasFiller1
      ? this.emulator.readMemory32(msgAddr + offsets.filler1)
      : undefined;
    const filler2 = hasFiller2
      ? this.emulator.readMemory32(msgAddr + offsets.filler2)
      : undefined;
    const stringPtr = hasStringPtr
      ? this.emulator.readMemory32(msgAddr + offsets.stringPtr)
      : undefined;
    const filler3 = hasFiller3
      ? this.emulator.readMemory32(msgAddr + offsets.filler3)
      : undefined;
    const stringAddr = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;

    // Read the string (200 bytes starting at offset 24)
    const messageString = this.emulator.readString(
      stringAddr,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );

    if (messageString.toLowerCase().startsWith('bbs:')) {
      const rawData32 = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
      const rawCmd32 = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
      const rawBytes: number[] = [];
      const dumpBase = msgAddr + DoorConstants.MESSAGE_DATA_OFFSET;
      for (let i = 0; i < 16; i++) {
        rawBytes.push(this.emulator.readMemory(dumpBase + i) & 0xff);
      }
      const rawHex = rawBytes.map((b) => b.toString(16).padStart(2, '0')).join(' ');
      const data16 = this.emulator.readMemory16(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
      const cmd16 = this.emulator.readMemory16(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
      const cmd16Alt = this.emulator.readMemory16(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET - 2);
console.log(`[XIMMessageParser] bbs: raw data=0x${rawData32.toString(16)} raw cmd=0x${rawCmd32.toString(16)} msgAddr=0x${msgAddr.toString(16)}`);
console.log(`[XIMMessageParser] bbs: raw bytes @0x${dumpBase.toString(16)}: ${rawHex}`);
console.log(`[XIMMessageParser] bbs: data16=${data16} cmd16@e0=${cmd16} cmd16@de=${cmd16Alt}`);
    }

console.log("[XIMMessageParser] Parsed jhMessage:");
console.log(`  Address: 0x${msgAddr.toString(16)}`);
console.log(`  Length: ${messageLength} (layout=${layout})`);
console.log(`  Reply Port: 0x${replyPort.toString(16)}`);
console.log(`  Command: ${command} (${this.getCommandName(command)})`);
console.log(`  Data: ${data} (0x${data.toString(16)})`);
console.log(`  Node: ${nodeId}, Line: ${lineNumber}`);
console.log(`  Signal: ${signal}, Task: 0x${task.toString(16)}`);
console.log(`  Semi: ${this.formatHex(semaphore)}`);
console.log(`  Filler1: ${this.formatHex(filler1)}, Filler2: ${this.formatHex(filler2)}`);
console.log(`  StrPtr: ${this.formatHex(stringPtr)}, Filler3: ${this.formatHex(filler3)}`);
console.log(`  String: "${messageString}"`);
    if (layout === 'short') {
      const dumpBase = msgAddr + offsets.data;
      const raw: number[] = [];
      for (let i = 0; i < 16; i++) {
        raw.push(this.emulator.readMemory(dumpBase + i) & 0xff);
      }
      const rawHex = raw.map((b) => b.toString(16).padStart(2, '0')).join(' ');
console.log(`  Raw @0x${dumpBase.toString(16)} (data..filler2): ${rawHex}`);
      const data16 = this.emulator.readMemory16(msgAddr + offsets.data);
      const cmd16 = this.emulator.readMemory16(msgAddr + offsets.command);
      const node16 = this.emulator.readMemory16(msgAddr + offsets.node);
      const line16 = this.emulator.readMemory16(msgAddr + offsets.line);
console.log(`  Raw16 data=${data16} cmd=${cmd16} node=${node16} line=${line16}`);
    }

    return {
      msgAddr,
      command,
      data,
      replyPort,
      messageLength,
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
   * Also updates strPtr to point to the embedded buffer in case door reads via pointer
   */
  writeMessageString(msgAddr: number, value: string): void {
    const stringAddr = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;

    // Write the string to embedded buffer
    this.writeString(stringAddr, value, DoorConstants.MESSAGE_STRING_CAPACITY);

    // CRITICAL: Update strPtr to point to embedded buffer
    // Some doors read via strPtr instead of embedded buffer directly
    // If strPtr is 0 (not set by door), door would read garbage and crash
    this.writeStringPointer(msgAddr, stringAddr);
  }

  /**
   * Write reply data/result (msg->Data)
   */
  writeData(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    this.writeValue(msgAddr, offsets.data, value, layout === 'short' ? 2 : 4);
  }

  /**
   * Write Command (msg->Command)
   */
  writeCommand(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    this.writeValue(msgAddr, offsets.command, value, layout === 'short' ? 2 : 4);

    // DEBUG: Log command writes for debugging dRE!WAll
    const char = (value >= 32 && value < 127) ? String.fromCharCode(value) : `0x${value.toString(16)}`;
console.log(`[XIMMessageParser] writeCommand: msgAddr=0x${msgAddr.toString(16)} offset=${offsets.command} value=${value} (${char}) layout=${layout}`);
  }

  /**
   * Write LineNum (msg->LineNum)
   */
  writeLineNumber(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    this.writeValue(msgAddr, offsets.line, value, layout === 'short' ? 2 : 4);
  }

  /**
   * Write NodeID (msg->NodeID)
   */
  writeNodeId(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    this.writeValue(msgAddr, offsets.node, value, layout === 'short' ? 2 : 4);
  }

  /**
   * Write semaphore/filler pointers
   */
  writeSemaphore(msgAddr: number, value: number): void {
    const msgLen = this.getMessageLength(msgAddr);
    const layout = this.getMessageLayout(msgLen);
    const offsets = this.getLayoutOffsets(layout);
    console.error(`[XIMMessageParser] writeSemaphore: msgAddr=0x${msgAddr.toString(16)}, value=0x${value.toString(16)}, msgLen=${msgLen}, layout=${layout}, semOffset=0x${offsets.semaphore.toString(16)}`);
    if (!this.hasField(msgAddr, offsets.semaphore, 4)) {
      console.error(`[XIMMessageParser] writeSemaphore: SKIPPED - hasField returned false (msgLen=${msgLen} < offset+size=${offsets.semaphore + 4})`);
      return;
    }
    this.writeValue(msgAddr, offsets.semaphore, value, 4);
    // Verify the write
    const readback = this.emulator.readMemory32(msgAddr + offsets.semaphore);
    console.error(`[XIMMessageParser] writeSemaphore: Wrote to msgAddr+0x${offsets.semaphore.toString(16)}, readback=0x${readback.toString(16)}`);
  }

  writeFiller1(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    if (!this.hasField(msgAddr, offsets.filler1, 4)) {
      return;
    }
    this.writeValue(msgAddr, offsets.filler1, value, 4);
  }

  writeFiller2(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    if (!this.hasField(msgAddr, offsets.filler2, 4)) {
      return;
    }
    this.writeValue(msgAddr, offsets.filler2, value, 4);
  }

  writeFiller3(msgAddr: number, value: number): void {
    const layout = this.getMessageLayout(this.getMessageLength(msgAddr));
    const offsets = this.getLayoutOffsets(layout);
    if (!this.hasField(msgAddr, offsets.filler3, 4)) {
      return;
    }
    this.writeValue(msgAddr, offsets.filler3, value, 4);
  }

  writeStringPointer(msgAddr: number, value: number): boolean {
    const msgLen = this.getMessageLength(msgAddr);
    const layout = this.getMessageLayout(msgLen);
    const offsets = this.getLayoutOffsets(layout);
    if (!this.hasField(msgAddr, offsets.stringPtr, 4)) {
      return false;
    }
    this.writeValue(msgAddr, offsets.stringPtr, value, 4);
    return true;
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
      [XIMCommand.JH_BBSNAME]: 'JH_BBSNAME',
      [XIMCommand.JH_SYSOP]: 'JH_SYSOP',
      [XIMCommand.JH_ExtHK]: 'JH_ExtHK (Extended Hotkey)',
      [XIMCommand.JH_SIGBIT]: 'JH_SIGBIT',
      [XIMCommand.JH_FetchKey]: 'JH_FetchKey',
      [XIMCommand.JH_SMPTR]: 'JH_SMPTR (Send Message Pointer)',
      [XIMCommand.JH_20]: 'JH_20',
      [XIMCommand.JH_MCI]: 'JH_MCI',
      [XIMCommand.GETKEY]: 'GETKEY',
      [XIMCommand.RAWARROW]: 'RAWARROW',
      [XIMCommand.CHAIN]: 'CHAIN',
      [XIMCommand.NB_LOAD]: 'NB_LOAD (Node Bulletin)',
      [XIMCommand.CHG_USER]: 'CHG_USER',
      [XIMCommand.RETURNCOMMAND]: 'RETURNCOMMAND',
      [XIMCommand.RETURNCOMMAND2]: 'RETURNCOMMAND2',
      [XIMCommand.CANCEL_TRANSFER_OFFHOOK]: 'CANCEL_TRANSFER_OFFHOOK',
      [XIMCommand.CLEAR_OLM_QUEUE]: 'CLEAR_OLM_QUEUE',
      [XIMCommand.DT_USERLOAD]: 'DT_USERLOAD',
      [XIMCommand.MOD_TYPE]: 'MOD_TYPE',
      [XIMCommand.EDITOR_STRUCT]: 'EDITOR_STRUCT',
      [XIMCommand.BYPASS_CSI_CHECK]: 'BYPASS_CSI_CHECK',
      [XIMCommand.SENTBY]: 'SENTBY',
      [XIMCommand.PRV_COMMAND]: 'PRV_COMMAND',
      [XIMCommand.PRV_GROUP]: 'PRV_GROUP',
      [XIMCommand.NODE_NUMBER]: 'NODE_NUMBER',
      [XIMCommand.GET_CMD_TOOLTYPE]: 'GET_CMD_TOOLTYPE',
      [XIMCommand.SCREEN_ADDRESS]: 'SCREEN_ADDRESS',
      [XIMCommand.RAWSCREEN_ADDRESS]: 'RAWSCREEN_ADDRESS',

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
      [XIMCommand.BB_NONSTOPTEXT]: 'BB_NONSTOPTEXT',
      [XIMCommand.BB_LINECOUNT]: 'BB_LINECOUNT',
      [XIMCommand.BB_PURGELINE]: 'BB_PURGELINE',
      [XIMCommand.BB_PURGELINESTART]: 'BB_PURGELINESTART',
      [XIMCommand.BB_PURGELINEEND]: 'BB_PURGELINEEND',
      [XIMCommand.BB_SCRLEFT]: 'BB_SCRLEFT',
      [XIMCommand.BB_SCRTOP]: 'BB_SCRTOP',
      [XIMCommand.BB_SCRWIDTH]: 'BB_SCRWIDTH',
      [XIMCommand.BB_SCRHEIGHT]: 'BB_SCRHEIGHT',
      [XIMCommand.BB_CONFIG]: 'BB_CONFIG',
      [XIMCommand.BB_TASKPRI]: 'BB_TASKPRI',
      [XIMCommand.BB_CHATFLAG]: 'BB_CHATFLAG',
      [XIMCommand.BB_CHATSET]: 'BB_CHATSET',
      [XIMCommand.BB_PCONFLOCAL]: 'BB_PCONFLOCAL',
      [XIMCommand.BB_PCONFNAME]: 'BB_PCONFNAME',
      [XIMCommand.BB_CALLERSLOG]: 'BB_CALLERSLOG',
      [XIMCommand.BB_UDLOG]: 'BB_UDLOG',
      [XIMCommand.BB_LOGONTYPE]: 'BB_LOGONTYPE',
      [XIMCommand.BB_DROPDTR]: 'BB_DROPDTR',
      [XIMCommand.BB_GETTASK]: 'BB_GETTASK',
      [XIMCommand.BB_REMOVEPORT]: 'BB_REMOVEPORT',
      [XIMCommand.BB_SOPT]: 'BB_SOPT',
      [XIMCommand.ENVSTAT]: 'ENVSTAT',
      // Note: BB_NUMCONFS = 614 = CONF_ACCESS - duplicate removed

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
      [XIMCommand.SV_NEWMSG]: 'SV_NEWMSG',
      [XIMCommand.SV_UNICONIFY]: 'SV_UNICONIFY',
      [XIMCommand.SV_SYSOPLOG]: 'SV_SYSOPLOG',
      [XIMCommand.SV_LOCALLOG]: 'SV_LOCALLOG',
      [XIMCommand.SV_ACCOUNTS]: 'SV_ACCOUNTS',
      [XIMCommand.SV_CHAT]: 'SV_CHAT',
      [XIMCommand.SV_NODEOFFHOOK]: 'SV_NODEOFFHOOK',
      [XIMCommand.SV_EXITNODE]: 'SV_EXITNODE',
      [XIMCommand.SV_INITMODEM]: 'SV_INITMODEM',
      [XIMCommand.SV_WHATSUP]: 'SV_WHATSUP',
      [XIMCommand.SV_INSTANT]: 'SV_INSTANT',
      [XIMCommand.SV_RESERVE]: 'SV_RESERVE',
      [XIMCommand.SV_CHATTOGGLE]: 'SV_CHATTOGGLE',
      [XIMCommand.SV_TOPS]: 'SV_TOPS',
      [XIMCommand.SV_AESHELL]: 'SV_AESHELL',
      [XIMCommand.SV_START]: 'SV_START',
      [XIMCommand.SV_QUIETNODE]: 'SV_QUIETNODE',
      [XIMCommand.SV_SETNRAMS]: 'SV_SETNRAMS',
      [XIMCommand.SV_RESERVENODE]: 'SV_RESERVENODE',
      [XIMCommand.SV_NODE_LOCK]: 'SV_NODE_LOCK',
      [XIMCommand.SV_ACPALERT]: 'SV_ACPALERT',
      [XIMCommand.SV_INCOMING_MSG]: 'SV_INCOMING_MSG',
      [XIMCommand.SV_KICKUSER]: 'SV_KICKUSER',
      [XIMCommand.SV_STARTNODE]: 'SV_STARTNODE',
      [XIMCommand.SV_INFO]: 'SV_INFO',
      [XIMCommand.INCOMING_TELNET]: 'INCOMING_TELNET',
      [XIMCommand.INCOMING_FTP]: 'INCOMING_FTP',
      [XIMCommand.SV_ACPSHUTDOWN]: 'SV_ACPSHUTDOWN',
      [XIMCommand.SV_CONFMAINT]: 'SV_CONFMAINT',
      [XIMCommand.SV_VIEWLOGS]: 'SV_VIEWLOGS',
      [XIMCommand.SV_TOGGLESTATUS]: 'SV_TOGGLESTATUS',
      [XIMCommand.SV_TIMEINCREASE]: 'SV_TIMEINCREASE',
      [XIMCommand.SV_TIMEDECREASE]: 'SV_TIMEDECREASE',
      [XIMCommand.SV_CAPTURE]: 'SV_CAPTURE',
      [XIMCommand.SV_DISPLAYFILE]: 'SV_DISPLAYFILE',
      [XIMCommand.SV_GRANTTEMP]: 'SV_GRANTTEMP',

      // Node/Modem info
      [XIMCommand.NODE_BAUD]: 'NODE_BAUD',
      [XIMCommand.NODE_BAUDRATE]: 'NODE_BAUDRATE',
      [XIMCommand.NODE_DEVICE]: 'NODE_DEVICE',
      [XIMCommand.NODE_UNIT]: 'NODE_UNIT',

      // Multicom
      [XIMCommand.MULTICOM]: 'MULTICOM',

      // Message base commands
      [XIMCommand.GET_CUSTOM_MSGBASE_PARAM1]: 'GET_CUSTOM_MSGBASE_PARAM1',
      [XIMCommand.GET_CUSTOM_MSGBASE_PARAM2]: 'GET_CUSTOM_MSGBASE_PARAM2',
      [XIMCommand.LAST_READ]: 'LAST_READ',
      [XIMCommand.LAST_SCANNED]: 'LAST_SCANNED',
      [XIMCommand.MSGBASE_LOC]: 'MSGBASE_LOC',

      // Override/control
      [XIMCommand.SETOVERIDE]: 'SETOVERIDE',
      [XIMCommand.FULLEDIT]: 'FULLEDIT',
      [XIMCommand.SETMCIOFF]: 'SETMCIOFF',

      // Serial I/O
      [XIMCommand.SER_INOUT]: 'SER_INOUT',

      // AXNet
      [XIMCommand.AXNET_SEND]: 'AXNET_SEND',
      [XIMCommand.AXNET_RECEIVE]: 'AXNET_RECEIVE',
      [XIMCommand.XNET_OUTBOUND]: 'XNET_OUTBOUND',

      // Memory/Conference
      [XIMCommand.MEMCONF]: 'MEMCONF',
      [XIMCommand.SET_SERSHARED]: 'SET_SERSHARED',
      [XIMCommand.CONF_ACCESS]: 'CONF_ACCESS',

      // Password
      [XIMCommand.PASSWORD_HASH]: 'PASSWORD_HASH',

      // Display control
      [XIMCommand.GET_GNSFLAG]: 'GET_GNSFLAG',
      [XIMCommand.SET_FILEATTACH]: 'SET_FILEATTACH',
      [XIMCommand.INTERPRET_MCI]: 'INTERPRET_MCI',
      [XIMCommand.GET_XIMPORT]: 'GET_XIMPORT',
      [XIMCommand.GET_MENU_COMMAND_CHAR]: 'GET_MENU_COMMAND_CHAR',
      [XIMCommand.FILE_REQUEST]: 'FILE_REQUEST',
      [XIMCommand.DISABLE_FILE_ATTACH]: 'DISABLE_FILE_ATTACH',

      // QWK
      [XIMCommand.QWKZOOM_REC]: 'QWKZOOM_REC',

      // Conference
      [XIMCommand.REL_CONF]: 'REL_CONF',
      [XIMCommand.CHECK_PLAYPEN_EXISTS]: 'CHECK_PLAYPEN_EXISTS',
      [XIMCommand.CHOOSE_NAME]: 'CHOOSE_NAME',
      [XIMCommand.EXT_CHOOSE_NAME]: 'EXT_CHOOSE_NAME',
      [XIMCommand.CHECK_REALNAME]: 'CHECK_REALNAME',

      // Extended user data
      [XIMCommand.DT_INTERNETNAME]: 'DT_INTERNETNAME',
      [XIMCommand.DT_TRANSLATOR]: 'DT_TRANSLATOR',
      [XIMCommand.DT_HOST_LANGUAGE]: 'DT_HOST_LANGUAGE',
      [XIMCommand.DT_GEOGRAPHIC]: 'DT_GEOGRAPHIC',
      [XIMCommand.DT_SIZEUPLOAD]: 'DT_SIZEUPLOAD',
      [XIMCommand.DT_SIZEDOWNLOAD]: 'DT_SIZEDOWNLOAD',

      // Console
      [XIMCommand.CON_CURSOR]: 'CON_CURSOR',

      // Telnet
      [XIMCommand.TELNET_CONNECT]: 'TELNET_CONNECT',
      [XIMCommand.TELNET_USERNAME_PROMPT]: 'TELNET_USERNAME_PROMPT',
      [XIMCommand.TELNET_USERNAME]: 'TELNET_USERNAME',
      [XIMCommand.TELNET_PASSWORD_PROMPT]: 'TELNET_PASSWORD_PROMPT',
      [XIMCommand.TELNET_PASSWORD]: 'TELNET_PASSWORD',

      // Extended stats
      [XIMCommand.DT_CONFACCESS2]: 'DT_CONFACCESS2',
      [XIMCommand.DT_CBYTESUPLOAD]: 'DT_CBYTESUPLOAD',
      [XIMCommand.DT_CBYTESDOWNLOAD]: 'DT_CBYTESDOWNLOAD',
      [XIMCommand.DT_CFILESUPLOAD]: 'DT_CFILESUPLOAD',
      [XIMCommand.DT_CFILESDOWNLOAD]: 'DT_CFILESDOWNLOAD',
      [XIMCommand.BB_CONFACCOUNT]: 'BB_CONFACCOUNT',
      [XIMCommand.DT_CALLEDTODAY]: 'DT_CALLEDTODAY',

      // Playpen/sig
      [XIMCommand.SIG_PLAYPEN]: 'SIG_PLAYPEN',
      [XIMCommand.ICONIFYQUERY]: 'ICONIFYQUERY',

      // Logon
      [XIMCommand.LOGON_UNAME]: 'LOGON_UNAME',
      [XIMCommand.LOGON_UPASS]: 'LOGON_UPASS',

      // Secure input
      [XIMCommand.SIG_LI]: 'SIG_LI',

      // Internal
      [XIMCommand.UNKNOWN4]: 'UNKNOWN4',
      [XIMCommand.QUIET_DOWNLOAD]: 'QUIET_DOWNLOAD',
    };

    return names[command] || `Unknown (${command})`;
  }

  /**
   * Write a 32-bit value to the canonical jhMessage offset.
   *
   * CRITICAL FIX: Removed biased write (+0x14) that was corrupting message structure.
   * The biased write was overwriting MESSAGE_TASK_OFFSET (0xf0) and causing stack
   * corruption crashes in all XIM doors. Express.e uses standard ReplyMsg() without
   * any biased offset modifications.
   *
   * Previous bug: writeData(0xdc) also wrote to 0xf0 (MESSAGE_TASK_OFFSET)
   * Result: Door crashed when processing reply with corrupted task pointer
   */
  private writeValue(msgAddr: number, offset: number, value: number, size: number): void {
    if (size === 2) {
      this.emulator.writeMemory16(msgAddr + offset, value & 0xffff);
      return;
    }
    // Only write to canonical offset - no biased write for XIM messages
    this.emulator.writeMemory32(msgAddr + offset, value);

    // Biased write removed - was causing MESSAGE_TASK_OFFSET corruption
    // Previous code wrote to msgAddr + offset + 0x14, overwriting critical fields
  }

  private getMessageLength(msgAddr: number): number {
    return this.emulator.readMemory16(
      msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
    );
  }

  private getMessageLayout(messageLength: number): 'short' | 'long' {
    // jhMessage is size 0x100 with LONG fields (axcommon.e/AE docs).
    // Only treat smaller, non-standard sizes as 16-bit "short" layouts.
    if (messageLength && messageLength < 0x100) {
      return 'short';
    }
    return 'long';
  }

  private getLayoutOffsets(layout: 'short' | 'long') {
    if (layout === 'short') {
      return {
        data: 0xdc,
        command: 0xde,
        node: 0xe0,
        line: 0xe2,
        signal: 0xe4,
        task: 0xe8,
        semaphore: 0xec,
        filler1: 0xf0,
        filler2: 0xf4,
        stringPtr: 0xf8,
        filler3: 0xfc,
      };
    }

    return {
      data: DoorConstants.MESSAGE_DATA_OFFSET,
      command: DoorConstants.MESSAGE_COMMAND_OFFSET,
      node: DoorConstants.MESSAGE_NODE_OFFSET,
      line: DoorConstants.MESSAGE_LINE_OFFSET,
      signal: DoorConstants.MESSAGE_SIGNAL_OFFSET,
      task: DoorConstants.MESSAGE_TASK_OFFSET,
      semaphore: DoorConstants.MESSAGE_SEMAPHORE_OFFSET,
      filler1: DoorConstants.MESSAGE_FILLER1_OFFSET,
      filler2: DoorConstants.MESSAGE_FILLER2_OFFSET,
      stringPtr: DoorConstants.MESSAGE_STRING_PTR_OFFSET,
      filler3: DoorConstants.MESSAGE_FILLER3_OFFSET,
    };
  }

  private hasField(msgAddr: number, offset: number, size: number): boolean {
    const length = this.getMessageLength(msgAddr);
    return this.hasFieldLength(length, offset, size);
  }

  private hasFieldLength(messageLength: number, offset: number, size: number): boolean {
    if (!messageLength) {
      return false;
    }
    return offset + size <= messageLength;
  }

  private formatHex(value?: number): string {
    if (value === undefined) {
      return 'n/a';
    }
    return `0x${value.toString(16)}`;
  }
}

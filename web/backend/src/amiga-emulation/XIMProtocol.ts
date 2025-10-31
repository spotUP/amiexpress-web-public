/**
 * XIM Protocol Implementation for AmiExpress Door Communication
 *
 * Based on aedoor.h specification from AmiExpress sources.
 * Handles bidirectional message-based communication between BBS and doors.
 */

import { MoiraEmulator } from './cpu/MoiraEmulator';
import { ExecLibrary } from './api/ExecLibrary';

// XIM Protocol Command Codes (from aedoor.h)
export enum XIMCommand {
  JH_LI = 0,           // Login info
  JH_REGISTER = 1,     // Register with BBS
  JH_SHUTDOWN = 2,     // Shutdown door
  JH_WRITE = 3,        // Write to terminal
  JH_SM = 4,           // Send message
  JH_PM = 5,           // Private message
  JH_HK = 6,           // Hotkey
  JH_SG = 7,           // Signal
  JH_SF = 8,           // Set flag
  JH_EF = 9,           // End flag
  JH_CO = 10,          // Conference operation
  JH_BBSName = 11,     // Get BBS name
  JH_Sysop = 12,       // Get sysop name
  JH_FLAGFILE = 13,    // Flag file
  JH_SHOWFLAGS = 14,   // Show flags
  JH_DL = 15,          // Download
  JH_ExtHK = 15,       // Extended hotkey
  JH_SIGBIT = 16,      // Signal bit
  JH_FetchKey = 17,    // Fetch key

  // Data query commands
  DT_NAME = 100,
  DT_PASSWORD = 101,
  DT_LOCATION = 102,
  DT_PHONENUMBER = 103,
  DT_SLOTNUMBER = 104,
  DT_SECSTATUS = 105,
  DT_TIMELIMIT = 115,
  DT_EXPERT = 121,
  DT_LINELENGTH = 122,

  // Special commands
  GETKEY = 500,        // Get keyboard input
  RAWARROW = 501,      // Raw arrow keys
  CHAIN = 502,         // Chain to another door
  NODE_NUMBER = 506,   // Get node number
}

/**
 * XIM Message Structure
 *
 * struct DIFace {
 *   APTR dif_AEPort;      // Ptr to AEDoorPortX
 *   APTR dif_MsgPort;     // Ptr to DoorReplyPort
 *   APTR dif_Message;     // Ptr to message
 *   char dif_ReplyName[16];
 *   int *dif_Data;
 *   char *dif_String;
 * }
 */
export interface XIMMessage {
  msgAddr: number;      // Address of message in memory
  command: number;      // XIM command code
  data: number;         // Data value
  replyPort: number;    // Door's reply port address
  stringAddr?: number;  // Address of string data (if any)
}

export class XIMProtocol {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private doorPort: number;          // AEDoorPort address (0xa0000)
  private doorReplyPort: number = 0; // Door's reply port (will be discovered)

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary, doorPort: number) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.doorPort = doorPort;

    console.log('[XIMProtocol] Initialized');
    console.log(`  Door Port: 0x${doorPort.toString(16)}`);
  }

  /**
   * Parse XIM message from memory
   */
  parseMessage(msgAddr: number): XIMMessage {
    // Amiga Message structure:
    // struct Message {
    //   struct Node mn_Node;        // 14 bytes
    //   struct MsgPort *mn_ReplyPort; // 4 bytes (offset 14)
    //   UWORD mn_Length;            // 2 bytes (offset 18)
    // }
    // Total: 20 bytes for standard message header

    // XIM message adds:
    // UWORD command;  // offset 20
    // ULONG data;     // offset 22

    const replyPort = this.emulator.readMemory32(msgAddr + 14);
    const command = this.emulator.readMemory16(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 22);

    console.log('[XIMProtocol] Parsed message:');
    console.log(`  Address: 0x${msgAddr.toString(16)}`);
    console.log(`  Reply Port: 0x${replyPort.toString(16)}`);
    console.log(`  Command: ${command} (${this.getCommandName(command)})`);
    console.log(`  Data: 0x${data.toString(16)}`);

    // Save door's reply port for future responses
    if (replyPort !== 0 && this.doorReplyPort === 0) {
      this.doorReplyPort = replyPort;
      console.log('[XIMProtocol] Discovered door reply port: 0x' + replyPort.toString(16));
    }

    return {
      msgAddr,
      command,
      data,
      replyPort,
    };
  }

  /**
   * Handle incoming XIM message from door
   */
  handleMessage(msg: XIMMessage): void {
    console.log(`[XIMProtocol] Handling command: ${this.getCommandName(msg.command)}`);

    switch (msg.command) {
      case XIMCommand.JH_LI:
      case XIMCommand.JH_REGISTER:
        this.handleRegister(msg);
        break;

      case XIMCommand.JH_WRITE:
        this.handleWrite(msg);
        break;

      case XIMCommand.GETKEY:
        this.handleGetKey(msg);
        break;

      case XIMCommand.JH_SHUTDOWN:
        this.handleShutdown(msg);
        break;

      case XIMCommand.DT_NAME:
      case XIMCommand.DT_LOCATION:
      case XIMCommand.DT_TIMELIMIT:
      case XIMCommand.DT_LINELENGTH:
        this.handleDataQuery(msg);
        break;

      default:
        console.log(`[XIMProtocol] Unhandled command: ${msg.command}`);
        // Reply with success anyway to keep door moving
        this.sendReply(msg, 0);
    }
  }

  /**
   * Handle door registration / login info request
   */
  private handleRegister(msg: XIMMessage): void {
    console.log('[XIMProtocol] Door registering with BBS');

    // Door is requesting initialization
    // Send back success to acknowledge registration
    this.sendReply(msg, 1); // 1 = success

    console.log('[XIMProtocol] Registration acknowledged');
  }

  /**
   * Handle door write request (door wants to display text)
   */
  private handleWrite(msg: XIMMessage): void {
    // msg.data contains pointer to string
    const stringAddr = msg.data;

    if (stringAddr !== 0) {
      const text = this.readString(stringAddr);
      console.log('[XIMProtocol] Door writing to terminal:', text);

      // TODO: Send to terminal via socket
      // socket.emit('ansi-output', text);
    }

    this.sendReply(msg, text.length);
  }

  /**
   * Handle keyboard input request
   */
  private handleGetKey(msg: XIMMessage): void {
    console.log('[XIMProtocol] Door requesting keyboard input');

    // TODO: Queue this request, wait for terminal input
    // For now, reply with 0 (no key available)
    this.sendReply(msg, 0);
  }

  /**
   * Handle door shutdown request
   */
  private handleShutdown(msg: XIMMessage): void {
    console.log('[XIMProtocol] Door requesting shutdown');

    // Acknowledge shutdown
    this.sendReply(msg, 1);

    // TODO: Signal door manager that door completed
    console.log('[XIMProtocol] Door completed execution');
  }

  /**
   * Handle data query (user info, time remaining, etc)
   */
  private handleDataQuery(msg: XIMMessage): void {
    console.log(`[XIMProtocol] Door querying data: ${this.getCommandName(msg.command)}`);

    let responseValue = 0;

    switch (msg.command) {
      case XIMCommand.DT_NAME:
        // Return pointer to username string
        // TODO: Write username to memory and return address
        responseValue = 0; // For now
        break;

      case XIMCommand.DT_TIMELIMIT:
        responseValue = 60; // 60 minutes
        break;

      case XIMCommand.DT_LINELENGTH:
        responseValue = 80; // 80 columns
        break;

      default:
        responseValue = 0;
    }

    this.sendReply(msg, responseValue);
  }

  /**
   * Send reply to door via PutMsg
   */
  private sendReply(msg: XIMMessage, data: number): void {
    if (this.doorReplyPort === 0) {
      console.log('[XIMProtocol] No door reply port yet, cannot send reply');
      return;
    }

    console.log('[XIMProtocol] Sending reply to door:');
    console.log(`  Reply Port: 0x${this.doorReplyPort.toString(16)}`);
    console.log(`  Message: 0x${msg.msgAddr.toString(16)}`);
    console.log(`  Data: ${data}`);

    // Update message data field with response
    this.emulator.writeMemory32(msg.msgAddr + 22, data);

    // Send message back to door via PutMsg
    this.execLibrary.putMsg(this.doorReplyPort, msg.msgAddr);

    console.log('[XIMProtocol] Reply sent');
  }

  /**
   * Read null-terminated string from memory
   */
  private readString(addr: number, maxLength: number = 200): string {
    const bytes: number[] = [];

    for (let i = 0; i < maxLength; i++) {
      const byte = this.emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }

    return String.fromCharCode(...bytes);
  }

  /**
   * Get human-readable command name
   */
  private getCommandName(command: number): string {
    const names: { [key: number]: string } = {
      [XIMCommand.JH_LI]: 'JH_LI (Login Info)',
      [XIMCommand.JH_REGISTER]: 'JH_REGISTER',
      [XIMCommand.JH_SHUTDOWN]: 'JH_SHUTDOWN',
      [XIMCommand.JH_WRITE]: 'JH_WRITE',
      [XIMCommand.GETKEY]: 'GETKEY',
      [XIMCommand.DT_NAME]: 'DT_NAME',
      [XIMCommand.DT_TIMELIMIT]: 'DT_TIMELIMIT',
      [XIMCommand.DT_LINELENGTH]: 'DT_LINELENGTH',
    };

    return names[command] || `Unknown (${command})`;
  }
}

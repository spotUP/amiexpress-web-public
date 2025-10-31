/**
 * XIM Protocol Implementation for AmiExpress Door Communication
 *
 * Based on aedoor.h specification from AmiExpress sources.
 * Handles bidirectional message-based communication between BBS and doors.
 */

import { MoiraEmulator } from './cpu/MoiraEmulator';
import { ExecLibrary } from './api/ExecLibrary';
import { Socket } from 'socket.io';

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
  private socket: Socket;
  private doorPort: number;          // AEDoorPort address (0xa0000)
  private doorReplyPort: number = 0; // Door's reply port (will be discovered)
  private inputQueue: string[] = []; // Queue for keyboard input from terminal

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary, socket: Socket, doorPort: number) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.doorPort = doorPort;

    console.log('[XIMProtocol] Initialized');
    console.log(`  Door Port: 0x${doorPort.toString(16)}`);
  }

  /**
   * Queue input from terminal for door to read via GETKEY
   * Called from AmigaDoorSession when 'door:input' event received
   */
  queueInput(data: string): void {
    console.log(`[XIMProtocol] Queuing input: "${data}"`);

    // Split input into individual characters and queue them
    for (const char of data) {
      this.inputQueue.push(char);
    }

    console.log(`[XIMProtocol] Input queue size: ${this.inputQueue.length}`);
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
      case XIMCommand.JH_REGISTER:
        this.handleRegister(msg);
        break;

      case XIMCommand.JH_LI:
        this.handleLineInput(msg);
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
   * Handle door registration
   *
   * From E sources (express.e:3379):
   * - CASE JH_REGISTER
   * - msg.command:=IF loggedOnUser<>NIL THEN userLineLen ELSE 29
   * - nodesPtr[]:=nodesPtr[]+1
   *
   * Door expects: Line length in response (80 columns for us)
   */
  private handleRegister(msg: XIMMessage): void {
    console.log('[XIMProtocol] Door registering with BBS');

    // Reply with terminal line length (80 columns)
    // Following E sources: msg.command gets the line length
    this.sendReply(msg, 80);

    console.log('[XIMProtocol] Registration acknowledged, line length=80');
  }

  /**
   * Handle line input request (JH_LI)
   *
   * From E sources (express.e:3425):
   * - CASE JH_LI
   * - IF(lineInput('',msg.string,msg.data,doorTimeout,tempstring)<>RESULT_SUCCESS)
   * -   msg.data:=-1
   * - ELSE
   * -   msg.data:=1
   * -   AstrCopy(msg.string,tempstring,200)
   *
   * Protocol:
   * - msg.string = prompt to display (if any)
   * - msg.data = max length
   * - Response: msg.data=1 (success) or -1 (timeout/failure)
   * - Response: msg.string = the input line
   */
  private handleLineInput(msg: XIMMessage): void {
    const promptAddr = msg.data;
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 22 + 4); // Get string pointer

    console.log('[XIMProtocol] Door requesting line input');

    // Display prompt if provided
    if (promptAddr !== 0) {
      const prompt = this.readString(promptAddr);
      if (prompt.length > 0) {
        console.log(`[XIMProtocol] Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    // Check if we have queued input ending with Enter
    // For now, just return empty line as success
    // TODO: Wait for actual line input from terminal
    console.log('[XIMProtocol] Returning empty line (TODO: implement line input queue)');

    if (stringAddr !== 0) {
      // Write empty string
      this.emulator.writeMemory(stringAddr, 0);
    }

    // Reply with success (1)
    this.sendReply(msg, 1);
  }

  /**
   * Handle door write request (door wants to display text)
   *
   * From E sources (express.e:1085):
   * - CASE JH_WRITE
   * - aePuts(servermsg.string)
   * - servermsg.command:=currentStat
   * - ReplyMsg(servermsg)
   */
  private handleWrite(msg: XIMMessage): void {
    // msg.data contains pointer to string
    const stringAddr = msg.data;
    let text = '';
    let bytesWritten = 0;

    if (stringAddr !== 0) {
      text = this.readString(stringAddr);
      console.log('[XIMProtocol] Door writing to terminal:', JSON.stringify(text));

      // Send to terminal - Following E sources: aePuts(servermsg.string)
      this.socket.emit('ansi-output', text);
      bytesWritten = text.length;

      console.log(`[XIMProtocol] Sent ${bytesWritten} bytes to terminal`);
    }

    // Reply with bytes written count (following E sources: servermsg.command:=currentStat)
    this.sendReply(msg, bytesWritten);
  }

  /**
   * Handle keyboard input request
   *
   * From E sources (express.e:3811):
   * - CASE GETKEY
   * - IF checkInput() THEN msg.string[0]:="1" ELSE msg.string[0]:="0"
   * - msg.string[1]:=0
   * - ReplyMsg(msg)
   *
   * Protocol:
   * - msg.data points to string buffer
   * - If key available: write "1<key>\0" (e.g., "1A\0")
   * - If no key: write "0\0"
   */
  private handleGetKey(msg: XIMMessage): void {
    const stringAddr = msg.data;

    if (stringAddr === 0) {
      console.log('[XIMProtocol] GETKEY: No string buffer provided');
      this.sendReply(msg, 0);
      return;
    }

    // Check if we have queued input
    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      console.log(`[XIMProtocol] GETKEY: Returning key '${char}' (0x${charCode.toString(16)})`);

      // Write "1<char>\0" to string buffer (E sources format)
      this.emulator.writeMemory(stringAddr, 0x31);      // '1' - key available
      this.emulator.writeMemory(stringAddr + 1, charCode); // the key character
      this.emulator.writeMemory(stringAddr + 2, 0);     // null terminator

      // Reply with 1 (key available)
      this.sendReply(msg, 1);
    } else {
      console.log('[XIMProtocol] GETKEY: No input queued');

      // Write "0\0" to string buffer
      this.emulator.writeMemory(stringAddr, 0x30);      // '0' - no key
      this.emulator.writeMemory(stringAddr + 1, 0);     // null terminator

      // Reply with 0 (no key available)
      this.sendReply(msg, 0);
    }
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
   * Send reply to door via ReplyMsg
   * Following E sources (express.e:1096, 4368) - BBS uses ReplyMsg()
   */
  private sendReply(msg: XIMMessage, data: number): void {
    console.log('[XIMProtocol] Sending reply to door:');
    console.log(`  Message: 0x${msg.msgAddr.toString(16)}`);
    console.log(`  Data: ${data}`);

    // Update message data field with response
    this.emulator.writeMemory32(msg.msgAddr + 22, data);

    // Send message back to door via ReplyMsg (not PutMsg!)
    // ReplyMsg reads mn_ReplyPort from message and sends it there
    this.execLibrary.replyMsg(msg.msgAddr);

    console.log('[XIMProtocol] Reply sent via ReplyMsg');
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

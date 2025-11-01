/**
 * XIM Protocol Implementation for AmiExpress Door Communication
 *
 * Based on aedoor.h specification from AmiExpress sources.
 * Handles bidirectional message-based communication between BBS and doors.
 */

import { MoiraEmulator } from './cpu/MoiraEmulator';
import { ExecLibrary } from './api/ExecLibrary';
import { Socket } from 'socket.io';

// XIM Protocol Command Codes (from aedoor.h and axcommon.e)
export enum XIMCommand {
  // Terminal I/O commands (JH_*)
  JH_LI = 0,           // Line input
  JH_REGISTER = 1,     // Register with BBS
  JH_SHUTDOWN = 2,     // Shutdown door
  JH_WRITE = 3,        // Write to terminal
  JH_SM = 4,           // Send message
  JH_PM = 5,           // Private message / Prompt message
  JH_HK = 6,           // Hotkey
  JH_SG = 7,           // Security screen
  JH_SF = 8,           // Show file
  JH_EF = 9,           // Edit file
  JH_CO = 10,          // Console output
  JH_BBSNAME = 11,     // Get BBS name
  JH_SYSOP = 12,       // Get sysop name
  JH_FLAGFILE = 13,    // Flag file
  JH_SHOWFLAGS = 14,   // Show flags
  JH_ExtHK = 15,       // Extended hotkey
  JH_SIGBIT = 16,      // Signal bit
  JH_FetchKey = 17,    // Fetch key
  JH_SO = 18,          // Serial output
  JH_SMPTR = 19,       // Send message pointer
  JH_20 = 20,          // Command 20
  JH_MCI = 507,        // MCI processing

  // Data query commands (DT_*)
  DT_NAME = 100,
  DT_PASSWORD = 101,
  DT_LOCATION = 102,
  DT_PHONENUMBER = 103,
  DT_SLOTNUMBER = 104,
  DT_SECSTATUS = 105,       // Security status / Access level
  DT_SECBOARD = 106,        // Security board / Ratio type
  DT_SECLIBRARY = 107,      // Security library / Ratio
  DT_SECBULLETIN = 108,     // Security bulletin / Comp type
  DT_MESSAGESPOSTED = 109,
  DT_UPLOADS = 110,
  DT_DOWNLOADS = 111,
  DT_TIMESCALLED = 112,
  DT_TIMELASTON = 113,
  DT_TIMEUSED = 114,
  DT_TIMELIMIT = 115,
  DT_TIMETOTAL = 116,
  DT_BYTESUPLOAD = 117,
  DT_BYTEDOWNLOAD = 118,
  DT_DAILYBYTELIMIT = 119,
  DT_DAILYBYTEDLD = 120,
  DT_EXPERT = 121,
  DT_LINELENGTH = 122,
  ACTIVE_NODES = 123,
  DT_DUMP = 124,
  DT_TIMEOUT = 125,
  DT_STAMP_LASTON = 143,
  DT_CURR_TIME = 145,
  DT_STAMP_CTIME = 144,
  DT_CONFACCESS = 146,
  DT_LANGUAGE = 527,
  DT_QUICKFLAG = 528,
  DT_GOODFILE = 529,
  DT_ANSICOLOR = 530,
  DT_ISANSI = 541,
  DT_MSGCODE = 543,
  DT_FILECODE = 545,
  DT_REALNAME = 606,
  DT_HOSTNAME = 700,
  DT_HOSTIP = 701,
  DT_ADDBIT = 1000,
  DT_REMBIT = 1001,
  DT_QUERYBIT = 1002,

  // BBS information commands (BB_*)
  BB_CONFNAME = 126,
  BB_CONFLOCAL = 127,
  BB_LOCAL = 128,
  BB_MAINLINE = 131,
  BB_TASKPRI = 140,
  BB_CHATFLAG = 142,
  BB_CHATSET = 162,
  BB_PCONFNAME = 148,
  BB_PCONFLOCAL = 147,
  BB_NODEID = 149,
  BB_CALLERSLOG = 150,
  BB_UDLOG = 151,
  BB_CONFNUM = 510,
  BB_LOGONTYPE = 517,
  BB_SCRLEFT = 518,
  BB_SCRTOP = 519,
  BB_SCRWIDTH = 520,
  BB_SCRHEIGHT = 521,
  BB_PURGELINE = 522,
  BB_PURGELINESTART = 523,
  BB_PURGELINEEND = 524,
  BB_NONSTOPTEXT = 525,
  BB_LINECOUNT = 526,
  BB_DROPDTR = 161,
  BB_GETTASK = 164,

  // System commands
  EXPRESS_VERSION = 152,
  GETKEY = 500,            // Get keyboard input
  RAWARROW = 501,          // Raw arrow keys
  CHAIN = 502,             // Chain to another door
  RETURNCOMMAND = 136,     // Return command
  RETURNCOMMAND2 = 628,    // Return command 2
  QUICK_KEY = 608,         // Quick key
  ENVSTAT = 163,           // Environment status
  SV_NEWMSG = 135,         // Server new message
  PRV_COMMAND = 133,       // Private command
  PRV_GROUP = 134,         // Private group
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
  private bbsSession: any;           // BBS session data (user info, system info)

  // Line input state (for JH_LI command)
  private waitingForLineInput: boolean = false;
  private lineInputMessage: XIMMessage | null = null;
  private lineInputBuffer: string = '';

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary, socket: Socket, doorPort: number, bbsSession?: any) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.doorPort = doorPort;
    this.bbsSession = bbsSession || {};

    console.log('[XIMProtocol] Initialized');
    console.log(`  Door Port: 0x${doorPort.toString(16)}`);
    console.log(`  BBS Session: ${bbsSession ? 'Provided' : 'None'}`);
    if (bbsSession?.user) {
      console.log(`  User: ${bbsSession.user.username || 'Unknown'}`);
    }
  }

  /**
   * Queue input from terminal for door to read via GETKEY or JH_LI
   * Called from AmigaDoorSession when 'door:input' event received
   */
  /**
   * Check if waiting for line input from user
   */
  isWaitingForLineInput(): boolean {
    return this.waitingForLineInput;
  }

  queueInput(data: string): void {
    console.log(`[XIMProtocol] Queuing input: "${data}"`);

    // If waiting for line input, handle specially
    if (this.waitingForLineInput) {
      for (const char of data) {
        if (char === '\r' || char === '\n') {
          // User pressed Enter - complete the line input
          console.log(`[XIMProtocol] Enter pressed, completing line input: "${this.lineInputBuffer}"`);
          this.completeLineInput();
          return;
        } else if (char === '\b' || char === '\x7f') {
          // Backspace - remove last character
          if (this.lineInputBuffer.length > 0) {
            this.lineInputBuffer = this.lineInputBuffer.slice(0, -1);
            console.log(`[XIMProtocol] Backspace, buffer now: "${this.lineInputBuffer}"`);
          }
        } else {
          // Normal character - add to buffer
          this.lineInputBuffer += char;
          console.log(`[XIMProtocol] Character added, buffer now: "${this.lineInputBuffer}"`);
        }
      }
    } else {
      // Not waiting for line input - queue for GETKEY
      for (const char of data) {
        this.inputQueue.push(char);
      }
      console.log(`[XIMProtocol] Input queue size: ${this.inputQueue.length}`);
    }
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

      case XIMCommand.JH_SM:
        this.handleSendMessage(msg);
        break;

      case XIMCommand.JH_SMPTR:
        this.handleSendMessagePointer(msg);
        break;

      case XIMCommand.JH_PM:
        this.handlePromptMessage(msg);
        break;

      case XIMCommand.JH_HK:
        this.handleHotkey(msg);
        break;

      case XIMCommand.JH_ExtHK:
        this.handleExtendedHotkey(msg);
        break;

      case XIMCommand.JH_FetchKey:
        this.handleFetchKey(msg);
        break;

      case XIMCommand.JH_SIGBIT:
        this.handleSignalBit(msg);
        break;

      case XIMCommand.JH_MCI:
        this.handleMCI(msg);
        break;

      case XIMCommand.JH_SG:
        this.handleSecurityScreen(msg);
        break;

      case XIMCommand.JH_SF:
        this.handleShowFile(msg);
        break;

      case XIMCommand.JH_EF:
        this.handleEditFile(msg);
        break;

      case XIMCommand.JH_FLAGFILE:
        this.handleFlagFile(msg);
        break;

      case XIMCommand.JH_20:
      case XIMCommand.QUICK_KEY:
        this.handleQuickKey(msg);
        break;

      case XIMCommand.JH_CO:
        this.handleConsoleOutput(msg);
        break;

      case XIMCommand.JH_SO:
        this.handleSerialOutput(msg);
        break;

      case XIMCommand.GETKEY:
        this.handleGetKey(msg);
        break;

      case XIMCommand.JH_SHUTDOWN:
        this.handleShutdown(msg);
        break;

      // BBS Information commands (BB_*)
      case XIMCommand.JH_BBSNAME:
        this.handleBBSName(msg);
        break;

      case XIMCommand.JH_SYSOP:
        this.handleSysopName(msg);
        break;

      case XIMCommand.EXPRESS_VERSION:
        this.handleExpressVersion(msg);
        break;

      case XIMCommand.BB_NODEID:
        this.handleNodeID(msg);
        break;

      case XIMCommand.BB_CONFNAME:
      case XIMCommand.BB_CONFLOCAL:
      case XIMCommand.BB_LOCAL:
      case XIMCommand.BB_CONFNUM:
      case XIMCommand.BB_LOGONTYPE:
        this.handleBBSInfo(msg);
        break;

      case XIMCommand.BB_SCRWIDTH:
      case XIMCommand.BB_SCRHEIGHT:
      case XIMCommand.BB_SCRLEFT:
      case XIMCommand.BB_SCRTOP:
        this.handleScreenDimensions(msg);
        break;

      case XIMCommand.BB_PURGELINE:
      case XIMCommand.BB_PURGELINESTART:
      case XIMCommand.BB_PURGELINEEND:
        this.handlePurgeLine(msg);
        break;

      case XIMCommand.BB_NONSTOPTEXT:
        this.handleNonStopText(msg);
        break;

      case XIMCommand.BB_LINECOUNT:
        this.handleLineCount(msg);
        break;

      case XIMCommand.BB_PCONFNAME:
      case XIMCommand.BB_PCONFLOCAL:
        this.handlePConf(msg);
        break;

      case XIMCommand.BB_MAINLINE:
        this.handleMainLine(msg);
        break;

      case XIMCommand.BB_CALLERSLOG:
        this.handleCallersLog(msg);
        break;

      case XIMCommand.BB_UDLOG:
        this.handleUDLog(msg);
        break;

      case XIMCommand.BB_TASKPRI:
        this.handleTaskPri(msg);
        break;

      case XIMCommand.BB_CHATFLAG:
      case XIMCommand.BB_CHATSET:
        this.handleChat(msg);
        break;

      case XIMCommand.BB_DROPDTR:
        this.handleDropDTR(msg);
        break;

      case XIMCommand.BB_GETTASK:
        this.handleGetTask(msg);
        break;

      // System commands
      case XIMCommand.RAWARROW:
        this.handleRawArrow(msg);
        break;

      case XIMCommand.RETURNCOMMAND:
      case XIMCommand.RETURNCOMMAND2:
        this.handleReturnCommand(msg);
        break;

      case XIMCommand.CHAIN:
        this.handleChain(msg);
        break;

      case XIMCommand.ENVSTAT:
        this.handleEnvStat(msg);
        break;

      case XIMCommand.SV_NEWMSG:
        this.handleSvNewMsg(msg);
        break;

      case XIMCommand.PRV_COMMAND:
        this.handlePrvCommand(msg);
        break;

      case XIMCommand.PRV_GROUP:
        this.handlePrvGroup(msg);
        break;

      // Data query commands (DT_*)
      case XIMCommand.DT_NAME:
      case XIMCommand.DT_PASSWORD:
      case XIMCommand.DT_LOCATION:
      case XIMCommand.DT_PHONENUMBER:
      case XIMCommand.DT_REALNAME:
      case XIMCommand.DT_SLOTNUMBER:
      case XIMCommand.DT_SECSTATUS:
      case XIMCommand.DT_SECBOARD:
      case XIMCommand.DT_SECLIBRARY:
      case XIMCommand.DT_SECBULLETIN:
      case XIMCommand.DT_TIMELIMIT:
      case XIMCommand.DT_LINELENGTH:
      case XIMCommand.DT_EXPERT:
      case XIMCommand.DT_MESSAGESPOSTED:
      case XIMCommand.DT_UPLOADS:
      case XIMCommand.DT_DOWNLOADS:
      case XIMCommand.DT_TIMESCALLED:
      case XIMCommand.DT_TIMELASTON:
      case XIMCommand.DT_TIMEUSED:
      case XIMCommand.DT_TIMETOTAL:
      case XIMCommand.DT_BYTESUPLOAD:
      case XIMCommand.DT_BYTEDOWNLOAD:
      case XIMCommand.DT_DAILYBYTELIMIT:
      case XIMCommand.DT_DAILYBYTEDLD:
      case XIMCommand.DT_TIMEOUT:
      case XIMCommand.DT_DUMP:
      case XIMCommand.DT_MSGCODE:
      case XIMCommand.DT_FILECODE:
      case XIMCommand.DT_LANGUAGE:
      case XIMCommand.DT_QUICKFLAG:
      case XIMCommand.DT_GOODFILE:
      case XIMCommand.DT_ANSICOLOR:
      case XIMCommand.DT_ISANSI:
      case XIMCommand.DT_STAMP_LASTON:
      case XIMCommand.DT_STAMP_CTIME:
      case XIMCommand.DT_CURR_TIME:
      case XIMCommand.DT_CONFACCESS:
      case XIMCommand.DT_ADDBIT:
      case XIMCommand.DT_REMBIT:
      case XIMCommand.DT_QUERYBIT:
      case XIMCommand.ACTIVE_NODES:
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

    console.log('[XIMProtocol] Door requesting line input');

    // Display prompt if provided
    if (promptAddr !== 0) {
      const prompt = this.readString(promptAddr);
      if (prompt.length > 0) {
        console.log(`[XIMProtocol] Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    // Don't reply immediately - wait for user to type line and press Enter
    console.log('[XIMProtocol] Waiting for user to type line and press Enter...');
    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';

    // Reply will be sent when user presses Enter (via completeLineInput)
  }

  /**
   * Complete line input and send reply to door
   * Called when user presses Enter while waiting for line input
   */
  private completeLineInput(): void {
    if (!this.lineInputMessage) {
      console.log('[XIMProtocol] ERROR: completeLineInput called but no pending message!');
      return;
    }

    const msg = this.lineInputMessage;
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 22 + 4); // Get string pointer

    console.log(`[XIMProtocol] Completing line input with: "${this.lineInputBuffer}"`);

    if (stringAddr !== 0) {
      // Write the buffered line to memory
      for (let i = 0; i < this.lineInputBuffer.length; i++) {
        this.emulator.writeMemory(stringAddr + i, this.lineInputBuffer.charCodeAt(i));
      }
      // Null terminate
      this.emulator.writeMemory(stringAddr + this.lineInputBuffer.length, 0);

      console.log(`[XIMProtocol] Wrote ${this.lineInputBuffer.length} characters to memory at 0x${stringAddr.toString(16)}`);
    }

    // Reply with success (1)
    this.sendReply(msg, 1);

    // Reset state
    this.waitingForLineInput = false;
    this.lineInputMessage = null;
    this.lineInputBuffer = '';

    console.log('[XIMProtocol] Line input completed, waiting for next command');
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
      console.log(`🔊 [XIM OUTPUT] Emitting ${text.length} chars: "${text.substring(0, 80)}"`);
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
   * Handle JH_SM (Send Message)
   *
   * From E sources (express.e:3406-3411):
   * - CASE JH_SM
   * - aePuts(msg.string)
   * - IF msg.data
   * -   aePuts('\b\n')
   * -   checkForPause()
   *
   * Protocol:
   * - msg.string (offset 26) = pointer to string to display
   * - msg.data = if non-zero, add newline and check for pause
   */
  private handleSendMessage(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr === 0) {
      console.log('[XIMProtocol] JH_SM: No string address provided');
      this.sendReply(msg, 0);
      return;
    }

    const text = this.readString(stringAddr);
    console.log(`[XIMProtocol] JH_SM: "${text}"`);

    // Send text to terminal
    this.socket.emit('ansi-output', text);

    // If msg.data is non-zero, add newline and check for pause
    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
      // TODO: checkForPause() - implement pause checking
      console.log('[XIMProtocol] JH_SM: Added newline (msg.data non-zero)');
    }

    // Reply with success
    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SMPTR (Send Message Pointer)
   *
   * From E sources (express.e:3412-3417):
   * - CASE JH_SMPTR
   * - aePuts(msg.strptr)
   * - IF msg.data
   * -   aePuts('\b\n')
   * -   checkForPause()
   *
   * Same as JH_SM but uses msg.strptr instead of msg.string
   * In our implementation, they work the same way
   */
  private handleSendMessagePointer(msg: XIMMessage): void {
    // Same implementation as JH_SM - both use string pointer
    this.handleSendMessage(msg);
  }

  /**
   * Handle JH_PM (Prompt Message)
   *
   * From E sources (express.e:3418-3424):
   * - CASE JH_PM
   * - IF(lineInput(msg.string,'',msg.data,doorTimeout,tempstring)<>RESULT_SUCCESS)
   * -   msg.data:=-1
   * - ELSE
   * -   msg.data:=1
   * -   AstrCopy(msg.string,tempstring,200)
   *
   * Protocol:
   * - msg.string = prompt to display
   * - msg.data = max length for input
   * - Response: msg.data=1 (success) or -1 (timeout/failure)
   * - Response: msg.string = the input line
   *
   * Similar to JH_LI but displays a prompt first
   */
  private handlePromptMessage(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const maxLength = msg.data;

    console.log('[XIMProtocol] JH_PM: Prompt message with line input');

    // Display prompt if provided
    if (stringAddr !== 0) {
      const prompt = this.readString(stringAddr);
      if (prompt.length > 0) {
        console.log(`[XIMProtocol] JH_PM: Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    // Wait for line input (same as JH_LI)
    console.log(`[XIMProtocol] JH_PM: Waiting for user input (max ${maxLength} chars)...`);
    this.waitingForLineInput = true;
    this.lineInputMessage = msg;
    this.lineInputBuffer = '';

    // Reply will be sent when user presses Enter
  }

  /**
   * Handle JH_HK (Hotkey)
   *
   * From E sources (express.e:3436-3447):
   * - CASE JH_HK
   * - lineCount:=0
   * - aePuts(msg.string)
   * - ch:=readChar(doorTimeout)
   * - IF (ch<0)
   * -   msg.data:=-1
   * - ELSE
   * -   msg.data:=1
   * - ENDIF
   * - msg.string[0]:=ch
   * - msg.string[1]:=0
   * - msg.command:=ximPort
   *
   * Protocol:
   * - msg.string = prompt to display
   * - Waits for single character input
   * - Response: msg.data=1 (got key) or -1 (timeout)
   * - Response: msg.string[0] = character pressed
   * - Response: msg.command = ximPort (1=console, 2=serial)
   */
  private handleHotkey(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMProtocol] JH_HK: Hotkey input request');

    // Display prompt if provided
    if (stringAddr !== 0) {
      const prompt = this.readString(stringAddr);
      if (prompt.length > 0) {
        console.log(`[XIMProtocol] JH_HK: Prompt: "${prompt}"`);
        this.socket.emit('ansi-output', prompt);
      }
    }

    // Check if we have queued input
    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      console.log(`[XIMProtocol] JH_HK: Got hotkey '${char}' (0x${charCode.toString(16)})`);

      // Write character to msg.string
      if (stringAddr !== 0) {
        this.emulator.writeMemory(stringAddr, charCode);
        this.emulator.writeMemory(stringAddr + 1, 0); // Null terminator
      }

      // Update msg.command with ximPort (1 = console)
      this.emulator.writeMemory16(msg.msgAddr + 20, 1);

      // Reply with success (1)
      this.sendReply(msg, 1);
    } else {
      // No input available - timeout
      console.log('[XIMProtocol] JH_HK: No input available (timeout)');

      // Reply with timeout (-1)
      this.sendReply(msg, -1);
    }
  }

  /**
   * Handle JH_CO (Console Output)
   *
   * From E sources (express.e:3395-3400):
   * - CASE JH_CO
   * - conPuts(msg.string,-1)
   * - IF msg.data
   * -   conPuts('\b\n',-1)
   * -   checkForPause()
   *
   * Protocol:
   * - msg.string = text to output to console
   * - msg.data = if non-zero, add newline and check for pause
   * - Console output (not serial)
   */
  private handleConsoleOutput(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr === 0) {
      console.log('[XIMProtocol] JH_CO: No string address provided');
      this.sendReply(msg, 0);
      return;
    }

    const text = this.readString(stringAddr);
    console.log(`[XIMProtocol] JH_CO (Console): "${text}"`);

    // Send to terminal (console output)
    this.socket.emit('ansi-output', text);

    // If msg.data is non-zero, add newline and check for pause
    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
      console.log('[XIMProtocol] JH_CO: Added newline');
    }

    // Reply with success
    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SO (Serial Output)
   *
   * From E sources (express.e:3401-3405):
   * - CASE JH_SO
   * - serPuts(msg.string,-1)
   * - IF msg.data
   * -   serPuts('\b\n',-1)
   *
   * Protocol:
   * - msg.string = text to output to serial port
   * - msg.data = if non-zero, add newline
   * - Serial output (not console)
   * - In web version, we treat this same as console output
   */
  private handleSerialOutput(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr === 0) {
      console.log('[XIMProtocol] JH_SO: No string address provided');
      this.sendReply(msg, 0);
      return;
    }

    const text = this.readString(stringAddr);
    console.log(`[XIMProtocol] JH_SO (Serial): "${text}"`);

    // In web version, serial and console output both go to terminal
    this.socket.emit('ansi-output', text);

    // If msg.data is non-zero, add newline
    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
      console.log('[XIMProtocol] JH_SO: Added newline');
    }

    // Reply with success
    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_BBSNAME (Get BBS Name)
   *
   * From E sources (express.e:3486-3487):
   * - CASE JH_BBSNAME
   * - AstrCopy(msg.string,cmds.bbsName,41)
   */
  private handleBBSName(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const bbsName = this.bbsSession?.bbsName || 'AmiExpress-Web';

    console.log(`[XIMProtocol] JH_BBSNAME: "${bbsName}"`);

    if (stringAddr !== 0) {
      this.writeString(stringAddr, bbsName, 41);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SYSOP (Get Sysop Name)
   *
   * From E sources (express.e:3488-3489):
   * - CASE JH_SYSOP
   * - AstrCopy(msg.string,cmds.sysopName,41)
   */
  private handleSysopName(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const sysopName = this.bbsSession?.sysopName || 'Sysop';

    console.log(`[XIMProtocol] JH_SYSOP: "${sysopName}"`);

    if (stringAddr !== 0) {
      this.writeString(stringAddr, sysopName, 41);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle EXPRESS_VERSION (Get BBS Version)
   *
   * From E sources (express.e:3808-3810):
   * - CASE EXPRESS_VERSION
   * - getExpressMajorVer(tempstring)
   * - AstrCopy(msg.string,tempstring,200)
   */
  private handleExpressVersion(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const version = 'AmiExpress-Web v1.0';

    console.log(`[XIMProtocol] EXPRESS_VERSION: "${version}"`);

    if (stringAddr !== 0) {
      this.writeString(stringAddr, version, 200);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle BB_NODEID (Get Node ID)
   *
   * From E sources (express.e:3801-3803):
   * - CASE BB_NODEID
   * - StringF(tempstring,'\d',node)
   * - AstrCopy(msg.string,tempstring,200)
   */
  private handleNodeID(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const nodeId = this.bbsSession?.nodeId || 0;

    console.log(`[XIMProtocol] BB_NODEID: ${nodeId}`);

    if (stringAddr !== 0) {
      this.writeString(stringAddr, nodeId.toString(), 200);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle BB_* BBS Info commands
   */
  private handleBBSInfo(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    let value = '';

    switch (msg.command) {
      case XIMCommand.BB_CONFNAME:
        // Conference name
        value = this.bbsSession?.conferenceName || 'Main';
        console.log(`[XIMProtocol] BB_CONFNAME: "${value}"`);
        break;

      case XIMCommand.BB_CONFLOCAL:
        // Conference local path
        value = this.bbsSession?.conferencePath || '/BBS/Conf01';
        console.log(`[XIMProtocol] BB_CONFLOCAL: "${value}"`);
        break;

      case XIMCommand.BB_LOCAL:
        // BBS local path
        value = this.bbsSession?.bbsPath || '/BBS';
        console.log(`[XIMProtocol] BB_LOCAL: "${value}"`);
        break;

      case XIMCommand.BB_CONFNUM:
        // Conference number
        value = (this.bbsSession?.conferenceId || 1).toString();
        console.log(`[XIMProtocol] BB_CONFNUM: ${value}`);
        break;

      case XIMCommand.BB_LOGONTYPE:
        // Logon type (0=off, 1=sysop, 2=local, 3=remote)
        const logonType = this.bbsSession?.logonType || 3;
        console.log(`[XIMProtocol] BB_LOGONTYPE: ${logonType}`);
        // Reply in msg.data, not msg.string
        this.sendReply(msg, logonType);
        return;
    }

    if (stringAddr !== 0 && value) {
      this.writeString(stringAddr, value, 200);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle RAWARROW (Toggle Raw Arrow Keys)
   *
   * From E sources (express.e:3814-3815):
   * - CASE RAWARROW
   * - IF(rawArrow) THEN rawArrow:=FALSE ELSE rawArrow:=TRUE
   */
  private handleRawArrow(msg: XIMMessage): void {
    // Toggle raw arrow key mode
    // In web version, we always process arrow keys
    console.log('[XIMProtocol] RAWARROW: Toggle raw arrow mode (no-op in web)');
    this.sendReply(msg, 1);
  }

  /**
   * Handle RETURNCOMMAND / RETURNCOMMAND2 (Return Command to BBS)
   *
   * From E sources (express.e:3492-3493, 4064-4065):
   * - CASE RETURNCOMMAND
   * - StrCopy(runOnExit,msg.string,200)
   *
   * Door can tell BBS to run a command after door exits
   */
  private handleReturnCommand(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    if (stringAddr !== 0) {
      const command = this.readString(stringAddr, 200);
      console.log(`[XIMProtocol] RETURNCOMMAND: "${command}"`);

      // Store command to run after door exits
      // TODO: Pass this to door manager
      this.bbsSession.returnCommand = command;
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle CHAIN (Chain to Another Door)
   *
   * From E sources (express.e:3386-3387):
   * - CASE CHAIN
   * - nodesPtr[]:=nodesPtr[]-1
   *
   * Door wants to exit and chain to another door
   */
  private handleChain(msg: XIMMessage): void {
    console.log('[XIMProtocol] CHAIN: Door requesting chain to another door');

    // Decrement node count (door is exiting)
    // Reply with success
    this.sendReply(msg, 1);

    // Door will shutdown after this
  }

  /**
   * Handle data query (user info, time remaining, etc)
   *
   * From E sources (express.e:3494-3981):
   * Protocol:
   * - msg.data = direction flag:
   *   - IF msg.data != 0: READ mode - copy user data TO msg.string (door is reading)
   *   - IF msg.data == 0: WRITE mode - copy msg.string TO user data (door is writing)
   * - msg.string (offset 26) = pointer to string buffer in memory
   * - For numeric values: convert to/from string format
   */
  private handleDataQuery(msg: XIMMessage): void {
    console.log(`[XIMProtocol] Door querying data: ${this.getCommandName(msg.command)}`);
    console.log(`  msg.data (direction): ${msg.data} (${msg.data !== 0 ? 'READ' : 'WRITE'})`);

    // Read string pointer from message (offset 26 in jhMessage structure)
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    console.log(`  String address: 0x${stringAddr.toString(16)}`);

    const isRead = msg.data !== 0;
    const user = this.bbsSession?.user;

    switch (msg.command) {
      case XIMCommand.DT_NAME:
        // User's username (31 bytes max)
        if (isRead) {
          const username = user?.username || 'Guest';
          this.writeString(stringAddr, username, 31);
          console.log(`  [READ] DT_NAME: "${username}"`);
        } else {
          const newName = this.readString(stringAddr, 31);
          if (user) user.username = newName;
          console.log(`  [WRITE] DT_NAME: "${newName}"`);
        }
        break;

      case XIMCommand.DT_PASSWORD:
        // Password - E sources: never allow doors to grab password
        if (isRead) {
          this.writeString(stringAddr, '', 40);
          console.log(`  [READ] DT_PASSWORD: (blocked - security)`);
        } else {
          // Door setting new password - we'd need to hash it
          console.log(`  [WRITE] DT_PASSWORD: (not implemented - needs hashing)`);
        }
        break;

      case XIMCommand.DT_LOCATION:
        // User's location (30 bytes max)
        if (isRead) {
          const location = user?.location || 'Unknown';
          this.writeString(stringAddr, location, 30);
          console.log(`  [READ] DT_LOCATION: "${location}"`);
        } else {
          const newLocation = this.readString(stringAddr, 30);
          if (user) user.location = newLocation;
          console.log(`  [WRITE] DT_LOCATION: "${newLocation}"`);
        }
        break;

      case XIMCommand.DT_PHONENUMBER:
        // User's phone number (13 bytes max)
        if (isRead) {
          const phone = user?.phone || '';
          this.writeString(stringAddr, phone, 13);
          console.log(`  [READ] DT_PHONENUMBER: "${phone}"`);
        } else {
          const newPhone = this.readString(stringAddr, 13);
          if (user) user.phone = newPhone;
          console.log(`  [WRITE] DT_PHONENUMBER: "${newPhone}"`);
        }
        break;

      case XIMCommand.DT_REALNAME:
        // User's real name (26 bytes max)
        if (isRead) {
          const realname = user?.realname || '';
          this.writeString(stringAddr, realname, 26);
          console.log(`  [READ] DT_REALNAME: "${realname}"`);
        } else {
          const newRealname = this.readString(stringAddr, 26);
          if (user) user.realname = newRealname;
          console.log(`  [WRITE] DT_REALNAME: "${newRealname}"`);
        }
        break;

      case XIMCommand.DT_SLOTNUMBER:
        // User's slot/account number
        if (isRead) {
          const slotNum = user?.id || 1;
          this.writeString(stringAddr, slotNum.toString(), 200);
          console.log(`  [READ] DT_SLOTNUMBER: ${slotNum}`);
        } else {
          const newSlot = parseInt(this.readString(stringAddr, 200));
          if (user) user.id = newSlot;
          console.log(`  [WRITE] DT_SLOTNUMBER: ${newSlot}`);
        }
        break;

      case XIMCommand.DT_SECSTATUS:
        // Security level / Access level
        if (isRead) {
          const secLevel = user?.secLevel || 10;
          this.writeString(stringAddr, secLevel.toString(), 200);
          console.log(`  [READ] DT_SECSTATUS: ${secLevel}`);
        } else {
          const newLevel = parseInt(this.readString(stringAddr, 200));
          if (user) user.secLevel = newLevel;
          console.log(`  [WRITE] DT_SECSTATUS: ${newLevel}`);
        }
        break;

      case XIMCommand.DT_TIMELIMIT:
        // Time limit in minutes
        if (isRead) {
          const timeLimit = user?.timeLimit || 60;
          this.writeString(stringAddr, timeLimit.toString(), 200);
          console.log(`  [READ] DT_TIMELIMIT: ${timeLimit}`);
        } else {
          const newLimit = parseInt(this.readString(stringAddr, 200));
          if (user) user.timeLimit = newLimit;
          console.log(`  [WRITE] DT_TIMELIMIT: ${newLimit}`);
        }
        break;

      case XIMCommand.DT_LINELENGTH:
        // Terminal line length (80 columns standard)
        if (isRead) {
          const lineLen = 80;
          this.writeString(stringAddr, lineLen.toString(), 200);
          console.log(`  [READ] DT_LINELENGTH: ${lineLen}`);
        } else {
          const newLen = parseInt(this.readString(stringAddr, 200));
          console.log(`  [WRITE] DT_LINELENGTH: ${newLen}`);
        }
        break;

      case XIMCommand.DT_EXPERT:
        // Expert mode (Y/N character)
        if (isRead) {
          const expert = user?.expert ? 'Y' : 'N';
          this.writeString(stringAddr, expert, 200);
          console.log(`  [READ] DT_EXPERT: ${expert}`);
        } else {
          const expertStr = this.readString(stringAddr, 1);
          if (user) user.expert = (expertStr === 'Y' || expertStr === 'y');
          console.log(`  [WRITE] DT_EXPERT: ${expertStr}`);
        }
        break;

      case XIMCommand.DT_MESSAGESPOSTED:
        if (isRead) {
          const msgs = user?.messagesPosted || 0;
          this.writeString(stringAddr, msgs.toString(), 200);
          console.log(`  [READ] DT_MESSAGESPOSTED: ${msgs}`);
        }
        break;

      case XIMCommand.DT_UPLOADS:
        if (isRead) {
          const uploads = user?.uploads || 0;
          this.writeString(stringAddr, uploads.toString(), 200);
          console.log(`  [READ] DT_UPLOADS: ${uploads}`);
        }
        break;

      case XIMCommand.DT_DOWNLOADS:
        if (isRead) {
          const downloads = user?.downloads || 0;
          this.writeString(stringAddr, downloads.toString(), 200);
          console.log(`  [READ] DT_DOWNLOADS: ${downloads}`);
        }
        break;

      case XIMCommand.DT_TIMESCALLED:
        if (isRead) {
          const calls = user?.timesCalled || 0;
          this.writeString(stringAddr, calls.toString(), 200);
          console.log(`  [READ] DT_TIMESCALLED: ${calls}`);
        }
        break;

      case XIMCommand.DT_TIMELASTON:
        if (isRead) {
          const lastOn = user?.lastLoginAt ? Math.floor(new Date(user.lastLoginAt).getTime() / 1000) : 0;
          this.writeString(stringAddr, lastOn.toString(), 200);
          console.log(`  [READ] DT_TIMELASTON: ${lastOn}`);
        }
        break;

      case XIMCommand.DT_TIMEUSED:
        if (isRead) {
          const timeUsed = user?.timeUsed || 0;
          this.writeString(stringAddr, timeUsed.toString(), 200);
          console.log(`  [READ] DT_TIMEUSED: ${timeUsed}`);
        }
        break;

      case XIMCommand.DT_TIMETOTAL:
        if (isRead) {
          const timeTotal = user?.timeTotal || 0;
          this.writeString(stringAddr, timeTotal.toString(), 200);
          console.log(`  [READ] DT_TIMETOTAL: ${timeTotal}`);
        }
        break;

      case XIMCommand.DT_HOSTNAME:
        if (isRead) {
          const hostname = this.bbsSession?.hostname || 'localhost';
          this.writeString(stringAddr, hostname, 200);
          console.log(`  [READ] DT_HOSTNAME: "${hostname}"`);
        }
        break;

      case XIMCommand.DT_HOSTIP:
        if (isRead) {
          const hostip = this.bbsSession?.hostip || '127.0.0.1';
          this.writeString(stringAddr, hostip, 200);
          console.log(`  [READ] DT_HOSTIP: "${hostip}"`);
        }
        break;

      // Security commands
      case XIMCommand.DT_SECBOARD:
        if (isRead) {
          const secBoard = user?.secBoard || 0;
          this.writeString(stringAddr, secBoard.toString(), 200);
          console.log(`  [READ] DT_SECBOARD: ${secBoard}`);
        } else {
          const newSec = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secBoard = newSec;
          console.log(`  [WRITE] DT_SECBOARD: ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECLIBRARY:
        if (isRead) {
          const secLibrary = user?.secLibrary || 0;
          this.writeString(stringAddr, secLibrary.toString(), 200);
          console.log(`  [READ] DT_SECLIBRARY: ${secLibrary}`);
        } else {
          const newSec = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secLibrary = newSec;
          console.log(`  [WRITE] DT_SECLIBRARY: ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECBULLETIN:
        if (isRead) {
          const secBulletin = user?.secBulletin || 0;
          this.writeString(stringAddr, secBulletin.toString(), 200);
          console.log(`  [READ] DT_SECBULLETIN: ${secBulletin}`);
        } else {
          const newSec = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newSec)) user.secBulletin = newSec;
          console.log(`  [WRITE] DT_SECBULLETIN: ${newSec}`);
        }
        break;

      // Byte counts
      case XIMCommand.DT_BYTESUPLOAD:
        if (isRead) {
          const bytesUp = user?.bytesUpload || 0;
          this.writeString(stringAddr, bytesUp.toString(), 200);
          console.log(`  [READ] DT_BYTESUPLOAD: ${bytesUp}`);
        } else {
          const newBytes = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newBytes)) user.bytesUpload = newBytes;
          console.log(`  [WRITE] DT_BYTESUPLOAD: ${newBytes}`);
        }
        break;

      case XIMCommand.DT_BYTEDOWNLOAD:
        if (isRead) {
          const bytesDown = user?.bytesDownload || 0;
          this.writeString(stringAddr, bytesDown.toString(), 200);
          console.log(`  [READ] DT_BYTEDOWNLOAD: ${bytesDown}`);
        } else {
          const newBytes = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newBytes)) user.bytesDownload = newBytes;
          console.log(`  [WRITE] DT_BYTEDOWNLOAD: ${newBytes}`);
        }
        break;

      case XIMCommand.DT_DAILYBYTELIMIT:
        if (isRead) {
          const limit = user?.dailyBytesLimit || 0;
          this.writeString(stringAddr, limit.toString(), 200);
          console.log(`  [READ] DT_DAILYBYTELIMIT: ${limit}`);
        } else {
          const newLimit = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newLimit)) user.dailyBytesLimit = newLimit;
          console.log(`  [WRITE] DT_DAILYBYTELIMIT: ${newLimit}`);
        }
        break;

      case XIMCommand.DT_DAILYBYTEDLD:
        if (isRead) {
          const dailyDld = user?.dailyBytesDld || 0;
          this.writeString(stringAddr, dailyDld.toString(), 200);
          console.log(`  [READ] DT_DAILYBYTEDLD: ${dailyDld}`);
        } else {
          const newDld = parseInt(this.readString(stringAddr));
          if (user && !isNaN(newDld)) user.dailyBytesDld = newDld;
          console.log(`  [WRITE] DT_DAILYBYTEDLD: ${newDld}`);
        }
        break;

      // Timestamps
      case XIMCommand.DT_STAMP_LASTON:
        if (isRead) {
          const stampLastOn = user?.lastLoginAt ? new Date(user.lastLoginAt).toISOString() : '';
          this.writeString(stringAddr, stampLastOn, 200);
          console.log(`  [READ] DT_STAMP_LASTON: "${stampLastOn}"`);
        }
        break;

      case XIMCommand.DT_STAMP_CTIME:
        if (isRead) {
          const now = new Date().toISOString();
          this.writeString(stringAddr, now, 200);
          console.log(`  [READ] DT_STAMP_CTIME: "${now}"`);
        }
        break;

      case XIMCommand.DT_CURR_TIME:
        if (isRead) {
          const currTime = Math.floor(Date.now() / 1000);
          this.writeString(stringAddr, currTime.toString(), 200);
          console.log(`  [READ] DT_CURR_TIME: ${currTime}`);
        }
        break;

      // Configuration
      case XIMCommand.DT_TIMEOUT:
        if (isRead) {
          const timeout = 300; // 5 minutes default
          this.writeString(stringAddr, timeout.toString(), 200);
          console.log(`  [READ] DT_TIMEOUT: ${timeout}`);
        }
        break;

      case XIMCommand.DT_CONFACCESS:
        if (isRead) {
          const confAccess = user?.confAccess || '';
          this.writeString(stringAddr, confAccess, 10);
          console.log(`  [READ] DT_CONFACCESS: "${confAccess}"`);
        } else {
          const newAccess = this.readString(stringAddr, 10);
          if (user) user.confAccess = newAccess;
          console.log(`  [WRITE] DT_CONFACCESS: "${newAccess}"`);
        }
        break;

      case XIMCommand.DT_LANGUAGE:
        if (isRead) {
          const language = user?.language || 'txt';
          this.writeString(stringAddr, language, 200);
          console.log(`  [READ] DT_LANGUAGE: "${language}"`);
        }
        break;

      case XIMCommand.DT_ANSICOLOR:
      case XIMCommand.DT_ISANSI:
        if (isRead) {
          const isAnsi = user?.ansi || true;
          this.writeString(stringAddr, isAnsi ? '1' : '0', 200);
          console.log(`  [READ] ${this.getCommandName(msg.command)}: ${isAnsi}`);
        }
        break;

      // Flags and codes
      case XIMCommand.DT_MSGCODE:
        // Message code flag (used by doors)
        this.emulator.writeMemory32(msg.msgAddr + 22, 0);
        console.log('  DT_MSGCODE: 0');
        break;

      case XIMCommand.DT_FILECODE:
        // File code flag (used by doors)
        this.emulator.writeMemory32(msg.msgAddr + 22, 0);
        console.log('  DT_FILECODE: 0');
        break;

      case XIMCommand.DT_QUICKFLAG:
      case XIMCommand.DT_GOODFILE:
        if (isRead) {
          this.writeString(stringAddr, '0', 200);
          console.log(`  [READ] ${this.getCommandName(msg.command)}: 0`);
        }
        break;

      case XIMCommand.DT_DUMP:
        // Dump active user data (for debugging)
        if (isRead) {
          const dumpData = JSON.stringify(user || {}, null, 2);
          this.writeString(stringAddr, dumpData, 200);
          console.log(`  [READ] DT_DUMP: User data dumped`);
        }
        break;

      case XIMCommand.ACTIVE_NODES:
        if (isRead) {
          // Return list of active nodes (32 chars, 'X' = active, ' ' = inactive)
          const nodes = '                                '; // 32 spaces
          // TODO: Query actual active nodes
          this.writeString(stringAddr, nodes, 32);
          console.log('  [READ] ACTIVE_NODES: (all inactive)');
        }
        break;

      // Security bit operations
      case XIMCommand.DT_ADDBIT:
      case XIMCommand.DT_REMBIT:
      case XIMCommand.DT_QUERYBIT:
        // TODO: Implement security bit operations
        console.log(`  [TODO] ${this.getCommandName(msg.command)}`);
        this.emulator.writeMemory32(msg.msgAddr + 22, 0);
        break;

      default:
        console.log(`  [UNHANDLED] ${this.getCommandName(msg.command)}`);
    }

    // Reply with success (1)
    this.sendReply(msg, 1);
  }

  /**
   * Handle extended hotkey (JH_ExtHK)
   * From E sources (express.e:3432-3435):
   * - CASE JH_ExtHK
   * - lineCount:=0
   * - msg.command:=readChar(doorTimeout,Shl(1,msg.signal))
   * - IF (msg.command<0) THEN msg.data:=-1 ELSE msg.data:=1
   *
   * Extended hotkey with signal mask support
   * msg.signal contains the signal number to monitor
   */
  private handleExtendedHotkey(msg: XIMMessage): void {
    console.log('[XIMProtocol] JH_ExtHK - Extended hotkey with signal');

    // Check if we have input available
    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      // Set msg.command to the character code
      this.emulator.writeMemory16(msg.msgAddr + 20, charCode);
      // Set msg.data to 1 (success)
      this.emulator.writeMemory32(msg.msgAddr + 22, 1);

      console.log(`  [READ] Extended hotkey: '${char}' (code ${charCode})`);
    } else {
      // Timeout - no input available
      this.emulator.writeMemory16(msg.msgAddr + 20, -1);
      this.emulator.writeMemory32(msg.msgAddr + 22, -1);

      console.log('  [TIMEOUT] No input available');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle fetch key (JH_FetchKey)
   * From E sources (express.e:3465-3472):
   * - IF checkInput()
   * -   msg.command:=readChar(doorTimeout)
   * -   IF (msg.command<0) THEN msg.data:=-1 ELSE msg.data:=1
   * - ELSE
   * -   msg.command:=0
   * -   msg.data:=1
   *
   * Non-blocking key check - returns immediately
   */
  private handleFetchKey(msg: XIMMessage): void {
    console.log('[XIMProtocol] JH_FetchKey - Non-blocking key check');

    if (this.inputQueue.length > 0) {
      // Input available - read it
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      this.emulator.writeMemory16(msg.msgAddr + 20, charCode);
      this.emulator.writeMemory32(msg.msgAddr + 22, 1);

      console.log(`  [READ] Key available: '${char}' (code ${charCode})`);
    } else {
      // No input - return 0
      this.emulator.writeMemory16(msg.msgAddr + 20, 0);
      this.emulator.writeMemory32(msg.msgAddr + 22, 1);

      console.log('  [NO INPUT] No key available');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle signal bit query (JH_SIGBIT)
   * From E sources (express.e:3463-3464):
   * - CASE JH_SIGBIT
   * - msg.data:=doorExtSig
   *
   * Returns the current door signal bits
   */
  private handleSignalBit(msg: XIMMessage): void {
    console.log('[XIMProtocol] JH_SIGBIT - Query signal bits');

    // Return signal bits (0 for now - no signals pending)
    this.emulator.writeMemory32(msg.msgAddr + 22, 0);

    this.sendReply(msg, 1);
  }

  /**
   * Handle MCI processing (JH_MCI)
   * From E sources (express.e:3456-3462):
   * - CASE JH_MCI
   * - StrCopy(tempstring,msg.string)
   * - processMci(tempstring)
   * - IF msg.data
   * -   aePuts('\b\n')
   * -   checkForPause()
   *
   * Process MCI codes in string and display
   * msg.data: if non-zero, add CR/LF and check for pause
   */
  private handleMCI(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const text = this.readString(stringAddr);

    console.log('[XIMProtocol] JH_MCI - Process MCI codes');
    console.log(`  Text: "${text}"`);

    // For now, just output the text without MCI processing
    // TODO: Implement full MCI code processing (colors, variables, etc.)
    this.socket.emit('ansi-output', text);

    // If msg.data is non-zero, add CR/LF
    if (msg.data !== 0) {
      this.socket.emit('ansi-output', '\r\n');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle security screen display (JH_SG)
   * From E sources (express.e:3473-3474):
   * - IF (findSecurityScreen(msg.string,tempstring)) THEN displayFile(tempstring)
   *
   * Display a security-level specific screen file
   */
  private handleSecurityScreen(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const screenName = this.readString(stringAddr);

    console.log('[XIMProtocol] JH_SG - Display security screen');
    console.log(`  Screen: "${screenName}"`);

    // TODO: Implement security screen lookup and display
    // For now, just acknowledge
    this.socket.emit('ansi-output', `\r\n[Security screen: ${screenName}]\r\n`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle show file (JH_SF)
   * From E sources (express.e:3475-3476):
   * - displayFile(msg.string)
   *
   * Display a file to the user
   */
  private handleShowFile(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const fileName = this.readString(stringAddr);

    console.log('[XIMProtocol] JH_SF - Show file');
    console.log(`  File: "${fileName}"`);

    // TODO: Implement file display
    // For now, just acknowledge
    this.socket.emit('ansi-output', `\r\n[Display file: ${fileName}]\r\n`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle edit file (JH_EF)
   * From E sources (express.e:3477-3485, 1145-1154):
   * - CASE JH_EF
   * - fileattach:=FALSE
   * - loadMsg(msg.string)
   * - IF(edit()=RESULT_SUCCESS)
   * -   saveMsg(msg.string)
   * -   msg.data:=1
   * - ELSE
   * -   msg.data:=-1
   *
   * Edit a message/file
   */
  private handleEditFile(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const fileName = this.readString(stringAddr);

    console.log('[XIMProtocol] JH_EF - Edit file');
    console.log(`  File: "${fileName}"`);

    // TODO: Implement file editing
    // For now, return success
    this.emulator.writeMemory32(msg.msgAddr + 22, 1);
    console.log('  [SUCCESS] File edit acknowledged');

    this.sendReply(msg, 1);
  }

  /**
   * Handle flag file (JH_FLAGFILE)
   * From E sources (express.e:3490-3491, 1160-1161):
   * - addFlagToList(msg.string)
   *
   * Add a file to the flagged files list
   */
  private handleFlagFile(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const fileName = this.readString(stringAddr);

    console.log('[XIMProtocol] JH_FLAGFILE - Flag file for download');
    console.log(`  File: "${fileName}"`);

    // TODO: Add to flagged files list
    console.log('  [TODO] Add to download queue');

    this.sendReply(msg, 1);
  }

  /**
   * Handle quick key (JH_20, QUICK_KEY)
   * From E sources (express.e:3448-3455):
   * - CASE JH_20 / QUICK_KEY
   * - ch:=readChar(doorTimeout)
   * - msg.data:=ch
   * - msg.command:=ximPort
   *
   * Quick key input with port indication
   */
  private handleQuickKey(msg: XIMMessage): void {
    console.log('[XIMProtocol] QUICK_KEY - Quick key input');

    if (this.inputQueue.length > 0) {
      const char = this.inputQueue.shift()!;
      const charCode = char.charCodeAt(0);

      // Set msg.data to character
      this.emulator.writeMemory32(msg.msgAddr + 22, charCode);
      // Set msg.command to ximPort (1 = console, 2 = serial)
      this.emulator.writeMemory16(msg.msgAddr + 20, 1); // Console

      console.log(`  [READ] Quick key: '${char}' (code ${charCode})`);
    } else {
      // Timeout
      this.emulator.writeMemory32(msg.msgAddr + 22, -1);
      this.emulator.writeMemory16(msg.msgAddr + 20, 1);

      console.log('  [TIMEOUT] No input available');
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle screen dimension queries (BB_SCRWIDTH, BB_SCRHEIGHT, BB_SCRLEFT, BB_SCRTOP)
   * From E sources (express.e:3861-3868):
   * - CASE BB_SCRLEFT: msg.data:=screen.leftedge
   * - CASE BB_SCRTOP: msg.data:=screen.topedge
   * - CASE BB_SCRWIDTH: msg.data:=screen.width
   * - CASE BB_SCRHEIGHT: msg.data:=screen.height
   */
  private handleScreenDimensions(msg: XIMMessage): void {
    console.log('[XIMProtocol] Screen dimension query');

    let value = 0;

    switch (msg.command) {
      case XIMCommand.BB_SCRWIDTH:
        value = 80; // Terminal width
        console.log('  BB_SCRWIDTH: 80');
        break;

      case XIMCommand.BB_SCRHEIGHT:
        value = 24; // Terminal height
        console.log('  BB_SCRHEIGHT: 24');
        break;

      case XIMCommand.BB_SCRLEFT:
        value = 0; // Left edge
        console.log('  BB_SCRLEFT: 0');
        break;

      case XIMCommand.BB_SCRTOP:
        value = 0; // Top edge
        console.log('  BB_SCRTOP: 0');
        break;
    }

    // Set msg.data to the dimension value
    this.emulator.writeMemory32(msg.msgAddr + 22, value);

    this.sendReply(msg, 1);
  }

  /**
   * Handle purge line (BB_PURGELINE, BB_PURGELINESTART, BB_PURGELINEEND)
   * From E sources (express.e:3869-3874):
   * - CASE BB_PURGELINE: purgeLine()
   * - CASE BB_PURGELINESTART: purgeLineStart()
   * - CASE BB_PURGELINEEND: purgeLineEnd()
   *
   * Clear current line or parts of it
   */
  private handlePurgeLine(msg: XIMMessage): void {
    console.log('[XIMProtocol] Purge line command');

    switch (msg.command) {
      case XIMCommand.BB_PURGELINE:
        // Clear entire line
        this.socket.emit('ansi-output', '\r\x1b[K');
        console.log('  BB_PURGELINE: Clear entire line');
        break;

      case XIMCommand.BB_PURGELINESTART:
        // Clear from start to cursor
        this.socket.emit('ansi-output', '\x1b[1K');
        console.log('  BB_PURGELINESTART: Clear to cursor');
        break;

      case XIMCommand.BB_PURGELINEEND:
        // Clear from cursor to end
        this.socket.emit('ansi-output', '\x1b[K');
        console.log('  BB_PURGELINEEND: Clear from cursor');
        break;
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle non-stop text flag (BB_NONSTOPTEXT)
   * From E sources (express.e:3875-3876):
   * - IF (msg.data=0) THEN nonStopDisplayFlag:=FALSE ELSE nonStopDisplayFlag:=TRUE
   *
   * Enable/disable pause prompts
   */
  private handleNonStopText(msg: XIMMessage): void {
    const enable = msg.data !== 0;

    console.log(`[XIMProtocol] BB_NONSTOPTEXT: ${enable ? 'Enable' : 'Disable'} non-stop text`);

    // TODO: Store this flag and use it to control pause prompts
    // For now, just acknowledge

    this.sendReply(msg, 1);
  }

  /**
   * Handle line count (BB_LINECOUNT)
   * From E sources (express.e:3877-3883):
   * - IF(msg.data)
   * -   StringF(tempstring,'\d',lineCount)
   * -   AstrCopy(msg.string,tempstring,200)
   * - ELSE
   * -   lineCount:=Val(msg.string)
   *
   * Get or set current line count for pause tracking
   */
  private handleLineCount(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMProtocol] BB_LINECOUNT');

    if (msg.data !== 0) {
      // READ - return current line count
      const lineCount = 0; // TODO: Track actual line count
      this.writeString(stringAddr, lineCount.toString(), 200);
      console.log(`  [READ] Line count: ${lineCount}`);
    } else {
      // WRITE - set line count
      const newCount = this.readString(stringAddr);
      console.log(`  [WRITE] Set line count: ${newCount}`);
      // TODO: Store this value
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle conference by number (BB_PCONFNAME, BB_PCONFLOCAL)
   * From E sources (express.e:3779-3793):
   * - Get conference name or location by number (1-9)
   */
  private handlePConf(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const confNum = parseInt(this.readString(stringAddr));

    console.log(`[XIMProtocol] ${msg.command === XIMCommand.BB_PCONFNAME ? 'BB_PCONFNAME' : 'BB_PCONFLOCAL'}`);
    console.log(`  Conference number: ${confNum}`);

    if (confNum < 1 || confNum > 9) {
      this.writeString(stringAddr, 'ERROR', 10);
      console.log('  [ERROR] Invalid conference number');
    } else {
      // TODO: Look up actual conference name/location
      const value = msg.command === XIMCommand.BB_PCONFNAME ? `Conference ${confNum}` : `/bbs/conf${confNum}`;
      this.writeString(stringAddr, value, 200);
      console.log(`  [RESULT] ${value}`);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle main line command (BB_MAINLINE)
   * From E sources (express.e:3794-3800):
   * - Return the current command and parameters
   */
  private handleMainLine(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMProtocol] BB_MAINLINE - Get main command line');

    // TODO: Return actual command and params from session
    const mainLine = this.bbsSession?.currentCommand || '';
    this.writeString(stringAddr, mainLine, 200);
    console.log(`  Command line: "${mainLine}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle callers log (BB_CALLERSLOG)
   * From E sources (express.e:3804-3805):
   * - Write to callers log file
   */
  private handleCallersLog(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const logText = this.readString(stringAddr);

    console.log('[XIMProtocol] BB_CALLERSLOG - Write to callers log');
    console.log(`  Log text: "${logText}"`);

    // TODO: Implement callers log writing
    this.sendReply(msg, 1);
  }

  /**
   * Handle UD log (BB_UDLOG)
   * From E sources (express.e:3806-3807):
   * - Write to upload/download log
   */
  private handleUDLog(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const logText = this.readString(stringAddr);

    console.log('[XIMProtocol] BB_UDLOG - Write to U/D log');
    console.log(`  Log text: "${logText}"`);

    // TODO: Implement U/D log writing
    this.sendReply(msg, 1);
  }

  /**
   * Handle task priority (BB_TASKPRI)
   * From E sources: Get/set task priority
   */
  private handleTaskPri(msg: XIMMessage): void {
    console.log('[XIMProtocol] BB_TASKPRI - Task priority query');

    // Return default priority (0)
    this.emulator.writeMemory32(msg.msgAddr + 22, 0);

    this.sendReply(msg, 1);
  }

  /**
   * Handle chat flag (BB_CHATFLAG, BB_CHATSET)
   * From E sources: Get/set chat availability
   */
  private handleChat(msg: XIMMessage): void {
    console.log(`[XIMProtocol] ${msg.command === XIMCommand.BB_CHATFLAG ? 'BB_CHATFLAG' : 'BB_CHATSET'} - Chat status`);

    if (msg.command === XIMCommand.BB_CHATFLAG) {
      // Return chat availability (0 = no chat pending)
      this.emulator.writeMemory32(msg.msgAddr + 22, 0);
      console.log('  Chat flag: 0 (no chat)');
    } else {
      // Set chat availability
      const chatEnabled = msg.data !== 0;
      console.log(`  Set chat: ${chatEnabled ? 'enabled' : 'disabled'}`);
      // TODO: Store chat flag
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle drop DTR (BB_DROPDTR)
   * From E sources (express.e:3834-3839):
   * - Drop carrier / hang up modem
   */
  private handleDropDTR(msg: XIMMessage): void {
    console.log('[XIMProtocol] BB_DROPDTR - Drop DTR (hangup)');

    // In web version, this would disconnect the socket
    // For now, just acknowledge
    console.log('  [TODO] Implement actual disconnect');

    this.sendReply(msg, 1);
  }

  /**
   * Handle get task (BB_GETTASK)
   * From E sources (express.e:3840-3841):
   * - Get current task pointer (Amiga-specific)
   */
  private handleGetTask(msg: XIMMessage): void {
    console.log('[XIMProtocol] BB_GETTASK - Get task pointer');

    // Return dummy task pointer (not applicable in web version)
    this.emulator.writeMemory32(msg.msgAddr + 22, 0);

    this.sendReply(msg, 1);
  }

  /**
   * Handle environment status (ENVSTAT)
   * From E sources (express.e:3677-3683):
   * - Get/set environment status
   */
  private handleEnvStat(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMProtocol] ENVSTAT - Environment status');

    if (msg.data !== 0) {
      // READ - return current status
      const status = 0; // TODO: Track actual status
      this.writeString(stringAddr, status.toString(), 10);
      console.log(`  [READ] Status: ${status}`);
    } else {
      // WRITE - set status
      const newStatus = this.readString(stringAddr);
      console.log(`  [WRITE] Set status: ${newStatus}`);
      // TODO: Store status
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle server new message (SV_NEWMSG)
   * From E sources (express.e:3684-3685):
   * - Set environment message
   */
  private handleSvNewMsg(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const message = this.readString(stringAddr);

    console.log('[XIMProtocol] SV_NEWMSG - Set server message');
    console.log(`  Message: "${message}"`);

    // TODO: Store server message for display
    this.sendReply(msg, 1);
  }

  /**
   * Handle private command (PRV_COMMAND)
   * From E sources (express.e:3816-3818):
   * - Execute a BBS command from the door
   */
  private handlePrvCommand(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const command = this.readString(stringAddr);

    console.log('[XIMProtocol] PRV_COMMAND - Execute BBS command');
    console.log(`  Command: "${command}"`);

    // TODO: Execute BBS command
    this.sendReply(msg, 1);
  }

  /**
   * Handle private group (PRV_GROUP)
   * From E sources (express.e:3819-3830):
   * - Modify conference/group settings
   */
  private handlePrvGroup(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const groupData = this.readString(stringAddr);

    console.log('[XIMProtocol] PRV_GROUP - Modify group settings');
    console.log(`  Group data: "${groupData}"`);

    // TODO: Implement group modification
    this.sendReply(msg, 1);
  }

  /**
   * Write null-terminated string to memory
   */
  private writeString(addr: number, str: string, maxLength: number): void {
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
      [XIMCommand.DT_NAME]: 'DT_NAME',
      [XIMCommand.DT_PASSWORD]: 'DT_PASSWORD',
      [XIMCommand.DT_LOCATION]: 'DT_LOCATION',
      [XIMCommand.DT_PHONENUMBER]: 'DT_PHONENUMBER',
      [XIMCommand.DT_REALNAME]: 'DT_REALNAME',
      [XIMCommand.DT_SLOTNUMBER]: 'DT_SLOTNUMBER',
      [XIMCommand.DT_SECSTATUS]: 'DT_SECSTATUS',
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
      [XIMCommand.DT_HOSTNAME]: 'DT_HOSTNAME',
      [XIMCommand.DT_HOSTIP]: 'DT_HOSTIP',
      [XIMCommand.EXPRESS_VERSION]: 'EXPRESS_VERSION',
    };

    return names[command] || `Unknown (${command})`;
  }
}

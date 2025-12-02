// DoorMessageHandler.ts
// Phase 5B: Message Processing and IPC Handling
// Handles door messages, XIM protocol, and inter-process communication
// 2025-11-20

import { MoiraEmulator } from "../cpu/MoiraEmulator.js";
import { Socket } from "socket.io";
import { ExecLibrary } from "../api/ExecLibrary.js";
import { XIMProtocol, XIMCommand } from "../XIMProtocol.js";
import { DoorConfig, DoorConstants } from "../DoorTypes.js";
import { logDoorMessage } from "../../utils/door-logging.util";
import { populateDoorInfoStructs } from "./door-info.util.js";
import { parseMciCodes } from "../../handlers/screen.handler.js";
import * as fs from "fs";
import * as path from "path";

export interface MessageProcessingConfig {
  suppressCallbacks: boolean;
  enableMessageLogging: boolean;
  maxMessageSize: number;
  bufferSize: number;
}

interface ActiveInputState {
  msgAddr: number;
  maxlen: number;
  command: number;
  replyPortAddr: number;
  resumeCallback: () => void;
}

export class DoorMessageHandler {
  private emulator: MoiraEmulator;
  private socket: Socket;
  private execLibrary: ExecLibrary;
  private ximProtocol: XIMProtocol | null = null;
  private config: DoorConfig;

  // Message processing state
  private messageConfig: MessageProcessingConfig;
  private lastMessageDump: number = 0;
  private messageCount: number = 0;
  private firstNonRegisterSeen: boolean = false;
  private activeInput: ActiveInputState | null = null;

  // Door display state (express.e:3876,3877)
  private lineCount: number = 0;
  private nonStopDisplayFlag: boolean = false;
  private logMessageRequest(
    msgAddr: number,
    command: number,
    data: number,
    str: string
  ): void {
    console.log(`[DoorMessageHandler] msg request: ${command}`);
    console.log(`[DoorMessageHandler] data: ${data}`);
    console.log(`[DoorMessageHandler] string: ${str ?? ""}`);
  }

  // Shared references (managed by parent)
  private doorReplyPortAddr: number = 0;
  private doorPortAddress: number = 0;
  private doorInfoAddr: number = 0;
  private nodeStatusAddr: number = 0;
  private doorSummaryPtr: number = 0;
  private aePortAddress: number = 0;
  private sentInitialMessage: boolean = false;

  constructor(
    emulator: MoiraEmulator,
    socket: Socket,
    execLibrary: ExecLibrary,
    config: DoorConfig
  ) {
    this.emulator = emulator;
    this.socket = socket;
    this.execLibrary = execLibrary;
    this.config = config;

    this.messageConfig = {
      suppressCallbacks: true,
      enableMessageLogging: process.env.AEDOOR_MSG_LOG === "true",
      maxMessageSize: 1000,
      bufferSize: 256,
    };

    this.firstNonRegisterSeen = false;
    this.setupInputHandler();
  }

  // Setter methods for dependencies and shared state
  setXIMProtocol(ximProtocol: XIMProtocol | null): void {
    this.ximProtocol = ximProtocol;
    if (this.ximProtocol) {
      this.ximProtocol.setMessageLogger(logDoorMessage);
    }
  }

  setSharedState(state: {
    doorReplyPortAddr: number;
    doorPortAddress: number;
    doorInfoAddr: number;
    nodeStatusAddr: number;
    doorSummaryPtr: number;
    aePortAddress: number;
    sentInitialMessage: boolean;
  }): void {
    this.doorReplyPortAddr = state.doorReplyPortAddr;
    this.doorPortAddress = state.doorPortAddress;
    this.doorInfoAddr = state.doorInfoAddr;
    this.nodeStatusAddr = state.nodeStatusAddr;
    this.doorSummaryPtr = state.doorSummaryPtr;
    this.aePortAddress = state.aePortAddress;
    this.sentInitialMessage = state.sentInitialMessage;
  }

  /**
   * Setup Socket.IO input handler for JH_PM/JH_LI/JH_HK commands
   * Listens to door:input events and resumes emulator when input arrives
   */
  private setupInputHandler(): void {
    this.socket.on("door:input", (data: string) => {
      if (!this.activeInput) {
        console.log("[DoorMessageHandler] door:input received but no active input request");
        return;
      }

      const { msgAddr, maxlen, command, replyPortAddr, resumeCallback } = this.activeInput;
      console.log(`[DoorMessageHandler] door:input: "${data}" for command ${command}`);

      // Trim to maxlen
      const trimmed = data.slice(0, maxlen);

      // Write input to message string
      this.writeStringToMessage(msgAddr, trimmed);

      // Set data field: 1 for success (got input)
      this.emulator.writeMemory32(
        msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
        1
      );

      console.log(`[DoorMessageHandler] Wrote input "${trimmed}" to message`);

      // Reply to door (express.e:4232 - ReplyMsg after processing)
      this.execLibrary.putMsg(replyPortAddr, msgAddr, {
        suppressDoorCallback: true,
      });
      console.log(`[DoorMessageHandler] Sent reply to door at port 0x${replyPortAddr.toString(16)}`);

      // Clear active input and resume
      this.activeInput = null;
      resumeCallback();
    });
  }

  // For XIM doors, express.e expects the BBS to deliver an initial node-status/register
  // message via PutMsg so the door can call WaitPort/GetMsg to start IPC.
  sendStartupMessage(): void {
    this.sendInitAndStatusMessages();
  }

  /**
   * Send INIT (cmd 0) and STAT (cmd 1) messages for XIM doors, mirroring AEDoor.library
   */
  sendInitAndStatusMessages(): void {
    if (this.sentInitialMessage) {
      return;
    }

    // Ensure DoorInfo/NodeStatus blocks are populated like AEDoor.library
    this.ensureDoorInfoStructure();
    const session: any = (this.config as any)?.bbsSession || {};
    const userName =
      session.user?.username ||
      session.currentUser?.username ||
      session.username ||
      "SYSOP";
    const location =
      session.user?.location ||
      session.currentUser?.location ||
      session.location ||
      "AMIGA";
    const cliName =
      session.command ||
      (this.config as any)?.doorId ||
      session.doorId ||
      "BULLS";

    populateDoorInfoStructs(this.emulator, this.doorInfoAddr, this.nodeStatusAddr, {
      aePort: this.doorPortAddress || this.execLibrary.getDoorPortAddress() || 0,
      replyPort: this.doorReplyPortAddr,
      nodeId: this.resolveNodeId(),
      userName,
      location,
      cliName,
    });
    if (!this.doorInfoAddr || !this.nodeStatusAddr) {
      console.warn(
        "[DoorMessageHandler] Cannot send init/status messages: missing doorInfo or nodeStatus"
      );
      return;
    }

    // Bulls expects two messages: JH_INIT (cmd=0, data=DoorInfo) then JH_STAT (cmd=1, data=NodeStatus)
    const portAddr =
      this.doorPortAddress ||
      this.execLibrary.getDoorPortAddress() ||
      0xa0000;
    const statusText = `NODE ${this.resolveNodeId()} STATUS READY`;

    const initMsgAddr = this.allocateDoorCommandMessage(0, 0, "INIT");
    const statMsgAddr = this.allocateDoorCommandMessage(
      1,
      this.doorInfoAddr + 0xe4,
      statusText
    );
    if (initMsgAddr === null || statMsgAddr === null) {
      return;
    }

    const enqueue = (msgAddr: number, label: string) => {
      console.log(
        `[DoorMessageHandler] Sending ${label} message (data=0x${this.emulator.readMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET
        ).toString(16)})`
      );
      console.log(
        `[DoorMessageHandler]   port=0x${portAddr.toString(
          16
        )} msg=0x${msgAddr.toString(
          16
        )} reply=0x${this.doorReplyPortAddr.toString(
          16
        )} len=${DoorConstants.MESSAGE_TOTAL_LENGTH}`
      );
      this.execLibrary.putMsg(portAddr, msgAddr, {
        suppressDoorCallback: this.messageConfig.suppressCallbacks,
      });
      if (this.doorReplyPortAddr) {
        this.execLibrary.putMsg(this.doorReplyPortAddr, msgAddr, {
          suppressDoorCallback: this.messageConfig.suppressCallbacks,
        });
      }
    };

    enqueue(initMsgAddr, "INIT");
    enqueue(statMsgAddr, "STAT");

    this.sentInitialMessage = true;
  }

  /**
   * Allocate door command message structure
   */
  private allocateDoorCommandMessage(
    command: number,
    data: number,
    messageText: string
  ): number | null {
    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = this.execLibrary.createMsgPort();
    }
    if (this.doorReplyPortAddr === 0) {
      console.error("[DoorMessageHandler] Failed to create reply port");
      return null;
    }

    const msgAddr = this.execLibrary.allocMem(
      DoorConstants.MESSAGE_TOTAL_LENGTH,
      DoorConstants.MEMF_PUBLIC_CLEAR
    );
    if (msgAddr === 0) {
      console.error(
        "[DoorMessageHandler] Failed to allocate door command message memory"
      );
      return null;
    }

    const replyPortAddr = this.doorReplyPortAddr;
    const NT_MESSAGE = 5;

    this.emulator.writeMemory32(msgAddr + 0, 0);
    this.emulator.writeMemory32(msgAddr + 4, 0);
    this.emulator.writeMemory(msgAddr + 8, NT_MESSAGE);
    this.emulator.writeMemory(msgAddr + 9, 0);
    this.emulator.writeMemory32(msgAddr + 10, 0);
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET,
      replyPortAddr
    );
    this.emulator.writeMemory16(
      msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET,
      DoorConstants.MESSAGE_TOTAL_LENGTH
    );
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
      command
    );
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
      data
    );
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_NODE_OFFSET,
      this.resolveNodeId()
    );
    // Bias the Bulls-style header fields as well
    const bias = DoorConstants.MESSAGE_HEADER_SIZE || 0;
    if (bias > 0) {
      this.emulator.writeMemory32(
        msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET + bias,
        command
      );
      this.emulator.writeMemory32(
        msgAddr + DoorConstants.MESSAGE_DATA_OFFSET + bias,
        data
      );
      this.emulator.writeMemory32(
        msgAddr + DoorConstants.MESSAGE_NODE_OFFSET + bias,
        this.resolveNodeId() || 1
      );
    }
    this.writeStringToMemory(
      msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      messageText,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );

    return msgAddr;
  }

  /**
   * Get XIM command name from command number (matches AmiExpress logging)
   */
  private getCommandName(command: number): string {
    // Find enum key by value
    for (const [key, value] of Object.entries(XIMCommand)) {
      if (value === command && isNaN(Number(key))) {
        return key;
      }
    }
    return `UNKNOWN_${command}`;
  }

  /**
   * Handle door message (trap-based, not polling)
   */
  async handleDoorMessage(portAddr: number, msgAddr: number): Promise<void> {
    this.messageCount++;

    // Parse message structure
    const mn_ReplyPort = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET
    );
    const mn_Length = this.emulator.readMemory16(
      msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
    );

    // AEDoor message extension (after struct Message)
    const command = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET
    );
    const data = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_DATA_OFFSET
    );

    // Read string (first MESSAGE_STRING_CAPACITY bytes max)
    let str = "";
    const stringBase = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    for (let i = 0; i < DoorConstants.MESSAGE_STRING_CAPACITY; i++) {
      const ch = this.emulator.readMemory(stringBase + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    // Log in AmiExpress format (matches express.e logging)
    const commandName = this.getCommandName(command);
    console.log(`msg request: ${command} (${commandName})`);
    console.log(`data: ${data}`);
    console.log(`string: ${str}`);

    // Use XIM Protocol handler to process and respond
    if (this.ximProtocol) {
      const ximMessage = this.ximProtocol.parseMessage(msgAddr);
      await this.ximProtocol.handleMessage(ximMessage);
    } else {
      console.log(
        `[DoorMessageHandler] WARNING: XIM Protocol not initialized!`
      );
      // Fall back to command processor
      await this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
    }

    console.log(
      `[DoorMessageHandler] ===============================================`
    );
  }

  /**
   * Dump Bulls message for debugging
   */
  private dumpBullsMessage(msgAddr: number): void {
    const dumpOffsets = [
      0x10, 0x14, 0x18, 0x1c, 0xdc, 0xe0, 0xe4, 0xe8, 0xec, 0xf0, 0xf4, 0xf8,
      0xfc, 0x100,
    ];
    const dumpParts = dumpOffsets.map((off) => {
      const val = this.emulator.readMemory32(msgAddr + off);
      return `+0x${off.toString(16)}=0x${val.toString(16)}`;
    });
    console.log(
      `[DoorMessageHandler][BullsMsgDump] msg=0x${msgAddr.toString(
        16
      )} ${dumpParts.join(", ")}`
    );
    // Log first non-register command to see where Bulls goes after handshake.
    if (!this.firstNonRegisterSeen) {
      const cmd = this.emulator.readMemory32(
        msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET
      );
      if (cmd !== 1) {
        this.firstNonRegisterSeen = true;
        const data = this.emulator.readMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET
        );
        const str = this.emulator.readString(
          msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
          DoorConstants.MESSAGE_STRING_CAPACITY
        );
        console.log(
          `[DoorMessageHandler][BullsFirstCmd] cmd=${cmd} data=${data} str="${str}"`
        );
      }
    }
    this.lastMessageDump++;
  }

  /**
   * Process a specific door command
   * Implementation matches express.e:3372-3700 (processXimMsg)
   */
  private async processCommand(
    command: number,
    data: number,
    str: string,
    msgAddr: number,
    replyPortAddr: number
  ): Promise<void> {
    console.log(`[DoorMessageHandler] Processing command ${command}...`);
    this.logMessageRequest(msgAddr, command, data, str);

    // If the incoming message uses a different reply port, honor it (express.e ReplyMsg behavior)
    if (replyPortAddr && replyPortAddr !== this.doorReplyPortAddr) {
      this.doorReplyPortAddr = replyPortAddr;
    }

    // Command constants from express.e:3372-4230 (processXimMsg)
    // JH_* commands (basic I/O and control)
    const JH_LI = 0;           // Line Input
    const JH_REGISTER = 1;     // Register door with BBS
    const JH_SHUTDOWN = 2;     // Shutdown door
    const JH_WRITE = 3;        // Write text to terminal
    const JH_SM = 4;           // Send Message
    const JH_PM = 5;           // Prompt Message
    const JH_HK = 6;           // HotKey
    const JH_SG = 7;           // Show GFile
    const JH_SF = 8;           // Show File
    const JH_EF = 9;           // Edit File
    const JH_CO = 10;          // Console Output
    const JH_SO = 11;          // Serial Output
    const JH_MCI = 12;         // Process MCI codes
    const JH_BBSNAME = 13;     // Get BBS name
    const JH_SYSOP = 14;       // Get Sysop name
    const JH_FLAGFILE = 15;    // Flag file for download
    const JH_SMPTR = 16;       // Send Message (pointer variant)
    const JH_ExtHK = 17;       // Extended HotKey
    const JH_20 = 20;          // Read char variant
    const JH_SIGBIT = 21;      // Signal bit
    const JH_FetchKey = 22;    // Fetch key non-blocking

    const CHAIN = 23;          // Chain command
    const RETURNCOMMAND = 24;  // Return command string
    const RETURNCOMMAND2 = 25; // Return command string 2
    const QUICK_KEY = 26;      // Quick key read

    // DT_* commands (user data access)
    const DT_NAME = 100;
    const DT_PASSWORD = 101;
    const DT_LOCATION = 102;
    const DT_PHONENUMBER = 103;
    const DT_SLOTNUMBER = 104;
    const DT_SECSTATUS = 105;
    const DT_SECBOARD = 106;
    const DT_SECLIBRARY = 107;
    const DT_SECBULLETIN = 108;
    const DT_MESSAGESPOSTED = 109;
    const DT_UPLOADS = 110;
    const DT_DOWNLOADS = 111;
    const DT_TIMESCALLED = 112;
    const DT_TIMELASTON = 113;
    const DT_TIMEUSED = 114;
    const DT_TIMELIMIT = 115;
    const DT_TIMETOTAL = 116;
    const DT_BYTESUPLOAD = 117;
    const DT_BYTEDOWNLOAD = 118;
    const DT_DAILYBYTELIMIT = 119;
    const DT_DAILYBYTEDLD = 120;
    const DT_EXPERT = 121;
    const DT_LINELENGTH = 122;
    const DT_TIMEOUT = 123;
    const DT_DUMP = 124;
    const DT_MSGCODE = 125;
    const DT_CONFACCESS = 126;
    const DT_LANGUAGE = 127;
    const DT_QUICKFLAG = 128;
    const DT_GOODFILE = 129;
    const DT_ANSICOLOR = 130;
    const DT_ISANSI = 131;
    const DT_STAMP_LASTON = 132;
    const DT_CURR_TIME = 133;
    const DT_STAMP_CTIME = 134;
    const DT_ADDBIT = 135;
    const DT_REMBIT = 136;
    const DT_QUERYBIT = 137;
    const DT_FILECODE = 138;
    const DT_REALNAME = 139;
    const DT_INTERNETNAME = 140;
    const DT_TRANSLATOR = 141;
    const DT_HOST_LANGUAGE = 142;
    const DT_HOSTNAME = 143;
    const DT_HOSTIP = 144;
    const DT_GEOGRAPHIC = 145;
    const DT_SIZEUPLOAD = 146;
    const DT_SIZEDOWNLOAD = 147;
    const DT_CONFACCESS2 = 148;
    const DT_CBYTESUPLOAD = 149;
    const DT_CBYTESDOWNLOAD = 150;
    const DT_CFILESUPLOAD = 151;
    const DT_CFILESDOWNLOAD = 152;
    const DT_CALLEDTODAY = 153;

    // BB_* commands (BBS system info)
    const BB_CONFNAME = 200;
    const BB_CONFLOCAL = 201;
    const BB_LOCAL = 202;
    const BB_TASKPRI = 203;
    const BB_CHATFLAG = 204;
    const BB_CHATSET = 205;
    const BB_PCONFNAME = 206;
    const BB_PCONFLOCAL = 207;
    const BB_MAINLINE = 208;
    const BB_NODEID = 209;
    const BB_CALLERSLOG = 210;
    const BB_UDLOG = 211;
    const BB_CONFNUM = 212;
    const BB_DROPDTR = 213;
    const BB_GETTASK = 214;
    const BB_LOGONTYPE = 215;
    const BB_SCRLEFT = 216;
    const BB_SCRTOP = 217;
    const BB_SCRWIDTH = 218;
    const BB_SCRHEIGHT = 219;
    const BB_PURGELINE = 220;
    const BB_PURGELINESTART = 221;
    const BB_PURGELINEEND = 222;
    const BB_NONSTOPTEXT = 223;
    const BB_LINECOUNT = 224;
    const BB_CONFACCOUNT = 225;

    // File transfer commands
    const ZMODEMSEND = 300;
    const BATCHZMODEMSEND = 301;
    const ZMODEMRECEIVE = 302;
    const AXNET_SEND = 303;
    const AXNET_RECEIVE = 304;

    // Account management commands
    const LOAD_ACCOUNT = 400;
    const SAVE_ACCOUNT = 401;
    const SEARCH_ACCOUNT = 402;
    const APPEND_ACCOUNT = 403;
    const LAST_ACCOUNTNUM = 404;
    const CHOOSE_NAME = 405;
    const EXT_LOAD_ACCOUNT = 406;
    const EXT_CHOOSE_NAME = 407;

    // System and misc commands
    const GETKEY = 500;
    const RAWARROW = 501;
    const EXPRESS_VERSION = 502;
    const ACTIVE_NODES = 503;
    const ENVSTAT = 504;
    const SV_NEWMSG = 505;
    const PRV_COMMAND = 506;
    const PRV_GROUP = 507;
    const SCREEN_ADDRESS = 506;
    const RAWSCREEN_ADDRESS = 507;
    const MULTICOM = 508;
    const EDITOR_STRUCT = 509;
    const LOAD_CONFDB = 510;
    const SAVE_CONFDB = 511;
    const GET_CONFNUM = 512;
    const MOD_TYPE = 513;
    const ACP_COMMAND = 514;
    const BYPASS_CSI_CHECK = 515;
    const SENTBY = 516;
    const SETOVERIDE = 517;
    const FULLEDIT = 518;
    const SETMCIOFF = 519;
    const GET_CUSTOM_MSGBASE_PARAM1 = 520;
    const GET_CUSTOM_MSGBASE_PARAM2 = 521;
    const LAST_READ = 522;
    const LAST_SCANNED = 523;
    const MSGBASE_LOC = 524;
    const GET_CUSTOM_MSGBASE_MENUCMD = 525;
    const SER_INOUT = 526;
    const MEMCONF = 527;
    const SET_SERSHARED = 528;
    const CONF_ACCESS = 529;
    const PASSWORD_HASH = 530;
    const GET_GNSFLAG = 531;
    const DISPLAY_FILE = 532;
    const CHECK_TO_DISPLAY = 533;
    const SET_FILEATTACH = 534;
    const INTERPRET_MCI = 535;
    const GET_XIMPORT = 536;
    const GET_MENU_COMMAND_CHAR = 537;
    const FILE_REQUEST = 538;
    const DISABLE_FILE_ATTACH = 539;
    const QWKZOOM_REC = 540;
    const REL_CONF = 541;
    const CHECK_PLAYPEN_EXISTS = 542;
    const CHECK_REALNAME = 543;
    const XNET_OUTBOUND = 544;
    const CON_CURSOR = 545;
    const TELNET_CONNECT = 546;
    const TELNET_USERNAME_PROMPT = 547;
    const TELNET_USERNAME = 548;
    const TELNET_PASSWORD_PROMPT = 549;
    const TELNET_PASSWORD = 550;
    const GET_CMD_TOOLTYPE = 551;
    const SIG_PLAYPEN = 552;
    const ICONIFYQUERY = 553;
    const LOGON_UNAME = 554;
    const LOGON_UPASS = 555;
    const SIG_LI = 556;
    const UNKNOWN4 = 557;
    const QUIET_DOWNLOAD = 558;
    const NODE_BAUD = 559;
    const NODE_BAUDRATE = 560;
    const NODE_DEVICE = 561;
    const NODE_UNIT = 562;

    const DT_SECLEVEL = DT_SECSTATUS; // Alias

    switch (command) {
      case JH_REGISTER:
        // express.e:3379-3381: msg.command := IF loggedOnUser<>NIL THEN userLineLen ELSE 29
        console.log(`[DoorMessageHandler]   JH_REGISTER: Door registering with BBS`);
        const rawLineLen =
          (this.config.bbsSession as any)?.user?.linesPerScreen ??
          (this.config.bbsSession as any)?.user?.lineLength ??
          24;
        const lineLen = typeof rawLineLen === "number" && rawLineLen > 0 ? rawLineLen : 29;
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
          lineLen
        );
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_LINE_OFFSET,
          0
        );
        console.log(`[DoorMessageHandler]   Replied with line length ${lineLen}`);
        break;

      case JH_WRITE:
        // express.e:3382-3385: IF (transfering=FALSE) AND (doorSilent=FALSE) THEN aePuts(msg.string)
        console.log(`[DoorMessageHandler]   JH_WRITE: "${str}"`);
        this.socket.emit("ansi-output", str);
        break;

      case JH_SHUTDOWN:
        // express.e:3388-3394: Decrement nodes counter and set exit flag
        console.log(`[DoorMessageHandler]   JH_SHUTDOWN: Door shutting down`);
        this.execLibrary.putMsg(replyPortAddr, msgAddr, {
          suppressDoorCallback: true,
        });
        return; // Don't send reply again

      case JH_CO:
        // express.e:3395-3400: conPuts(msg.string) + optional newline + checkForPause
        console.log(`[DoorMessageHandler]   JH_CO: Console output "${str}"`);
        let coOutput = str;
        if (data) {
          coOutput += "\r\n";
        }
        // For web BBS, console = terminal
        this.socket.emit("ansi-output", coOutput);
        break;

      case JH_SO:
        // express.e:3401-3405: serPuts(msg.string) + optional newline
        console.log(`[DoorMessageHandler]   JH_SO: Serial output "${str}"`);
        let soOutput = str;
        if (data) {
          soOutput += "\r\n";
        }
        this.socket.emit("ansi-output", soOutput);
        break;

      case JH_SM:
        // express.e:3406-3411: aePuts(msg.string) + optional newline + checkForPause
        console.log(`[DoorMessageHandler]   JH_SM: Send message "${str}"`);
        let smOutput = str;
        if (data) {
          smOutput += "\r\n";
        }
        this.socket.emit("ansi-output", smOutput);
        break;

      case JH_PM:
        // express.e:3418-3424: lineInput() with prompt, return user input
        // data=-1 = timeout/carrier lost, data=1 = success
        console.log(`[DoorMessageHandler]   JH_PM: Prompt message "${str}", maxlen=${data}`);
        // Display prompt
        this.socket.emit("ansi-output", str);
        // Pause emulator and wait for user input via door:input event
        this.activeInput = {
          msgAddr,
          maxlen: data,
          command: JH_PM,
          replyPortAddr: this.doorReplyPortAddr,
          resumeCallback: () => {
            console.log(`[DoorMessageHandler]   JH_PM: Resuming after input`);
            this.emulator.resume();
          },
        };
        this.emulator.pause();
        console.log(`[DoorMessageHandler]   JH_PM: Emulator paused, waiting for user input`);
        return; // Don't reply yet - will reply when input arrives via setupInputHandler

      case JH_LI:
        // express.e:3425-3431: lineInput() without prompt
        console.log(`[DoorMessageHandler]   JH_LI: Line input, maxlen=${data}`);
        // Pause emulator and wait for user input via door:input event
        this.activeInput = {
          msgAddr,
          maxlen: data,
          command: JH_LI,
          replyPortAddr: this.doorReplyPortAddr,
          resumeCallback: () => {
            console.log(`[DoorMessageHandler]   JH_LI: Resuming after input`);
            this.emulator.resume();
          },
        };
        this.emulator.pause();
        console.log(`[DoorMessageHandler]   JH_LI: Emulator paused, waiting for user input`);
        return; // Don't reply yet - will reply when input arrives via setupInputHandler

      case JH_HK:
        // express.e:3436-3447: readChar() and return key code
        console.log(`[DoorMessageHandler]   JH_HK: Hot key, prompt="${str}"`);
        this.socket.emit("ansi-output", str);
        // Pause emulator and wait for user input via door:input event
        // For hot key, we just need a single character
        this.activeInput = {
          msgAddr,
          maxlen: 1, // Hot key only needs one char
          command: JH_HK,
          replyPortAddr: this.doorReplyPortAddr,
          resumeCallback: () => {
            console.log(`[DoorMessageHandler]   JH_HK: Resuming after input`);
            this.emulator.resume();
          },
        };
        this.emulator.pause();
        console.log(`[DoorMessageHandler]   JH_HK: Emulator paused, waiting for user input`);
        return; // Don't reply yet - will reply when input arrives via setupInputHandler

      case JH_SG:
        // express.e:3473-3474: findSecurityScreen() and displayFile()
        console.log(`[DoorMessageHandler]   JH_SG: Show GFile "${str}"`);
        const secFilePath = this.findSecurityScreen(str);
        if (secFilePath) {
          await this.displayFile(secFilePath);
          console.log(`[DoorMessageHandler]   Displayed security screen: ${secFilePath}`);
        } else {
          console.log(`[DoorMessageHandler]   Security screen not found: ${str}`);
        }
        break;

      case JH_SF:
        // express.e:3475-3476: displayFile()
        console.log(`[DoorMessageHandler]   JH_SF: Show File "${str}"`);
        const bbsRoot = this.config.bbsSession?.bbsRoot || this.config.bbsSession?.dataDir || "";
        const fullPath = path.join(bbsRoot, str);
        if (await this.displayFile(fullPath)) {
          console.log(`[DoorMessageHandler]   Displayed file: ${fullPath}`);
        } else {
          console.log(`[DoorMessageHandler]   File not found: ${fullPath}`);
        }
        break;

      case JH_EF:
        // express.e:3477-3485: Edit file with message editor
        console.log(`[DoorMessageHandler]   JH_EF: Edit File "${str}"`);
        // Message editor requires full editor integration
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
          -1
        );
        console.log(`[DoorMessageHandler]   Editor not yet supported`);
        break;

      case JH_BBSNAME:
        // express.e:3486-3487: Return BBS name
        console.log(`[DoorMessageHandler]   JH_BBSNAME: Request for BBS name`);
        const bbsName = this.config.bbsSession?.bbsName || "AmiExpress Web BBS";
        this.writeStringToMessage(msgAddr, bbsName);
        console.log(`[DoorMessageHandler]   Replied with BBS name: "${bbsName}"`);
        break;

      case JH_SYSOP:
        // express.e:3488-3489: Return sysop name
        console.log(`[DoorMessageHandler]   JH_SYSOP: Request for sysop name`);
        const sysopName = this.config.bbsSession?.sysopName || "Sysop";
        this.writeStringToMessage(msgAddr, sysopName);
        console.log(`[DoorMessageHandler]   Replied with sysop name: "${sysopName}"`);
        break;

      case DT_NAME:
        // express.e:3494-3499: Get/Set user name
        console.log(`[DoorMessageHandler]   DT_NAME: data=${data}`);
        if (data) {
          // Get name
          const userName = this.config.bbsSession?.user?.username || "Sysop";
          this.writeStringToMessage(msgAddr, userName);
          console.log(`[DoorMessageHandler]   Replied with name: "${userName}"`);
        } else {
          // Set name (not implemented)
          console.log(`[DoorMessageHandler]   Set name not implemented`);
        }
        break;

      case DT_LOCATION:
        // express.e:3512-3517: Get/Set user location
        console.log(`[DoorMessageHandler]   DT_LOCATION: data=${data}`);
        if (data) {
          // Get location
          const location = this.config.bbsSession?.user?.location || "Unknown";
          this.writeStringToMessage(msgAddr, location);
          console.log(`[DoorMessageHandler]   Replied with location: "${location}"`);
        } else {
          // Set location (not implemented)
          console.log(`[DoorMessageHandler]   Set location not implemented`);
        }
        break;

      case DT_PHONENUMBER:
        // express.e:3518-3523: Get/Set phone number
        console.log(`[DoorMessageHandler]   DT_PHONENUMBER: data=${data}`);
        if (data) {
          const phone = this.config.bbsSession?.user?.phone || "000-000-0000";
          this.writeStringToMessage(msgAddr, phone);
          console.log(`[DoorMessageHandler]   Replied with phone: "${phone}"`);
        } else {
          console.log(`[DoorMessageHandler]   Set phone not implemented`);
        }
        break;

      case DT_SECLEVEL:
        // express.e: Security status (not implemented in search results, but common)
        console.log(`[DoorMessageHandler]   DT_SECLEVEL: Request for security level`);
        const secLevel = this.config.bbsSession?.user?.secLevel || 100;
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, secLevel);
        console.log(`[DoorMessageHandler]   Replied with sec level: ${secLevel}`);
        break;

      case GETKEY:
        console.log(`[DoorMessageHandler]   GETKEY: Request for user input`);
        this.waitForKeypress(msgAddr, replyPortAddr);
        return; // Don't send reply - waitForKeypress will handle it

      // Additional JH_* commands
      case JH_SMPTR:
        // express.e:3412-3417: Send Message using pointer
        console.log(`[DoorMessageHandler]   JH_SMPTR: Send message (pointer)`);
        this.socket.emit("ansi-output", str);
        if (data) {
          this.socket.emit("ansi-output", "\r\n");
        }
        break;

      case JH_ExtHK:
        // express.e:3432-3435: Extended HotKey with signal
        console.log(`[DoorMessageHandler]   JH_ExtHK: Extended hot key`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, -1);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        break;

      case JH_20:
      case QUICK_KEY:
        // express.e:3448-3455: Quick key read
        console.log(`[DoorMessageHandler]   JH_20/QUICK_KEY: Quick key read`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, 0);
        break;

      case JH_SIGBIT:
        // express.e:3463-3464: Return door signal bit
        console.log(`[DoorMessageHandler]   JH_SIGBIT: Signal bit request`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case JH_FetchKey:
        // express.e:3465-3472: Fetch key non-blocking
        console.log(`[DoorMessageHandler]   JH_FetchKey: Non-blocking key fetch`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, 0);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      case JH_FLAGFILE:
        // express.e:3490-3491: Flag file for download
        console.log(`[DoorMessageHandler]   JH_FLAGFILE: Flag file "${str}"`);
        // File flagging requires file system integration
        break;

      case JH_MCI:
        // express.e:3456-3462: Process MCI codes
        console.log(`[DoorMessageHandler]   JH_MCI: Process MCI codes for "${str}"`);
        try {
          // Get BBS session info for MCI processing
          const bbsSession = (this.config as any)?.bbsSession || {};
          const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
          const sysopName = bbsSession.sysopName || 'Sysop';
          const location = bbsSession.user?.location || 'The Internet';

          // Process MCI codes (async)
          const result = await parseMciCodes(str, bbsSession, bbsName, sysopName, location);

          // Output parsed content to terminal (express.e: processMci outputs to terminal)
          this.socket.emit('ansi-output', result.parsed);

          // If data flag is set, output backspace + newline (express.e:3459-3461)
          if (data) {
            this.socket.emit('ansi-output', '\b\n');
            // Note: checkForPause() not implemented yet
          }

          console.log(`[DoorMessageHandler]   JH_MCI: Processed successfully`);
        } catch (error: any) {
          console.error(`[DoorMessageHandler]   JH_MCI: Error processing MCI codes:`, error.message || error);
        }
        break;

      case CHAIN:
        // express.e:3386-3387: Chain command (node counter)
        console.log(`[DoorMessageHandler]   CHAIN: Chain command`);
        break;

      case RETURNCOMMAND:
        // express.e:3492-3493: Store command to run on exit
        console.log(`[DoorMessageHandler]   RETURNCOMMAND: "${str}"`);
        break;

      case RETURNCOMMAND2:
        // express.e:4064-4065: Store second command to run on exit
        console.log(`[DoorMessageHandler]   RETURNCOMMAND2: "${str}"`);
        break;

      // DT_* commands (user data)
      case DT_PASSWORD:
        // express.e:3500-3511: Get/Set password
        console.log(`[DoorMessageHandler]   DT_PASSWORD: data=${data}`);
        if (data) {
          // Don't allow doors to read password
          this.writeStringToMessage(msgAddr, "");
        }
        break;

      case DT_SLOTNUMBER:
        // express.e:3524-3530: Get/Set slot number
        console.log(`[DoorMessageHandler]   DT_SLOTNUMBER: data=${data}`);
        if (data) {
          const slotNum = this.config.bbsSession?.user?.id || 1;
          this.writeStringToMessage(msgAddr, String(slotNum));
        }
        break;

      case DT_SECSTATUS:
        // express.e:3531-3538: Get/Set security status
        console.log(`[DoorMessageHandler]   DT_SECSTATUS: data=${data}`);
        if (data) {
          const secStatus = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secStatus));
        } else {
          // Set security status from string
          const newSec = parseInt(str) || 100;
          console.log(`[DoorMessageHandler]   Set security status to ${newSec}`);
        }
        break;

      case DT_SECBOARD:
        // express.e:3539-3545: Get/Set message board security
        console.log(`[DoorMessageHandler]   DT_SECBOARD: data=${data}`);
        if (data) {
          const secBoard = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secBoard));
        } else {
          console.log(`[DoorMessageHandler]   Set board security from: ${str}`);
        }
        break;

      case DT_SECLIBRARY:
        // express.e:3546-3552: Get/Set library security
        console.log(`[DoorMessageHandler]   DT_SECLIBRARY: data=${data}`);
        if (data) {
          const secLib = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secLib));
        } else {
          console.log(`[DoorMessageHandler]   Set library security from: ${str}`);
        }
        break;

      case DT_SECBULLETIN:
        // express.e:3553-3559: Get/Set bulletin security
        console.log(`[DoorMessageHandler]   DT_SECBULLETIN: data=${data}`);
        if (data) {
          const secBull = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secBull));
        } else {
          console.log(`[DoorMessageHandler]   Set bulletin security from: ${str}`);
        }
        break;

      case DT_MESSAGESPOSTED:
        // express.e:3560-3566: Get/Set messages posted (masked with $FFFF)
        console.log(`[DoorMessageHandler]   DT_MESSAGESPOSTED: data=${data}`);
        if (data) {
          const msgPosted = (this.config.bbsSession?.user?.messagesPosted || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(msgPosted));
        } else {
          console.log(`[DoorMessageHandler]   Set messages posted from: ${str}`);
        }
        break;

      case DT_UPLOADS:
        // express.e:3567-3573: Get/Set uploads count (masked with $FFFF)
        console.log(`[DoorMessageHandler]   DT_UPLOADS: data=${data}`);
        if (data) {
          const uploads = (this.config.bbsSession?.user?.uploads || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(uploads));
        } else {
          console.log(`[DoorMessageHandler]   Set uploads from: ${str}`);
        }
        break;

      case DT_DOWNLOADS:
        // express.e:3574-3580: Get/Set downloads count (masked with $FFFF)
        console.log(`[DoorMessageHandler]   DT_DOWNLOADS: data=${data}`);
        if (data) {
          const downloads = (this.config.bbsSession?.user?.downloads || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(downloads));
        } else {
          console.log(`[DoorMessageHandler]   Set downloads from: ${str}`);
        }
        break;

      case DT_TIMESCALLED:
        // express.e:3581-3587: Get/Set times called (masked with $FFFF)
        console.log(`[DoorMessageHandler]   DT_TIMESCALLED: data=${data}`);
        if (data) {
          const calls = (this.config.bbsSession?.user?.calls || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(calls));
        } else {
          console.log(`[DoorMessageHandler]   Set times called from: ${str}`);
        }
        break;

      case DT_TIMELASTON:
        // express.e:3588-3594: Get/Set time last on (in seconds)
        console.log(`[DoorMessageHandler]   DT_TIMELASTON: data=${data}`);
        if (data) {
          const lastOn = this.config.bbsSession?.user?.lastLogin
            ? Math.floor(new Date(this.config.bbsSession.user.lastLogin).getTime() / 1000)
            : 0;
          this.writeStringToMessage(msgAddr, String(lastOn));
        } else {
          console.log(`[DoorMessageHandler]   Set time last on from: ${str}`);
        }
        break;

      case DT_TIMEUSED:
        // express.e:3595-3601: Get/Set time used (in seconds)
        console.log(`[DoorMessageHandler]   DT_TIMEUSED: data=${data}`);
        if (data) {
          const timeUsed = this.config.bbsSession?.user?.timeUsed || 0;
          this.writeStringToMessage(msgAddr, String(timeUsed));
        } else {
          console.log(`[DoorMessageHandler]   Set time used from: ${str}`);
        }
        break;

      case DT_TIMELIMIT:
        // express.e:3602-3608: Get/Set time limit (in seconds)
        console.log(`[DoorMessageHandler]   DT_TIMELIMIT: data=${data}`);
        if (data) {
          const timeLimit = this.config.bbsSession?.user?.timeLimit || 3600;
          this.writeStringToMessage(msgAddr, String(timeLimit));
        } else {
          console.log(`[DoorMessageHandler]   Set time limit from: ${str}`);
        }
        break;

      case DT_TIMETOTAL:
        // express.e:3609-3615: Get/Set time total (in seconds)
        console.log(`[DoorMessageHandler]   DT_TIMETOTAL: data=${data}`);
        if (data) {
          const timeTotal = this.config.bbsSession?.user?.timeTotal || 0;
          this.writeStringToMessage(msgAddr, String(timeTotal));
        } else {
          console.log(`[DoorMessageHandler]   Set time total from: ${str}`);
        }
        break;

      case DT_BYTESUPLOAD:
        // express.e:3616-3623: Get/Set bytes uploaded (BCD format in express.e)
        console.log(`[DoorMessageHandler]   DT_BYTESUPLOAD: data=${data}`);
        if (data) {
          const bytesUp = this.config.bbsSession?.user?.bytesUpload || 0;
          this.writeStringToMessage(msgAddr, String(bytesUp));
        } else {
          console.log(`[DoorMessageHandler]   Set bytes upload from: ${str}`);
        }
        break;

      case DT_BYTEDOWNLOAD:
        // express.e:3624-3631: Get/Set bytes downloaded (BCD format in express.e)
        console.log(`[DoorMessageHandler]   DT_BYTEDOWNLOAD: data=${data}`);
        if (data) {
          const bytesDown = this.config.bbsSession?.user?.bytesDownload || 0;
          this.writeStringToMessage(msgAddr, String(bytesDown));
        } else {
          console.log(`[DoorMessageHandler]   Set bytes download from: ${str}`);
        }
        break;

      case DT_DAILYBYTELIMIT:
        // express.e:3632-3638: Get/Set daily byte limit (formatUnsignedLong)
        console.log(`[DoorMessageHandler]   DT_DAILYBYTELIMIT: data=${data}`);
        if (data) {
          const dailyLimit = this.config.bbsSession?.user?.byteLimit || 10485760;
          this.writeStringToMessage(msgAddr, String(dailyLimit));
        } else {
          console.log(`[DoorMessageHandler]   Set daily byte limit from: ${str}`);
        }
        break;

      case DT_DAILYBYTEDLD:
        // express.e:3639-3645: Get/Set daily bytes downloaded (formatUnsignedLong)
        console.log(`[DoorMessageHandler]   DT_DAILYBYTEDLD: data=${data}`);
        if (data) {
          const dailyDld = this.config.bbsSession?.user?.dailyBytesDld || 0;
          this.writeStringToMessage(msgAddr, String(dailyDld));
        } else {
          console.log(`[DoorMessageHandler]   Set daily bytes downloaded from: ${str}`);
        }
        break;

      case DT_EXPERT:
        // express.e:3646-3652: Get/Set expert mode (single char: Y/N)
        console.log(`[DoorMessageHandler]   DT_EXPERT: data=${data}`);
        if (data) {
          const expert = this.config.bbsSession?.user?.expert || "N";
          this.writeStringToMessage(msgAddr, String(expert).charAt(0));
        } else {
          // Set expert mode from first character of string
          const newExpert = str.charAt(0).toUpperCase();
          console.log(`[DoorMessageHandler]   Set expert mode to: ${newExpert}`);
        }
        break;

      case DT_LINELENGTH:
        // express.e:3653-3660: Get/Set line length (userLineLen)
        console.log(`[DoorMessageHandler]   DT_LINELENGTH: data=${data}`);
        if (data) {
          const lineLen = this.config.bbsSession?.user?.linesPerScreen || 24;
          this.writeStringToMessage(msgAddr, String(lineLen));
        } else {
          // Set line length from string
          const newLineLen = parseInt(str) || 24;
          console.log(`[DoorMessageHandler]   Set line length to: ${newLineLen}`);
        }
        break;

      case DT_TIMEOUT:
        // express.e:3686-3692: Get/Set door timeout (in seconds)
        console.log(`[DoorMessageHandler]   DT_TIMEOUT: data=${data}`);
        if (data) {
          // Return current door timeout (default 300 seconds = 5 minutes)
          this.writeStringToMessage(msgAddr, "300");
        } else {
          // Set door timeout from string
          const newTimeout = parseInt(str) || 300;
          console.log(`[DoorMessageHandler]   Set door timeout to: ${newTimeout}`);
        }
        break;

      case DT_CONFACCESS:
        // express.e:3777-3778: Conference access string
        console.log(`[DoorMessageHandler]   DT_CONFACCESS: data=${data}`);
        if (data) {
          this.writeStringToMessage(msgAddr, "111111111"); // All conferences
        }
        break;

      case DT_STAMP_LASTON:
      case DT_STAMP_CTIME:
        // express.e:3768-3776: Timestamps
        console.log(`[DoorMessageHandler]   DT_STAMP: Timestamp, data=${data}`);
        if (data) {
          const now = Math.floor(Date.now() / 1000);
          this.writeStringToMessage(msgAddr, String(now));
        }
        break;

      case DT_CURR_TIME:
        // express.e:3771-3773: Current time
        console.log(`[DoorMessageHandler]   DT_CURR_TIME`);
        const currTime = Math.floor(Date.now() / 1000);
        this.writeStringToMessage(msgAddr, String(currTime));
        break;

      case DT_REALNAME:
        // express.e:3976-3981: Real name
        console.log(`[DoorMessageHandler]   DT_REALNAME: data=${data}`);
        if (data) {
          const realname = this.config.bbsSession?.user?.realname || "";
          this.writeStringToMessage(msgAddr, realname);
        }
        break;

      case DT_INTERNETNAME:
        // express.e:4088-4093: Internet name
        console.log(`[DoorMessageHandler]   DT_INTERNETNAME: data=${data}`);
        if (data) {
          this.writeStringToMessage(msgAddr, "");
        }
        break;

      case DT_HOSTNAME:
        // express.e:4109-4110: Hostname
        console.log(`[DoorMessageHandler]   DT_HOSTNAME`);
        this.writeStringToMessage(msgAddr, "localhost");
        break;

      case DT_HOSTIP:
        // express.e:4111-4112: Host IP
        console.log(`[DoorMessageHandler]   DT_HOSTIP`);
        this.writeStringToMessage(msgAddr, "127.0.0.1");
        break;

      case DT_ANSICOLOR:
        // express.e:3904-3906: ANSI color mode
        console.log(`[DoorMessageHandler]   DT_ANSICOLOR: data=${data}`);
        // Set ANSI mode (web BBS is always ANSI)
        break;

      case DT_ISANSI:
        // express.e:3907-3908: Check if ANSI mode
        console.log(`[DoorMessageHandler]   DT_ISANSI`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      // BB_* commands (BBS info)
      case BB_CONFNAME:
        // express.e:3693-3700: Get/Set conference name
        console.log(`[DoorMessageHandler]   BB_CONFNAME: data=${data}`);
        if (data) {
          // Get current conference name
          const confName = this.config.bbsSession?.conferenceName || "Main";
          this.writeStringToMessage(msgAddr, confName);
        } else {
          // Set conference name
          console.log(`[DoorMessageHandler]   Set conference name to: ${str}`);
        }
        break;

      case BB_CONFLOCAL:
        // express.e:3701-3707: Get/Set conference location (directory)
        console.log(`[DoorMessageHandler]   BB_CONFLOCAL: data=${data}`);
        if (data) {
          // Get current conference directory
          const confDir = this.config.bbsSession?.conferenceDir || "CONF1:";
          this.writeStringToMessage(msgAddr, confDir);
        } else {
          // Set conference location
          console.log(`[DoorMessageHandler]   Set conference location to: ${str}`);
        }
        break;

      case BB_LOCAL:
        // express.e:3708-3709: BBS local directory
        console.log(`[DoorMessageHandler]   BB_LOCAL`);
        this.writeStringToMessage(msgAddr, this.config.bbsSession?.bbsRoot || "/");
        break;

      case BB_TASKPRI:
        // express.e:3744-3746: Task priority
        console.log(`[DoorMessageHandler]   BB_TASKPRI`);
        this.writeStringToMessage(msgAddr, "0");
        break;

      case BB_CHATFLAG:
        // express.e:3750-3755: Sysop available flag
        console.log(`[DoorMessageHandler]   BB_CHATFLAG`);
        this.writeStringToMessage(msgAddr, "OFF");
        break;

      case BB_CHATSET:
        // express.e:3756-3767: Get/Set chat paged flag
        console.log(`[DoorMessageHandler]   BB_CHATSET: data=${data}`);
        if (data) {
          // Get current paged flag
          this.writeStringToMessage(msgAddr, "0");
        } else {
          // Set paged flag from string
          const pagedFlag = parseInt(str) || 0;
          console.log(`[DoorMessageHandler]   Set paged flag to: ${pagedFlag}`);
          // express.e:3764-3766: IF pagedFlag AND Not(temp) THEN sysopPaged()
        }
        break;

      case BB_MAINLINE:
        // express.e:3794-3800: Main command line
        console.log(`[DoorMessageHandler]   BB_MAINLINE`);
        this.writeStringToMessage(msgAddr, "");
        break;

      case BB_NODEID:
        // express.e:3801-3803: Node ID
        console.log(`[DoorMessageHandler]   BB_NODEID`);
        const nodeId = this.config.bbsSession?.nodeId || 1;
        this.writeStringToMessage(msgAddr, String(nodeId));
        break;

      case BB_CONFNUM:
        // express.e:3831-3833: Conference number
        console.log(`[DoorMessageHandler]   BB_CONFNUM`);
        this.writeStringToMessage(msgAddr, "0");
        break;

      case BB_LOGONTYPE:
        // express.e:3859-3860: Logon type
        console.log(`[DoorMessageHandler]   BB_LOGONTYPE`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      case BB_LINECOUNT:
        // express.e:3877-3882: Get/Set line count (for pause tracking)
        if (data) {
          // Get current line count - return as string
          console.log(`[DoorMessageHandler]   BB_LINECOUNT GET: ${this.lineCount}`);
          this.writeStringToMessage(msgAddr, String(this.lineCount));
        } else {
          // Set line count from string
          this.lineCount = parseInt(str) || 0;
          console.log(`[DoorMessageHandler]   BB_LINECOUNT SET: ${this.lineCount}`);
        }
        break;

      // System commands
      case EXPRESS_VERSION:
        // express.e:3808-3810: Express version
        console.log(`[DoorMessageHandler]   EXPRESS_VERSION`);
        this.writeStringToMessage(msgAddr, "v4.0");
        break;

      case RAWARROW:
        // express.e:3814-3815: Toggle raw arrow mode
        console.log(`[DoorMessageHandler]   RAWARROW`);
        break;

      case ACTIVE_NODES:
        // express.e:3661-3666: Active nodes bitmap
        console.log(`[DoorMessageHandler]   ACTIVE_NODES`);
        this.writeStringToMessage(msgAddr, "X               ");
        break;

      case MULTICOM:
        // express.e:3909-3910: Multi-node master node
        console.log(`[DoorMessageHandler]   MULTICOM`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case NODE_BAUD:
      case NODE_BAUDRATE:
        // express.e:3842-3847: Baud rate
        console.log(`[DoorMessageHandler]   NODE_BAUD*`);
        this.writeStringToMessage(msgAddr, "115200");
        break;

      // Transfer commands
      case ZMODEMSEND:
      case BATCHZMODEMSEND:
      case ZMODEMRECEIVE:
        // express.e:3710-3739: File transfer
        console.log(`[DoorMessageHandler]   ZMODEM: Transfer not supported`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        break;

      case AXNET_SEND:
      case AXNET_RECEIVE:
        // express.e:3986-4014: AXNet transfer
        console.log(`[DoorMessageHandler]   AXNET: Transfer not supported`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        break;

      // Account management
      case LOAD_ACCOUNT:
      case EXT_LOAD_ACCOUNT:
        // express.e:3911-3912: Load user account
        console.log(`[DoorMessageHandler]   LOAD_ACCOUNT: data=${data}`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case SAVE_ACCOUNT:
        // express.e:3927-3928: Save user account
        console.log(`[DoorMessageHandler]   SAVE_ACCOUNT: data=${data}`);
        break;

      case SEARCH_ACCOUNT:
        // express.e:3913-3914: Search for account
        console.log(`[DoorMessageHandler]   SEARCH_ACCOUNT: data=${data}`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case LAST_ACCOUNTNUM:
        // express.e:3925-3926: Last account number
        console.log(`[DoorMessageHandler]   LAST_ACCOUNTNUM`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      // Misc commands with simple responses
      case SCREEN_ADDRESS:
      case RAWSCREEN_ADDRESS:
      case GET_GNSFLAG:
        // express.e:4036-4037: Get non-stop text flag status
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
          this.nonStopDisplayFlag ? 1 : 0
        );
        console.log(`[DoorMessageHandler]   GET_GNSFLAG: ${this.nonStopDisplayFlag ? 1 : 0}`);
        break;

      case GET_XIMPORT:
        // express.e:4047-4048: Get XIM import port number
        // Default XIM port is 2324
        console.log(`[DoorMessageHandler]   GET_XIMPORT: 2324`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 2324);
        break;

      case CONF_ACCESS:
        // express.e:4023-4028: Check conference access
        // Returns: 0=no access, 1=has access, 2=invalid conf
        if (data < 0 || data >= 256) {
          // Invalid conference number
          console.log(`[DoorMessageHandler]   CONF_ACCESS: Invalid conf ${data}, returning 2`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 2);
        } else {
          // For now, assume all conferences are accessible (requires conference system integration)
          console.log(`[DoorMessageHandler]   CONF_ACCESS: Conf ${data} accessible, returning 1`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        }
        break;

      case CHECK_REALNAME:
      case ICONIFYQUERY:
        // express.e:4199-4200: Check if iconified
        // Web BBS is never iconified
        console.log(`[DoorMessageHandler]   ICONIFYQUERY: NO (web BBS)`);
        this.writeStringToMessage(msgAddr, "NO");
        break;

      case QUIET_DOWNLOAD:
        // Various query commands
        console.log(`[DoorMessageHandler]   Misc query command: ${command}`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      // Commands that don't need responses
      case BB_NONSTOPTEXT:
        // express.e:3875-3876: Enable/disable non-stop text (pagination)
        this.nonStopDisplayFlag = data !== 0;
        console.log(`[DoorMessageHandler]   BB_NONSTOPTEXT: ${this.nonStopDisplayFlag ? 'ENABLED' : 'DISABLED'}`);
        break;

      case BB_PURGELINE:
        // express.e:3869-3870,1914-1924: Clear input buffer
        console.log(`[DoorMessageHandler]   BB_PURGELINE: Clearing input buffer (no-op in web)`);
        // In web environment, no serial buffer to clear
        break;

      case BB_PURGELINESTART:
        // express.e:3871-3872,1906-1912: Clear buffer and restart read
        console.log(`[DoorMessageHandler]   BB_PURGELINESTART: Clear and restart (no-op in web)`);
        break;

      case BB_PURGELINEEND:
        // express.e:3873-3874,1889-1904: Abort and clear buffer
        console.log(`[DoorMessageHandler]   BB_PURGELINEEND: Abort and clear (no-op in web)`);
        break;

      case BB_DROPDTR:
      case ENVSTAT:
      case SV_NEWMSG:
      case PRV_COMMAND:
      case PRV_GROUP:
      case DT_DUMP:
      case DT_MSGCODE:
      case DT_QUICKFLAG:
      case DT_GOODFILE:
      case DT_ADDBIT:
      case DT_REMBIT:
      case DT_QUERYBIT:
      case DT_FILECODE:
      case DT_LANGUAGE:
      case DT_TRANSLATOR:
      case DT_HOST_LANGUAGE:
      case DT_GEOGRAPHIC:
      case DT_SIZEUPLOAD:
      case DT_SIZEDOWNLOAD:
      case DT_CONFACCESS2:
      case DT_CBYTESUPLOAD:
      case DT_CBYTESDOWNLOAD:
      case DT_CFILESUPLOAD:
      case DT_CFILESDOWNLOAD:
      case DT_CALLEDTODAY:
      case BB_PCONFNAME:
        // express.e:3779-3785: Get conference name by number (1-9)
        {
          const confNum = parseInt(str) || 0;
          if (confNum < 1 || confNum > 9) {
            console.log(`[DoorMessageHandler]   BB_PCONFNAME: Invalid conf ${confNum}, returning ERROR`);
            this.writeStringToMessage(msgAddr, "ERROR");
          } else {
            // Return generic conference name (requires conference system integration)
            const confName = `Conference ${confNum}`;
            console.log(`[DoorMessageHandler]   BB_PCONFNAME: ${confNum} -> "${confName}"`);
            this.writeStringToMessage(msgAddr, confName);
          }
        }
        break;

      case BB_PCONFLOCAL:
      case BB_CALLERSLOG:
        // express.e:3804-3805: Log to callers log
        console.log(`[DoorMessageHandler]   BB_CALLERSLOG: "${str}"`);
        // Callers log would write to Node1/CallersLog file
        break;

      case BB_UDLOG:
        // express.e:3806-3807: Log to upload/download log
        console.log(`[DoorMessageHandler]   BB_UDLOG: "${str}"`);
        // U/D log would write to appropriate file
        break;

      case BB_GETTASK:
      case BB_SCRLEFT:
        // express.e:3861-3862: Screen left edge (0 for terminals)
        console.log(`[DoorMessageHandler]   BB_SCRLEFT: 0`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case BB_SCRTOP:
        // express.e:3863-3864: Screen top edge (0 for terminals)
        console.log(`[DoorMessageHandler]   BB_SCRTOP: 0`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case BB_SCRWIDTH:
        // express.e:3865-3866: Screen width (80 columns standard)
        console.log(`[DoorMessageHandler]   BB_SCRWIDTH: 80`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 80);
        break;

      case BB_SCRHEIGHT:
        // express.e:3867-3868: Screen height (24 rows standard)
        console.log(`[DoorMessageHandler]   BB_SCRHEIGHT: 24`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 24);
        break;

      case BB_CONFACCOUNT:
      case EDITOR_STRUCT:
      case LOAD_CONFDB:
      case SAVE_CONFDB:
      case GET_CONFNUM:
      case MOD_TYPE:
      case ACP_COMMAND:
      case BYPASS_CSI_CHECK:
      case SENTBY:
      case SETOVERIDE:
      case FULLEDIT:
      case SETMCIOFF:
      case GET_CUSTOM_MSGBASE_PARAM1:
      case GET_CUSTOM_MSGBASE_PARAM2:
      case LAST_READ:
      case LAST_SCANNED:
      case MSGBASE_LOC:
      case GET_CUSTOM_MSGBASE_MENUCMD:
      case SER_INOUT:
      case MEMCONF:
      case SET_SERSHARED:
      case PASSWORD_HASH:
        // express.e:4029-4035: Get password hash
        // Returns empty hash for now (requires user session integration)
        console.log(`[DoorMessageHandler]   PASSWORD_HASH: Returning empty hash`);
        this.writeStringToMessage(msgAddr, "");
        break;

      case GET_MENU_COMMAND_CHAR:
        // express.e:4049-4050: Get message menu command character
        // Default is '/' for AmiExpress
        console.log(`[DoorMessageHandler]   GET_MENU_COMMAND_CHAR: 47 ('/')`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 47); // ASCII '/'
        break;

      case DISPLAY_FILE:
        // express.e:4038-4039: Display file by path
        console.log(`[DoorMessageHandler]   DISPLAY_FILE: ${str}`);
        await this.displayFile(str);
        break;

      case CHECK_TO_DISPLAY:
        // express.e:4040-4041: Find and display security screen if it exists
        console.log(`[DoorMessageHandler]   CHECK_TO_DISPLAY: ${str}`);
        try {
          const screenPath = this.findSecurityScreen(str);
          if (screenPath) {
            await this.displayFile(screenPath);
          }
        } catch (error: any) {
          console.error(`[DoorMessageHandler]   CHECK_TO_DISPLAY error:`, error.message);
        }
        break;

      case SET_FILEATTACH:
        // express.e:4042-4043: Enable/disable file attach mode
        console.log(`[DoorMessageHandler]   SET_FILEATTACH: ${data !== 0 ? 'ENABLED' : 'DISABLED'}`);
        // File attach mode would be stored in session state
        break;

      case INTERPRET_MCI:
        // express.e:4044-4046: Process MCI codes and return result in msg.string
        console.log(`[DoorMessageHandler]   INTERPRET_MCI: "${str}"`);
        try {
          const bbsSession = (this.config as any)?.bbsSession || {};
          const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
          const sysopName = bbsSession.sysopName || 'Sysop';
          const location = bbsSession.user?.location || 'The Internet';
          const result = await parseMciCodes(str, bbsSession, bbsName, sysopName, location);
          this.writeStringToMessage(msgAddr, result.parsed);
          console.log(`[DoorMessageHandler]   INTERPRET_MCI result: "${result.parsed}"`);
        } catch (error: any) {
          console.error(`[DoorMessageHandler]   INTERPRET_MCI error:`, error.message);
          this.writeStringToMessage(msgAddr, str); // Return original on error
        }
        break;

      case FILE_REQUEST:
        // express.e:4051-4052: ASL file requester
        // Not applicable in web environment - return empty path
        console.log(`[DoorMessageHandler]   FILE_REQUEST: Not supported in web (returning empty)`);
        this.writeStringToMessage(msgAddr, "");
        break;

      case DISABLE_FILE_ATTACH:
        // express.e:4053-4054: Disable file attach
        console.log(`[DoorMessageHandler]   DISABLE_FILE_ATTACH: ${data !== 0 ? 'DISABLED' : 'ENABLED'}`);
        // File attach disallow flag would be stored in session state
        break;

      case QWKZOOM_REC:
        // express.e:4055-4059: QWK zoom record number
        console.log(`[DoorMessageHandler]   QWKZOOM_REC: Not implemented`);
        break;

      case REL_CONF:
        // express.e:4062-4063: Release conference
        console.log(`[DoorMessageHandler]   REL_CONF: conf=${data}`);
        // Returns conference number after release
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, data);
        break;

      case CHECK_PLAYPEN_EXISTS:
        // express.e:4066-4068: Check if file exists in playpen
        {
          const filePath = str || "";
          const exists = fs.existsSync(filePath) ? 1 : 0;
          console.log(`[DoorMessageHandler]   CHECK_PLAYPEN_EXISTS: "${filePath}" exists=${exists}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, exists);
        }
        break;

      case CHOOSE_NAME:
      case EXT_CHOOSE_NAME:
        // express.e:4069-4077: Choose user name from accounts
        {
          const userPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER1_OFFSET);
          const keysPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER2_OFFSET);
          const miscPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER3_OFFSET);
          const searchName = str.toLowerCase();

          console.log(`[DoorMessageHandler]   CHOOSE_NAME: searching for "${searchName}"`);

          // Search for user by name in database
          const user = this.config.bbsSession?.user;
          if (user && (user.username.toLowerCase() === searchName || user.name?.toLowerCase() === searchName)) {
            // Found matching user - write user data to memory pointers
            if (userPtr) {
              const userBuf = Buffer.alloc(239);
              userBuf.writeUInt32BE(user.id ? parseInt(user.id) : 1, 0); // slot number
              // Write username (32 bytes max)
              const username = user.username.substring(0, 31);
              userBuf.write(username, 4, 'latin1');
              // Write buffer byte by byte
              for (let i = 0; i < userBuf.length; i++) {
                this.emulator.writeMemory(userPtr + i, userBuf[i]);
              }
            }
            if (keysPtr) {
              const keysBuf = Buffer.alloc(54);
              keysBuf.writeUInt32BE(user.id ? parseInt(user.id) : 1, 0); // number
              // Write real name (32 bytes max)
              const realName = (user.name || user.username).substring(0, 31);
              keysBuf.write(realName, 4, 'latin1');
              // Write buffer byte by byte
              for (let i = 0; i < keysBuf.length; i++) {
                this.emulator.writeMemory(keysPtr + i, keysBuf[i]);
              }
            }
            if (miscPtr) {
              const miscBuf = Buffer.alloc(256);
              // Write buffer byte by byte
              for (let i = 0; i < miscBuf.length; i++) {
                this.emulator.writeMemory(miscPtr + i, miscBuf[i]);
              }
            }
            console.log(`[DoorMessageHandler]   CHOOSE_NAME: Found user ${user.username}`);
            this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1); // Success
          } else {
            console.log(`[DoorMessageHandler]   CHOOSE_NAME: User not found`);
            this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0); // Not found
          }
        }
        break;

      case APPEND_ACCOUNT:
        // express.e:3915-3924: Append/find account entry (findOpenAccount)
        {
          const userPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER1_OFFSET);
          const keysPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER2_OFFSET);
          const miscPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER3_OFFSET);

          // Find next available slot (use simple counter for now)
          const slot = Date.now() % 10000; // Simple slot assignment

          console.log(`[DoorMessageHandler]   APPEND_ACCOUNT: Creating account slot ${slot}`);

          // Initialize user buffers with slot number
          if (userPtr) {
            const userBuf = Buffer.alloc(239);
            userBuf.writeUInt32BE(slot, 0); // slot number at offset 0
            // Write buffer byte by byte
            for (let i = 0; i < userBuf.length; i++) {
              this.emulator.writeMemory(userPtr + i, userBuf[i]);
            }
          }
          if (keysPtr) {
            const keysBuf = Buffer.alloc(54);
            keysBuf.writeUInt32BE(slot, 0); // number at offset 0
            // Write buffer byte by byte
            for (let i = 0; i < keysBuf.length; i++) {
              this.emulator.writeMemory(keysPtr + i, keysBuf[i]);
            }
          }
          if (miscPtr) {
            const miscBuf = Buffer.alloc(256);
            // Write buffer byte by byte
            for (let i = 0; i < miscBuf.length; i++) {
              this.emulator.writeMemory(miscPtr + i, miscBuf[i]);
            }
          }

          console.log(`[DoorMessageHandler]   APPEND_ACCOUNT: Account slot ${slot} initialized`);
        }
        break;

      case XNET_OUTBOUND:
        // express.e:4107-4108: Set XNet outbound directory
        console.log(`[DoorMessageHandler]   XNET_OUTBOUND: "${str}"`);
        // XNet outbound directory for mail
        break;

      case CON_CURSOR:
        // express.e:4121-4126: Console cursor control
        console.log(`[DoorMessageHandler]   CON_CURSOR: ${data ? 'ON' : 'OFF'}`);
        // Cursor visibility handled by terminal emulator
        break;

      case TELNET_CONNECT:
        // express.e:4127-4128: Connect to telnet host
        console.log(`[DoorMessageHandler]   TELNET_CONNECT: "${str}" port=${data}`);
        // Telnet connectivity handled by telnet-connect door
        break;

      case TELNET_USERNAME_PROMPT:
        // express.e:4129-4130: Set telnet username prompt
        console.log(`[DoorMessageHandler]   TELNET_USERNAME_PROMPT: "${str}"`);
        break;

      case TELNET_USERNAME:
        // express.e:4131-4132: Set telnet username
        console.log(`[DoorMessageHandler]   TELNET_USERNAME: "${str}"`);
        break;

      case TELNET_PASSWORD_PROMPT:
        // express.e:4133-4134: Set telnet password prompt
        console.log(`[DoorMessageHandler]   TELNET_PASSWORD_PROMPT: "${str}"`);
        break;

      case TELNET_PASSWORD:
        // express.e:4135-4136: Set telnet password
        console.log(`[DoorMessageHandler]   TELNET_PASSWORD: (hidden)`);
        break;
      case GET_CMD_TOOLTYPE:
        // express.e:4137-4140: Read tooltype from command file
        console.log(`[DoorMessageHandler]   GET_CMD_TOOLTYPE: Not implemented (returns empty)`);
        this.writeStringToMessage(msgAddr, "");
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case SIG_PLAYPEN:
        // express.e:4196-4198: Get playpen directory path
        {
          const nodeId = this.config.bbsSession?.nodeId || 1;
          const playpenPath = `Node${nodeId}/Playpen/`;
          console.log(`[DoorMessageHandler]   SIG_PLAYPEN: "${playpenPath}"`);
          this.writeStringToMessage(msgAddr, playpenPath);
        }
        break;

      case LOGON_UNAME:
        // express.e:4201-4202: Auto-login username (not supported)
        console.log(`[DoorMessageHandler]   LOGON_UNAME: Not supported`);
        break;

      case LOGON_UPASS:
        // express.e:4203-4204: Auto-login password (not supported)
        console.log(`[DoorMessageHandler]   LOGON_UPASS: Not supported`);
        break;

      case SIG_LI:
        // express.e:4205-4207: Get password input
        console.log(`[DoorMessageHandler]   SIG_LI: Password input`);
        // Password input would be handled via Socket.IO
        this.writeStringToMessage(msgAddr, "");
        break;
      case NODE_DEVICE:
        // express.e:3848-3849: Get serial device name
        {
          const deviceName = this.config.bbsSession?.connectionType || 'websocket';
          console.log(`[DoorMessageHandler]   NODE_DEVICE: "${deviceName}"`);
          this.writeStringToMessage(msgAddr, deviceName);
        }
        break;

      case NODE_UNIT:
        // express.e:3850-3852: Get serial device unit number
        {
          const unitNumber = this.config.bbsSession?.nodeId || 0;
          console.log(`[DoorMessageHandler]   NODE_UNIT: ${unitNumber}`);
          this.writeStringToMessage(msgAddr, String(unitNumber));
        }
        break;

      case UNKNOWN4:
        // Unknown/undocumented command
        console.log(`[DoorMessageHandler]   UNKNOWN4: Not implemented`);
        break;

      default:
        console.log(`[DoorMessageHandler]   Unknown command: ${command}`);
        console.log(`[DoorMessageHandler]   Returning unchanged message`);
        break;
    }

    // Reply to the door by sending message back to its reply port
    this.execLibrary.putMsg(replyPortAddr, msgAddr, {
      suppressDoorCallback: true,
    });
    console.log(
      `[DoorMessageHandler]   Sent reply to door at port 0x${replyPortAddr.toString(16)}`
    );
  }

  /**
   * Suspend execution and wait for a keypress from the socket, then resume.
   */
  private waitForKeypress(msgAddr: number, replyPortAddr: number): void {
    const handler = (data: { keyCode?: number; char?: string }) => {
      // Prefer explicit keyCode; fallback to first char code or Enter
      const code =
        typeof data.keyCode === "number"
          ? data.keyCode
          : data.char?.charCodeAt(0) ?? 0x0d;

      this.emulator.writeMemory32(msgAddr + 24, code);
      this.execLibrary.putMsg(replyPortAddr, msgAddr, {
        suppressDoorCallback: true,
      });
      this.socket.off("door:keypress", handler);
      this.socket.off("keypress", handler);
      console.log(`[DoorMessageHandler]   Resumed door with key 0x${code.toString(16)}`);
    };

    // Listen for keypress events from the client; support both legacy and door-specific
    this.socket.on("door:keypress", handler);
    this.socket.on("keypress", handler);
    this.socket.emit("door:await-key");
  }

  /**
   * Write a string to the message string field
   */
  private writeStringToMessage(msgAddr: number, str: string): void {
    // Write string to offset 28 (after Message header + command + data)
    for (let i = 0; i < str.length && i < 200; i++) {
      this.emulator.writeMemory(msgAddr + 28 + i, str.charCodeAt(i));
    }
    // Null terminate
    this.emulator.writeMemory(msgAddr + 28 + str.length, 0);
  }

  /**
   * Log door message contents for debugging
   */
  private logDoorMessageContents(msgAddr: number, label: string): void {
    const replyPort = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET
    );
    const length = this.emulator.readMemory16(
      msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET
    );
    const command = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET
    );
    const data = this.emulator.readMemory32(
      msgAddr + DoorConstants.MESSAGE_DATA_OFFSET
    );
    let str = "";
    const stringBase = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    for (let i = 0; i < DoorConstants.MESSAGE_STRING_CAPACITY; i++) {
      const ch = this.emulator.readMemory(stringBase + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(
      `[DoorMessageHandler] ${label}: msg=0x${msgAddr.toString(
        16
      )}, len=${length}, cmd=${command}, data=${data}, reply=0x${replyPort.toString(
        16
      )}, str="${str}"`
    );
  }

  /**
   * Emulate Exec PutMsg for doors that bypass the normal vector
   */
  emulateExecPutMsg(
    portAddr: number,
    msgAddr: number,
    returnAddr?: number
  ): void {
    console.log(
      `[DoorMessageHandler] >>> Host handling PutMsg(port=0x${portAddr.toString(
        16
      )}, msg=0x${msgAddr.toString(16)})`
    );
    this.execLibrary.putMsg(portAddr, msgAddr);

    const sp = this.emulator.getRegister(15);
    let resumePc = returnAddr ?? this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4);
    this.emulator.setRegister(16, resumePc);
    this.emulator.refillPrefetch();

    console.log(
      `[DoorMessageHandler] <<< PutMsg emulation complete, returning to 0x${resumePc.toString(
        16
      )}`
    );
  }

  // Private helper methods
  private ensureDoorInfoStructure(): void {
    if (!this.execLibrary || !this.emulator) {
      return;
    }
    // Ensure reply port exists
    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = this.execLibrary.createMsgPort();
    }
    // Minimal allocations to satisfy Bulls node-status message
    if (this.nodeStatusAddr === 0) {
      this.nodeStatusAddr = this.execLibrary.allocMem(256, DoorConstants.MEMF_PUBLIC_CLEAR);
    }
    if (this.doorInfoAddr === 0) {
      this.doorInfoAddr = this.execLibrary.allocMem(256, DoorConstants.MEMF_PUBLIC_CLEAR);
    }
  }

  private resolveNodeId(): number {
    const session = this.config.bbsSession;
    if (session) {
      if (typeof session.nodeId === "number") {
        return session.nodeId;
      }
      if (typeof session.nodeNumber === "number") {
        return session.nodeNumber;
      }
    }
    return 0;
  }

  private writeStringToMemory(
    address: number,
    value: string,
    maxLength: number
  ): void {
    const truncated = value.slice(0, Math.max(0, maxLength - 1));
    for (let i = 0; i < truncated.length; i++) {
      this.emulator.writeMemory(address + i, truncated.charCodeAt(i));
    }
    this.emulator.writeMemory(address + truncated.length, 0);
  }

  // Public getters for message statistics
  getMessageCount(): number {
    return this.messageCount;
  }

  isMessageLoggingEnabled(): boolean {
    return this.messageConfig.enableMessageLogging;
  }

  /**
   * Update message processing configuration
   */
  updateMessageConfig(updates: Partial<MessageProcessingConfig>): void {
    this.messageConfig = { ...this.messageConfig, ...updates };
  }

  /**
   * Find security-specific screen file based on user's security level
   * express.e:6246-6290 - findSecurityScreen()
   *
   * @param screenPath - Base screen path (e.g., "Screens/MENU")
   * @returns Full path to security-specific file if found, or base.txt if not
   */
  private findSecurityScreen(screenPath: string): string | null {
    const bbsRoot = this.config.bbsSession?.bbsRoot || this.config.bbsSession?.dataDir || "";
    const user = this.config.bbsSession?.user;
    const secLevel = user?.secLevel || 0;

    // Round down to nearest 5 (express.e:6275)
    let currentLevel = Math.floor(secLevel / 5) * 5;
    const minLevel = 5;

    // Try security-level-specific screens from current level down to minLevel
    while (currentLevel >= minLevel) {
      const secFilePath = path.join(bbsRoot, `${screenPath}${currentLevel}.txt`);
      if (fs.existsSync(secFilePath)) {
        return secFilePath;
      }
      currentLevel -= 5;
    }

    // Fall back to base file
    const basePath = path.join(bbsRoot, `${screenPath}.txt`);
    if (fs.existsSync(basePath)) {
      return basePath;
    }

    return null;
  }

  /**
   * Display a file to the terminal
   * express.e:6746-6850 - displayFile()
   * Simplified version without MCI processing for now
   *
   * @param filePath - Full path to file to display
   * @returns true if file was displayed, false if not found
   */
  private async displayFile(filePath: string): Promise<boolean> {
    try {
      if (!fs.existsSync(filePath)) {
        console.log(`[DoorMessageHandler] File not found: ${filePath}`);
        return false;
      }

      const contents = fs.readFileSync(filePath, "utf-8");

      // Process MCI codes in file contents (express.e:6790-6820)
      const bbsSession = (this.config as any)?.bbsSession || {};
      const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
      const sysopName = bbsSession.sysopName || 'Sysop';
      const location = bbsSession.user?.location || 'The Internet';

      try {
        const result = await parseMciCodes(contents, bbsSession, bbsName, sysopName, location);

        // Replace \n with \r\n for proper terminal display
        const displayContents = result.parsed.replace(/\n/g, "\r\n");
        this.socket.emit("ansi-output", displayContents);

        console.log(`[DoorMessageHandler] Displayed file with MCI: ${filePath} (${contents.length} bytes)`);
      } catch (mciError: any) {
        console.warn(`[DoorMessageHandler] MCI processing failed, displaying raw: ${mciError.message}`);
        // Fallback to raw display if MCI processing fails
        const displayContents = contents.replace(/\n/g, "\r\n");
        this.socket.emit("ansi-output", displayContents);
      }

      return true;
    } catch (error: any) {
      console.error(`[DoorMessageHandler] Error reading file ${filePath}:`, error?.message);
      return false;
    }
  }
}

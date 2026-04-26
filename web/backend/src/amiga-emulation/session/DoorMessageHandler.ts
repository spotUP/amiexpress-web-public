// DoorMessageHandler.ts
// Phase 5B: Message Processing and IPC Handling
// Handles door messages, XIM protocol, and inter-process communication
// 2025-11-20

import { MoiraEmulator } from "../cpu/MoiraEmulator.js";
import { Socket } from "socket.io";
import { ExecLibrary } from "../api/ExecLibrary.js";
import { XIMProtocol, XIMCommand } from "../XIMProtocol.js";
import { DoorConfig, DoorConstants, AEDoorCommand } from "../DoorTypes.js";
import { logDoorMessage } from "../../utils/door-logging.util";
import { populateDoorInfoStructs } from "./door-info.util.js";
import { parseMciCodes } from "../../handlers/screen.handler.js";
import { parseInfoFile } from "../../utils/amiga-command-parser.util.js";
import { debugLog } from "../../utils/debug-log";
import * as fs from "fs";
import * as path from "path";
import * as net from "net";

// Telnet session state for TELNET_CONNECT command (express.e:3051-3302)
interface TelnetSessionState {
  usernamePrompt: string;
  username: string;
  passwordPrompt: string;
  password: string;
  connection: net.Socket | null;
  connected: boolean;
  loginSent: boolean;
  originalInputHandler: ((data: string) => void) | null;
  // For blocking reply - store message address to reply when session ends
  pendingMsgAddr: number;
}

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
  onInput?: (input: string) => void;
}

export class DoorMessageHandler {
  private emulator: MoiraEmulator;
  private socket: Socket;
  private execLibrary: ExecLibrary;
  private ximProtocol: XIMProtocol | null = null;
  private config: DoorConfig;

  // Message processing state
  private messageConfig: MessageProcessingConfig;
  private messageCount: number = 0;
  private activeInput: ActiveInputState | null = null;

  // Door display state (express.e:3876,3877)
  private lineCount: number = 0;
  private nonStopDisplayFlag: boolean = false;
  private waitingForPause: boolean = false;

  /**
   * Convert Amiga/Latin-1 character bytes to ASCII equivalents for terminal display.
   * Amiga BBSes use Latin-1 character set, but modern terminals expect ASCII or UTF-8.
   * Key mappings:
   * - 0xA0 (non-breaking space in Latin-1) -> 0x20 (regular space)
   * - Other high-bit characters (0x80-0xFF) -> stripped or converted as needed
   */
  private amigaCharToAscii(byte: number): number {
    // Non-breaking space (0xA0) -> regular space (0x20)
    // This fixes MultiTop and other doors using 0xA0 as thousands separator
    if (byte === 0xA0) {
      return 0x20;
    }

    // For now, pass through ASCII (0x00-0x7F) and strip other high-bit chars
    // Extended Latin-1 chars (0x80-0xFF) would need individual mappings if used
    if (byte >= 0x80 && byte <= 0xFF && byte !== 0xA0) {
      // Strip unrecognized high-bit characters to avoid display issues
      return 0x20; // Convert to space for safety
    }

    return byte;
  }

  // Old-style door compatibility fallback
  private oldStyleDoorTimer: NodeJS.Timeout | null = null;
  private receivedPostRegisterMessage: boolean = false;

  private logMessageRequest(
    msgAddr: number,
    command: number,
    data: number,
    str: string
  ): void {
debugLog(`[DoorMessageHandler] msg request: ${command}`);
debugLog(`[DoorMessageHandler] data: ${data}`);
debugLog(`[DoorMessageHandler] string: ${str ?? ""}`);
  }

  // Shared references (managed by parent)
  private doorReplyPortAddr: number = 0;
  private doorPortAddress: number = 0;
  private doorInfoAddr: number = 0;
  private nodeStatusAddr: number = 0;
  private doorSummaryPtr: number = 0;
  private aePortAddress: number = 0;
  private sentInitialMessage: boolean = false;

  // Telnet session state for TELNET_CONNECT (express.e:3051-3302)
  private telnetState: TelnetSessionState = {
    usernamePrompt: '',
    username: '',
    passwordPrompt: '',
    password: '',
    connection: null,
    connected: false,
    loginSent: false,
    originalInputHandler: null,
    pendingMsgAddr: 0
  };

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
      suppressCallbacks: false,
      enableMessageLogging: process.env.AEDOOR_MSG_LOG === "true",
      maxMessageSize: 1000,
      bufferSize: 256,
    };
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

  isWaitingForPause(): boolean {
    return this.waitingForPause;
  }

  /**
   * Setup Socket.IO input handler for JH_PM/JH_LI/JH_HK commands
   * Listens to door:input events and resumes emulator when input arrives
   */
  private setupInputHandler(): void {
    this.socket.on("door:input", (data: string) => {
      if (!this.activeInput) {
debugLog("[DoorMessageHandler] door:input received but no active input request");
        return;
      }

      const { msgAddr, maxlen, command, replyPortAddr, resumeCallback, onInput } = this.activeInput;
debugLog(`[DoorMessageHandler] door:input: "${data}" for command ${command}`);

      // Trim to maxlen
      const trimmed = data.slice(0, maxlen);

      if (onInput) {
        this.activeInput = null;
        onInput(trimmed);
        return;
      }

      // Write input to message string
      this.writeStringToMessage(msgAddr, trimmed);

      // Set data field: 1 for success (got input)
      this.emulator.writeMemory32(
        msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
        1
      );

debugLog(`[DoorMessageHandler] Wrote input "${trimmed}" to message`);

      // Reply to door (express.e:4232 - ReplyMsg after processing)
      this.execLibrary.putMsg(replyPortAddr, msgAddr, {
        suppressDoorCallback: true,
      });
debugLog(`[DoorMessageHandler] Sent reply to door at port 0x${replyPortAddr.toString(16)}`);

      // Clear active input and resume
      this.activeInput = null;
      resumeCallback();
    });
  }

  private async checkForPause(): Promise<number> {
    const user = this.config.bbsSession?.user;
    if (!user) {
      return 0;
    }

    const rawLineLen = user.linesPerScreen ?? user.lineLength ?? 0;
    const lineLen = typeof rawLineLen === "number" && rawLineLen > 0 ? rawLineLen : 22;

    if (!this.nonStopDisplayFlag) {
      this.lineCount += 1;
    }

    if (!this.nonStopDisplayFlag && this.lineCount >= lineLen) {
      if (this.activeInput) {
        return 0;
      }

      this.lineCount = 0;
      this.socket.emit("ansi-output", "(Pause)...More(y/n/ns)? ");
      this.waitingForPause = true;
      const input = await this.waitForPauseResponse();
      this.waitingForPause = false;
      const trimmed = input.trim();
      if (trimmed.length > 0 && (trimmed[0] === "N" || trimmed[0] === "n")) {
        if (trimmed.length > 1 && (trimmed[1] === "S" || trimmed[1] === "s")) {
          this.nonStopDisplayFlag = true;
        } else {
          this.socket.emit("ansi-output", "\x1b[1A\x1b[K");
          this.emulator.resume();
          return -1;
        }
      }

      this.socket.emit("ansi-output", "\x1b[1A\x1b[K");
      this.emulator.resume();
    }

    return 0;
  }

  private waitForPauseResponse(): Promise<string> {
    return new Promise((resolve) => {
      this.activeInput = {
        msgAddr: 0,
        maxlen: 3,
        command: XIMCommand.JH_SM,
        replyPortAddr: this.doorReplyPortAddr,
        resumeCallback: () => {},
        onInput: (input: string) => {
          resolve(input);
        },
      };
      this.emulator.pause();
debugLog("[DoorMessageHandler] checkForPause: waiting for user input");
    });
  }

  // CRITICAL FIX: Real Amiga logs show doors initiate communication, NOT the BBS!
  // See Documentation/4-Door-Developers/REAL_AMIGA_XIM_SEQUENCES.md
  // - RTW sends JH_REGISTER (cmd=1) first with reply port "AEDoorRP.000"
  // - Bulls sends JH_REGISTER (cmd=1) first, then starts making requests
  // - AquaScan sends JH_REGISTER (cmd=1) first
  // The BBS does NOT send INIT (0) or STAT (1) - doors start the conversation.
  // Previous implementation was backwards and caused doors to hang waiting.
  //
  // HOWEVER: Some old doors (WALL, JoinCnf) expect old protocol and don't send
  // follow-up messages. For these, we use a 500ms fallback timer to detect and
  // send INIT/STAT if needed (see processCommand JH_REGISTER case).
  sendStartupMessage(): void {
debugLog("[DoorMessageHandler] Sending INIT/STAT to door's task port (pr_MsgPort)");
    // XIM DOOR STARTUP PROTOCOL:
    //
    // Doors with pr_CLI=0 (BBS mode) expect INIT/STAT on their TASK PORT (pr_MsgPort),
    // similar to how Workbench sends startup messages to WB-launched programs.
    //
    // The door reads from pr_MsgPort, replies, then uses AEDoorPort1 for BBS communication.
    // AEDoorPort1 is for door->BBS communication, NOT BBS->door!
    //
    // PREVIOUS BUG: We were sending INIT/STAT to AEDoorPort1, which our own polling
    // consumed before the door could read them.
    //
    // See express.e:4352-4369 for the BBS side of XIM protocol.
    this.sendInitAndStatusMessages();
  }

  /**
   * Send INIT (cmd 0) and STAT (cmd 1) messages for XIM doors, mirroring AEDoor.library
   * layout (Exec message header + command at offset 0x14/0x18).
   */
  sendInitAndStatusMessages(): void {
    // NOTE: Native AEDoor.library does NOT automatically send INIT/STAT messages.
    // We must send them from the emulator regardless of native vs trapped library.
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
      "XIM";

    // Get BBS name and sysop name from disk-based config (passed via bbsSession)
    const bbsName = (this.config.bbsSession as any)?.bbsName || 'AmiExpress-Web';
    const sysopName = (this.config.bbsSession as any)?.sysopName || 'Sysop';

    // Get numeric user status fields for doors like ZooStats that read from BBSInfo structure
    const user = this.config.bbsSession?.user;
    const secLevel = user?.secLevel ?? 10;
    // user.id can be string or number, ensure we get a number
    const userSlot = typeof user?.id === 'string' ? parseInt(user.id, 10) || this.resolveNodeId() : (user?.id ?? this.resolveNodeId());
    const currentConf = (this.config.bbsSession as any)?.currentConf ?? 1;
    // timeRemaining can be at bbsSession level (already in minutes) or user.timeLimit (in seconds)
    const sessionTimeRemaining = (this.config.bbsSession as any)?.timeRemaining;
    const timeRemaining = sessionTimeRemaining ?? Math.floor((user?.timeLimit ?? 3600) / 60);
    const uploads = user?.uploads ?? 0;
    const downloads = user?.downloads ?? 0;

    populateDoorInfoStructs(this.emulator, this.doorInfoAddr, this.nodeStatusAddr, {
      aePort: this.doorPortAddress || this.execLibrary.getDoorPortAddress() || 0,
      replyPort: this.doorReplyPortAddr,
      nodeId: this.resolveNodeId(),
      userName,
      location,
      cliName,
      bbsName,
      sysopName,
      // Numeric fields for doors like ZooStats
      secLevel,
      userSlot,
      conference: currentConf,
      timeRemaining,
      uploads,
      downloads,
    });
    if (!this.doorInfoAddr || !this.nodeStatusAddr) {
console.warn(
        "[DoorMessageHandler] Cannot send init/status messages: missing doorInfo or nodeStatus"
      );
      return;
    }

    // CRITICAL: XIM doors with pr_CLI=0 (BBS mode) expect INIT/STAT on their TASK PORT
    // (pr_MsgPort), NOT on AEDoorPort1! AEDoorPort1 is for door->BBS communication.
    //
    // The door startup sequence (like AquaScan) is:
    //   1. Check pr_CLI - if NULL, in BBS mode
    //   2. Read startup message from pr_MsgPort (like WB startup)
    //   3. Reply to it and continue
    //   4. Call createComm() which finds AEDoorPort1 for sending TO the BBS
    //
    // Our polling on AEDoorPort1 was consuming INIT/STAT before the door could read them
    // because we were sending to the WRONG port!
    const doorTaskAddr = this.execLibrary.getCurrentTaskAddress();
    const doorTaskPort = doorTaskAddr > 0 ? doorTaskAddr + 0x5c : 0; // pr_MsgPort offset in Process
debugLog(`[DoorMessageHandler] Door task: 0x${doorTaskAddr.toString(16)}, pr_MsgPort: 0x${doorTaskPort.toString(16)}`);

    // Target the door's pr_MsgPort where it reads startup messages
    const targetPorts = Array.from(
      new Set([doorTaskPort].filter((p) => p && p > 0))
    );
    const statusText = `NODE ${this.resolveNodeId()} STATUS READY`;

    // Real AEDoor disasm sends two PutMsg calls with d0=0 (INIT) then d0=1 (STAT)
    // CRITICAL: Door DOES reply to these messages - use doorReplyPort, NOT NULL!
    // WHO door works with this format.
    // FIX for AquaScan: INIT data should also point to nodeStatusAddr, not 0.
    // AquaScan reads message data expecting a valid pointer for BBS mode detection.
    const initMsgAddr = this.allocateAedoorStyleMessage(0, this.nodeStatusAddr, "INIT", this.doorReplyPortAddr);
    // CRITICAL: STAT data must point to nodeStatusAddr, not doorInfoAddr + offset
    // Legacy XIM doors read user info, node status etc from this structure
    const statMsgAddr = this.allocateAedoorStyleMessage(
      1,
      this.nodeStatusAddr,
      statusText,
      this.doorReplyPortAddr
    );
    if (initMsgAddr === null || statMsgAddr === null) {
      return;
    }

    const enqueue = (msgAddr: number, label: string) => {
debugLog(
        `[DoorMessageHandler] Sending ${label} message (data=0x${this.emulator.readMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET
        ).toString(16)})`
      );
debugLog(
        `[DoorMessageHandler]   ports=[${targetPorts.map(p => '0x' + p.toString(16)).join(', ')}] msg=0x${msgAddr.toString(
          16
        )} reply=0x${this.doorReplyPortAddr.toString(
          16
        )} len=${DoorConstants.MESSAGE_TOTAL_LENGTH}`
      );
debugLog(
        `[DoorMessageHandler]   header: cmd=0x${this.emulator
          .readMemory32(msgAddr + 20)
          .toString(16)} data=0x${this.emulator
          .readMemory32(msgAddr + 24)
          .toString(16)}`
      );
      for (const dest of targetPorts) {
        this.execLibrary.putMsg(dest, msgAddr, {
          suppressDoorCallback: this.messageConfig.suppressCallbacks,
        });
      }
      // Also queue to the door's reply port (mn_ReplyPort) if present, matching AEDoor behavior where the door may WaitPort on its own reply port.
      if (this.doorReplyPortAddr && !targetPorts.includes(this.doorReplyPortAddr)) {
        this.execLibrary.putMsg(this.doorReplyPortAddr, msgAddr, {
          suppressDoorCallback: this.messageConfig.suppressCallbacks,
        });
      }
    };

    // Send both INIT and STAT messages to door's pr_MsgPort
    enqueue(initMsgAddr, "INIT");
    enqueue(statMsgAddr, "STAT");

    this.sentInitialMessage = true;
  }

  /**
   * Allocate a minimal AEDoor-style message (Exec message header + command/data)
   * so legacy 68K doors see the exact layout expected from AEDoor.library.
   */
  private allocateAedoorStyleMessage(
    command: number,
    data: number,
    messageText: string,
    explicitReplyPort?: number
  ): number | null {
    if (!this.doorInfoAddr) {
console.error("[DoorMessageHandler] Cannot create message without DoorInfo");
console.error("[DoorMessageHandler] Failed to create reply port");
      return null;
    }

    // Ensure reply port exists
    if (this.doorReplyPortAddr === 0) {
      this.doorReplyPortAddr = this.execLibrary.createMsgPort();
    }

    const msgSize = DoorConstants.MESSAGE_TOTAL_LENGTH;
    // AEDoor.library reuses DoorInfo+0x46, but we allocate per message so INIT/STAT
    // are distinct in the queue (prevents overwrite before the door reads them).
    const msgAddr = this.execLibrary.allocMem(
      msgSize,
      DoorConstants.MEMF_PUBLIC_CLEAR
    );
    if (!msgAddr) {
console.error("[DoorMessageHandler] Failed to allocate AEDoor message buffer");
      return null;
    }
    // CRITICAL: Use explicit reply port if provided (e.g., 0 for INIT/STAT), otherwise auto-detect
    const replyPortAddr =
      explicitReplyPort !== undefined
        ? explicitReplyPort
        : this.doorReplyPortAddr ||
          this.emulator.readMemory32(this.doorInfoAddr + 0x4) ||
          this.execLibrary.getDoorPortAddress();
    const NT_MESSAGE = 5;

    // Exec message header
    this.emulator.writeMemory32(msgAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(msgAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(msgAddr + 8, NT_MESSAGE); // ln_Type
    this.emulator.writeMemory(msgAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(msgAddr + 10, 0); // ln_Name
    this.emulator.writeMemory32(msgAddr + 14, replyPortAddr); // mn_ReplyPort
    this.emulator.writeMemory16(msgAddr + 18, msgSize); // mn_Length

    // AEDoor extension: command/data near the end of the 0x100 block, string at +0x14
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
      command
    );
    this.emulator.writeMemory32(
      msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
      data
    );
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
    // Convert Amiga/Latin-1 characters to ASCII for proper terminal display
    let str = "";
    const stringBase = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    for (let i = 0; i < DoorConstants.MESSAGE_STRING_CAPACITY; i++) {
      const ch = this.emulator.readMemory(stringBase + i);
      if (ch === 0) break;
      const asciiChar = this.amigaCharToAscii(ch);
      str += String.fromCharCode(asciiChar);
    }

    // Log in AmiExpress format (matches express.e logging)
    const commandName = this.getCommandName(command);
debugLog(`msg request: ${command} (${commandName})`);
debugLog(`data: ${data}`);
debugLog(`string: ${str}`);

    // Use XIM Protocol handler to process and respond
    if (this.ximProtocol) {
debugLog(`[DoorMessageHandler] Delegating to XIMProtocol for cmd=${command} (doorParams="${(this.config.bbsSession as any)?.doorParams}")`);
      const ximMessage = this.ximProtocol.parseMessage(msgAddr);
      await this.ximProtocol.handleMessage(ximMessage);
    } else {
debugLog(
        `[DoorMessageHandler] WARNING: XIM Protocol not initialized! Falling back to processCommand (doorParams="${(this.config.bbsSession as any)?.doorParams}")`
      );
      // Fall back to command processor
      await this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
    }

debugLog(
      `[DoorMessageHandler] ===============================================`
    );
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
debugLog(`[DoorMessageHandler] Processing command ${command}...`);
    this.logMessageRequest(msgAddr, command, data, str);

    // Cancel old-style door timer if we receive data/environment requests (BB_, DT_, etc.)
    // This indicates it's a modern door that actively queries BBS state.
    // Don't cancel for input requests (JH_HK, JH_LI, JH_PM) - those can be auto-injected.
    const isDataRequest = command >= 100; // BB_, DT_, and other data requests are >= 100
    const isInputRequest = command === XIMCommand.JH_HK || command === XIMCommand.JH_LI || command === XIMCommand.JH_PM;
    if (command !== XIMCommand.JH_REGISTER && !isInputRequest && this.oldStyleDoorTimer) {
debugLog(`[DoorMessageHandler] Received post-register data request (cmd=${command}) - canceling old-style fallback`);
      clearTimeout(this.oldStyleDoorTimer);
      this.oldStyleDoorTimer = null;
      this.receivedPostRegisterMessage = true;
    }

    // If the incoming message uses a different reply port, honor it (express.e ReplyMsg behavior)
    if (replyPortAddr && replyPortAddr !== this.doorReplyPortAddr) {
      this.doorReplyPortAddr = replyPortAddr;
    }

    switch (command) {
      case XIMCommand.JH_REGISTER:
        // express.e:3379-3381:
        // CASE JH_REGISTER
        //   msg.command:=IF loggedOnUser<>NIL THEN userLineLen ELSE 29
        //   nodesPtr[]:=nodesPtr[]+1
debugLog(`[DoorMessageHandler]   JH_REGISTER: Door registering with BBS`);
        const rawLineLen =
          (this.config.bbsSession as any)?.user?.linesPerScreen ??
          (this.config.bbsSession as any)?.user?.lineLength ??
          24;
        // 0 = unlimited (AmiExpress convention). See xim/system-commands.ts
        // handleRegister for the full rationale (JoinCnf equality-pagination).
        const lineLen = typeof rawLineLen === "number" && rawLineLen >= 0 ? rawLineLen : 29;
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
          lineLen
        );
        // WEB_: divergence from express.e:3380 (which only writes msg.command).
        // AEKIT-based 68K doors (SRH/TList/TLP2) read msg->Data via CheckMessage()
        // for ALL replies (AEKIT101/Sources/MISC/AEDoor.c:171), so they ignore
        // msg.command and treat userLineLen as 0 — pausing after every line.
        // Mirror userLineLen into msg.data so AEKIT-style doors get the right
        // threshold; express.e-style doors still read msg.command unchanged.
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
          lineLen
        );
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_LINE_OFFSET,
          0
        );

        // express.e:3381 - Increment active door counter
        // nodesPtr[]:=nodesPtr[]+1
        // For web BBS, track active doors in session
        if (!this.config.bbsSession.activeDoorCount) {
          this.config.bbsSession.activeDoorCount = 0;
        }
        this.config.bbsSession.activeDoorCount++;
debugLog(`[DoorMessageHandler]   Replied with line length ${lineLen}, activeDoorCount=${this.config.bbsSession.activeDoorCount}`);

        // Compatibility fallback for old-style doors (WALL, JoinCnf, etc.)
        // Modern doors (Bulls, AquaScan) send follow-up requests immediately after JH_REGISTER.
        // Old doors expect INIT/STAT messages from BBS first.
        // Wait 500ms - if no follow-up messages arrive, assume old-style and send INIT/STAT.
        this.receivedPostRegisterMessage = false;
        this.oldStyleDoorTimer = setTimeout(() => {
          // NOTE: Native AEDoor.library does NOT automatically send INIT/STAT.
          // Check if this is an old-style door that needs INIT/STAT fallback.
          if (!this.receivedPostRegisterMessage) {
debugLog(`[DoorMessageHandler] No post-register messages received - assuming old-style door`);
debugLog(`[DoorMessageHandler] Sending INIT/STAT messages for compatibility`);
            // Temporarily clear sentInitialMessage flag to allow INIT/STAT to be sent
            this.sentInitialMessage = false;
            this.sendInitAndStatusMessages();
          }
        }, 500);
        break;

      case XIMCommand.JH_WRITE:
        // express.e:3382-3385: IF (transfering=FALSE) AND (doorSilent=FALSE) THEN aePuts(msg.string)
debugLog(`[DoorMessageHandler]   JH_WRITE: "${str}"`);
        this.socket.emit("ansi-output", str);
        break;

      case XIMCommand.JH_SHUTDOWN:
        // express.e:3388-3394:
        // CASE JH_SHUTDOWN
        //   nodesPtr[]:=nodesPtr[]-1
        //   IF(nodesPtr[]=0)
        //     quietDownload:=FALSE
        //     rawArrow:=FALSE
        //     exitPtr[]:=TRUE
        //   ENDIF
debugLog(`[DoorMessageHandler]   JH_SHUTDOWN: Door shutting down`);

        // Decrement active door counter
        if (this.config.bbsSession.activeDoorCount) {
          this.config.bbsSession.activeDoorCount--;
debugLog(`[DoorMessageHandler]   Decremented activeDoorCount to ${this.config.bbsSession.activeDoorCount}`);

          // If last door exited, reset flags per express.e:3390-3393
          if (this.config.bbsSession.activeDoorCount === 0) {
            if (this.config.bbsSession.quietDownload !== undefined) {
              this.config.bbsSession.quietDownload = false;
            }
            if (this.config.bbsSession.rawArrow !== undefined) {
              this.config.bbsSession.rawArrow = false;
            }
            // exitPtr flag - for web BBS, this would signal main loop to exit
            // Not critical for web version as each door runs in isolated session
debugLog(`[DoorMessageHandler]   Last door exited - reset quietDownload and rawArrow flags`);
          }
        }

        this.execLibrary.putMsg(replyPortAddr, msgAddr, {
          suppressDoorCallback: true,
        });
        return; // Don't send reply again

      case XIMCommand.JH_CO:
        // express.e:3395-3400: conPuts(msg.string) + optional newline + checkForPause
debugLog(`[DoorMessageHandler]   JH_CO: Console output "${str}"`);
        let coOutput = str;
        if (data) {
          coOutput += "\r\n";
        }
        // For web BBS, console = terminal
        this.socket.emit("ansi-output", coOutput);
        break;

      case XIMCommand.JH_SO:
        // express.e:3401-3405: serPuts(msg.string) + optional newline
debugLog(`[DoorMessageHandler]   JH_SO: Serial output "${str}"`);
        let soOutput = str;
        if (data) {
          soOutput += "\r\n";
        }
        this.socket.emit("ansi-output", soOutput);
        break;

      case XIMCommand.JH_SM:
        // express.e:3406-3411: aePuts(msg.string) + optional newline + checkForPause
        // BBS mode detection: AquaScan sends JH_SM with data=0 as query, expects data=3 in reply
        // See AquaScan offset 0x4f4c-0x4f60: checks response data, sets 0x114=1 if data==3
debugLog(`[DoorMessageHandler]   JH_SM: Send message "${str}" (data=${data})`);
        if (data === 0) {
          // BBS mode query - reply with data=3 to indicate we're a BBS
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 3);
debugLog(`[DoorMessageHandler]   JH_SM: BBS mode query, setting reply data=3`);
        }
        let smOutput = str;
        if (data) {
          smOutput += "\r\n";
        }
        this.socket.emit("ansi-output", smOutput);
        break;

      case XIMCommand.JH_ExtHK:
        // express.e:3432-3435: Extended HotKey - readChar with signal handling
        // lineCount:=0
        // msg.command:=readChar(doorTimeout,Shl(1,msg.signal))
        // IF (msg.command<0) THEN msg.data:=-1 ELSE msg.data:=1
debugLog(`[DoorMessageHandler]   JH_ExtHK: Extended hotkey (non-blocking)`);
        // For now, just acknowledge with no key available
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, 0);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      case XIMCommand.JH_PM:
        // express.e:3418-3424: lineInput() with prompt, return user input
        // data=-1 = timeout/carrier lost, data=1 = success
debugLog(`[DoorMessageHandler]   JH_PM: Prompt message "${str}", maxlen=${data}`);
        // Display prompt
        this.socket.emit("ansi-output", str);
        // Pause emulator and wait for user input via door:input event
        this.activeInput = {
          msgAddr,
          maxlen: data,
          command: XIMCommand.JH_PM,
          replyPortAddr: this.doorReplyPortAddr,
          resumeCallback: () => {
debugLog(`[DoorMessageHandler]   JH_PM: Resuming after input`);
            this.emulator.resume();
          },
        };
        this.emulator.pause();
debugLog(`[DoorMessageHandler]   JH_PM: Emulator paused, waiting for user input`);
        return; // Don't reply yet - will reply when input arrives via setupInputHandler

      case XIMCommand.JH_LI:
        // express.e:3425-3431: lineInput() without prompt
debugLog(`[DoorMessageHandler]   JH_LI: Line input, maxlen=${data}`);
        // Pause emulator and wait for user input via door:input event
        this.activeInput = {
          msgAddr,
          maxlen: data,
          command: XIMCommand.JH_LI,
          replyPortAddr: this.doorReplyPortAddr,
          resumeCallback: () => {
debugLog(`[DoorMessageHandler]   JH_LI: Resuming after input`);
            this.emulator.resume();
          },
        };
        this.emulator.pause();
debugLog(`[DoorMessageHandler]   JH_LI: Emulator paused, waiting for user input`);
        return; // Don't reply yet - will reply when input arrives via setupInputHandler

      case XIMCommand.JH_HK:
        // express.e:3436-3447: readChar() and return key code
debugLog(`[DoorMessageHandler]   JH_HK: Hot key, prompt="${str}"`);
        this.socket.emit("ansi-output", str);
        // Pause emulator and wait for user input via door:input event
        // For hot key, we just need a single character
        this.activeInput = {
          msgAddr,
          maxlen: 1, // Hot key only needs one char
          command: XIMCommand.JH_HK,
          replyPortAddr: this.doorReplyPortAddr,
          resumeCallback: () => {
debugLog(`[DoorMessageHandler]   JH_HK: Resuming after input`);
            this.emulator.resume();
          },
        };
        this.emulator.pause();
debugLog(`[DoorMessageHandler]   JH_HK: Emulator paused, waiting for user input`);
        return; // Don't reply yet - will reply when input arrives via setupInputHandler

      case XIMCommand.JH_SG:
        // express.e:3473-3474: findSecurityScreen() and displayFile()
debugLog(`[DoorMessageHandler]   JH_SG: Show GFile "${str}"`);
        const secFilePath = this.findSecurityScreen(str);
        if (secFilePath) {
          await this.displayFile(secFilePath);
debugLog(`[DoorMessageHandler]   Displayed security screen: ${secFilePath}`);
        } else {
debugLog(`[DoorMessageHandler]   Security screen not found: ${str}`);
        }
        break;

      case XIMCommand.JH_SF:
        // express.e:3475-3476: displayFile()
debugLog(`[DoorMessageHandler]   JH_SF: Show File "${str}"`);
        const bbsRoot = this.config.bbsSession?.bbsRoot || this.config.bbsSession?.dataDir || "";
        const fullPath = path.join(bbsRoot, str);
        if (await this.displayFile(fullPath)) {
debugLog(`[DoorMessageHandler]   Displayed file: ${fullPath}`);
        } else {
debugLog(`[DoorMessageHandler]   File not found: ${fullPath}`);
        }
        break;

      case XIMCommand.JH_EF:
        // express.e:3477-3485: Edit file with message editor
debugLog(`[DoorMessageHandler]   JH_EF: Edit File "${str}"`);
        // Message editor requires full editor integration
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
          -1
        );
debugLog(`[DoorMessageHandler]   Editor not yet supported`);
        break;

      case XIMCommand.JH_BBSNAME:
        // express.e:3486-3487: Return BBS name
debugLog(`[DoorMessageHandler]   JH_BBSNAME: Request for BBS name`);
        const bbsName = this.config.bbsSession?.bbsName || "AmiExpress Web BBS";
        this.writeStringToMessage(msgAddr, bbsName);
debugLog(`[DoorMessageHandler]   Replied with BBS name: "${bbsName}"`);
        break;

      case XIMCommand.JH_SYSOP:
        // express.e:3488-3489: Return sysop name
debugLog(`[DoorMessageHandler]   JH_SYSOP: Request for sysop name`);
        const sysopName = this.config.bbsSession?.sysopName || "Sysop";
        this.writeStringToMessage(msgAddr, sysopName);
debugLog(`[DoorMessageHandler]   Replied with sysop name: "${sysopName}"`);
        break;

      case XIMCommand.DT_NAME:
        // express.e:3494-3499: Get/Set user name
debugLog(`[DoorMessageHandler]   DT_NAME: data=${data}`);
        if (data) {
          // Get name
          const userName = this.config.bbsSession?.user?.username || "Sysop";
          this.writeStringToMessage(msgAddr, userName);
debugLog(`[DoorMessageHandler]   Replied with name: "${userName}"`);
        } else {
          // Set name - update session user
          const newName = str?.trim();
          if (newName && this.config.bbsSession?.user) {
            const oldName = this.config.bbsSession.user.username;
            this.config.bbsSession.user.username = newName;
debugLog(`[DoorMessageHandler]   Set name: "${oldName}" -> "${newName}"`);
          } else {
debugLog(`[DoorMessageHandler]   Set name: no value or no user`);
          }
        }
        break;

      case XIMCommand.DT_LOCATION:
        // express.e:3512-3517: Get/Set user location
debugLog(`[DoorMessageHandler]   DT_LOCATION: data=${data}`);
        if (data) {
          // Get location
          const location = this.config.bbsSession?.user?.location || "Unknown";
          this.writeStringToMessage(msgAddr, location);
debugLog(`[DoorMessageHandler]   Replied with location: "${location}"`);
        } else {
          // Set location - update session user
          const newLocation = str?.trim();
          if (newLocation && this.config.bbsSession?.user) {
            const oldLocation = this.config.bbsSession.user.location;
            this.config.bbsSession.user.location = newLocation;
debugLog(`[DoorMessageHandler]   Set location: "${oldLocation}" -> "${newLocation}"`);
          } else {
debugLog(`[DoorMessageHandler]   Set location: no value or no user`);
          }
        }
        break;

      case XIMCommand.DT_PHONENUMBER:
        // express.e:3518-3523: Get/Set phone number
debugLog(`[DoorMessageHandler]   DT_PHONENUMBER: data=${data}`);
        if (data) {
          const phone = this.config.bbsSession?.user?.phone || "000-000-0000";
          this.writeStringToMessage(msgAddr, phone);
debugLog(`[DoorMessageHandler]   Replied with phone: "${phone}"`);
        } else {
          // Set phone - update session user
          const newPhone = str?.trim();
          if (newPhone && this.config.bbsSession?.user) {
            const oldPhone = this.config.bbsSession.user.phone;
            this.config.bbsSession.user.phone = newPhone;
debugLog(`[DoorMessageHandler]   Set phone: "${oldPhone}" -> "${newPhone}"`);
          } else {
debugLog(`[DoorMessageHandler]   Set phone: no value or no user`);
          }
        }
        break;

      case XIMCommand.DT_SECSTATUS:
        // express.e: Security status / Access level (DT_SECLEVEL was an alias for DT_SECSTATUS=105)
debugLog(`[DoorMessageHandler]   DT_SECSTATUS: Request for security level`);
        const secLevel = this.config.bbsSession?.user?.secLevel || 100;
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, secLevel);
debugLog(`[DoorMessageHandler]   Replied with sec level: ${secLevel}`);
        break;

      case XIMCommand.GETKEY:
debugLog(`[DoorMessageHandler]   GETKEY: Request for user input`);
        this.waitForKeypress(msgAddr, replyPortAddr);
        return; // Don't send reply - waitForKeypress will handle it

      // Additional JH_* commands
      case XIMCommand.JH_SMPTR:
        // express.e:3412-3417: Send Message using pointer
debugLog(`[DoorMessageHandler]   JH_SMPTR: Send message (pointer)`);
        this.socket.emit("ansi-output", str);
        if (data) {
          this.socket.emit("ansi-output", "\r\n");
        }
        break;

      case XIMCommand.JH_ExtHK:
        // express.e:3432-3435: Extended HotKey with signal
debugLog(`[DoorMessageHandler]   JH_ExtHK: Extended hot key`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, -1);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        break;

      case XIMCommand.JH_20:
      case XIMCommand.QUICK_KEY:
        // express.e:3448-3455: Quick key read
debugLog(`[DoorMessageHandler]   JH_20/QUICK_KEY: Quick key read`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, 0);
        break;

      case XIMCommand.JH_SIGBIT:
        // express.e:3463-3464:
        // CASE JH_SIGBIT
        //   msg.data:=doorExtSig
        // Return the door extended signal bit for JH_ExtHK extended hotkeys
        // doorExtSig is allocated via AllocSignal() for extended door signaling
        // For web BBS, we use a fixed signal bit (bit 30 - user signals are 16-31)
debugLog(`[DoorMessageHandler]   JH_SIGBIT: Signal bit request`);
        const doorExtSig = 30; // Signal bit for extended door signals (user-allocatable range)
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, doorExtSig);
debugLog(`[DoorMessageHandler]   Replied with doorExtSig: ${doorExtSig}`);
        break;

      case XIMCommand.JH_FetchKey:
        // express.e:3465-3472: Fetch key non-blocking
debugLog(`[DoorMessageHandler]   JH_FetchKey: Non-blocking key fetch`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, 0);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      case XIMCommand.JH_FLAGFILE:
        // express.e:3490-3491: Flag file for download
debugLog(`[DoorMessageHandler]   JH_FLAGFILE: Flag file "${str}"`);
        // File flagging requires file system integration
        break;

      case XIMCommand.JH_MCI:
        // express.e:3456-3462: Process MCI codes
debugLog(`[DoorMessageHandler]   JH_MCI: Process MCI codes for "${str}"`);
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

debugLog(`[DoorMessageHandler]   JH_MCI: Processed successfully`);
        } catch (error: any) {
console.error(`[DoorMessageHandler]   JH_MCI: Error processing MCI codes:`, error.message || error);
        }
        break;

      case XIMCommand.CHAIN:
        // express.e:3386-3387: Chain command (node counter)
debugLog(`[DoorMessageHandler]   CHAIN: Chain command`);
        break;

      case XIMCommand.RETURNCOMMAND:
      case XIMCommand.RETURNCOMMAND2:
        // express.e:3492-3493, 4064-4065: Store command to run on exit
        // This is a fallback if ximProtocol isn't handling it
        {
          const returnCmd = str || '';
debugLog(`[DoorMessageHandler]   RETURNCOMMAND: "${returnCmd}"`);
          if (this.config.bbsSession) {
            (this.config.bbsSession as any).returnCommand = returnCmd;
debugLog(`[DoorMessageHandler]   RETURNCOMMAND: Stored in bbsSession.returnCommand`);
          }
        }
        break;

      // DT_* commands (user data)
      case XIMCommand.DT_PASSWORD:
        // express.e:3500-3511: Get/Set password
debugLog(`[DoorMessageHandler]   DT_PASSWORD: data=${data}`);
        if (data) {
          // Don't allow doors to read password
          this.writeStringToMessage(msgAddr, "");
        }
        break;

      case XIMCommand.DT_SLOTNUMBER:
        // express.e:3524-3530: Get/Set slot number
debugLog(`[DoorMessageHandler]   DT_SLOTNUMBER: data=${data}`);
        if (data) {
          const slotNum = this.config.bbsSession?.user?.id || 1;
          this.writeStringToMessage(msgAddr, String(slotNum));
        }
        break;

      case XIMCommand.DT_SECSTATUS:
        // express.e:3531-3538: Get/Set security status
debugLog(`[DoorMessageHandler]   DT_SECSTATUS: data=${data}`);
        if (data) {
          const secStatus = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secStatus));
        } else {
          // Set security status from string
          const newSec = parseInt(str) || 100;
debugLog(`[DoorMessageHandler]   Set security status to ${newSec}`);
        }
        break;

      case XIMCommand.DT_SECBOARD:
        // express.e:3539-3545: Get/Set message board security
debugLog(`[DoorMessageHandler]   DT_SECBOARD: data=${data}`);
        if (data) {
          const secBoard = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secBoard));
        } else {
debugLog(`[DoorMessageHandler]   Set board security from: ${str}`);
        }
        break;

      case XIMCommand.DT_SECLIBRARY:
        // express.e:3546-3552: Get/Set library security
debugLog(`[DoorMessageHandler]   DT_SECLIBRARY: data=${data}`);
        if (data) {
          const secLib = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secLib));
        } else {
debugLog(`[DoorMessageHandler]   Set library security from: ${str}`);
        }
        break;

      case XIMCommand.DT_SECBULLETIN:
        // express.e:3553-3559: Get/Set bulletin security
debugLog(`[DoorMessageHandler]   DT_SECBULLETIN: data=${data}`);
        if (data) {
          const secBull = this.config.bbsSession?.user?.secLevel || 100;
          this.writeStringToMessage(msgAddr, String(secBull));
        } else {
debugLog(`[DoorMessageHandler]   Set bulletin security from: ${str}`);
        }
        break;

      case XIMCommand.DT_MESSAGESPOSTED:
        // express.e:3560-3566: Get/Set messages posted (masked with $FFFF)
debugLog(`[DoorMessageHandler]   DT_MESSAGESPOSTED: data=${data}`);
        if (data) {
          const msgPosted = (this.config.bbsSession?.user?.messagesPosted || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(msgPosted));
        } else {
debugLog(`[DoorMessageHandler]   Set messages posted from: ${str}`);
        }
        break;

      case XIMCommand.DT_UPLOADS:
        // express.e:3567-3573: Get/Set uploads count (masked with $FFFF)
debugLog(`[DoorMessageHandler]   DT_UPLOADS: data=${data}`);
        if (data) {
          const uploads = (this.config.bbsSession?.user?.uploads || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(uploads));
        } else {
debugLog(`[DoorMessageHandler]   Set uploads from: ${str}`);
        }
        break;

      case XIMCommand.DT_DOWNLOADS:
        // express.e:3574-3580: Get/Set downloads count (masked with $FFFF)
debugLog(`[DoorMessageHandler]   DT_DOWNLOADS: data=${data}`);
        if (data) {
          const downloads = (this.config.bbsSession?.user?.downloads || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(downloads));
        } else {
debugLog(`[DoorMessageHandler]   Set downloads from: ${str}`);
        }
        break;

      case XIMCommand.DT_TIMESCALLED:
        // express.e:3581-3587: Get/Set times called (masked with $FFFF)
debugLog(`[DoorMessageHandler]   DT_TIMESCALLED: data=${data}`);
        if (data) {
          const calls = (this.config.bbsSession?.user?.calls || 0) & 0xFFFF;
          this.writeStringToMessage(msgAddr, String(calls));
        } else {
debugLog(`[DoorMessageHandler]   Set times called from: ${str}`);
        }
        break;

      case XIMCommand.DT_TIMELASTON:
        // express.e:3588-3594: Get/Set time last on (in seconds)
debugLog(`[DoorMessageHandler]   DT_TIMELASTON: data=${data}`);
        if (data) {
          const lastOn = this.config.bbsSession?.user?.lastLogin
            ? Math.floor(new Date(this.config.bbsSession.user.lastLogin).getTime() / 1000)
            : 0;
          this.writeStringToMessage(msgAddr, String(lastOn));
        } else {
debugLog(`[DoorMessageHandler]   Set time last on from: ${str}`);
        }
        break;

      case XIMCommand.DT_TIMEUSED:
        // express.e:3595-3601: Get/Set time used (in seconds)
debugLog(`[DoorMessageHandler]   DT_TIMEUSED: data=${data}`);
        if (data) {
          const timeUsed = this.config.bbsSession?.user?.timeUsed || 0;
          this.writeStringToMessage(msgAddr, String(timeUsed));
        } else {
debugLog(`[DoorMessageHandler]   Set time used from: ${str}`);
        }
        break;

      case XIMCommand.DT_TIMELIMIT:
        // express.e:3602-3608: Get/Set time limit (in seconds)
debugLog(`[DoorMessageHandler]   DT_TIMELIMIT: data=${data}`);
        if (data) {
          const timeLimit = this.config.bbsSession?.user?.timeLimit || 3600;
          this.writeStringToMessage(msgAddr, String(timeLimit));
        } else {
debugLog(`[DoorMessageHandler]   Set time limit from: ${str}`);
        }
        break;

      case XIMCommand.DT_TIMETOTAL:
        // express.e:3609-3615: Get/Set time total (in seconds)
debugLog(`[DoorMessageHandler]   DT_TIMETOTAL: data=${data}`);
        if (data) {
          const timeTotal = this.config.bbsSession?.user?.timeTotal || 0;
          this.writeStringToMessage(msgAddr, String(timeTotal));
        } else {
debugLog(`[DoorMessageHandler]   Set time total from: ${str}`);
        }
        break;

      case XIMCommand.DT_BYTESUPLOAD:
        // express.e:3616-3623: Get/Set bytes uploaded (BCD format in express.e)
debugLog(`[DoorMessageHandler]   DT_BYTESUPLOAD: data=${data}`);
        if (data) {
          const bytesUp = this.config.bbsSession?.user?.bytesUpload || 0;
          this.writeStringToMessage(msgAddr, String(bytesUp));
        } else {
debugLog(`[DoorMessageHandler]   Set bytes upload from: ${str}`);
        }
        break;

      case XIMCommand.DT_BYTEDOWNLOAD:
        // express.e:3624-3631: Get/Set bytes downloaded (BCD format in express.e)
debugLog(`[DoorMessageHandler]   DT_BYTEDOWNLOAD: data=${data}`);
        if (data) {
          const bytesDown = this.config.bbsSession?.user?.bytesDownload || 0;
          this.writeStringToMessage(msgAddr, String(bytesDown));
        } else {
debugLog(`[DoorMessageHandler]   Set bytes download from: ${str}`);
        }
        break;

      case XIMCommand.DT_DAILYBYTELIMIT:
        // express.e:3632-3638: Get/Set daily byte limit (formatUnsignedLong)
debugLog(`[DoorMessageHandler]   DT_DAILYBYTELIMIT: data=${data}`);
        if (data) {
          const dailyLimit = this.config.bbsSession?.user?.byteLimit || 10485760;
          this.writeStringToMessage(msgAddr, String(dailyLimit));
        } else {
debugLog(`[DoorMessageHandler]   Set daily byte limit from: ${str}`);
        }
        break;

      case XIMCommand.DT_DAILYBYTEDLD:
        // express.e:3639-3645: Get/Set daily bytes downloaded (formatUnsignedLong)
debugLog(`[DoorMessageHandler]   DT_DAILYBYTEDLD: data=${data}`);
        if (data) {
          const dailyDld = this.config.bbsSession?.user?.dailyBytesDld || 0;
          this.writeStringToMessage(msgAddr, String(dailyDld));
        } else {
debugLog(`[DoorMessageHandler]   Set daily bytes downloaded from: ${str}`);
        }
        break;

      case XIMCommand.DT_EXPERT:
        // express.e:3646-3652: Get/Set expert mode (single char: Y/N)
debugLog(`[DoorMessageHandler]   DT_EXPERT: data=${data}`);
        if (data) {
          const expert = this.config.bbsSession?.user?.expert || "N";
          this.writeStringToMessage(msgAddr, String(expert).charAt(0));
        } else {
          // Set expert mode from first character of string
          const newExpert = str.charAt(0).toUpperCase();
debugLog(`[DoorMessageHandler]   Set expert mode to: ${newExpert}`);
        }
        break;

      case XIMCommand.DT_LINELENGTH:
        // express.e:3653-3660: Get/Set line length (userLineLen = screen HEIGHT in lines)
        // Note: "lineLength" is misleading - this is SCREEN HEIGHT not character width
debugLog(`[DoorMessageHandler]   DT_LINELENGTH: data=${data}`);
        if (data) {
          const lineLen = this.config.bbsSession?.pauseLines ||
                          this.config.bbsSession?.user?.linesPerScreen ||
                          (this.config.bbsSession as any)?.user?.pageLength ||
                          24;
          this.writeStringToMessage(msgAddr, String(lineLen));
        } else {
          // Set line length from string
          const newLineLen = parseInt(str) || 24;
debugLog(`[DoorMessageHandler]   Set line length to: ${newLineLen}`);
        }
        break;

      case XIMCommand.DT_TIMEOUT:
        // express.e:3686-3692: Get/Set door timeout (in seconds)
debugLog(`[DoorMessageHandler]   DT_TIMEOUT: data=${data}`);
        if (data) {
          // Return current door timeout (default 300 seconds = 5 minutes)
          this.writeStringToMessage(msgAddr, "300");
        } else {
          // Set door timeout from string
          const newTimeout = parseInt(str) || 300;
debugLog(`[DoorMessageHandler]   Set door timeout to: ${newTimeout}`);
        }
        break;

      case XIMCommand.DT_CONFACCESS:
        // express.e:3777-3778: Conference access string
        // Fallback path - normally handled by XIMDataQueryHandler via XIMProtocol
debugLog(`[DoorMessageHandler]   DT_CONFACCESS: data=${data}`);
        if (data) {
          // Use confAccess from disk/session, NOT hardcoded value
          const confAccess = (this.config.bbsSession as any)?.confAccess ||
                             (this.config.bbsSession as any)?.user?.confAccess ||
                             'XX'; // Default to 2 conferences
          this.writeStringToMessage(msgAddr, confAccess.slice(0, 10));
        }
        break;

      case XIMCommand.DT_STAMP_LASTON:
      case XIMCommand.DT_STAMP_CTIME:
        // express.e:3768-3776: Timestamps
debugLog(`[DoorMessageHandler]   DT_STAMP: Timestamp, data=${data}`);
        if (data) {
          const now = Math.floor(Date.now() / 1000);
          this.writeStringToMessage(msgAddr, String(now));
        }
        break;

      case XIMCommand.DT_CURR_TIME:
        // express.e:3771-3773: Current time
debugLog(`[DoorMessageHandler]   DT_CURR_TIME`);
        const currTime = Math.floor(Date.now() / 1000);
        this.writeStringToMessage(msgAddr, String(currTime));
        break;

      case XIMCommand.DT_REALNAME:
        // express.e:3976-3981: Real name
debugLog(`[DoorMessageHandler]   DT_REALNAME: data=${data}`);
        if (data) {
          const realname = this.config.bbsSession?.user?.realname || "";
          this.writeStringToMessage(msgAddr, realname);
        }
        break;

      case XIMCommand.DT_INTERNETNAME:
        // express.e:4088-4093: Internet name
debugLog(`[DoorMessageHandler]   DT_INTERNETNAME: data=${data}`);
        if (data) {
          this.writeStringToMessage(msgAddr, "");
        }
        break;

      case XIMCommand.DT_HOSTNAME:
        // express.e:4109-4110: Hostname
debugLog(`[DoorMessageHandler]   DT_HOSTNAME`);
        this.writeStringToMessage(msgAddr, "localhost");
        break;

      case XIMCommand.DT_HOSTIP:
        // express.e:4111-4112: Host IP
debugLog(`[DoorMessageHandler]   DT_HOSTIP`);
        this.writeStringToMessage(msgAddr, "127.0.0.1");
        break;

      case XIMCommand.DT_ANSICOLOR:
        // express.e:3904-3906: ANSI color mode
debugLog(`[DoorMessageHandler]   DT_ANSICOLOR: data=${data}`);
        // Set ANSI mode (web BBS is always ANSI)
        break;

      case XIMCommand.DT_ISANSI:
        // express.e:3907-3908: Check if ANSI mode
debugLog(`[DoorMessageHandler]   DT_ISANSI`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      // BB_* commands (BBS info)
      case XIMCommand.BB_CONFNAME:
        // express.e:3693-3700: Get/Set conference name
debugLog(`[DoorMessageHandler]   BB_CONFNAME: data=${data}`);
        if (data) {
          // Get current conference name
          const confName = this.config.bbsSession?.conferenceName || "Main";
          this.writeStringToMessage(msgAddr, confName);
        } else {
          // Set conference name
debugLog(`[DoorMessageHandler]   Set conference name to: ${str}`);
        }
        break;

      case XIMCommand.BB_CONFLOCAL:
        // express.e:3701-3707: Get/Set conference location (directory)
        // Returns currentConfDir which is the full Amiga-style path with assign
        // Real express.e uses paths like "BBS:Conf1/" or relative like "255/"
debugLog(`[DoorMessageHandler]   BB_CONFLOCAL: data=${data}`);
        if (data) {
          // Get current conference directory with BBS: assign and trailing slash
          const confNum = (this.config.bbsSession as any)?.currentConf || 1;
          const confDir = `BBS:Conf${confNum}/`;
debugLog(`[DoorMessageHandler]   BB_CONFLOCAL returning: "${confDir}" (from currentConf=${confNum})`);
          this.writeStringToMessage(msgAddr, confDir);
        } else {
          // Set conference location
debugLog(`[DoorMessageHandler]   Set conference location to: ${str}`);
        }
        break;

      case XIMCommand.BB_LOCAL:
        // express.e:3708-3709: BBS local directory (Amiga-style assign "BBS:")
debugLog(`[DoorMessageHandler]   BB_LOCAL: returning "BBS:"`);
        this.writeStringToMessage(msgAddr, "BBS:");
        break;

      case XIMCommand.BB_TASKPRI:
        // express.e:3744-3746: Task priority
debugLog(`[DoorMessageHandler]   BB_TASKPRI`);
        this.writeStringToMessage(msgAddr, "0");
        break;

      case XIMCommand.BB_CHATFLAG:
        // express.e:3750-3755: Sysop available flag
debugLog(`[DoorMessageHandler]   BB_CHATFLAG`);
        this.writeStringToMessage(msgAddr, "OFF");
        break;

      case XIMCommand.BB_CHATSET:
        // express.e:3756-3767: Get/Set chat paged flag
debugLog(`[DoorMessageHandler]   BB_CHATSET: data=${data}`);
        if (data) {
          // Get current paged flag
          this.writeStringToMessage(msgAddr, "0");
        } else {
          // Set paged flag from string
          const pagedFlag = parseInt(str) || 0;
debugLog(`[DoorMessageHandler]   Set paged flag to: ${pagedFlag}`);
          // express.e:3764-3766: IF pagedFlag AND Not(temp) THEN sysopPaged()
        }
        break;

      case XIMCommand.BB_MAINLINE:
        // express.e:3794-3799: Return command text (command + params)
        //   CASE BB_MAINLINE
        //     IF StrLen(params)>0
        //       StringF(tempstring,'\s \s',command,params)
        //     ELSE
        //       StrCopy(tempstring,command)
        {
          const doorParams = (this.config.bbsSession as any)?.doorParams || '';
          const doorCommand = (this.config.bbsSession as any)?.doorCommand || '';
          // If doorParams includes command (e.g., "FR A"), use it; otherwise combine
          const result = doorParams.trim() || doorCommand.trim();
debugLog(`[DoorMessageHandler]   BB_MAINLINE: returning command="${result}" (per express.e:3794-3799)`);
          this.writeStringToMessage(msgAddr, result);
        }
        break;

      case XIMCommand.BB_NODEID:
        // express.e:3801-3803: Node ID
debugLog(`[DoorMessageHandler]   BB_NODEID`);
        const nodeId = this.config.bbsSession?.nodeId || 1;
        this.writeStringToMessage(msgAddr, String(nodeId));
        break;

      case XIMCommand.BB_CONFNUM:
        // express.e:3831-3833: Conference number
debugLog(`[DoorMessageHandler]   BB_CONFNUM`);
        this.writeStringToMessage(msgAddr, "0");
        break;

      case XIMCommand.BB_LOGONTYPE:
        // express.e:3859-3860: Logon type
debugLog(`[DoorMessageHandler]   BB_LOGONTYPE`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      case XIMCommand.BB_LINECOUNT:
        // express.e:3877-3882: Get/Set line count (for pause tracking)
        if (data) {
          // Get current line count - return as string
debugLog(`[DoorMessageHandler]   BB_LINECOUNT GET: ${this.lineCount}`);
          this.writeStringToMessage(msgAddr, String(this.lineCount));
        } else {
          // Set line count from string
          this.lineCount = parseInt(str) || 0;
debugLog(`[DoorMessageHandler]   BB_LINECOUNT SET: ${this.lineCount}`);
        }
        break;

      // System commands
      case XIMCommand.EXPRESS_VERSION:
        // express.e:3808-3810: Return BBS version
        //   CASE EXPRESS_VERSION
        //     getExpressMajorVer(tempstring)
        //     AstrCopy(msg.string,tempstring,200)
        {
          const version = this.getExpressMajorVersion();
debugLog(`[DoorMessageHandler]   EXPRESS_VERSION: returning version="${version}" (per express.e:3808-3810)`);
          this.writeStringToMessage(msgAddr, version);
        }
        break;

      case XIMCommand.RAWARROW:
        // express.e:3814-3815: Toggle raw arrow mode
debugLog(`[DoorMessageHandler]   RAWARROW`);
        break;

      case XIMCommand.ACTIVE_NODES:
        // express.e:3661-3666: Active nodes bitmap
debugLog(`[DoorMessageHandler]   ACTIVE_NODES`);
        this.writeStringToMessage(msgAddr, "X               ");
        break;

      case XIMCommand.MULTICOM:
        // express.e:3909-3910: Multi-node master node
debugLog(`[DoorMessageHandler]   MULTICOM`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case XIMCommand.NODE_BAUD:
      case XIMCommand.NODE_BAUDRATE:
        // express.e:3842-3847: Baud rate
debugLog(`[DoorMessageHandler]   NODE_BAUD*`);
        this.writeStringToMessage(msgAddr, "115200");
        break;

      // Transfer commands
      case XIMCommand.ZMODEMSEND:
      case XIMCommand.BATCHZMODEMSEND:
      case XIMCommand.ZMODEMRECEIVE:
        // express.e:3710-3739: File transfer
debugLog(`[DoorMessageHandler]   ZMODEM: Transfer not supported`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        break;

      case XIMCommand.AXNET_SEND:
      case XIMCommand.AXNET_RECEIVE:
        // express.e:3986-4014: AXNet transfer
debugLog(`[DoorMessageHandler]   AXNET: Transfer not supported`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, -1);
        break;

      // Account management
      case XIMCommand.LOAD_ACCOUNT:
      case XIMCommand.EXT_LOAD_ACCOUNT:
        // express.e:3911-3912: Load user account
debugLog(`[DoorMessageHandler]   LOAD_ACCOUNT: data=${data}`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case XIMCommand.SAVE_ACCOUNT:
        // express.e:3927-3928: Save user account
debugLog(`[DoorMessageHandler]   SAVE_ACCOUNT: data=${data}`);
        break;

      case XIMCommand.SEARCH_ACCOUNT:
        // express.e:3913-3914: Search for account
debugLog(`[DoorMessageHandler]   SEARCH_ACCOUNT: data=${data}`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case XIMCommand.LAST_ACCOUNTNUM:
        // express.e:3925-3926: Last account number
debugLog(`[DoorMessageHandler]   LAST_ACCOUNTNUM`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1);
        break;

      // Misc commands with simple responses
      case XIMCommand.SCREEN_ADDRESS:
      case XIMCommand.RAWSCREEN_ADDRESS:
      case XIMCommand.GET_GNSFLAG:
        // express.e:4036-4037: Get non-stop text flag status
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
          this.nonStopDisplayFlag ? 1 : 0
        );
debugLog(`[DoorMessageHandler]   GET_GNSFLAG: ${this.nonStopDisplayFlag ? 1 : 0}`);
        break;

      case XIMCommand.GET_XIMPORT:
        // express.e:4047-4048: Get XIM import port number
        // Default XIM port is 2324
debugLog(`[DoorMessageHandler]   GET_XIMPORT: 2324`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 2324);
        break;

      case XIMCommand.CONF_ACCESS:
        // express.e:4023-4028: Check conference access
        // Returns: 0=no access, 1=has access, 2=invalid conf
        // Reference: express.e checkConfAccess() lines 8499-8512
        {
          const confNum = data; // 0-indexed conference number
          const user = this.config.bbsSession?.user;
          const confAccess = user?.confAccess || user?.conferenceAccess || '';

          // Check bounds
          if (confNum < 0 || confNum >= 256) {
debugLog(`[DoorMessageHandler]   CONF_ACCESS: Invalid conf ${confNum}, returning 2`);
            this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 2);
          } else {
            // express.e:8504-8508: Check conferenceAccess string
            // confNum is 0-indexed, conferenceAccess is 1-indexed in express.e
            // so confNum+1 maps to conferenceAccess[confNum]
            let hasAccess = false;
            if (confAccess && confNum < confAccess.length) {
              // "X" = access, anything else (usually "_") = no access
              hasAccess = confAccess.charAt(confNum).toUpperCase() === 'X';
            }
            const accessStatus = hasAccess ? 1 : 0;
debugLog(`[DoorMessageHandler]   CONF_ACCESS: conf=${confNum}, confAccess="${confAccess}", status=${accessStatus}`);
            this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, accessStatus);
          }
        }
        break;

      case XIMCommand.CHECK_REALNAME:
      case XIMCommand.ICONIFYQUERY:
        // express.e:4199-4200: Check if iconified
        // Web BBS is never iconified
debugLog(`[DoorMessageHandler]   ICONIFYQUERY: NO (web BBS)`);
        this.writeStringToMessage(msgAddr, "NO");
        break;

      case XIMCommand.QUIET_DOWNLOAD:
        // Various query commands
debugLog(`[DoorMessageHandler]   Misc query command: ${command}`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      // BB_NONSTOPTEXT - REMOVED - handled in bbs-info.ts (WRITE-ONLY per express.e:3875-3876)
      // This was a duplicate implementation with WRONG bidirectional logic
      // Correct WRITE-ONLY implementation is in bbs-info.ts:447-453

      // Commands that don't need responses

      case XIMCommand.BB_PURGELINE:
        // express.e:3869-3870,1914-1924: Clear input buffer
debugLog(`[DoorMessageHandler]   BB_PURGELINE: Clearing input buffer (no-op in web)`);
        // In web environment, no serial buffer to clear
        break;

      case XIMCommand.BB_PURGELINESTART:
        // express.e:3871-3872,1906-1912: Clear buffer and restart read
debugLog(`[DoorMessageHandler]   BB_PURGELINESTART: Clear and restart (no-op in web)`);
        break;

      case XIMCommand.BB_PURGELINEEND:
        // express.e:3873-3874,1889-1904: Abort and clear buffer
debugLog(`[DoorMessageHandler]   BB_PURGELINEEND: Abort and clear (no-op in web)`);
        break;

      case XIMCommand.BB_DROPDTR:
        // express.e:3834-3839: Drop DTR (modem hangup)
        // processOlmMessageQueue(TRUE); Delay(30); modemOffHook(); resetSerOut:=TRUE
debugLog(`[DoorMessageHandler]   BB_DROPDTR: Dropping DTR (hangup)`);
        // For web implementation, trigger disconnect event
        if (this.config.bbsSession?.socket) {
          (this.config.bbsSession.socket as any).emit('hangup', { reason: 'BB_DROPDTR' });
        }
        break;

      case XIMCommand.ENVSTAT:
        // express.e:3677-3683: Get/set environment status
        if (data !== 0) {
          // Read: return current stat (default to 0 = idle)
          const currentStat = (this.config.bbsSession as any)?.envStat || 0;
debugLog(`[DoorMessageHandler]   ENVSTAT GET: ${currentStat}`);
          this.writeStringToMessage(msgAddr, String(currentStat));
        } else {
          // Write: set environment status
          const newStat = parseInt(str) || 0;
debugLog(`[DoorMessageHandler]   ENVSTAT SET: ${newStat}`);
          if ((this.config.bbsSession as any)) {
            (this.config.bbsSession as any).envStat = newStat;
          }
        }
        break;

      case XIMCommand.SV_NEWMSG:
        // express.e:3684-3685: Set environment message
debugLog(`[DoorMessageHandler]   SV_NEWMSG: "${str}"`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).envMessage = str;
        }
        break;

      case XIMCommand.PRV_COMMAND:
        // express.e:3816-3818: Process command passthrough
debugLog(`[DoorMessageHandler]   PRV_COMMAND: "${str}"`);
        // This would execute a BBS command - store for later processing
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).pendingCommand = str;
        }
        break;

      case XIMCommand.PRV_GROUP:
        // express.e:3819-3830: Set conference group info
debugLog(`[DoorMessageHandler]   PRV_GROUP: "${str}"`);
        // Format: "NN<name 37 chars><location 54 chars>"
        // Conference number at start, name at +2, location at +40
        break;

      case XIMCommand.DT_DUMP:
        // express.e:3667-3668: Dump active user data to string
        {
          const user = (this.config.bbsSession as any)?.user;
          const dumpStr = user ? `${user.name || 'Unknown'}|${user.location || ''}|${user.accessLevel || 0}` : 'No user';
debugLog(`[DoorMessageHandler]   DT_DUMP: "${dumpStr}"`);
          this.writeStringToMessage(msgAddr, dumpStr);
        }
        break;

      case XIMCommand.DT_MSGCODE:
        // express.e:3669-3676: Door message code flag (0/1/2)
        if (data === 1) {
          (this.config.bbsSession as any).doorMsgCode = 1;
debugLog(`[DoorMessageHandler]   DT_MSGCODE: SET to 1`);
        } else if (data === 2) {
          (this.config.bbsSession as any).doorMsgCode = 0;
debugLog(`[DoorMessageHandler]   DT_MSGCODE: SET to 0`);
        } else {
          const code = (this.config.bbsSession as any)?.doorMsgCode || 0;
debugLog(`[DoorMessageHandler]   DT_MSGCODE: GET = ${code}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, code);
        }
        break;

      case XIMCommand.DT_QUICKFLAG:
        // express.e:3900-3901: Quick login flag
debugLog(`[DoorMessageHandler]   DT_QUICKFLAG: SET to ${data}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).quickFlag = data !== 0;
        }
        break;

      case XIMCommand.DT_GOODFILE:
        // express.e:3902-3903: Good file flag for file checking
debugLog(`[DoorMessageHandler]   DT_GOODFILE: SET to ${data}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).aeGoodFile = data;
        }
        break;

      case XIMCommand.DT_ADDBIT:
        // express.e:3853-3854: Add temporary security flag bit
debugLog(`[DoorMessageHandler]   DT_ADDBIT: Adding bit ${data}`);
        {
          const session = this.config.bbsSession as any;
          if (session) {
            session.tempSecurityFlags = (session.tempSecurityFlags || 0) | (1 << data);
          }
        }
        break;

      case XIMCommand.DT_REMBIT:
        // express.e:3855-3856: Remove temporary security flag bit
debugLog(`[DoorMessageHandler]   DT_REMBIT: Removing bit ${data}`);
        {
          const session = this.config.bbsSession as any;
          if (session) {
            session.tempSecurityFlags = (session.tempSecurityFlags || 0) & ~(1 << data);
          }
        }
        break;

      case XIMCommand.DT_QUERYBIT:
        // express.e:3857-3858: Query security bit - returns 1 if set, 0 if not
        {
          const session = this.config.bbsSession as any;
          const flags = session?.tempSecurityFlags || 0;
          const userFlags = session?.user?.accessFlags || 0;
          const allFlags = flags | userFlags;
          const hasFlag = (allFlags & (1 << data)) !== 0 ? 1 : 0;
debugLog(`[DoorMessageHandler]   DT_QUERYBIT: bit ${data} = ${hasFlag}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, hasFlag);
        }
        break;

      case XIMCommand.DT_FILECODE:
        // express.e:3945-3946: File check symbol code
debugLog(`[DoorMessageHandler]   DT_FILECODE: SET to ${data}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).checksym = data;
        }
        break;

      case XIMCommand.DT_LANGUAGE:
        // express.e:3884-3898: Screen type extension (txt, ans, etc)
        if (data !== 0) {
          // Read: return screen type extension
          const screenType = (this.config.bbsSession as any)?.user?.screenType || 0;
          const extensions = ['txt', 'ans', 'avt', 'rip', 'vtx'];
          const ext = extensions[screenType] || 'txt';
debugLog(`[DoorMessageHandler]   DT_LANGUAGE GET: "${ext}"`);
          this.writeStringToMessage(msgAddr, ext);
        } else {
          // Write: set screen type by extension
debugLog(`[DoorMessageHandler]   DT_LANGUAGE SET: "${str}"`);
          const extensions = ['txt', 'ans', 'avt', 'rip', 'vtx'];
          const idx = extensions.indexOf(str.toLowerCase());
          if (idx >= 0 && (this.config.bbsSession as any)?.user) {
            (this.config.bbsSession as any).user.screenType = idx;
          }
        }
        break;

      case XIMCommand.DT_TRANSLATOR:
        // express.e:4094-4099: User language translator
        if (data !== 0) {
          const lang = (this.config.bbsSession as any)?.userLanguage || '';
debugLog(`[DoorMessageHandler]   DT_TRANSLATOR GET: "${lang}"`);
          this.writeStringToMessage(msgAddr, lang);
        } else {
debugLog(`[DoorMessageHandler]   DT_TRANSLATOR SET: "${str}"`);
          if ((this.config.bbsSession as any)) {
            (this.config.bbsSession as any).userLanguage = str;
          }
        }
        break;

      case XIMCommand.DT_HOST_LANGUAGE:
        // express.e:4101-4106: Host language
        if (data !== 0) {
          const lang = (this.config.bbsSession as any)?.hostLanguage || 'en';
debugLog(`[DoorMessageHandler]   DT_HOST_LANGUAGE GET: "${lang}"`);
          this.writeStringToMessage(msgAddr, lang);
        } else {
debugLog(`[DoorMessageHandler]   DT_HOST_LANGUAGE SET: "${str}"`);
          if ((this.config.bbsSession as any)) {
            (this.config.bbsSession as any).hostLanguage = str;
          }
        }
        break;

      case XIMCommand.DT_GEOGRAPHIC:
        // express.e:4113-4114: Geographic/BBS location string
        {
          const bbsLoc = (this.config.bbsSession as any)?.bbsLocation || 'The Internet';
debugLog(`[DoorMessageHandler]   DT_GEOGRAPHIC: "${bbsLoc}"`);
          this.writeStringToMessage(msgAddr, bbsLoc);
        }
        break;

      case XIMCommand.DT_SIZEUPLOAD:
        // express.e:4115-4117: Human-readable upload size (e.g., "1.5mb")
        {
          const user = (this.config.bbsSession as any)?.user;
          const bytes = user?.bytesUploaded || 0;
          const sizeStr = this.formatByteSize(bytes);
debugLog(`[DoorMessageHandler]   DT_SIZEUPLOAD: "${sizeStr}"`);
          this.writeStringToMessage(msgAddr, sizeStr);
        }
        break;

      case XIMCommand.DT_SIZEDOWNLOAD:
        // express.e:4118-4120: Human-readable download size
        {
          const user = (this.config.bbsSession as any)?.user;
          const bytes = user?.bytesDownloaded || 0;
          const sizeStr = this.formatByteSize(bytes);
debugLog(`[DoorMessageHandler]   DT_SIZEDOWNLOAD: "${sizeStr}"`);
          this.writeStringToMessage(msgAddr, sizeStr);
        }
        break;

      case XIMCommand.DT_CONFACCESS2:
        // express.e:4141-4150: Extended conference access (25 chars)
        if (data !== 0) {
          // Read: return conf access string (X for access, _ for no access)
          const session = this.config.bbsSession as any;
          const numConfs = Math.min(25, session?.numConferences || 9);
          let accessStr = '';
          for (let i = 1; i <= numConfs; i++) {
            const hasAccess = session?.user?.confAccess?.[i] !== false;
            accessStr += hasAccess ? 'X' : '_';
          }
debugLog(`[DoorMessageHandler]   DT_CONFACCESS2 GET: "${accessStr}"`);
          this.writeStringToMessage(msgAddr, accessStr);
        } else {
          // Write: set conference access from string
debugLog(`[DoorMessageHandler]   DT_CONFACCESS2 SET: "${str}"`);
          const session = this.config.bbsSession as any;
          if (session?.user) {
            session.user.confAccess = session.user.confAccess || {};
            for (let i = 0; i < str.length && i < 25; i++) {
              session.user.confAccess[i + 1] = str[i] === 'X';
            }
          }
        }
        break;

      case XIMCommand.DT_CBYTESUPLOAD:
        // express.e:4151-4159: Conference bytes uploaded (same as DT_BYTESUPLOAD for current conf)
        if (data !== 0) {
          const user = (this.config.bbsSession as any)?.user;
          const bytes = user?.bytesUploaded || 0;
debugLog(`[DoorMessageHandler]   DT_CBYTESUPLOAD GET: ${bytes}`);
          this.writeStringToMessage(msgAddr, String(bytes));
        } else {
debugLog(`[DoorMessageHandler]   DT_CBYTESUPLOAD SET: ${str}`);
          if ((this.config.bbsSession as any)?.user) {
            (this.config.bbsSession as any).user.bytesUploaded = parseInt(str) || 0;
          }
        }
        break;

      case XIMCommand.DT_CBYTESDOWNLOAD:
        // express.e:4160-4168: Conference bytes downloaded
        if (data !== 0) {
          const user = (this.config.bbsSession as any)?.user;
          const bytes = user?.bytesDownloaded || 0;
debugLog(`[DoorMessageHandler]   DT_CBYTESDOWNLOAD GET: ${bytes}`);
          this.writeStringToMessage(msgAddr, String(bytes));
        } else {
debugLog(`[DoorMessageHandler]   DT_CBYTESDOWNLOAD SET: ${str}`);
          if ((this.config.bbsSession as any)?.user) {
            (this.config.bbsSession as any).user.bytesDownloaded = parseInt(str) || 0;
          }
        }
        break;

      case XIMCommand.DT_CFILESUPLOAD:
        // express.e:4169-4175: Conference files uploaded
        if (data !== 0) {
          const user = (this.config.bbsSession as any)?.user;
          const files = user?.filesUploaded || user?.uploads || 0;
debugLog(`[DoorMessageHandler]   DT_CFILESUPLOAD GET: ${files}`);
          this.writeStringToMessage(msgAddr, String(files));
        } else {
debugLog(`[DoorMessageHandler]   DT_CFILESUPLOAD SET: ${str}`);
          if ((this.config.bbsSession as any)?.user) {
            (this.config.bbsSession as any).user.uploads = parseInt(str) || 0;
          }
        }
        break;

      case XIMCommand.DT_CFILESDOWNLOAD:
        // express.e:4176-4182: Conference files downloaded
        if (data !== 0) {
          const user = (this.config.bbsSession as any)?.user;
          const files = user?.filesDownloaded || user?.downloads || 0;
debugLog(`[DoorMessageHandler]   DT_CFILESDOWNLOAD GET: ${files}`);
          this.writeStringToMessage(msgAddr, String(files));
        } else {
debugLog(`[DoorMessageHandler]   DT_CFILESDOWNLOAD SET: ${str}`);
          if ((this.config.bbsSession as any)?.user) {
            (this.config.bbsSession as any).user.downloads = parseInt(str) || 0;
          }
        }
        break;

      case XIMCommand.DT_CALLEDTODAY:
        // express.e:4189-4195: Times called today
        if (data !== 0) {
          const user = (this.config.bbsSession as any)?.user;
          const calls = user?.timesOnToday || 1;
debugLog(`[DoorMessageHandler]   DT_CALLEDTODAY GET: ${calls}`);
          this.writeStringToMessage(msgAddr, String(calls));
        } else {
debugLog(`[DoorMessageHandler]   DT_CALLEDTODAY SET: ${str}`);
          if ((this.config.bbsSession as any)?.user) {
            (this.config.bbsSession as any).user.timesOnToday = parseInt(str) || 0;
          }
        }
        break;

      case XIMCommand.BB_PCONFNAME:
        // express.e:3779-3785: Get conference name by number (1-9)
        // Uses getConfName(temp) to read NAME.n from ConfConfig.info
        {
          const confNum = parseInt(str) || 0;
          if (confNum < 1 || confNum > 9) {
debugLog(`[DoorMessageHandler]   BB_PCONFNAME: Invalid conf ${confNum}, returning ERROR`);
            this.writeStringToMessage(msgAddr, "ERROR");
          } else {
            // Read conference name from ConfConfig.info
            try {
              const { loadConfConfig } = require('../../services/conf-config.service');
              const bbsRoot = (this.config.bbsSession as any)?.bbsRoot || process.cwd();
              const confConfig = loadConfConfig(bbsRoot);
              const confName = confConfig?.entries[confNum - 1]?.name || `Conference ${confNum}`;
debugLog(`[DoorMessageHandler]   BB_PCONFNAME: ${confNum} -> "${confName}"`);
              this.writeStringToMessage(msgAddr, confName);
            } catch (error) {
debugLog(`[DoorMessageHandler]   BB_PCONFNAME: Error reading ConfConfig.info: ${error}`);
              this.writeStringToMessage(msgAddr, `Conference ${confNum}`);
            }
          }
        }
        break;

      case XIMCommand.BB_PCONFLOCAL:
        // express.e:3786-3793: Get conference location by number (1-9)
        // Uses getConfLocation(temp,tempstring) to read LOCATION.n from ConfConfig.info
        {
          const confNum = parseInt(str) || 0;
          if (confNum < 1 || confNum > 9) {
debugLog(`[DoorMessageHandler]   BB_PCONFLOCAL: Invalid conf ${confNum}, returning ERROR`);
            this.writeStringToMessage(msgAddr, "ERROR");
          } else {
            // Read conference location from ConfConfig.info
            try {
              const { loadConfConfig } = require('../../services/conf-config.service');
              const bbsRoot = (this.config.bbsSession as any)?.bbsRoot || process.cwd();
              const confConfig = loadConfConfig(bbsRoot);
              const confDir = confConfig?.entries[confNum - 1]?.location || `BBS:Conf${confNum}/`;
debugLog(`[DoorMessageHandler]   BB_PCONFLOCAL(${confNum}): "${confDir}"`);
              this.writeStringToMessage(msgAddr, confDir);
            } catch (error) {
debugLog(`[DoorMessageHandler]   BB_PCONFLOCAL: Error reading ConfConfig.info: ${error}`);
              this.writeStringToMessage(msgAddr, `BBS:Conf${confNum}/`);
            }
          }
        }
        break;

      case XIMCommand.BB_CALLERSLOG:
        // express.e:3804-3805: Log to callers log
debugLog(`[DoorMessageHandler]   BB_CALLERSLOG: "${str}"`);
        // Callers log would write to Node1/CallersLog file
        break;

      case XIMCommand.BB_UDLOG:
        // express.e:3806-3807: Log to upload/download log
debugLog(`[DoorMessageHandler]   BB_UDLOG: "${str}"`);
        // U/D log would write to appropriate file
        break;

      case XIMCommand.BB_GETTASK:
        // express.e:3840-3841: msg.task:=FindTask(0)
        // Returns current task pointer (Amiga-specific)
        // For web implementation, return mock task pointer in msg.task field
        {
          const mockTaskPtr = 0xC0001000; // Mock task pointer (valid Amiga address range)
debugLog(`[DoorMessageHandler]   BB_GETTASK: Returning mock task pointer 0x${mockTaskPtr.toString(16)}`);
          // Write to msg.task field (offset 16 in Message structure per aedoor.i)
          this.emulator.writeMemory32(msgAddr + 16, mockTaskPtr);
        }
        break;

      case XIMCommand.BB_SCRLEFT:
        // express.e:3861-3862: Screen left edge (0 for terminals)
debugLog(`[DoorMessageHandler]   BB_SCRLEFT: 0`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case XIMCommand.BB_SCRTOP:
        // express.e:3863-3864: Screen top edge (0 for terminals)
debugLog(`[DoorMessageHandler]   BB_SCRTOP: 0`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0);
        break;

      case XIMCommand.BB_SCRWIDTH:
        // express.e:3865-3866: Screen width (80 columns standard)
debugLog(`[DoorMessageHandler]   BB_SCRWIDTH: 80`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 80);
        break;

      case XIMCommand.BB_SCRHEIGHT:
        // express.e:3867-3868: msg.data:=screen.height
        // Return user's configured screen height (lines per screen)
        {
          const screenHeight = this.config.bbsSession?.pauseLines ||
                               (this.config.bbsSession as any)?.user?.linesPerScreen ||
                               (this.config.bbsSession as any)?.user?.pageLength ||
                               24;
debugLog(`[DoorMessageHandler]   BB_SCRHEIGHT: ${screenHeight}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, screenHeight);
        }
        break;

      case XIMCommand.GET_CUSTOM_MSGBASE_MENUCMD:
        // Returns the menu command that was used to launch this door
        // e.g., if user typed "FR" which launched AquaScan, return "FR"
        // Doors use this to look up DOORUSE.FR in their .info tooltypes
        {
          const cmdName = this.config.doorId ||
                          this.config.bbsSession?.doorCommand ||
                          "";
debugLog(`[DoorMessageHandler]   GET_CUSTOM_MSGBASE_MENUCMD: "${cmdName}"`);
          this.writeStringToMessage(msgAddr, cmdName);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, cmdName.length);
        }
        break;

      case XIMCommand.BB_CONFACCOUNT:
        // express.e:4183-4188: Check if conference accounting is enabled
        if (data !== 0) {
          // Returns YES if conference accounting enabled, NO otherwise
          const confAccounting = (this.config.bbsSession as any)?.confAccounting || false;
debugLog(`[DoorMessageHandler]   BB_CONFACCOUNT GET: ${confAccounting ? 'YES' : 'NO'}`);
          this.writeStringToMessage(msgAddr, confAccounting ? 'YES' : 'NO');
        } else {
debugLog(`[DoorMessageHandler]   BB_CONFACCOUNT SET: ignored (not implemented)`);
        }
        break;

      case XIMCommand.EDITOR_STRUCT:
        // express.e:3929-3934: Copy editor struct to/from door memory
        // data=1: copy from door to BBS, data=0: copy from BBS to door
debugLog(`[DoorMessageHandler]   EDITOR_STRUCT: ${data ? 'READ from door' : 'WRITE to door'} (not implemented)`);
        break;

      case XIMCommand.LOAD_CONFDB:
        // express.e:3935-3936: Load conference database
debugLog(`[DoorMessageHandler]   LOAD_CONFDB: slot=${data}, nodeId=${(this.config.bbsSession as any)?.nodeId || 1}`);
        // Would load conf db into memory at msg.filler1
        break;

      case XIMCommand.SAVE_CONFDB:
        // express.e:3937-3939: Save conference database
debugLog(`[DoorMessageHandler]   SAVE_CONFDB: slot=${data}, nodeId=${(this.config.bbsSession as any)?.nodeId || 1}`);
        // Would save conf db from memory at msg.filler1
        break;

      case XIMCommand.GET_CONFNUM:
        // express.e:3940-3942: Get conference name and location by number
        // Writes conf name to filler1, location to filler2
        {
          const confNum = data;
debugLog(`[DoorMessageHandler]   GET_CONFNUM: ${confNum}`);
          try {
            const { loadConfConfig } = require('../../services/conf-config.service');
            const bbsRoot = (this.config.bbsSession as any)?.bbsRoot || process.cwd();
            const confConfig = loadConfConfig(bbsRoot);
            const confName = confConfig?.entries[confNum - 1]?.name || `Conference ${confNum}`;
            const confLoc = confConfig?.entries[confNum - 1]?.location || `BBS:Conf${confNum}/`;
            // Would write to filler1 and filler2 memory locations
debugLog(`[DoorMessageHandler]   GET_CONFNUM: name="${confName}", loc="${confLoc}"`);
          } catch (error) {
debugLog(`[DoorMessageHandler]   GET_CONFNUM: Error - ${error}`);
          }
        }
        break;

      case XIMCommand.MOD_TYPE:
        // express.e:3943-3944: Return 1 if privileged command, 0 if not
        {
          const isPrivCmd = (this.config.bbsSession as any)?.isPrivilegedCommand || false;
debugLog(`[DoorMessageHandler]   MOD_TYPE: ${isPrivCmd ? 1 : 0}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, isPrivCmd ? 1 : 0);
        }
        break;

      case XIMCommand.MSGBASE_LOC:
        // express.e:3967-3973: Get/set message base location path
        if (data !== 0) {
          // Read: return current message base path
          const confNum = (this.config.bbsSession as any)?.currentConf || 1;
          const msgBaseLoc = `BBS:Conf${confNum}/MsgBase/`;
debugLog(`[DoorMessageHandler]   MSGBASE_LOC GET: "${msgBaseLoc}"`);
          this.writeStringToMessage(msgAddr, msgBaseLoc);
        } else {
          // Write: set message base path
debugLog(`[DoorMessageHandler]   MSGBASE_LOC SET: "${str}"`);
          if ((this.config.bbsSession as any)) {
            (this.config.bbsSession as any).msgBaseLocation = str;
          }
        }
        break;

      case XIMCommand.ACP_COMMAND:
        // express.e:3947-3948: Send command to ACP (AmiExpress Control Panel)
debugLog(`[DoorMessageHandler]   ACP_COMMAND: "${str}" data=${data}`);
        // Would send command to ACP daemon if running
        break;

      case XIMCommand.BYPASS_CSI_CHECK:
        // express.e:3949-3950: Not implemented in original
debugLog(`[DoorMessageHandler]   BYPASS_CSI_CHECK: Not implemented`);
        break;

      case XIMCommand.SENTBY:
        // express.e:3951-3952: Return sentby files access level
        {
          const sentbyLevel = (this.config.bbsSession as any)?.sentbyLevel || 0;
debugLog(`[DoorMessageHandler]   SENTBY: ${sentbyLevel}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, sentbyLevel);
        }
        break;

      case XIMCommand.SETOVERIDE:
        // express.e:3953-3954: Set override mode
debugLog(`[DoorMessageHandler]   SETOVERIDE: ${data}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).overrideMode = data;
        }
        break;

      case XIMCommand.FULLEDIT:
        // express.e:3955-3956: Full editor mode - not implemented in original
debugLog(`[DoorMessageHandler]   FULLEDIT: Not implemented`);
        break;

      case XIMCommand.SETMCIOFF:
        // express.e:3957-3958: Turn MCI processing off (data != 0) or on (data == 0)
debugLog(`[DoorMessageHandler]   SETMCIOFF: ${data !== 0 ? 'MCI OFF' : 'MCI ON'}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).mciOff = data !== 0;
        }
        break;

      case XIMCommand.GET_CUSTOM_MSGBASE_PARAM1:
        // express.e:3959-3960: Return custom message base parameter 1
        {
          const param1 = (this.config.bbsSession as any)?.customMsgParam1 || 0;
debugLog(`[DoorMessageHandler]   GET_CUSTOM_MSGBASE_PARAM1: ${param1}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, param1);
        }
        break;

      case XIMCommand.GET_CUSTOM_MSGBASE_PARAM2:
        // express.e:3961-3962: Return custom message base parameter 2
        {
          const param2 = (this.config.bbsSession as any)?.customMsgParam2 || 0;
debugLog(`[DoorMessageHandler]   GET_CUSTOM_MSGBASE_PARAM2: ${param2}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, param2);
        }
        break;

      case XIMCommand.LAST_READ:
        // express.e:3963-3964: Last message read conference number
        {
          const lastRead = (this.config.bbsSession as any)?.lastMsgReadConf || 0;
debugLog(`[DoorMessageHandler]   LAST_READ: ${lastRead}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, lastRead);
        }
        break;

      case XIMCommand.LAST_SCANNED:
        // express.e:3965-3966: Last new message read conference number
        {
          const lastScanned = (this.config.bbsSession as any)?.lastNewReadConf || 0;
debugLog(`[DoorMessageHandler]   LAST_SCANNED: ${lastScanned}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, lastScanned);
        }
        break;

      case XIMCommand.SER_INOUT:
        // express.e:3982-3985: Set serial I/O flags (in and out)
debugLog(`[DoorMessageHandler]   SER_INOUT: ${data}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).serInFlag = data;
          (this.config.bbsSession as any).serOutFlag = data;
        }
        break;

      case XIMCommand.MEMCONF:
        // express.e:4015-4020: Get memory conference pointer
        // Returns pointer to conference memory structure
debugLog(`[DoorMessageHandler]   MEMCONF: Returning 0 (not supported)`);
        // msg.filler1 would point to memConf structure
        break;

      case XIMCommand.SET_SERSHARED:
        // express.e:4021-4022: Set serial shared flag
debugLog(`[DoorMessageHandler]   SET_SERSHARED: ${data}`);
        if ((this.config.bbsSession as any)) {
          (this.config.bbsSession as any).serShared = data !== 0;
        }
        break;

      case XIMCommand.PASSWORD_HASH:
        // express.e:4029-4035: Get password hash
        // If legacy (type 0), calculates hash from password
        // Otherwise returns stored 32-char hash
        {
          const user = (this.config.bbsSession as any)?.user;
          const pwdHash = user?.passwordHash || '';
debugLog(`[DoorMessageHandler]   PASSWORD_HASH: ${pwdHash ? '(hash present)' : '(empty)'}`);
          this.writeStringToMessage(msgAddr, pwdHash.substring(0, 40));
        }
        break;

      case XIMCommand.GET_MENU_COMMAND_CHAR:
        // express.e:4049-4050: Get message menu command character
        // Default is '/' for AmiExpress
debugLog(`[DoorMessageHandler]   GET_MENU_COMMAND_CHAR: 47 ('/')`);
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 47); // ASCII '/'
        break;

      case XIMCommand.DISPLAY_FILE:
        // express.e:4038-4039: Display file by path
debugLog(`[DoorMessageHandler]   DISPLAY_FILE: ${str}`);
        await this.displayFile(str);
        break;

      case XIMCommand.CHECK_TO_DISPLAY:
        // express.e:4040-4041: Find and display security screen if it exists
debugLog(`[DoorMessageHandler]   CHECK_TO_DISPLAY: ${str}`);
        try {
          const screenPath = this.findSecurityScreen(str);
          if (screenPath) {
            await this.displayFile(screenPath);
          }
        } catch (error: any) {
console.error(`[DoorMessageHandler]   CHECK_TO_DISPLAY error:`, error.message);
        }
        break;

      case XIMCommand.SET_FILEATTACH:
        // express.e:4042-4043: Enable/disable file attach mode
debugLog(`[DoorMessageHandler]   SET_FILEATTACH: ${data !== 0 ? 'ENABLED' : 'DISABLED'}`);
        // File attach mode would be stored in session state
        break;

      case XIMCommand.INTERPRET_MCI:
        // express.e:4044-4046: Process MCI codes and return result in msg.string
debugLog(`[DoorMessageHandler]   INTERPRET_MCI: "${str}"`);
        try {
          const bbsSession = (this.config as any)?.bbsSession || {};
          const bbsName = bbsSession.bbsName || 'AmiExpress-Web';
          const sysopName = bbsSession.sysopName || 'Sysop';
          const location = bbsSession.user?.location || 'The Internet';
          const result = await parseMciCodes(str, bbsSession, bbsName, sysopName, location);
          this.writeStringToMessage(msgAddr, result.parsed);
debugLog(`[DoorMessageHandler]   INTERPRET_MCI result: "${result.parsed}"`);
        } catch (error: any) {
console.error(`[DoorMessageHandler]   INTERPRET_MCI error:`, error.message);
          this.writeStringToMessage(msgAddr, str); // Return original on error
        }
        break;

      case XIMCommand.FILE_REQUEST:
        // express.e:4051-4052: ASL file requester
        // Not applicable in web environment - return empty path
debugLog(`[DoorMessageHandler]   FILE_REQUEST: Not supported in web (returning empty)`);
        this.writeStringToMessage(msgAddr, "");
        break;

      case XIMCommand.DISABLE_FILE_ATTACH:
        // express.e:4053-4054: Disable file attach
debugLog(`[DoorMessageHandler]   DISABLE_FILE_ATTACH: ${data !== 0 ? 'DISABLED' : 'ENABLED'}`);
        // File attach disallow flag would be stored in session state
        break;

      case XIMCommand.QWKZOOM_REC:
        // express.e:4055-4061: QWK zoom record number (floating point)
        if (data !== 0) {
          // Read: Return float message record number as string
          const floatMsgRecNum = (this.config.bbsSession as any)?.floatMsgRecNum || 0.0;
          const numStr = floatMsgRecNum.toFixed(2);
debugLog(`[DoorMessageHandler]   QWKZOOM_REC GET: ${numStr}`);
          this.writeStringToMessage(msgAddr, numStr);
        } else {
          // Write: Parse string as float and store
          const newVal = parseFloat(str) || 0.0;
debugLog(`[DoorMessageHandler]   QWKZOOM_REC SET: ${newVal}`);
          if ((this.config.bbsSession as any)) {
            (this.config.bbsSession as any).floatMsgRecNum = newVal;
          }
        }
        break;

      case XIMCommand.REL_CONF:
        // express.e:4062-4063: Release conference
debugLog(`[DoorMessageHandler]   REL_CONF: conf=${data}`);
        // Returns conference number after release
        this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, data);
        break;

      case XIMCommand.CHECK_PLAYPEN_EXISTS:
        // express.e:4066-4068: Check if file exists in playpen
        {
          const filePath = str || "";
          const exists = fs.existsSync(filePath) ? 1 : 0;
debugLog(`[DoorMessageHandler]   CHECK_PLAYPEN_EXISTS: "${filePath}" exists=${exists}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, exists);
        }
        break;

      case XIMCommand.CHOOSE_NAME:
      case XIMCommand.EXT_CHOOSE_NAME:
        // express.e:4069-4077: Choose user name from accounts
        {
          const userPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER1_OFFSET);
          const keysPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER2_OFFSET);
          const miscPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER3_OFFSET);
          const searchName = str.toLowerCase();

debugLog(`[DoorMessageHandler]   CHOOSE_NAME: searching for "${searchName}"`);

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
debugLog(`[DoorMessageHandler]   CHOOSE_NAME: Found user ${user.username}`);
            this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 1); // Success
          } else {
debugLog(`[DoorMessageHandler]   CHOOSE_NAME: User not found`);
            this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, 0); // Not found
          }
        }
        break;

      case XIMCommand.APPEND_ACCOUNT:
        // express.e:3915-3924: Append/find account entry (findOpenAccount)
        {
          const userPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER1_OFFSET);
          const keysPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER2_OFFSET);
          const miscPtr = this.emulator.readMemory32(msgAddr + DoorConstants.MESSAGE_FILLER3_OFFSET);

          // Find next available slot (use simple counter for now)
          const slot = Date.now() % 10000; // Simple slot assignment

debugLog(`[DoorMessageHandler]   APPEND_ACCOUNT: Creating account slot ${slot}`);

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

debugLog(`[DoorMessageHandler]   APPEND_ACCOUNT: Account slot ${slot} initialized`);
        }
        break;

      case XIMCommand.XNET_OUTBOUND:
        // express.e:4107-4108: Set XNet outbound directory
debugLog(`[DoorMessageHandler]   XNET_OUTBOUND: "${str}"`);
        // XNet outbound directory for mail
        break;

      case XIMCommand.CON_CURSOR:
        // express.e:4121-4126: Console cursor control
debugLog(`[DoorMessageHandler]   CON_CURSOR: ${data ? 'ON' : 'OFF'}`);
        // Cursor visibility handled by terminal emulator
        break;

      case XIMCommand.TELNET_CONNECT:
        // express.e:3051-3302: Connect to telnet host and establish passthrough
        // This is a BLOCKING call - door waits until user disconnects (ESC)
        debugLog(`[DoorMessageHandler]   TELNET_CONNECT: "${str}" port=${data}`);
        this.handleTelnetConnect(str, data, msgAddr);
        this.emulator.pause();
        debugLog(`[DoorMessageHandler]   TELNET_CONNECT: Emulator paused, waiting for telnet session to end`);
        return; // Don't reply yet - will reply when telnet session ends

      case XIMCommand.TELNET_USERNAME_PROMPT:
        // express.e:3271-3276: Set telnet username prompt for auto-login
        debugLog(`[DoorMessageHandler]   TELNET_USERNAME_PROMPT: "${str}"`);
        this.telnetState.usernamePrompt = str;
        break;

      case XIMCommand.TELNET_USERNAME:
        // express.e:3271-3276: Set telnet username for auto-login
        debugLog(`[DoorMessageHandler]   TELNET_USERNAME: "${str}"`);
        this.telnetState.username = str;
        break;

      case XIMCommand.TELNET_PASSWORD_PROMPT:
        // express.e:3277-3284: Set telnet password prompt for auto-login
        debugLog(`[DoorMessageHandler]   TELNET_PASSWORD_PROMPT: "${str}"`);
        this.telnetState.passwordPrompt = str;
        break;

      case XIMCommand.TELNET_PASSWORD:
        // express.e:3277-3284: Set telnet password for auto-login
        debugLog(`[DoorMessageHandler]   TELNET_PASSWORD: (hidden)`);
        this.telnetState.password = str;
        break;
      case XIMCommand.GET_CMD_TOOLTYPE:
        // express.e:4137-4140: Read tooltype from command file
        // msg.string INPUT = tooltype key to look up (e.g., "LOCATION", "DOORUSE.FR")
        // msg.data OUTPUT = 1 if found, 0 if not found
        // msg.string OUTPUT = the tooltype value
        {
          const tooltypeKey = str.toUpperCase();
          const cmdName = this.config.doorId ||
                          this.config.bbsSession?.doorCommand ||
                          "";
debugLog(`[DoorMessageHandler]   GET_CMD_TOOLTYPE: key="${tooltypeKey}", command="${cmdName}"`);

          let tooltypeValue = "";
          let found = 0;

          // Try to find the command's .info file
          const bbsPath = this.config.bbsSession?.dataDir || process.cwd();
          const possiblePaths = [
            path.join(bbsPath, "Commands", "BBSCmd", `${cmdName}.info`),
            path.join(bbsPath, "Commands", "SysCmd", `${cmdName}.info`),
            path.join(bbsPath, "Commands", "ConfCmd", `${cmdName}.info`),
          ];

          for (const infoPath of possiblePaths) {
            if (fs.existsSync(infoPath)) {
              try {
                const tooltypes = parseInfoFile(infoPath);
                if (tooltypes.has(tooltypeKey)) {
                  tooltypeValue = tooltypes.get(tooltypeKey) || "";
                  found = 1;
debugLog(`[DoorMessageHandler]     Found: ${tooltypeKey}="${tooltypeValue}" in ${infoPath}`);
                  break;
                }
              } catch (err) {
debugLog(`[DoorMessageHandler]     Error parsing ${infoPath}: ${err}`);
              }
            }
          }

          if (!found) {
debugLog(`[DoorMessageHandler]     Tooltype "${tooltypeKey}" not found`);
          }

          this.writeStringToMessage(msgAddr, tooltypeValue);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, found);
        }
        break;

      case XIMCommand.SIG_PLAYPEN:
        // express.e:4196-4198: Get playpen directory path
        {
          const nodeId = this.config.bbsSession?.nodeId || 1;
          const playpenPath = `Node${nodeId}/Playpen/`;
debugLog(`[DoorMessageHandler]   SIG_PLAYPEN: "${playpenPath}"`);
          this.writeStringToMessage(msgAddr, playpenPath);
        }
        break;

      case XIMCommand.LOGON_UNAME:
        // express.e:4201-4202: Auto-login username (not supported)
debugLog(`[DoorMessageHandler]   LOGON_UNAME: Not supported`);
        break;

      case XIMCommand.LOGON_UPASS:
        // express.e:4203-4204: Auto-login password (not supported)
debugLog(`[DoorMessageHandler]   LOGON_UPASS: Not supported`);
        break;

      case XIMCommand.SIG_LI:
        // express.e:4205-4207: Secure line input (password mode with asterisks)
        // getPass2(msg.string, NIL, 0, msg.data, tempstring)
        // msg.string = prompt to display, msg.data = max length, returns input in msg.string
        {
          const prompt = str || "";
          const maxLen = data || 20;
debugLog(`[DoorMessageHandler]   SIG_LI: Password prompt="${prompt}" maxLen=${maxLen}`);
          // Store state for password input handling
          this.activeInput = {
            msgAddr: msgAddr,
            maxlen: maxLen,
            command: command,
            replyPortAddr: this.doorReplyPortAddr,
            resumeCallback: () => {
              this.emulator.resume();
            }
          };
          // Send prompt and enable password mode (hidden input)
          if (prompt) {
            this.socket.emit("ansi-output", prompt);
          }
          // Emit password mode to frontend for masked input
          this.socket.emit("door:password-mode", { enabled: true, maxLength: maxLen });
          // Pause emulator while waiting for input
          this.emulator.pause();
          return; // Don't reply - will reply when input received
        }
      case XIMCommand.NODE_DEVICE:
        // express.e:3848-3849: Get serial device name
        {
          const deviceName = this.config.bbsSession?.connectionType || 'websocket';
debugLog(`[DoorMessageHandler]   NODE_DEVICE: "${deviceName}"`);
          this.writeStringToMessage(msgAddr, deviceName);
        }
        break;

      case XIMCommand.NODE_UNIT:
        // express.e:3850-3852: Get serial device unit number
        {
          const unitNumber = this.config.bbsSession?.nodeId || 0;
debugLog(`[DoorMessageHandler]   NODE_UNIT: ${unitNumber}`);
          this.writeStringToMessage(msgAddr, String(unitNumber));
        }
        break;

      case XIMCommand.NODE_NUMBER:
        // express.e:3853-3855: Get node number
        {
          const nodeNum = this.config.bbsSession?.nodeId || 1;
debugLog(`[DoorMessageHandler]   NODE_NUMBER: ${nodeNum}`);
          this.writeStringToMessage(msgAddr, String(nodeNum));
        }
        break;

      case XIMCommand.UNKNOWN4:
        // express.e:4208-4214: Unknown value storage (general purpose variable)
        if (data !== 0) {
          // Read: return stored value
          const unknownValue = (this.config.bbsSession as any)?.unknownValue || 0;
debugLog(`[DoorMessageHandler]   UNKNOWN4 GET: ${unknownValue}`);
          this.writeStringToMessage(msgAddr, String(unknownValue));
        } else {
          // Write: store value
          const newValue = parseInt(str) || 0;
debugLog(`[DoorMessageHandler]   UNKNOWN4 SET: ${newValue}`);
          if ((this.config.bbsSession as any)) {
            (this.config.bbsSession as any).unknownValue = newValue;
          }
        }
        break;

      // NOTE: CONF_ACCESS is handled earlier in the switch statement (around line 1285)
      // It now properly checks user's conferenceAccess string per express.e:8499-8512

      case XIMCommand.BB_PCONFNAME: // BB_PCONFNAME=148 - Get conference name by number
        {
          // express.e:3779-3785: Get conference name by conference number
          // Read from ConfConfig.info NAME.n tooltypes
          const confNum = data || parseInt(str) || 0;
          if (confNum < 1) {
debugLog(`[DoorMessageHandler]   BB_PCONFNAME: Invalid conf ${confNum}, returning ERROR`);
            this.writeStringToMessage(msgAddr, "ERROR");
          } else {
            const fs = require('fs');
            const path = require('path');
            const bbsRoot = this.config.bbsSession?.dataDir ||
                           (this.config.bbsSession as any)?.bbsRoot ||
                           process.cwd();
            const confConfigPath = path.join(bbsRoot, 'ConfConfig.info');
            let confName = `Conference ${confNum}`;
            try {
              if (fs.existsSync(confConfigPath)) {
                const { parseInfoFile } = require('../../utils/amiga-command-parser.util');
                const tooltypes = parseInfoFile(confConfigPath);
                const nameKey = `NAME.${confNum}`;
                if (tooltypes.has(nameKey)) {
                  confName = tooltypes.get(nameKey) || confName;
                }
              }
            } catch (e) {
debugLog(`[DoorMessageHandler]   BB_PCONFNAME: Error reading ConfConfig.info: ${e}`);
            }
debugLog(`[DoorMessageHandler]   BB_PCONFNAME(${confNum}): "${confName}"`);
            this.writeStringToMessage(msgAddr, confName);
          }
        }
        break;

      case XIMCommand.BB_PCONFLOCAL: // BB_PCONFLOCAL=147 - Get conference location by number
        {
          // express.e:3786-3792: Get conference directory by conference number
          const confNum = data || parseInt(str) || 0;
          if (confNum < 1) {
debugLog(`[DoorMessageHandler]   BB_PCONFLOCAL: Invalid conf ${confNum}, returning ERROR`);
            this.writeStringToMessage(msgAddr, "ERROR");
          } else {
            const confDir = `BBS:Conf${confNum}/`;
debugLog(`[DoorMessageHandler]   BB_PCONFLOCAL(${confNum}): "${confDir}"`);
            this.writeStringToMessage(msgAddr, confDir);
          }
        }
        break;

      case XIMCommand.BB_CONFNUM: // BB_CONFNUM=510 - Current conference number
        {
          // express.e:3831-3833: Conference number
          const confNum = (this.config.bbsSession as any)?.currentConf ||
                         (this.config.bbsSession as any)?.conferenceId || 1;
debugLog(`[DoorMessageHandler]   BB_CONFNUM(510): ${confNum}`);
          this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, confNum);
        }
        break;

      case XIMCommand.BB_CONFNAME: // BB_CONFNAME=126 - Current conference name
        {
          const confName = this.config.bbsSession?.conferenceName || "Main";
debugLog(`[DoorMessageHandler]   BB_CONFNAME(126): "${confName}"`);
          this.writeStringToMessage(msgAddr, confName);
        }
        break;

      case XIMCommand.BB_CONFLOCAL: // BB_CONFLOCAL=127 - Current conference location
        {
          const confNum = (this.config.bbsSession as any)?.currentConf || 1;
          const confDir = `BBS:Conf${confNum}/`;
debugLog(`[DoorMessageHandler]   BB_CONFLOCAL(127): "${confDir}"`);
          this.writeStringToMessage(msgAddr, confDir);
        }
        break;

      case XIMCommand.DT_CONFACCESS: // DT_CONFACCESS=146 - Conference access string
        {
          // express.e:3777-3778: Conference access string (25 chars, X=access)
          // Returns user's conference access permissions
          // bbsSession.confAccess comes from disk (user.data) via door.handler.ts
          // Do NOT fall back to user?.confAccess - that's SQLite database data
          // Default to full access (25 conferences) if not set
          const confAccess = (this.config.bbsSession as any)?.confAccess || 'XXXXXXXXXXXXXXXXXXXXXXXXX';
debugLog(`[DoorMessageHandler]   DT_CONFACCESS(146): "${confAccess}" (from disk)`);
          this.writeStringToMessage(msgAddr, confAccess);
        }
        break;

      default:
debugLog(`[DoorMessageHandler]   Unknown command: ${command}`);
debugLog(`[DoorMessageHandler]   Returning unchanged message`);
        break;
    }

    // Reply to the door by sending message back to its reply port
    this.execLibrary.putMsg(replyPortAddr, msgAddr, {
      suppressDoorCallback: true,
    });
debugLog(
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
debugLog(`[DoorMessageHandler]   Resumed door with key 0x${code.toString(16)}`);
    };

    // Listen for keypress events from the client; support both legacy and door-specific
    this.socket.on("door:keypress", handler);
    this.socket.on("keypress", handler);
    this.socket.emit("door:await-key");
  }

  /**
   * Return AmiExpress major/minor version string (express.e getExpressMajorVer)
   */
  private getExpressMajorVersion(): string {
    const session: any = this.config.bbsSession || {};
    const mimicVer = typeof session.mimicVer === 'string' ? session.mimicVer : '';
    if (mimicVer.length > 0) {
      return mimicVer;
    }

    const raw = typeof session.expressVer === 'string' ? session.expressVer : '';
    const expressVer = raw.trim().length > 0 ? raw.trim() : 'v5.6';

    const normalized = expressVer.startsWith('v') || expressVer.startsWith('V')
      ? expressVer.slice(1)
      : expressVer;
    const dotIndex = normalized.indexOf('.');
    if (dotIndex >= 0) {
      const major = parseInt(normalized.slice(0, dotIndex), 10);
      const minor = parseInt(normalized.slice(dotIndex + 1), 10);
      if (Number.isFinite(major) && Number.isFinite(minor)) {
        return `v${major}.${minor}`;
      }
      if (Number.isFinite(major)) {
        return `v${major}`;
      }
      return 'v5.6';
    }

    const major = parseInt(normalized, 10);
    if (Number.isFinite(major)) {
      return `v${major}`;
    }

    return 'v5.6';
  }

  /**
   * Write a string to the message string field
   */
  private writeStringToMessage(msgAddr: number, str: string): void {
    // FIXED: Use DoorConstants.MESSAGE_STRING_OFFSET (20), not hardcoded 28
    const stringAddr = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    for (let i = 0; i < str.length && i < 200; i++) {
      this.emulator.writeMemory(stringAddr + i, str.charCodeAt(i));
    }
    // Null terminate
    this.emulator.writeMemory(stringAddr + str.length, 0);
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
      const asciiChar = this.amigaCharToAscii(ch);
      str += String.fromCharCode(asciiChar);
    }

debugLog(
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
debugLog(
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

debugLog(
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
    // Minimal allocations to satisfy XIM node-status message
    if (this.nodeStatusAddr === 0) {
      this.nodeStatusAddr = this.execLibrary.allocMem(
        DoorConstants.NODE_STATUS_SIZE,
        DoorConstants.MEMF_PUBLIC_CLEAR
      );
    }
    if (this.doorInfoAddr === 0) {
      this.doorInfoAddr = this.execLibrary.allocMem(
        DoorConstants.DOOR_INFO_SIZE,
        DoorConstants.MEMF_PUBLIC_CLEAR
      );
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
    const petsciiMode = this.config.bbsSession?.petsciiMode || false;
    const ripMode = this.config.bbsSession?.ripMode || false;

    // Extensions to try based on graphics mode (express.e:6258-6295)
    let extensions: string[];
    if (ripMode) {
      extensions = ['.rip', '.RIP', '.txt', '.TXT'];
    } else if (petsciiMode) {
      extensions = ['.seq', '.SEQ', '.txt', '.TXT'];
    } else {
      extensions = ['.txt', '.TXT'];
    }

    // Round down to nearest 5 (express.e:6275)
    let currentLevel = Math.floor(secLevel / 5) * 5;
    const minLevel = 5;

    // Try security-level-specific screens from current level down to minLevel
    while (currentLevel >= minLevel) {
      for (const ext of extensions) {
        const secFilePath = path.join(bbsRoot, `${screenPath}${currentLevel}${ext}`);
        if (fs.existsSync(secFilePath)) {
          return secFilePath;
        }
      }
      currentLevel -= 5;
    }

    // Fall back to base file
    for (const ext of extensions) {
      const basePath = path.join(bbsRoot, `${screenPath}${ext}`);
      if (fs.existsSync(basePath)) {
        return basePath;
      }
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
debugLog(`[DoorMessageHandler] File not found: ${filePath}`);
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

debugLog(`[DoorMessageHandler] Displayed file with MCI: ${filePath} (${contents.length} bytes)`);
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

  // =========================================================================
  // TELNET_CONNECT Implementation (express.e:3051-3302)
  // Establishes TCP connection to remote telnet server and passes data through
  // =========================================================================

  /**
   * Handle TELNET_CONNECT command (XIM 706)
   * Opens TCP socket to remote host and establishes bidirectional passthrough
   * Per express.e:3051-3302: telnetConnect() function
   */
  private handleTelnetConnect(host: string, port: number, msgAddr: number): void {
    // Default to standard telnet port if not specified
    if (port === 0) port = 23;

    // Store message address for reply when session ends (blocking call)
    this.telnetState.pendingMsgAddr = msgAddr;

    debugLog(`[DoorMessageHandler] TELNET_CONNECT: Connecting to ${host}:${port}`);
    this.socket.emit('ansi-output', `\r\nConnecting to ${host}:${port}...\r\n`);

    // Close any existing connection first
    if (this.telnetState.connection) {
      debugLog(`[DoorMessageHandler] TELNET_CONNECT: Closing existing connection`);
      this.telnetState.connection.destroy();
      this.telnetState.connection = null;
    }

    // Create TCP connection with 30 second timeout
    const telnetSocket = net.createConnection({
      host,
      port,
      timeout: 30000
    });

    this.telnetState.connection = telnetSocket;
    this.telnetState.connected = false;
    this.telnetState.loginSent = false;

    telnetSocket.on('connect', () => {
      this.telnetState.connected = true;
      debugLog(`[DoorMessageHandler] TELNET_CONNECT: Connected to ${host}:${port}`);
      this.socket.emit('ansi-output', `Connected to ${host}.\r\n`);
      this.socket.emit('ansi-output', "Escape character is '^]'.\r\n\r\n");
    });

    telnetSocket.on('data', (data: Buffer) => {
      // Filter telnet IAC commands, pass through clean data
      const filtered = this.filterTelnetIAC(data, telnetSocket);
      if (filtered.length > 0) {
        // Convert to string and emit to user's terminal
        this.socket.emit('ansi-output', filtered.toString('binary'));
      }
      // Check for auto-login prompts (express.e:3271-3284)
      this.checkAutoLogin(data, telnetSocket);
    });

    telnetSocket.on('close', () => {
      debugLog(`[DoorMessageHandler] TELNET_CONNECT: Connection closed`);
      this.telnetState.connected = false;
      this.telnetState.connection = null;
      this.socket.emit('ansi-output', '\r\nConnection closed.\r\n');
      this.cleanupTelnetSession();
    });

    telnetSocket.on('error', (err: Error) => {
      debugLog(`[DoorMessageHandler] TELNET_CONNECT: Error - ${err.message}`);
      this.socket.emit('ansi-output', `\r\nConnection error: ${err.message}\r\n`);
      this.cleanupTelnetSession();
    });

    telnetSocket.on('timeout', () => {
      debugLog(`[DoorMessageHandler] TELNET_CONNECT: Connection timeout`);
      this.socket.emit('ansi-output', '\r\nConnection timed out.\r\n');
      telnetSocket.destroy();
      this.cleanupTelnetSession();
    });

    // Set up input handler to forward user input to telnet
    this.setupTelnetInputHandler(telnetSocket);
  }

  /**
   * Filter telnet IAC (Interpret As Command) sequences
   * Per express.e:3218-3269
   *
   * IAC codes:
   * - 255 (IAC): Interpret As Command marker
   * - 251 (WILL): Sender wants to do option
   * - 252 (WONT): Sender refuses option
   * - 253 (DO): Sender wants receiver to do option
   * - 254 (DONT): Sender wants receiver to not do option
   * - 250 (SB): Subnegotiation begin
   * - 240 (SE): Subnegotiation end
   */
  private filterTelnetIAC(data: Buffer, telnetSocket: net.Socket): Buffer {
    const IAC = 255;
    const WILL = 251;
    const WONT = 252;
    const DO = 253;
    const DONT = 254;
    const SB = 250;
    const SE = 240;
    const ECHO = 1;
    const SGA = 3;  // Suppress Go Ahead

    const filtered: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === IAC && i + 1 < data.length) {
        const cmd = data[i + 1];

        if (cmd === IAC) {
          // Escaped IAC (255 255) -> output single 255
          filtered.push(IAC);
          i += 2;
        } else if (cmd === WILL && i + 2 < data.length) {
          const option = data[i + 2];
          debugLog(`[DoorMessageHandler] Telnet IAC WILL ${option}`);

          // Per express.e:3218-3240
          // WILL ECHO -> respond DO ECHO
          // WILL SGA -> respond DO SGA
          if (option === ECHO || option === SGA) {
            telnetSocket.write(Buffer.from([IAC, DO, option]));
            debugLog(`[DoorMessageHandler] Telnet responded DO ${option}`);
          } else {
            // For other options, respond DONT
            telnetSocket.write(Buffer.from([IAC, DONT, option]));
            debugLog(`[DoorMessageHandler] Telnet responded DONT ${option}`);
          }
          i += 3;
        } else if (cmd === WONT && i + 2 < data.length) {
          const option = data[i + 2];
          debugLog(`[DoorMessageHandler] Telnet IAC WONT ${option}`);
          // Acknowledge with DONT
          telnetSocket.write(Buffer.from([IAC, DONT, option]));
          i += 3;
        } else if (cmd === DO && i + 2 < data.length) {
          const option = data[i + 2];
          debugLog(`[DoorMessageHandler] Telnet IAC DO ${option}`);
          // Per express.e: respond WONT to all DO requests
          telnetSocket.write(Buffer.from([IAC, WONT, option]));
          debugLog(`[DoorMessageHandler] Telnet responded WONT ${option}`);
          i += 3;
        } else if (cmd === DONT && i + 2 < data.length) {
          const option = data[i + 2];
          debugLog(`[DoorMessageHandler] Telnet IAC DONT ${option}`);
          // Acknowledge with WONT
          telnetSocket.write(Buffer.from([IAC, WONT, option]));
          i += 3;
        } else if (cmd === SB) {
          // Skip subnegotiation until SE
          debugLog(`[DoorMessageHandler] Telnet IAC SB - skipping subnegotiation`);
          let j = i + 2;
          while (j < data.length - 1) {
            if (data[j] === IAC && data[j + 1] === SE) {
              j += 2;
              break;
            }
            j++;
          }
          i = j;
        } else {
          // Unknown command, skip IAC + cmd
          debugLog(`[DoorMessageHandler] Telnet IAC ${cmd} - skipping`);
          i += 2;
        }
      } else {
        // Regular data byte, pass through
        filtered.push(data[i]);
        i++;
      }
    }

    return Buffer.from(filtered);
  }

  /**
   * Check received data for username/password prompts and auto-login
   * Per express.e:3271-3284
   */
  private checkAutoLogin(data: Buffer, telnetSocket: net.Socket): void {
    const text = data.toString();

    // Check for username prompt
    if (this.telnetState.username && this.telnetState.usernamePrompt) {
      if (text.toLowerCase().includes(this.telnetState.usernamePrompt.toLowerCase())) {
        debugLog(`[DoorMessageHandler] Auto-login: sending username`);
        telnetSocket.write(this.telnetState.username + '\r\n');
        this.telnetState.username = ''; // Clear after use
      }
    }

    // Check for password prompt
    if (this.telnetState.password && this.telnetState.passwordPrompt) {
      if (text.toLowerCase().includes(this.telnetState.passwordPrompt.toLowerCase())) {
        debugLog(`[DoorMessageHandler] Auto-login: sending password`);
        telnetSocket.write(this.telnetState.password + '\r\n');
        this.telnetState.password = ''; // Clear after use
        this.telnetState.loginSent = true;
      }
    }
  }

  /**
   * Set up input handler to forward user input to telnet socket
   * Per express.e:3095-3120 - handle user input during telnet session
   */
  private setupTelnetInputHandler(telnetSocket: net.Socket): void {
    // Store the original input handler to restore later
    // We'll intercept door:input events during telnet session

    const telnetInputHandler = (data: string) => {
      // ESC (0x1B) or Ctrl+] (0x1D) disconnects per express.e:3095-3100
      if (data === '\x1b' || data === '\x1d') {
        debugLog(`[DoorMessageHandler] Telnet: User requested disconnect`);
        this.socket.emit('ansi-output', '\r\n[Disconnecting...]\r\n');
        telnetSocket.destroy();
        return;
      }

      // Forward input to telnet socket if connected
      if (this.telnetState.connected && telnetSocket && !telnetSocket.destroyed) {
        telnetSocket.write(data);
      }
    };

    // Add telnet input handler
    this.telnetState.originalInputHandler = this.socket.listeners('door:input')[0] as ((data: string) => void) | undefined || null;

    // Remove existing handlers temporarily
    this.socket.removeAllListeners('door:input');

    // Add our telnet-specific handler
    this.socket.on('door:input', telnetInputHandler);

    debugLog(`[DoorMessageHandler] Telnet input handler set up`);
  }

  /**
   * Clean up telnet session and restore normal input handling
   */
  private cleanupTelnetSession(): void {
    debugLog(`[DoorMessageHandler] Cleaning up telnet session`);

    // Close connection if still open
    if (this.telnetState.connection && !this.telnetState.connection.destroyed) {
      this.telnetState.connection.destroy();
    }

    // Remove telnet input handler
    this.socket.removeAllListeners('door:input');

    // Restore original handler if we saved one
    if (this.telnetState.originalInputHandler) {
      this.socket.on('door:input', this.telnetState.originalInputHandler);
    } else {
      // Re-setup the standard input handler
      this.setupInputHandler();
    }

    // Reply to pending TELNET_CONNECT message (blocking call complete)
    const pendingMsgAddr = this.telnetState.pendingMsgAddr;
    if (pendingMsgAddr) {
      debugLog(`[DoorMessageHandler] Telnet session ended - replying to TELNET_CONNECT at 0x${pendingMsgAddr.toString(16)}`);
      this.execLibrary.putMsg(this.doorReplyPortAddr, pendingMsgAddr, {
        suppressDoorCallback: true,
      });
      // Resume emulator now that blocking call is complete
      this.emulator.resume();
      debugLog(`[DoorMessageHandler] Emulator resumed after telnet session`);
    }

    // Reset telnet state
    this.telnetState = {
      usernamePrompt: '',
      username: '',
      passwordPrompt: '',
      password: '',
      connection: null,
      connected: false,
      loginSent: false,
      originalInputHandler: null,
      pendingMsgAddr: 0
    };

    debugLog(`[DoorMessageHandler] Telnet session cleaned up`);
  }

  /**
   * Format byte size to human-readable string (e.g., "1.5mb")
   * Per express.e:3336-3370 calcSizeText()
   */
  private formatByteSize(bytes: number): string {
    if (bytes < 1024) {
      return `${bytes}b`;
    } else if (bytes < 1024 * 1024) {
      return `${(bytes / 1024).toFixed(1)}kb`;
    } else if (bytes < 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(1)}mb`;
    } else if (bytes < 1024 * 1024 * 1024 * 1024) {
      return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)}gb`;
    } else {
      return `${(bytes / (1024 * 1024 * 1024 * 1024)).toFixed(1)}tb`;
    }
  }
}

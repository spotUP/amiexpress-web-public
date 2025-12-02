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

export interface MessageProcessingConfig {
  suppressCallbacks: boolean;
  enableMessageLogging: boolean;
  maxMessageSize: number;
  bufferSize: number;
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
  handleDoorMessage(portAddr: number, msgAddr: number): void {
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
      this.ximProtocol.handleMessage(ximMessage);
    } else {
      console.log(
        `[DoorMessageHandler] WARNING: XIM Protocol not initialized!`
      );
      // Fall back to command processor
      this.processCommand(command, data, str, msgAddr, mn_ReplyPort);
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
   */
  private processCommand(
    command: number,
    data: number,
    str: string,
    msgAddr: number,
    replyPortAddr: number
  ): void {
    console.log(`[DoorMessageHandler] Processing command ${command}...`);
    this.logMessageRequest(msgAddr, command, data, str);
    // If the incoming message uses a different reply port, honor it (express.e ReplyMsg behavior)
    if (replyPortAddr && replyPortAddr !== this.doorReplyPortAddr) {
      this.doorReplyPortAddr = replyPortAddr;
    }

    // Command constants from aedoor.h
    const JH_LI = 0; // Line Input
    const JH_REGISTER = 1; // Register door with BBS
    const JH_SHUTDOWN = 2; // Shutdown door
    const JH_WRITE = 3; // Write text to terminal
    const JH_SM = 4; // Send Message
    const JH_PM = 5; // Post Message
    const JH_HK = 6; // HotKey
    const JH_SG = 7; // Show GFile
    const JH_SF = 8; // Show File
    const DT_NAME = 100;
    const DT_LOCATION = 102;
    const DT_PHONENUMBER = 103;
    const DT_SECLEVEL = 105;
    const GETKEY = 500;

    switch (command) {
      case JH_LI:
        // Line Input - door is requesting line input from user
        console.log(`[DoorMessageHandler]   JH_LI: Door requesting line input`);
        console.log(`[DoorMessageHandler]   Max length: ${data}`);
        this.writeStringToMessage(msgAddr, "");
        console.log(
          `[DoorMessageHandler]   Returned empty string (simulated Enter key)`
        );
        break;

      case JH_REGISTER:
        // Register door with BBS
        console.log(
          `[DoorMessageHandler]   JH_REGISTER: Door registering with BBS`
        );
        // express.e: msg.command := userLineLen (else 29)
        const rawLineLen =
          (this.config.bbsSession as any)?.user?.linesPerScreen ??
          (this.config.bbsSession as any)?.user?.lineLength ??
          (this.config.bbsSession as any)?.pauseLines ??
          (this.config.bbsSession as any)?.lineWrap;
        const lineLen =
          typeof rawLineLen === "number" && rawLineLen > 0 ? rawLineLen : 29;
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
          lineLen
        );
        // Keep data/node/string as provided by the door; clear lineNum
        this.emulator.writeMemory32(
          msgAddr + DoorConstants.MESSAGE_LINE_OFFSET,
          0
        );
        console.log(
          `[DoorMessageHandler]   Replied with line length ${lineLen}`
        );
        break;

      case JH_SHUTDOWN:
        // Door is shutting down
        console.log(`[DoorMessageHandler]   JH_SHUTDOWN: Door shutting down`);
        console.log(`[DoorMessageHandler]   Terminating door session`);
        this.execLibrary.putMsg(replyPortAddr, msgAddr, {
          suppressDoorCallback: true,
        });
        // Note: Lifecycle termination would be handled by parent
        return; // Don't send reply again

      case JH_WRITE:
        // Write text to terminal
        console.log(`[DoorMessageHandler]   JH_WRITE: "${str}"`);
        console.log(`[DoorMessageHandler]   Data (LF flag): ${data}`);

        // Send text to user's terminal
        let output = str;
        if (data === 1) {
          // LF flag set - add line feed
          output += "\r\n";
        }
        this.socket.emit("ansi-output", output);
        console.log(`[DoorMessageHandler]   Sent to terminal: "${output}"`);
        break;

      case DT_NAME:
        // Get user name - write to message string field
        console.log(`[DoorMessageHandler]   DT_NAME: Request for user name`);
        const userName = this.config.bbsSession?.user?.username || "Sysop";
        this.writeStringToMessage(msgAddr, userName);
        console.log(`[DoorMessageHandler]   Replied with name: "${userName}"`);
        break;

      case DT_LOCATION:
        // Get user location
        console.log(
          `[DoorMessageHandler]   DT_LOCATION: Request for user location`
        );
        const location = this.config.bbsSession?.user?.location || "Unknown";
        this.writeStringToMessage(msgAddr, location);
        console.log(
          `[DoorMessageHandler]   Replied with location: "${location}"`
        );
        break;

      case DT_SECLEVEL:
        // Get security level
        console.log(
          `[DoorMessageHandler]   DT_SECLEVEL: Request for security level`
        );
        const secLevel = this.config.bbsSession?.user?.secLevel || 100;
        this.emulator.writeMemory32(msgAddr + 24, secLevel);
        console.log(
          `[DoorMessageHandler]   Replied with sec level: ${secLevel}`
        );
        break;

      case GETKEY:
        // Get user input - this requires pausing execution
        console.log(`[DoorMessageHandler]   GETKEY: Request for user input`);
        // Pause the CPU loop and wait for a key from the client
        this.waitForKeypress(msgAddr, replyPortAddr);
        break;

      default:
        console.log(`[DoorMessageHandler]   Unknown command: ${command}`);
        console.log(
          `[DoorMessageHandler]   TODO: Implement handler for this command`
        );
        break;
    }

    // Reply to the door by sending message back to its reply port
    this.execLibrary.putMsg(replyPortAddr, msgAddr, {
      suppressDoorCallback: true,
    });
    console.log(
      `[DoorMessageHandler]   Sent reply to door at port 0x${replyPortAddr.toString(
        16
      )}`
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
}

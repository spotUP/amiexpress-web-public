/**
 * XIM Protocol Implementation for AmiExpress Door Communication
 *
 * Based on aedoor.h specification from AmiExpress sources.
 * Handles bidirectional message-based communication between BBS and doors.
 *
 * This is the main coordinator that delegates to specialized modules:
 * - messages.ts: Message parsing and validation
 * - io.ts: Input/output operations (terminal, keyboard)
 * - data-query.ts: User data queries (DT_* commands)
 * - bbs-info.ts: BBS information queries (BB_* commands)
 * - system-commands.ts: System commands (registration, shutdown, etc)
 */

import { MoiraEmulator } from './cpu/MoiraEmulator';
import { ExecLibrary } from './api/ExecLibrary';
import { Socket } from 'socket.io';
import { XIMCommand, BBSSessionData, XIMState, XIMMessage } from './xim/types';
import { DoorConstants } from './DoorTypes';
import { XIMMessageParser } from './xim/messages';
import { XIMIOHandler } from './xim/io';
import { XIMDataQueryHandler } from './xim/data-query';
import { XIMBBSInfoHandler } from './xim/bbs-info';
import { XIMSystemCommandsHandler } from './xim/system-commands';

export { XIMCommand } from './xim/types';

export class XIMProtocol {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private doorPort: number;
  private doorReplyPort: number = 0;
  private bbsSession: BBSSessionData;
  private state: XIMState;
  private doorCommand: string = ''; // Command name used to launch this door (e.g., "FR")
  private doorCommandAddr: number = 0; // Persistent memory address for door command string
  private iconLibrary: any = null; // IconLibrary for loading .info files

  // Specialized handlers
  private messageParser: XIMMessageParser;
  private ioHandler: XIMIOHandler;
  private dataQueryHandler: XIMDataQueryHandler;
  private bbsInfoHandler: XIMBBSInfoHandler;
  private systemCommandsHandler: XIMSystemCommandsHandler;
  private messageLogger: ((msg: XIMMessage, commandName?: string) => void) | null = null;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    socket: Socket,
    doorPort: number,
    bbsSession?: any,
    iconLibrary?: any
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.doorPort = doorPort;
    this.bbsSession = bbsSession || {};
    // Extract door command name (e.g., "FR" for AquaScan running in FR mode)
    // Check multiple possible locations where doorId/doorCommand might be set
    console.log(`[XIMProtocol] CONSTRUCTOR CALLED - bbsSession type: ${typeof bbsSession}, has doorCommand: ${!!bbsSession?.doorCommand}, has doorId: ${!!bbsSession?.doorId}`);
    this.doorCommand = bbsSession?.doorCommand || bbsSession?.doorId || bbsSession?.doorName || '';
    console.log(`[XIMProtocol] doorCommand="${this.doorCommand}" (from: doorCommand=${bbsSession?.doorCommand}, doorId=${bbsSession?.doorId}, doorName=${bbsSession?.doorName})`);

    // Allocate persistent memory for door command string in a high memory region
    // Use a fixed high address that won't conflict with door's memory
    if (this.doorCommand) {
      // Use address 0x1FF800 (near top of 2MB address space, unlikely to be used)
      this.doorCommandAddr = 0x1FF800;
      const bufferSize = this.doorCommand.length + 1;

      // Write the command string to this fixed address
      for (let i = 0; i < this.doorCommand.length; i++) {
        this.emulator.writeMemory(this.doorCommandAddr + i, this.doorCommand.charCodeAt(i));
      }
      this.emulator.writeMemory(this.doorCommandAddr + this.doorCommand.length, 0); // null terminator

      // Verify immediately
      const verifyStr = this.emulator.readString(this.doorCommandAddr, bufferSize);
      console.log(`[XIMProtocol] Wrote door command to fixed address 0x${this.doorCommandAddr.toString(16)}`);
      console.log(`[XIMProtocol]   Wrote: "${this.doorCommand}" -> Read back: "${verifyStr}"`);
    }

    // Store iconLibrary for command .info file loading
    this.iconLibrary = iconLibrary;

    // CRITICAL: Pre-load command's .info file and write DiskObject tooltype pointer to 0x100e5c
    // This is required for doors like AquaScan that expect the tooltype array pointer to be pre-initialized
    // Real AmiExpress does this automatically when launching doors
    if (this.iconLibrary && this.doorCommand) {
      this.preLoadCommandDiskObject();
    }

    this.state = {
      registered: false,
      shuttingDown: false,
      nonStopText: !!this.bbsSession?.nonStopText,
      lineCount: this.bbsSession?.lineCount ?? 0,
      lineWrap: this.bbsSession?.lineWrap ?? 79,
      pauseLines: this.bbsSession?.pauseLines ?? 22,
      language: this.bbsSession?.language || 'txt',
      confAccess:
        this.bbsSession?.confAccess || this.bbsSession?.user?.confAccess || '',
      carrierDropped: false,
      returnCommand: this.bbsSession?.returnCommand,
      prvCommand: undefined,
      chainCommand: undefined,
      logonType: this.bbsSession?.logonType,
    };

    // Initialize specialized handlers
    this.messageParser = new XIMMessageParser(emulator);
    this.ioHandler = new XIMIOHandler(
      emulator,
      execLibrary,
      socket,
      this.messageParser,
      this.state,
      this.bbsSession
    );
    this.dataQueryHandler = new XIMDataQueryHandler(
      emulator,
      execLibrary,
      this.messageParser,
      this.bbsSession,
      this.state
    );
    this.bbsInfoHandler = new XIMBBSInfoHandler(
      emulator,
      execLibrary,
      socket,
      this.messageParser,
      this.bbsSession,
      this.state
    );
    this.systemCommandsHandler = new XIMSystemCommandsHandler(
      emulator,
      execLibrary,
      socket,
      this.messageParser,
      this.bbsSession,
      this.state
    );

    console.log('[XIMProtocol] Initialized');
    console.log(`  Door Port: 0x${doorPort.toString(16)}`);
    console.log(`  BBS Session: ${bbsSession ? 'Provided' : 'None'}`);
    if (bbsSession?.user) {
      console.log(`  User: ${bbsSession.user.username || 'Unknown'}`);
    }
  }

  setMessageLogger(logger: (msg: XIMMessage, commandName?: string) => void): void {
    this.messageLogger = logger;
  }

  /**
   * Check if waiting for line input from user
   */
  isWaitingForLineInput(): boolean {
    return this.ioHandler.isWaitingForLineInput();
  }

  /**
   * Queue input from terminal for door to read via GETKEY or JH_LI
   * Called from AmigaDoorSession when 'door:input' event received
   */
  queueInput(data: string): void {
    this.ioHandler.queueInput(data);
  }

  /**
   * Update key state for simultaneous input (from keys:state event)
   * Called from AmigaDoorSession when 'keys:state' event received
   */
  updateKeyState(data: { key: string; pressed: boolean; keyState: Record<string, boolean> }): void {
    this.ioHandler.updateKeyState(data);
  }

  /**
   * Get current key state (for doors that need to check multiple keys at once)
   */
  getKeyState(): Record<string, boolean> {
    return this.ioHandler.getKeyState();
  }

  /**
   * Check if a specific key is currently pressed
   */
  isKeyPressed(key: string): boolean {
    return this.ioHandler.isKeyPressed(key);
  }

  /**
   * Mark carrier drop so pending input commands can fail with Data=-1
   */
  markCarrierDropped(): void {
    this.state.carrierDropped = true;
    this.ioHandler.markCarrierDropped();
  }

  /**
   * Parse XIM message from memory
   */
  parseMessage(msgAddr: number) {
    const msg = this.messageParser.parseMessage(msgAddr);

    // Save door's reply port for future responses
    if (msg.replyPort !== 0 && this.doorReplyPort === 0) {
      this.doorReplyPort = msg.replyPort;
      console.log('[XIMProtocol] Discovered door reply port: 0x' + msg.replyPort.toString(16));
    }

    return msg;
  }

  /**
   * Handle incoming XIM message from door
   * Routes to appropriate specialized handler based on command type
   */
  async handleMessage(msg: XIMMessage): Promise<void> {
    const humanName = this.messageParser.getCommandName(msg.command);
    console.log(
      `[XIMProtocol] Handling command: ${humanName} (enum SV_NEWMSG=${XIMCommand.SV_NEWMSG}, RAWARROW=${XIMCommand.RAWARROW})`
    );

    // Normalize nodeId to the active session node when the door leaves it unset or 0xFFFFFFFF.
    if (
      msg.nodeId === undefined ||
      msg.nodeId === null ||
      msg.nodeId === 0xffffffff
    ) {
      const nodeId =
        (this.bbsSession?.nodeId as number) ||
        (this.bbsSession as any)?.nodeNumber ||
        1;
      this.messageParser.writeNodeId(msg.msgAddr, nodeId);
      msg = { ...msg, nodeId };
    }

    // Normalize JH_REGISTER to carry the active node before logging/handling
    if (msg.command === XIMCommand.JH_REGISTER) {
      const incomingData =
        typeof msg.data === 'number' && !Number.isNaN(msg.data)
          ? msg.data
          : undefined;
      const nodeId =
        (this.bbsSession?.nodeId as number) ||
        (this.bbsSession as any)?.nodeNumber ||
        1;
      if (incomingData !== undefined) {
        this.messageParser.writeData(msg.msgAddr, incomingData);
      }
      this.messageParser.writeNodeId(msg.msgAddr, msg.nodeId ?? nodeId);
      this.messageParser.writeLineNumber(msg.msgAddr, 0);
      const normalized = this.messageParser.parseMessage(msg.msgAddr);
      msg = { ...msg, data: normalized.data, nodeId: normalized.nodeId, lineNumber: normalized.lineNumber };
      // Keep a copy of the register msg around in case the door polls again
      this.emulator.writeMemory32(
        msg.msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET,
        normalized.command
      );
      this.emulator.writeMemory32(
        msg.msgAddr + DoorConstants.MESSAGE_DATA_OFFSET,
        normalized.data
      );
      this.emulator.writeMemory32(
        msg.msgAddr + DoorConstants.MESSAGE_NODE_OFFSET,
        normalized.nodeId ?? nodeId
      );
    }

    this.messageLogger?.(msg, humanName);

    // Handle system commands first (register/shutdown and others)
    if (this.isSystemCommand(msg.command)) {
      this.handleSystemCommand(msg);
      return;
    }

    // Registration gate
    if (!this.state.registered) {
      console.warn('[XIMProtocol] Ignoring command before JH_REGISTER handshake');
      this.messageParser.writeData(msg.msgAddr, 0);
      this.execLibrary.replyMsg(msg.msgAddr);
      return;
    }

    if (this.state.shuttingDown && msg.command !== XIMCommand.JH_SHUTDOWN) {
      console.warn('[XIMProtocol] Door requested commands after shutdown, replying with 0');
      this.messageParser.writeData(msg.msgAddr, 0);
      this.execLibrary.replyMsg(msg.msgAddr);
      return;
    }

    // I/O Commands - handled by XIMIOHandler
    if (this.isIOCommand(msg.command)) {
      await this.handleIOCommand(msg);
      return;
    }

    // Data Query Commands (DT_*) - handled by XIMDataQueryHandler
    if (this.isDataQueryCommand(msg.command)) {
      this.dataQueryHandler.handleDataQuery(msg);
      return;
    }

    // Command-related handlers (GET_CUSTOM_MSGBASE_MENUCMD, GET_CMD_TOOLTYPE, etc.)
    // These MUST be checked BEFORE isBBSInfoCommand because command 525 is shared:
    // - BB_NONSTOPTEXT = 525 (in bbsList)
    // - GET_CUSTOM_MSGBASE_MENUCMD = 525 (door command lookup)
    // For doors like AquaScan, 525 means "get menu command", not "nonstop text"
    if (this.isCommandInfoRequest(msg.command)) {
      this.handleCommandInfoRequest(msg);
      return;
    }

    // BBS Info Commands (BB_*) - handled by XIMBBSInfoHandler
    if (this.isBBSInfoCommand(msg.command)) {
      this.handleBBSInfoCommand(msg);
      return;
    }

    // Unknown command
    console.log(`[XIMProtocol] ⚠️ UNHANDLED COMMAND: ${msg.command} (0x${msg.command.toString(16)})`);
    console.log(`[XIMProtocol]   Message details: msgAddr=0x${msg.msgAddr.toString(16)}, data=${msg.data}, string="${msg.string}"`);
    this.sendReply(msg, 0);
  }

  /**
   * Check if command is a command-info request (GET_CUSTOM_MSGBASE_MENUCMD, GET_CMD_TOOLTYPE)
   */
  private isCommandInfoRequest(command: number): boolean {
    // 525 = GET_CUSTOM_MSGBASE_MENUCMD - Returns menu command used to launch door
    // 551 = GET_CMD_TOOLTYPE - Reads tooltype from command's .info file
    const is525 = command === 525;
    const is551 = command === 551;
    if (is525 || is551) {
      console.log(`[XIMProtocol] isCommandInfoRequest(${command}) -> TRUE (is525=${is525}, is551=${is551})`);
      return true;
    }
    // Debug: log ALL commands in the 500-600 range to catch any we might be missing
    if (command >= 500 && command <= 600) {
      console.log(`[XIMProtocol] isCommandInfoRequest(${command}) -> FALSE (command in 500-600 range but NOT 525/551)`);
    }
    return false;
  }

  /**
   * Handle command-info requests
   * express.e:4137-4140 for GET_CMD_TOOLTYPE
   * express.e:4015 for GET_CUSTOM_MSGBASE_MENUCMD
   */
  private handleCommandInfoRequest(msg: XIMMessage): void {
    const command = msg.command;

    if (command === 525) {
      // GET_CUSTOM_MSGBASE_MENUCMD - Returns menu command that launched this door
      // e.g., if user typed "FR" which launched AquaScan, return "FR"
      // Doors use this to look up DOORUSE.FR in their .info tooltypes
      const cmdName = this.doorCommand || '';
      console.log(`[XIMProtocol] GET_CUSTOM_MSGBASE_MENUCMD: "${cmdName}"`);

      // Refresh the string in fixed memory (in case it was overwritten)
      if (this.doorCommandAddr > 0 && cmdName) {
        for (let i = 0; i < cmdName.length; i++) {
          this.emulator.writeMemory(this.doorCommandAddr + i, cmdName.charCodeAt(i));
        }
        this.emulator.writeMemory(this.doorCommandAddr + cmdName.length, 0);

        // Set StringPtr to fixed memory location
        this.messageParser.writeStringPointer(msg.msgAddr, this.doorCommandAddr);
        const stringContent = this.emulator.readString(this.doorCommandAddr, cmdName.length + 1);
        console.log(`[XIMProtocol]   StringPtr=0x${this.doorCommandAddr.toString(16)} (fixed) -> "${stringContent}"`);
      } else {
        // Fallback: write to embedded buffer
        this.messageParser.writeMessageString(msg.msgAddr, cmdName);
        const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
        this.messageParser.writeStringPointer(msg.msgAddr, stringAddr);
        console.log(`[XIMProtocol]   StringPtr=0x${stringAddr.toString(16)} (message buffer)`);
      }

      this.sendReply(msg, cmdName.length);
    } else if (command === 551) {
      // GET_CMD_TOOLTYPE - Read tooltype from command's .info file
      // msg.string = tooltype key to look up (e.g., "DOORUSE.FR")
      // Returns the tooltype value from the .info file
      const tooltypeKey = (msg.string || '').toUpperCase();
      const cmdName = this.doorCommand || '';
      console.log(`[XIMProtocol] GET_CMD_TOOLTYPE: key="${tooltypeKey}" cmd="${cmdName}"`);

      // Look up the tooltype in command's .info file
      const fs = require('fs');
      const path = require('path');
      const { parseInfoFile } = require('../utils/amiga-command-parser.util');

      let tooltypeValue = '';
      let found = 0;

      const bbsPath = (this.bbsSession as any)?.dataDir || (this.bbsSession as any)?.bbsRoot || process.cwd();
      const possiblePaths = [
        path.join(bbsPath, 'Commands', 'BBSCmd', `${cmdName}.info`),
        path.join(bbsPath, 'Commands', 'SysCmd', `${cmdName}.info`),
        path.join(bbsPath, 'Commands', 'ConfCmd', `${cmdName}.info`),
      ];

      for (const infoPath of possiblePaths) {
        if (fs.existsSync(infoPath)) {
          const tooltypes = parseInfoFile(infoPath);
          if (tooltypes.has(tooltypeKey)) {
            tooltypeValue = tooltypes.get(tooltypeKey) || '';
            found = 1;
            console.log(`[XIMProtocol]   Found "${tooltypeKey}"="${tooltypeValue}" in ${infoPath}`);
            break;
          }
        }
      }

      if (!found) {
        console.log(`[XIMProtocol]   Tooltype "${tooltypeKey}" not found`);
      }

      // Write string to embedded buffer
      this.messageParser.writeMessageString(msg.msgAddr, tooltypeValue);

      // Write pointer to the embedded string buffer
      const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
      this.messageParser.writeStringPointer(msg.msgAddr, stringAddr);

      console.log(`[XIMProtocol]   Wrote tooltype value="${tooltypeValue}", StringPtr=0x${stringAddr.toString(16)}`);

      this.messageParser.writeData(msg.msgAddr, found);
      this.sendReply(msg, found);
    }
  }

  /**
   * Check if command is an I/O command
   */
  private isIOCommand(command: number): boolean {
    const ioList = [
      XIMCommand.JH_LI,
      XIMCommand.JH_WRITE,
      XIMCommand.JH_SM,
      XIMCommand.JH_SMPTR,
      XIMCommand.JH_PM,
      XIMCommand.JH_HK,
      XIMCommand.JH_SG,
      XIMCommand.JH_SF,
      XIMCommand.JH_MCI,
      XIMCommand.JH_ExtHK,
      XIMCommand.JH_FetchKey,
      XIMCommand.JH_CO,
      XIMCommand.JH_SO,
      XIMCommand.JH_20,
      XIMCommand.QUICK_KEY,
      XIMCommand.GETKEY,
      XIMCommand.DISPLAY_FILE,
      XIMCommand.CHECK_TO_DISPLAY,
      XIMCommand.PG_SM,
      XIMCommand.PG_UD,
      XIMCommand.PG_US,
    ];
    if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
      console.log(
        `[XIMProtocol][IOCheckDebug] command=${command} inIO=${ioList.includes(
          command
        )}`
      );
    }
    return ioList.includes(command);
  }

  /**
   * Handle I/O commands
   */
  private async handleIOCommand(msg: any): Promise<void> {
    switch (msg.command) {
      case XIMCommand.JH_LI:
        this.ioHandler.handleLineInput(msg);
        break;

      case XIMCommand.JH_WRITE:
        this.ioHandler.handleWrite(msg);
        break;

      case XIMCommand.JH_SM:
        this.ioHandler.handleSendMessage(msg);
        break;
      case XIMCommand.JH_SMPTR:
        // JH_SMPTR uses stringPtr instead of embedded string
        msg.string = '';
        this.ioHandler.handleSendMessage(msg);
        break;

      case XIMCommand.JH_PM:
        this.ioHandler.handlePromptMessage(msg);
        break;

      case XIMCommand.JH_HK:
        this.ioHandler.handleHotkey(msg);
        break;

      case XIMCommand.JH_SG:
        await this.ioHandler.handleShowGFile(msg);
        break;

      case XIMCommand.JH_SF:
        await this.ioHandler.handleShowFile(msg);
        break;

      case XIMCommand.JH_MCI:
        await this.ioHandler.handleMCI(msg);
        break;

      case XIMCommand.DISPLAY_FILE:
        this.ioHandler.handleDisplayFileNonStop(msg);
        break;

      case XIMCommand.CHECK_TO_DISPLAY:
        this.ioHandler.handleCheckToDisplay(msg);
        break;

      case XIMCommand.JH_ExtHK:
        this.ioHandler.handleExtendedHotkey(msg);
        break;

      case XIMCommand.JH_FetchKey:
        this.ioHandler.handleFetchKey(msg);
        break;

      case XIMCommand.JH_CK:
        this.ioHandler.handleCheckKey(msg);
        break;

      case XIMCommand.JH_CO:
        this.ioHandler.handleConsoleOutput(msg);
        break;

      case XIMCommand.JH_SO:
        this.ioHandler.handleSerialOutput(msg);
        break;

      case XIMCommand.JH_20:
      case XIMCommand.QUICK_KEY:
        this.ioHandler.handleQuickKey(msg);
        break;

      case XIMCommand.GETKEY:
        this.ioHandler.handleGetKey(msg);
        break;

      case XIMCommand.PG_SM:
        this.ioHandler.handleScreenMessage(msg);
        break;

      case XIMCommand.PG_UD:
        this.ioHandler.handleUserData(msg, this.bbsSession);
        break;

      case XIMCommand.PG_US:
        this.ioHandler.handleUserString(msg, this.bbsSession);
        break;
    }
  }

  /**
   * Check if command is a data query command
   */
  private isDataQueryCommand(command: number): boolean {
    const inRange =
      (command >= 100 && command <= 146) ||
      (command >= 527 && command <= 545) ||
      command === 606 ||
      (command >= 700 && command <= 701) ||
      (command >= 1000 && command <= 1002);
    if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
      console.log(
        `[XIMProtocol][DataCheckDebug] command=${command} inDQ=${inRange}`
      );
    }
    return inRange;
  }

  /**
   * Check if command is a BBS info command
   */
  private isBBSInfoCommand(command: number): boolean {
    const bbsList = [
      XIMCommand.JH_BBSNAME,
      XIMCommand.JH_SYSOP,
      XIMCommand.EXPRESS_VERSION,
      XIMCommand.BB_NODEID,
      XIMCommand.BB_STATUS,
      XIMCommand.BB_CONFNAME,
      XIMCommand.BB_CONFLOCAL,
      XIMCommand.BB_LOCAL,
      XIMCommand.BB_CONFNUM,
      XIMCommand.BB_LOGONTYPE,
      XIMCommand.BB_SCRWIDTH,
      XIMCommand.BB_SCRHEIGHT,
      XIMCommand.BB_SCRLEFT,
      XIMCommand.BB_SCRTOP,
      XIMCommand.BB_PURGELINE,
      XIMCommand.BB_PURGELINESTART,
      XIMCommand.BB_PURGELINEEND,
      XIMCommand.BB_NONSTOPTEXT,
      XIMCommand.BB_LINECOUNT,
      XIMCommand.BB_PCONFNAME,
      XIMCommand.BB_PCONFLOCAL,
      XIMCommand.BB_MAINLINE,
      XIMCommand.BB_CALLERSLOG,
      XIMCommand.BB_UDLOG,
      XIMCommand.BB_TASKPRI,
      XIMCommand.BB_CHATFLAG,
      XIMCommand.BB_CHATSET,
      XIMCommand.BB_DROPDTR,
      XIMCommand.BB_GETTASK,
    ];
    if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
      console.log(
        `[XIMProtocol][BBSCheckDebug] command=${command} inBBS=${bbsList.includes(
          command
        )}`
      );
    }
    return bbsList.includes(command);
  }

  /**
   * Handle BBS info commands
   */
  private handleBBSInfoCommand(msg: any): void {
    switch (msg.command) {
      case XIMCommand.JH_BBSNAME:
        this.bbsInfoHandler.handleBBSName(msg);
        break;

      case XIMCommand.JH_SYSOP:
        this.bbsInfoHandler.handleSysopName(msg);
        break;

      case XIMCommand.EXPRESS_VERSION:
        this.bbsInfoHandler.handleExpressVersion(msg);
        break;

      case XIMCommand.BB_NODEID:
        this.bbsInfoHandler.handleNodeID(msg);
        break;

      case XIMCommand.BB_STATUS:
        this.bbsInfoHandler.handleStatus(msg);
        break;

      case XIMCommand.BB_CONFNAME:
      case XIMCommand.BB_CONFLOCAL:
      case XIMCommand.BB_LOCAL:
      case XIMCommand.BB_CONFNUM:
      case XIMCommand.BB_LOGONTYPE:
        this.bbsInfoHandler.handleBBSInfo(msg);
        break;

      case XIMCommand.BB_SCRWIDTH:
      case XIMCommand.BB_SCRHEIGHT:
      case XIMCommand.BB_SCRLEFT:
      case XIMCommand.BB_SCRTOP:
        this.bbsInfoHandler.handleScreenDimensions(msg);
        break;
      case XIMCommand.SCREEN_ADDRESS:
      case XIMCommand.RAWSCREEN_ADDRESS:
        this.bbsInfoHandler.handleScreenAddress(msg);
        break;

      case XIMCommand.BB_PURGELINE:
      case XIMCommand.BB_PURGELINESTART:
      case XIMCommand.BB_PURGELINEEND:
        this.bbsInfoHandler.handlePurgeLine(msg);
        break;

      case XIMCommand.BB_NONSTOPTEXT:
        this.bbsInfoHandler.handleNonStopText(msg);
        break;

      case XIMCommand.BB_LINECOUNT:
        this.bbsInfoHandler.handleLineCount(msg);
        break;

      case XIMCommand.BB_PCONFNAME:
      case XIMCommand.BB_PCONFLOCAL:
        this.bbsInfoHandler.handlePConf(msg);
        break;

      case XIMCommand.BB_MAINLINE:
        this.bbsInfoHandler.handleMainLine(msg);
        break;

      case XIMCommand.BB_CALLERSLOG:
        this.bbsInfoHandler.handleCallersLog(msg);
        break;

      case XIMCommand.BB_UDLOG:
        this.bbsInfoHandler.handleUDLog(msg);
        break;

      case XIMCommand.BB_TASKPRI:
        this.bbsInfoHandler.handleTaskPri(msg);
        break;

      case XIMCommand.BB_CHATFLAG:
      case XIMCommand.BB_CHATSET:
        this.bbsInfoHandler.handleChat(msg);
        break;

      case XIMCommand.BB_DROPDTR:
        this.bbsInfoHandler.handleDropDTR(msg);
        break;

      case XIMCommand.BB_GETTASK:
        this.bbsInfoHandler.handleGetTask(msg);
        break;
    }
  }

  /**
   * Check if command is a system command
   */
  private isSystemCommand(command: number): boolean {
    const systemList = [
      XIMCommand.JH_REGISTER,
      XIMCommand.JH_SHUTDOWN,
      XIMCommand.JH_SIGBIT,
      XIMCommand.JH_MCI,
      XIMCommand.JH_SG,
      XIMCommand.JH_SF,
      XIMCommand.JH_EF,
      XIMCommand.JH_FLAGFILE,
      XIMCommand.ZMODEMSEND,
      XIMCommand.ZMODEMRECEIVE,
      XIMCommand.BATCHZMODEMSEND,
      XIMCommand.ACP_COMMAND,
      XIMCommand.LOAD_ACCOUNT,
      XIMCommand.SAVE_ACCOUNT,
      XIMCommand.LOAD_CONFDB,
      XIMCommand.SAVE_CONFDB,
      XIMCommand.GET_CONFNUM,
      XIMCommand.SEARCH_ACCOUNT,
      XIMCommand.APPEND_ACCOUNT,
      XIMCommand.LAST_ACCOUNTNUM,
      XIMCommand.EXT_LOAD_ACCOUNT,
      XIMCommand.EXT_SAVE_ACCOUNT,
      XIMCommand.NETUPLOAD,
      XIMCommand.NETDOWNLOAD,
      XIMCommand.RAWARROW,
      XIMCommand.RETURNCOMMAND,
      XIMCommand.RETURNCOMMAND2,
      XIMCommand.CHAIN,
      XIMCommand.ENVSTAT,
      XIMCommand.SV_NEWMSG,
      XIMCommand.PRV_COMMAND,
      XIMCommand.PRV_GROUP,
    ];

    // Debug: log once to confirm runtime list
    if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
      console.log(
        `[XIMProtocol][SystemListDebug] command=${command} RAWARROW=${XIMCommand.RAWARROW} SV_NEWMSG=${XIMCommand.SV_NEWMSG} inList=${systemList.includes(
          command
        )} list=${systemList.join(',')}`
      );
    }

    return systemList.includes(command);
  }

  /**
   * Handle system commands
   */
  private handleSystemCommand(msg: any): void {
    switch (msg.command) {
      case XIMCommand.JH_REGISTER:
        this.systemCommandsHandler.handleRegister(msg);
        break;

      case XIMCommand.JH_SHUTDOWN:
        this.systemCommandsHandler.handleShutdown(msg);
        break;

      case XIMCommand.JH_SIGBIT:
        this.systemCommandsHandler.handleSignalBit(msg);
        break;

      case XIMCommand.JH_MCI:
        this.systemCommandsHandler.handleMCI(msg);
        break;

      case XIMCommand.JH_SG:
        this.systemCommandsHandler.handleSecurityScreen(msg);
        break;

      case XIMCommand.JH_SF:
        this.systemCommandsHandler.handleShowFile(msg);
        break;

      case XIMCommand.JH_EF:
        this.systemCommandsHandler.handleEditFile(msg);
        break;

      case XIMCommand.JH_FLAGFILE:
        this.systemCommandsHandler.handleFlagFile(msg);
        break;

      case XIMCommand.JH_SHOWFLAGS:
        this.systemCommandsHandler.handleShowFlags(msg);
        break;

      case XIMCommand.ZMODEMSEND:
        this.systemCommandsHandler.handleZmodemSend(msg);
        break;

      case XIMCommand.ZMODEMRECEIVE:
        this.systemCommandsHandler.handleZmodemReceive(msg);
        break;

      case XIMCommand.BATCHZMODEMSEND:
        this.systemCommandsHandler.handleBatchZmodemSend(msg);
        break;

      case XIMCommand.NETUPLOAD:
      case XIMCommand.NETDOWNLOAD:
        this.systemCommandsHandler.handleNetTransfer(msg);
        break;

      case XIMCommand.RAWARROW:
        this.systemCommandsHandler.handleRawArrow(msg);
        break;

      case XIMCommand.RETURNCOMMAND:
      case XIMCommand.RETURNCOMMAND2:
        this.systemCommandsHandler.handleReturnCommand(msg);
        break;

      case XIMCommand.CHAIN:
        this.systemCommandsHandler.handleChain(msg);
        break;

      case XIMCommand.ENVSTAT:
        this.systemCommandsHandler.handleEnvStat(msg);
        break;

      case XIMCommand.SV_NEWMSG:
        this.systemCommandsHandler.handleSvNewMsg(msg);
        break;

      case XIMCommand.PRV_COMMAND:
        this.systemCommandsHandler.handlePrvCommand(msg);
        break;

      case XIMCommand.PRV_GROUP:
        this.systemCommandsHandler.handlePrvGroup(msg);
        break;

      case XIMCommand.ACP_COMMAND:
        this.systemCommandsHandler.handleAcpCommand(msg);
        break;

      case XIMCommand.LOAD_ACCOUNT:
      case XIMCommand.EXT_LOAD_ACCOUNT:
      case XIMCommand.SAVE_ACCOUNT:
      case XIMCommand.EXT_SAVE_ACCOUNT:
      case XIMCommand.LOAD_CONFDB:
      case XIMCommand.SAVE_CONFDB:
      case XIMCommand.GET_CONFNUM:
      case XIMCommand.SEARCH_ACCOUNT:
      case XIMCommand.APPEND_ACCOUNT:
      case XIMCommand.LAST_ACCOUNTNUM:
        this.systemCommandsHandler.handleAccountOrConf(msg);
        break;
    }
  }

  /**
   * Send reply to door via ReplyMsg
   */
  private sendReply(msg: any, data: number): void {
    this.messageParser.writeData(msg.msgAddr, data);
    this.execLibrary.replyMsg(msg.msgAddr);
  }

  /**
   * Get a snapshot of XIM state for host usage after door exit
   */
  getStateSnapshot(): XIMState {
    return { ...this.state };
  }

  /**
   * Pre-load command's .info file and write DiskObject tooltype pointer to memory
   * This mimics what real AmiExpress does when launching doors
   * Doors like AquaScan expect the tooltype array pointer to be at a known memory location
   */
  private preLoadCommandDiskObject(): void {
    if (!this.iconLibrary || !this.doorCommand) {
      return;
    }

    const path = require('path');
    const fs = require('fs');

    console.log(`[XIMProtocol] Pre-loading command .info file for door: ${this.doorCommand}`);

    // Try to find the command's .info file
    const bbsPath = (this.bbsSession as any)?.dataDir || (this.bbsSession as any)?.bbsRoot || process.cwd();
    console.log(`[XIMProtocol]   Using bbsPath: ${bbsPath}`);
    console.log(`[XIMProtocol]   bbsSession.dataDir: ${(this.bbsSession as any)?.dataDir}`);
    console.log(`[XIMProtocol]   bbsSession.bbsRoot: ${(this.bbsSession as any)?.bbsRoot}`);

    const possiblePaths = [
      path.join(bbsPath, 'Commands', 'BBSCmd', `${this.doorCommand}.info`),
      path.join(bbsPath, 'Commands', 'SysCmd', `${this.doorCommand}.info`),
      path.join(bbsPath, 'Commands', 'ConfCmd', `${this.doorCommand}.info`),
    ];

    let infoPath = '';
    for (const p of possiblePaths) {
      console.log(`[XIMProtocol]   Checking: ${p} -> ${fs.existsSync(p) ? 'EXISTS' : 'NOT FOUND'}`);
      if (fs.existsSync(p)) {
        infoPath = p;
        console.log(`[XIMProtocol]   ✓ Found .info file: ${infoPath}`);
        break;
      }
    }

    if (!infoPath) {
      console.log(`[XIMProtocol]   No .info file found for command: ${this.doorCommand}`);
      return;
    }

    // Manually call icon.library GetDiskObject by simulating the library call
    // Set A0 to point to the filename string
    const CPURegister = { A0: 8, D0: 0 };

    // Write the path to memory at a temporary location
    const pathAddr = 0x1FF700; // Just below doorCommandAddr
    for (let i = 0; i < infoPath.length; i++) {
      this.emulator.writeMemory(pathAddr + i, infoPath.charCodeAt(i));
    }
    this.emulator.writeMemory(pathAddr + infoPath.length, 0); // null terminator

    // Set A0 register to point to the path
    this.emulator.setRegister(CPURegister.A0, pathAddr);

    // Call GetDiskObject
    console.log(`[XIMProtocol]   Calling GetDiskObject("${infoPath}")`);
    this.iconLibrary.GetDiskObject();

    // GetDiskObject returns DiskObject pointer in D0
    const diskObjPtr = this.emulator.getRegister(CPURegister.D0);
    console.log(`[XIMProtocol]   GetDiskObject returned: 0x${diskObjPtr.toString(16)}`);

    if (diskObjPtr === 0) {
      console.log(`[XIMProtocol]   Failed to load DiskObject`);
      return;
    }

    // Extract do_ToolTypes pointer from DiskObject
    // DiskObject structure: do_ToolTypes is at offset 53 (0x35)
    const toolTypesPtr = this.emulator.readMemory32(diskObjPtr + 53);
    console.log(`[XIMProtocol]   DiskObject->do_ToolTypes = 0x${toolTypesPtr.toString(16)}`);

    // CRITICAL: Write tooltype array pointer to memory address 0x100e5c
    // This is where AquaScan (and likely other doors) expect to find it
    const TOOLTYPE_PTR_ADDR = 0x100e5c;
    this.emulator.writeMemory32(TOOLTYPE_PTR_ADDR, toolTypesPtr);
    console.log(`[XIMProtocol]   ✅ Wrote tooltype pointer to 0x${TOOLTYPE_PTR_ADDR.toString(16)}`);

    // Verify the write
    const verifyPtr = this.emulator.readMemory32(TOOLTYPE_PTR_ADDR);
    console.log(`[XIMProtocol]   Verification: Memory at 0x${TOOLTYPE_PTR_ADDR.toString(16)} = 0x${verifyPtr.toString(16)}`);

    if (verifyPtr === toolTypesPtr) {
      console.log(`[XIMProtocol]   ✅ SUCCESS: Door can now call FindToolType(0x100e5c, ...) and it will work!`);
    } else {
      console.log(`[XIMProtocol]   ❌ ERROR: Verification failed!`);
    }
  }
}

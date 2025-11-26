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
    bbsSession?: any
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.doorPort = doorPort;
    this.bbsSession = bbsSession || {};
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
  handleMessage(msg: XIMMessage): void {
    console.log(`[XIMProtocol] Handling command: ${this.messageParser.getCommandName(msg.command)}`);

    // Normalize JH_REGISTER to carry the active node before logging/handling
    if (msg.command === XIMCommand.JH_REGISTER) {
      const nodeId =
        (this.bbsSession?.nodeId as number) ||
        (this.bbsSession as any)?.nodeNumber ||
        1;
      this.messageParser.writeData(msg.msgAddr, nodeId);
      this.messageParser.writeNodeId(msg.msgAddr, nodeId);
      this.messageParser.writeLineNumber(msg.msgAddr, 0);
      const normalized = this.messageParser.parseMessage(msg.msgAddr);
      msg = { ...msg, data: normalized.data, nodeId: normalized.nodeId, lineNumber: normalized.lineNumber };
    }

    const humanName = this.messageParser.getCommandName(msg.command);
    this.messageLogger?.(msg, humanName);

    // Handle registration/shutdown ahead of other handlers to avoid PG_* collisions
    if (msg.command === XIMCommand.JH_REGISTER) {
      this.systemCommandsHandler.handleRegister(msg);
      return;
    }
    if (!this.state.registered) {
      console.warn('[XIMProtocol] Ignoring command before JH_REGISTER handshake');
      this.messageParser.writeData(msg.msgAddr, 0);
      this.execLibrary.replyMsg(msg.msgAddr);
      return;
    }
    if (msg.command === XIMCommand.JH_SHUTDOWN) {
      this.systemCommandsHandler.handleShutdown(msg);
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
      this.handleIOCommand(msg);
      return;
    }

    // Data Query Commands (DT_*) - handled by XIMDataQueryHandler
    if (this.isDataQueryCommand(msg.command)) {
      this.dataQueryHandler.handleDataQuery(msg);
      return;
    }

    // BBS Info Commands (BB_*) - handled by XIMBBSInfoHandler
    if (this.isBBSInfoCommand(msg.command)) {
      this.handleBBSInfoCommand(msg);
      return;
    }

    // System Commands - handled by XIMSystemCommandsHandler
    if (this.isSystemCommand(msg.command)) {
      this.handleSystemCommand(msg);
      return;
    }

    // Unknown command
    console.log(`[XIMProtocol] Unhandled command: ${msg.command}`);
    this.sendReply(msg, 0);
  }

  /**
   * Check if command is an I/O command
   */
  private isIOCommand(command: number): boolean {
    return [
      XIMCommand.JH_LI,
      XIMCommand.JH_WRITE,
      XIMCommand.JH_SM,
      XIMCommand.JH_SMPTR,
      XIMCommand.JH_PM,
      XIMCommand.JH_HK,
      XIMCommand.JH_SG,
      XIMCommand.JH_SF,
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
    ].includes(command);
  }

  /**
   * Handle I/O commands
   */
  private handleIOCommand(msg: any): void {
    switch (msg.command) {
      case XIMCommand.JH_LI:
        this.ioHandler.handleLineInput(msg);
        break;

      case XIMCommand.JH_WRITE:
        this.ioHandler.handleWrite(msg);
        break;

      case XIMCommand.JH_SM:
      case XIMCommand.JH_SMPTR:
        this.ioHandler.handleSendMessage(msg);
        break;

      case XIMCommand.JH_PM:
        this.ioHandler.handlePromptMessage(msg);
        break;

      case XIMCommand.JH_HK:
        this.ioHandler.handleHotkey(msg);
        break;

      case XIMCommand.JH_SG:
        this.ioHandler.handleShowGFile(msg);
        break;

      case XIMCommand.JH_SF:
        this.ioHandler.handleShowFile(msg);
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
    return (command >= 100 && command <= 146) ||
           (command >= 527 && command <= 545) ||
           (command === 606) ||
           (command >= 700 && command <= 701) ||
           (command >= 1000 && command <= 1002);
  }

  /**
   * Check if command is a BBS info command
   */
  private isBBSInfoCommand(command: number): boolean {
    return [
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
    ].includes(command);
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
    return [
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
    ].includes(command);
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
}

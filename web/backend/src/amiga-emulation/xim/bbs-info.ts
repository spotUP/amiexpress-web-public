/**
 * XIM BBS Information Handler
 *
 * Handles all BB_* commands for querying BBS configuration and system info.
 * From E sources (express.e:3677-3883)
 */

import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMMessage, XIMCommand, BBSSessionData } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';

export class XIMBBSInfoHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    socket: Socket,
    messageParser: XIMMessageParser,
    bbsSession: BBSSessionData
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.messageParser = messageParser;
    this.bbsSession = bbsSession;
  }

  /**
   * Handle JH_BBSNAME (Get BBS Name)
   * From E sources (express.e:3486-3487)
   */
  handleBBSName(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const bbsName = this.bbsSession?.bbsName || 'AmiExpress-Web';

    console.log(`[XIMBBSInfo] JH_BBSNAME: "${bbsName}"`);

    if (stringAddr !== 0) {
      this.messageParser.writeString(stringAddr, bbsName, 41);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle JH_SYSOP (Get Sysop Name)
   * From E sources (express.e:3488-3489)
   */
  handleSysopName(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const sysopName = this.bbsSession?.sysopName || 'Sysop';

    console.log(`[XIMBBSInfo] JH_SYSOP: "${sysopName}"`);

    if (stringAddr !== 0) {
      this.messageParser.writeString(stringAddr, sysopName, 41);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle EXPRESS_VERSION (Get BBS Version)
   * From E sources (express.e:3808-3810)
   */
  handleExpressVersion(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const version = 'v5.6';

    console.log(`[XIMBBSInfo] EXPRESS_VERSION: "${version}"`);

    if (stringAddr !== 0) {
      this.messageParser.writeString(stringAddr, version, 200);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle BB_NODEID (Get Node ID)
   * From E sources (express.e:3801-3803)
   */
  handleNodeID(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const nodeId = this.bbsSession?.nodeId || 0;

    console.log(`[XIMBBSInfo] BB_NODEID: ${nodeId}`);

    if (stringAddr !== 0) {
      this.messageParser.writeString(stringAddr, nodeId.toString(), 200);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle BB_* BBS Info commands
   */
  handleBBSInfo(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    let value = '';

    switch (msg.command) {
      case XIMCommand.BB_CONFNAME:
        value = this.bbsSession?.conferenceName || 'Main';
        console.log(`[XIMBBSInfo] BB_CONFNAME: "${value}"`);
        break;

      case XIMCommand.BB_CONFLOCAL:
        value = this.bbsSession?.conferencePath || '/BBS/Conf01';
        console.log(`[XIMBBSInfo] BB_CONFLOCAL: "${value}"`);
        break;

      case XIMCommand.BB_LOCAL:
        value = this.bbsSession?.bbsPath || '/BBS';
        console.log(`[XIMBBSInfo] BB_LOCAL: "${value}"`);
        break;

      case XIMCommand.BB_CONFNUM:
        value = (this.bbsSession?.conferenceId || 1).toString();
        console.log(`[XIMBBSInfo] BB_CONFNUM: ${value}`);
        break;

      case XIMCommand.BB_LOGONTYPE:
        const logonType = this.bbsSession?.logonType || 3;
        console.log(`[XIMBBSInfo] BB_LOGONTYPE: ${logonType}`);
        this.sendReply(msg, logonType);
        return;
    }

    if (stringAddr !== 0 && value) {
      this.messageParser.writeString(stringAddr, value, 200);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle screen dimension queries
   * From E sources (express.e:3861-3868)
   */
  handleScreenDimensions(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] Screen dimension query');

    let value = 0;

    switch (msg.command) {
      case XIMCommand.BB_SCRWIDTH:
        value = 80;
        console.log('  BB_SCRWIDTH: 80');
        break;

      case XIMCommand.BB_SCRHEIGHT:
        value = 24;
        console.log('  BB_SCRHEIGHT: 24');
        break;

      case XIMCommand.BB_SCRLEFT:
        value = 0;
        console.log('  BB_SCRLEFT: 0');
        break;

      case XIMCommand.BB_SCRTOP:
        value = 0;
        console.log('  BB_SCRTOP: 0');
        break;
    }

    this.emulator.writeMemory32(msg.msgAddr + 22, value);
    this.sendReply(msg, 1);
  }

  /**
   * Handle purge line commands
   * From E sources (express.e:3869-3874)
   */
  handlePurgeLine(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] Purge line command');

    switch (msg.command) {
      case XIMCommand.BB_PURGELINE:
        this.socket.emit('ansi-output', '\r\x1b[K');
        console.log('  BB_PURGELINE: Clear entire line');
        break;

      case XIMCommand.BB_PURGELINESTART:
        this.socket.emit('ansi-output', '\x1b[1K');
        console.log('  BB_PURGELINESTART: Clear to cursor');
        break;

      case XIMCommand.BB_PURGELINEEND:
        this.socket.emit('ansi-output', '\x1b[K');
        console.log('  BB_PURGELINEEND: Clear from cursor');
        break;
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle non-stop text flag
   * From E sources (express.e:3875-3876)
   */
  handleNonStopText(msg: XIMMessage): void {
    const enable = msg.data !== 0;

    console.log(`[XIMBBSInfo] BB_NONSTOPTEXT: ${enable ? 'Enable' : 'Disable'} non-stop text`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle line count
   * From E sources (express.e:3877-3883)
   */
  handleLineCount(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMBBSInfo] BB_LINECOUNT');

    if (msg.data !== 0) {
      const lineCount = 0;
      this.messageParser.writeString(stringAddr, lineCount.toString(), 200);
      console.log(`  [READ] Line count: ${lineCount}`);
    } else {
      const newCount = this.messageParser.readString(stringAddr);
      console.log(`  [WRITE] Set line count: ${newCount}`);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle conference by number
   * From E sources (express.e:3779-3793)
   */
  handlePConf(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const confNum = parseInt(this.messageParser.readString(stringAddr));

    console.log(`[XIMBBSInfo] ${msg.command === XIMCommand.BB_PCONFNAME ? 'BB_PCONFNAME' : 'BB_PCONFLOCAL'}`);
    console.log(`  Conference number: ${confNum}`);

    if (confNum < 1 || confNum > 9) {
      this.messageParser.writeString(stringAddr, 'ERROR', 10);
      console.log('  [ERROR] Invalid conference number');
    } else {
      const value = msg.command === XIMCommand.BB_PCONFNAME ? `Conference ${confNum}` : `/bbs/conf${confNum}`;
      this.messageParser.writeString(stringAddr, value, 200);
      console.log(`  [RESULT] ${value}`);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle main line command
   * From E sources (express.e:3794-3800)
   */
  handleMainLine(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);

    console.log('[XIMBBSInfo] BB_MAINLINE - Get main command line');

    const mainLine = this.bbsSession?.currentCommand || '';
    this.messageParser.writeString(stringAddr, mainLine, 200);
    console.log(`  Command line: "${mainLine}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle callers log
   * From E sources (express.e:3804-3805)
   */
  handleCallersLog(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const logText = this.messageParser.readString(stringAddr);

    console.log('[XIMBBSInfo] BB_CALLERSLOG - Write to callers log');
    console.log(`  Log text: "${logText}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle UD log
   * From E sources (express.e:3806-3807)
   */
  handleUDLog(msg: XIMMessage): void {
    const stringAddr = this.emulator.readMemory32(msg.msgAddr + 26);
    const logText = this.messageParser.readString(stringAddr);

    console.log('[XIMBBSInfo] BB_UDLOG - Write to U/D log');
    console.log(`  Log text: "${logText}"`);

    this.sendReply(msg, 1);
  }

  /**
   * Handle task priority
   */
  handleTaskPri(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_TASKPRI - Task priority query');

    this.emulator.writeMemory32(msg.msgAddr + 22, 0);
    this.sendReply(msg, 1);
  }

  /**
   * Handle chat flag
   */
  handleChat(msg: XIMMessage): void {
    console.log(`[XIMBBSInfo] ${msg.command === XIMCommand.BB_CHATFLAG ? 'BB_CHATFLAG' : 'BB_CHATSET'} - Chat status`);

    if (msg.command === XIMCommand.BB_CHATFLAG) {
      this.emulator.writeMemory32(msg.msgAddr + 22, 0);
      console.log('  Chat flag: 0 (no chat)');
    } else {
      const chatEnabled = msg.data !== 0;
      console.log(`  Set chat: ${chatEnabled ? 'enabled' : 'disabled'}`);
    }

    this.sendReply(msg, 1);
  }

  /**
   * Handle drop DTR
   * From E sources (express.e:3834-3839)
   */
  handleDropDTR(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_DROPDTR - Drop DTR (hangup)');
    console.log('  [TODO] Implement actual disconnect');

    this.sendReply(msg, 1);
  }

  /**
   * Handle get task
   * From E sources (express.e:3840-3841)
   */
  handleGetTask(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_GETTASK - Get task pointer');

    this.emulator.writeMemory32(msg.msgAddr + 22, 0);
    this.sendReply(msg, 1);
  }

  /**
   * Send reply to door
   */
  private sendReply(msg: XIMMessage, data: number): void {
    this.emulator.writeMemory32(msg.msgAddr + 22, data);
    this.execLibrary.replyMsg(msg.msgAddr);
  }
}

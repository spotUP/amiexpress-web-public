/**
 * XIM BBS Information Handler
 *
 * Handles all BB_* commands for querying BBS configuration and system info.
 * From E sources (express.e:3677-3883)
 */

import { Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMMessage, XIMCommand, BBSSessionData, XIMState } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { callersLogManager } from '../../services/CallersLogManager';
import { startSysopPage } from '../../handlers/chat.handler';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';

export class XIMBBSInfoHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;
  private state: XIMState;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    socket: Socket,
    messageParser: XIMMessageParser,
    bbsSession: BBSSessionData,
    state: XIMState
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.socket = socket;
    this.messageParser = messageParser;
    this.bbsSession = bbsSession;
    this.state = state;
  }

  /**
   * Resolve BBS root and node id for log paths
   */
  private getBbsRoot(): string {
    const sessionRoot = (this.bbsSession as any)?.bbsRoot;
    if (sessionRoot) return sessionRoot;
    return process.env.BBS_ROOT || path.join(process.cwd());
  }

  private getNodeId(): number {
    return (
      (this.bbsSession?.nodeId as number) ||
      (this.bbsSession as any)?.nodeNumber ||
      1
    );
  }

  /**
   * Append a line to a node-specific log file (CallersLog/UDLog)
   */
  private appendNodeLog(filename: string, line: string): void {
    try {
      const nodeId = this.getNodeId();
      const nodeDir = path.join(this.getBbsRoot(), `Node${nodeId}`);
      fs.mkdirSync(nodeDir, { recursive: true });
      const logPath = path.join(nodeDir, filename);
      fs.appendFileSync(logPath, `${line}\n`, 'utf8');
    } catch (err) {
      console.error(`[XIMBBSInfo] Failed to write ${filename}:`, err);
      SysopDebugUtil.debug(
        this.socket,
        this.bbsSession,
        'XIM Protocol',
        `Failed to write to ${filename} log file`,
        {
          error: err instanceof Error ? err.message : String(err),
          filename,
          nodeId: this.getNodeId()
        },
        DebugSeverity.WARNING
      );
    }
  }

  /**
   * Return a best-effort screen address (dummy for console-only)
   */
  private getScreenAddress(): number {
    const stateAddr = (this.state as any)?.screenAddress;
    const sessionAddr = (this.bbsSession as any)?.screenAddress;
    if (typeof stateAddr === 'number') return stateAddr;
    if (typeof sessionAddr === 'number') return sessionAddr;
    // Use a stable dummy handle similar to intuition.library stub range
    return 0x20000;
  }

  /**
   * Handle JH_BBSNAME (Get BBS Name)
   * From E sources (express.e:3486-3487)
   */
  handleBBSName(msg: XIMMessage): void {
    const bbsName = this.bbsSession?.bbsName || 'AmiExpress-Web';

    console.log(`[XIMBBSInfo] JH_BBSNAME: "${bbsName}"`);

    this.messageParser.writeMessageString(msg.msgAddr, bbsName.slice(0, 41));

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SYSOP (Get Sysop Name)
   * From E sources (express.e:3488-3489)
   */
  handleSysopName(msg: XIMMessage): void {
    const sysopName = this.bbsSession?.sysopName || 'Sysop';

    console.log(`[XIMBBSInfo] JH_SYSOP: "${sysopName}"`);

    this.messageParser.writeMessageString(
      msg.msgAddr,
      sysopName.slice(0, 41)
    );

    this.reply(msg, 1);
  }

  /**
   * Handle EXPRESS_VERSION (Get BBS Version)
   * From E sources (express.e:3808-3810)
   */
  handleExpressVersion(msg: XIMMessage): void {
    const version = 'v5.6';

    console.log(`[XIMBBSInfo] EXPRESS_VERSION: "${version}"`);

    this.messageParser.writeMessageString(msg.msgAddr, version);

    this.reply(msg, 1);
  }

  /**
   * Handle BB_NODEID (Get Node ID)
   * From E sources (express.e:3801-3803)
   */
  handleNodeID(msg: XIMMessage): void {
    const nodeId = this.bbsSession?.nodeId || 0;

    console.log(`[XIMBBSInfo] BB_NODEID: ${nodeId}`);

    this.messageParser.writeMessageString(msg.msgAddr, nodeId.toString());

    this.reply(msg, 1);
  }

  /**
   * Handle BB_STATUS (ONLINE/OFFLINE)
   */
  handleStatus(msg: XIMMessage): void {
    const status =
      this.bbsSession?.user && this.bbsSession.user.username
        ? 'ONLINE'
        : 'OFFLINE';

    console.log(`[XIMBBSInfo] BB_STATUS: ${status}`);

    this.messageParser.writeMessageString(msg.msgAddr, status);
    this.reply(msg, 1);
  }

  /**
   * Handle BB_* BBS Info commands
   */
  handleBBSInfo(msg: XIMMessage): void {
    const isRead = msg.data !== 0;
    let value = '';

    switch (msg.command) {
      case XIMCommand.BB_CONFNAME:
        value = this.bbsSession?.conferenceName || 'Main';
        console.log(`[XIMBBSInfo] BB_CONFNAME: "${value}"`);
        break;

      case XIMCommand.BB_CONFLOCAL:
        value = this.bbsSession?.conferencePath || '/Conf1';
        console.log(`[XIMBBSInfo] BB_CONFLOCAL: "${value}"`);
        break;

      case XIMCommand.BB_LOCAL:
        value = this.bbsSession?.bbsPath || '/';
        console.log(`[XIMBBSInfo] BB_LOCAL: "${value}"`);
        break;

      case XIMCommand.BB_CONFNUM:
        {
          const confNum =
            (this.bbsSession as any)?.currentConf !== undefined
              ? (this.bbsSession as any).currentConf - 1
              : (this.bbsSession?.conferenceId || 1) - 1;
          value = confNum.toString();
          console.log(`[XIMBBSInfo] BB_CONFNUM: ${value}`);
          break;
        }

      case XIMCommand.BB_COMMAND:
        value = this.bbsSession?.currentCommand || '';
        console.log(`[XIMBBSInfo] BB_COMMAND: "${value}"`);
        break;

      case XIMCommand.BB_LOGONTYPE:
        const logonType = this.bbsSession?.logonType || 3;
        console.log(`[XIMBBSInfo] BB_LOGONTYPE: ${logonType}`);
        this.reply(msg, logonType);
        return;

      case XIMCommand.BB_TASKPRI:
        // express.e returns cmds.taskPri as a char/byte; default 0
        this.reply(msg, (this.bbsSession as any)?.taskPri || 0);
        return;

      case XIMCommand.BB_CHATFLAG:
        this.handleChat(msg);
        return;
      case XIMCommand.BB_CHATSET:
        this.handleChat(msg);
        return;

      case XIMCommand.BB_CALLERSLOG:
        this.handleCallersLog(msg);
        return;

      case XIMCommand.BB_UDLOG:
        this.handleUDLog(msg);
        return;

      case XIMCommand.BB_REMOVEPORT:
        this.reply(msg, 1);
        return;

      case XIMCommand.BB_SOPT:
        this.reply(msg, 1);
        return;
    }

    if (isRead && value) {
      this.messageParser.writeMessageString(msg.msgAddr, value);
    } else if (!isRead && msg.string) {
      // Accept updated values (write mode)
      switch (msg.command) {
        case XIMCommand.BB_CONFNAME:
          this.bbsSession.conferenceName = msg.string;
          break;
        case XIMCommand.BB_CONFLOCAL:
          this.bbsSession.conferencePath = msg.string;
          break;
        case XIMCommand.BB_LOCAL:
          this.bbsSession.bbsPath = msg.string;
          break;
      }
    }

    this.reply(msg, 1);
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

    this.messageParser.writeData(msg.msgAddr, value);
    this.reply(msg, 1);
  }

  /**
   * Handle SCREEN_ADDRESS / RAWSCREEN_ADDRESS
   * From E sources (express.e:3740-3748)
   */
  handleScreenAddress(msg: XIMMessage): void {
    const addr = this.getScreenAddress() >>> 0;
    if (msg.command === XIMCommand.SCREEN_ADDRESS) {
      const hex = addr.toString(16).padStart(8, '0').toLowerCase();
      this.messageParser.writeMessageString(msg.msgAddr, hex);
    } else {
      this.messageParser.writeMessageString(msg.msgAddr, addr.toString());
    }

    this.reply(msg, 1);
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

    this.reply(msg, 1);
  }

  /**
   * Handle non-stop text flag
   * From E sources (express.e:3875-3876)
   */
  handleNonStopText(msg: XIMMessage): void {
    const enable = msg.data !== 0;

    console.log(`[XIMBBSInfo] BB_NONSTOPTEXT: ${enable ? 'Enable' : 'Disable'} non-stop text`);

    this.state.nonStopText = enable;
    this.reply(msg, 1);
  }

  /**
   * Handle line count
   * From E sources (express.e:3877-3883)
   */
  handleLineCount(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_LINECOUNT');

    const isRead = msg.data !== 0;

    if (isRead) {
      const lineCount = this.state.lineCount;
      this.messageParser.writeMessageString(msg.msgAddr, lineCount.toString());
      console.log(`  [READ] Line count: ${lineCount}`);
    } else if (msg.string) {
      const parsed = parseInt(msg.string.trim(), 10);
      if (!Number.isNaN(parsed)) {
        this.state.lineCount = parsed;
        console.log(`  [WRITE] Set line count: ${parsed}`);
      }
    }

    this.reply(msg, 1);
  }

  /**
   * Handle conference by number
   * From E sources (express.e:3779-3793)
   */
  handlePConf(msg: XIMMessage): void {
    const confNum = parseInt(msg.string || '');

    console.log(`[XIMBBSInfo] ${msg.command === XIMCommand.BB_PCONFNAME ? 'BB_PCONFNAME' : 'BB_PCONFLOCAL'}`);
    console.log(`  Conference number: ${confNum}`);

    if (confNum < 1 || confNum > 9) {
      this.messageParser.writeMessageString(msg.msgAddr, 'ERROR');
      console.log('  [ERROR] Invalid conference number');
    } else {
      const value = msg.command === XIMCommand.BB_PCONFNAME ? `Conference ${confNum}` : `/bbs/conf${confNum}`;
      this.messageParser.writeMessageString(msg.msgAddr, value);
      console.log(`  [RESULT] ${value}`);
    }

    this.reply(msg, 1);
  }

  /**
   * Handle main line command
   * From E sources (express.e:3794-3800)
   */
  handleMainLine(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_MAINLINE - Get main command line');

    const mainLine = this.bbsSession?.currentCommand || '';
    this.messageParser.writeMessageString(msg.msgAddr, mainLine);
    console.log(`  Command line: "${mainLine}"`);

    this.reply(msg, 1);
  }

  /**
   * Handle callers log
   * From E sources (express.e:3804-3805)
   */
  handleCallersLog(msg: XIMMessage): void {
    const logText = msg.string || '';

    console.log('[XIMBBSInfo] BB_CALLERSLOG - Write to callers log');
    console.log(`  Log text: "${logText}"`);

    if (logText.length > 0) {
      const nodeId = this.getNodeId();
      this.appendNodeLog('CallersLog', logText);
      try {
        callersLogManager.logActivity(nodeId, logText);
      } catch (err) {
        console.warn('[XIMBBSInfo] callersLogManager failed:', err);
        SysopDebugUtil.debug(
          this.socket,
          this.bbsSession,
          'XIM Protocol',
          `Failed to log activity to CallersLog manager`,
          {
            error: err instanceof Error ? err.message : String(err),
            nodeId,
            textLength: logText.length
          },
          DebugSeverity.WARNING
        );
      }
    }

    this.reply(msg, 1);
  }

  /**
   * Handle UD log
   * From E sources (express.e:3806-3807)
   */
  handleUDLog(msg: XIMMessage): void {
    const logText = msg.string || '';

    console.log('[XIMBBSInfo] BB_UDLOG - Write to U/D log');
    console.log(`  Log text: "${logText}"`);

    if (logText.length > 0) {
      this.appendNodeLog('UDLog', logText);
    }

    this.reply(msg, 1);
  }

  /**
   * Handle task priority
   */
  handleTaskPri(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_TASKPRI - Task priority query');

    this.messageParser.writeData(msg.msgAddr, 0);
    this.reply(msg, 1);
  }

  /**
   * Handle chat flag
   */
  handleChat(msg: XIMMessage): void {
    const isFlag = msg.command === XIMCommand.BB_CHATFLAG;
    console.log(`[XIMBBSInfo] ${isFlag ? 'BB_CHATFLAG' : 'BB_CHATSET'} - Chat status`);

    if (isFlag) {
      // express.e: returns "ON"/"OFF" in the string buffer
      const chatStr = (this.bbsSession as any)?.sysopAvail ? 'ON' : 'OFF';
      this.messageParser.writeMessageString(msg.msgAddr, chatStr);
      this.reply(msg, 1);
      return;
    }

    // BB_CHATSET
    if (msg.data) {
      const paged = (this.bbsSession as any)?.pagedFlag || 0;
      this.messageParser.writeMessageString(msg.msgAddr, paged.toString());
      this.reply(msg, 1);
    } else {
      const newVal = parseInt(msg.string || '0', 10) || 0;
      const prev = (this.bbsSession as any)?.pagedFlag || 0;
      (this.bbsSession as any).pagedFlag = newVal;

      if (newVal && !prev) {
        try {
          startSysopPage(this.socket, this.bbsSession as any);
        } catch (err) {
          console.warn('[XIMBBSInfo] sysop page trigger failed:', err);
          SysopDebugUtil.debug(
            this.socket,
            this.bbsSession,
            'XIM Protocol',
            `Failed to trigger sysop page`,
            { error: err instanceof Error ? err.message : String(err) },
            DebugSeverity.WARNING
          );
        }
      }

      this.reply(msg, 1);
    }
  }

  /**
   * Handle drop DTR
   * From E sources (express.e:3834-3839)
   */
  handleDropDTR(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_DROPDTR - Drop DTR (hangup)');

    this.state.carrierDropped = true;
    this.reply(msg, 1);
  }

  /**
   * Handle get task
   * From E sources (express.e:3840-3841)
   */
  handleGetTask(msg: XIMMessage): void {
    console.log('[XIMBBSInfo] BB_GETTASK - Get task pointer');

    this.messageParser.writeData(msg.msgAddr, 0);
    this.reply(msg, 1);
  }

  /**
   * Send reply to door
   */
  private reply(msg: XIMMessage, data: number): void {
    this.messageParser.writeData(msg.msgAddr, data);
    this.execLibrary.replyMsg(msg.msgAddr);
  }
}

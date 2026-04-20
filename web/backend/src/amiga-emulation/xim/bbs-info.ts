/**
 * XIM BBS Information Handler
 *
 * Handles all BB_* commands for querying BBS configuration and system info.
 * From E sources (express.e:3677-3883)
 */

import { Socket } from 'socket.io';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMMessage, XIMCommand, BBSSessionData, XIMState } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { DoorConstants } from '../DoorTypes';
import { callersLogManager } from '../../services/CallersLogManager';
import { startSysopPage } from '../../handlers/chat/chat.handler';
import { SysopDebugUtil, DebugSeverity } from '../../utils/sysop-debug.util';
import { ximLogger } from '../../utils/XIMLogger';

// Debug log path - uses BBS_DATA_DIR env var or falls back to cwd
const BB_DEBUG_LOG_PATH = path.join(process.env.BBS_DATA_DIR || process.cwd(), 'logs', 'bb-conflocal-debug.log');
import { debugLog } from '../../utils/debug-log';

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
    // Use a stable dummy handle in IntuitionLibrary stub range (0x099000+)
    return 0x099000;
  }

  /**
   * Handle JH_BBSNAME (Get BBS Name)
   * From E sources (express.e:3486-3487)
   */
  handleBBSName(msg: XIMMessage): void {
    const bbsName = this.bbsSession?.bbsName || 'AmiExpress-Web';

debugLog(`[XIMBBSInfo] JH_BBSNAME: "${bbsName}"`);

    this.messageParser.writeMessageString(msg.msgAddr, bbsName.slice(0, 41));

    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle JH_SYSOP (Get Sysop Name)
   * From E sources (express.e:3488-3489)
   */
  handleSysopName(msg: XIMMessage): void {
    const sysopName = this.bbsSession?.sysopName || 'Sysop';

debugLog(`[XIMBBSInfo] JH_SYSOP: "${sysopName}"`);

    this.messageParser.writeMessageString(
      msg.msgAddr,
      sysopName.slice(0, 41)
    );

    this.reply(msg, 1);
  }

  /**
   * Handle EXPRESS_VERSION (Get BBS Version)
   *
   * From express.e:3808-3810:
   *   CASE EXPRESS_VERSION
   *     getExpressMajorVer(tempstring)
   *     AstrCopy(msg.string,tempstring,200)
   *
   * Returns the BBS version string for compatibility checks.
   */
  handleExpressVersion(msg: XIMMessage): void {
    const version = this.getExpressMajorVersion();

debugLog(`[XIMBBSInfo] EXPRESS_VERSION: returning version="${version}"`);

    this.messageParser.writeMessageString(msg.msgAddr, version);

    // Verify what was written to buffer
    const verifyBuffer = this.messageParser.readString(
      msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
debugLog(`[XIMBBSInfo] EXPRESS_VERSION verify buffer: "${verifyBuffer}"`);

    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle BB_NODEID (Get Node ID)
   * From E sources (express.e:3801-3803)
   */
  handleNodeID(msg: XIMMessage): void {
    const nodeId = this.bbsSession?.nodeId || 0;

debugLog(`[XIMBBSInfo] BB_NODEID: ${nodeId}`);

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

debugLog(`[XIMBBSInfo] BB_STATUS: ${status}`);

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
debugLog(`[XIMBBSInfo] BB_CONFNAME: "${value}"`);
        break;

      case XIMCommand.BB_CONFLOCAL:
        {
          // Return Amiga-style path like "BBS:Conf1/" (door expects this format)
          // Check both currentConference (GlobalStructures) and currentConf (legacy)
          const confId = (this.bbsSession as any)?.currentConference ?? (this.bbsSession as any)?.currentConf ?? this.bbsSession?.conferenceId ?? 1;
          value = `BBS:Conf${confId}/`;

          // DEBUG: Write to file for visibility
          const debugLine = `[BB_CONFLOCAL] ${new Date().toISOString()} confId=${confId} value="${value}" incomingString="${msg.string}" msgAddr=0x${msg.msgAddr.toString(16)}\n`;
          try {
            fs.appendFileSync(BB_DEBUG_LOG_PATH, debugLine);
          } catch (e) { /* ignore */ }

          ximLogger.log('info', 'send', 'SYSTEM', this.bbsSession?.nodeId || 1, {
            type: 'BB_CONFLOCAL_DEBUG',
            typeCode: 127,
            param: 0
          }, { confId, value, incomingString: msg.string || 'none' });
        }
        break;

      case XIMCommand.BB_LOCAL:
        // Return Amiga-style BBS root path
        value = 'BBS:';
debugLog(`[XIMBBSInfo] BB_LOCAL: "${value}"`);
        break;

      case XIMCommand.BB_CONFNUM:
        {
          // Returns 0-based conference number (currentConf - 1)
          // Per express.e:3832: StringF(tempstring,'\d',currentConf-1)
          const currentConfNum =
            (this.bbsSession as any)?.currentConference !== undefined
              ? (this.bbsSession as any).currentConference
              : (this.bbsSession as any)?.currentConf !== undefined
                ? (this.bbsSession as any).currentConf
                : this.bbsSession?.conferenceId !== undefined
                  ? this.bbsSession.conferenceId
                  : (this.bbsSession?.user as any)?.lastConf !== undefined
                    ? (this.bbsSession.user as any).lastConf
                    : 1; // Default to conference 1
          // MUST subtract 1 to convert to 0-based (express.e requirement)
          const confNum = currentConfNum - 1;
          value = confNum.toString();
debugLog(`[XIMBBSInfo][BB_CONFNUM] READ: Returning ${value} (0-based) from currentConf=${currentConfNum}`);
          break;
        }

      case XIMCommand.BB_COMMAND:
        value = this.bbsSession?.currentCommand || '';
debugLog(`[XIMBBSInfo] BB_COMMAND: "${value}"`);
        break;

      case XIMCommand.BB_LOGONTYPE:
        const logonType = this.bbsSession?.logonType || 3;
debugLog(`[XIMBBSInfo] BB_LOGONTYPE: ${logonType}`);
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

      // CONF_ACCESS (614) - Check user's access to a specific conference
      // Returns: 0=no access, 1=has access, 2=invalid conference
      // Per axcommon.e, this is the ONLY command at 614 (BB_NUMCONFS does NOT exist)
      case XIMCommand.ENVSTAT:
        if (msg.data) {
          // Read status: return currentStat as string
          const status = (this.bbsSession as any)?.currentStat ?? 0;
          this.messageParser.writeMessageString(msg.msgAddr, status.toString());
debugLog(`[XIMBBSInfo] ENVSTAT [READ]: ${status}`);
        } else if (msg.string) {
          // Write status: update currentStat
          const newStatus = parseInt(msg.string.trim(), 10);
          if (!Number.isNaN(newStatus)) {
            (this.bbsSession as any).currentStat = newStatus;
debugLog(`[XIMBBSInfo] ENVSTAT [WRITE]: ${newStatus}`);
          }
        }
        this.reply(msg, 1);
        return;
      case XIMCommand.CONF_ACCESS:
        this.handleConfAccess(msg);
        return;

      case XIMCommand.MULTICOM:
        this.handleMulticom(msg);
        return;
    }

    if (isRead && value) {
      this.messageParser.writeMessageString(msg.msgAddr, value);
      // DEBUG: Verify all path-related writes
      if (msg.command === XIMCommand.BB_CONFLOCAL || msg.command === XIMCommand.BB_LOCAL) {
        const verify = this.messageParser.readString(
          msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
          DoorConstants.MESSAGE_STRING_CAPACITY
        );
        // Write to debug file
        const debugLine = `[BB_CONFLOCAL WRITE] ${new Date().toISOString()} wrote="${value}" verify="${verify}" msgAddr=0x${msg.msgAddr.toString(16)} stringOffset=0x${DoorConstants.MESSAGE_STRING_OFFSET.toString(16)}\n`;
        try {
          fs.appendFileSync(BB_DEBUG_LOG_PATH, debugLine);
        } catch (e) { /* ignore */ }
      }
      if (msg.command === XIMCommand.BB_CONFNUM) {
        const verify = this.messageParser.readString(
          msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
          DoorConstants.MESSAGE_STRING_CAPACITY
        );
debugLog(`[XIMBBSInfo][BB_CONFNUM] AFTER write: buffer="${verify}" (should be "${value}")`);

        // Also log all message fields to see complete state
        const data = this.emulator.readMemory32(msg.msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
        const cmd = this.emulator.readMemory32(msg.msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
debugLog(`[XIMBBSInfo][BB_CONFNUM] Message state: cmd=${cmd}, data=${data}, string="${verify}"`);
      }
    } else if (!isRead && msg.string) {
      // Accept updated values (write mode)
      switch (msg.command) {
        case XIMCommand.BB_CONFNAME:
          this.bbsSession.conferenceName = msg.string;
          break;
        case XIMCommand.BB_CONFLOCAL:
          this.bbsSession.conferencePath = msg.string;
          break;
        // BB_LOCAL is READ-ONLY per express.e:3708-3709
      }
    }

    this.reply(msg, 1);
  }

  /**
   * Handle screen dimension queries
   * From E sources (express.e:3861-3868)
   */
  handleScreenDimensions(msg: XIMMessage): void {
debugLog('[XIMBBSInfo] Screen dimension query');

    let value = 0;

    switch (msg.command) {
      case XIMCommand.BB_SCRWIDTH:
        value = 80;
debugLog('  BB_SCRWIDTH: 80');
        break;

      case XIMCommand.BB_SCRHEIGHT:
        // express.e:3867-3868: msg.data:=screen.height
        // Return user's configured screen height (lines per screen)
        value = this.state.pauseLines ||
                (this.bbsSession as any)?.user?.linesPerScreen ||
                (this.bbsSession as any)?.user?.pageLength ||
                24;
debugLog(`  BB_SCRHEIGHT: ${value}`);
        break;

      case XIMCommand.BB_SCRLEFT:
        value = 0;
debugLog('  BB_SCRLEFT: 0');
        break;

      case XIMCommand.BB_SCRTOP:
        value = 0;
debugLog('  BB_SCRTOP: 0');
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
debugLog('[XIMBBSInfo] Purge line command');

    switch (msg.command) {
      case XIMCommand.BB_PURGELINE:
        this.socket.emit('ansi-output', '\r\x1b[K');
debugLog('  BB_PURGELINE: Clear entire line');
        break;

      case XIMCommand.BB_PURGELINESTART:
        this.socket.emit('ansi-output', '\x1b[1K');
debugLog('  BB_PURGELINESTART: Clear to cursor');
        break;

      case XIMCommand.BB_PURGELINEEND:
        this.socket.emit('ansi-output', '\x1b[K');
debugLog('  BB_PURGELINEEND: Clear from cursor');
        break;
    }

    this.reply(msg, 1);
  }

  /**
   * Handle non-stop text flag - WRITE-ONLY command
   * From E sources (express.e:3875-3876):
   *   IF (msg.data=0) THEN nonStopDisplayFlag:=FALSE ELSE nonStopDisplayFlag:=TRUE
   *
   * CRITICAL: This is WRITE-ONLY, NOT bidirectional!
   * - data=0 → disable non-stop text (pause at page breaks)
   * - data≠0 → enable non-stop text (no pausing)
   * - Does NOT return any value in string field
   * - Does NOT use msg.data to determine READ/WRITE mode
   */
  handleNonStopText(msg: XIMMessage): void {
    // WRITE-ONLY: data=0 disables, data≠0 enables
    this.state.nonStopText = msg.data !== 0;
    this.state.lineCount = 0;
debugLog(`[XIMBBSInfo] BB_NONSTOPTEXT: ${this.state.nonStopText ? 'ENABLED' : 'DISABLED'} (data=${msg.data})`);
    // CRITICAL FIX 2026-01-20: Return 1 (success), not msg.data (0)!
    // Most BB_* commands return 1 to indicate success. Returning 0 causes doors
    // like AquaScan/FR to loop forever thinking the command failed.
    this.reply(msg, 1);
  }

  /**
   * Handle line count
   * From E sources (express.e:3877-3883)
   */
  handleLineCount(msg: XIMMessage): void {
debugLog('[XIMBBSInfo] BB_LINECOUNT');

    const isRead = msg.data !== 0;

    if (isRead) {
      const lineCount = this.state.lineCount;
      this.messageParser.writeMessageString(msg.msgAddr, lineCount.toString());
debugLog(`  [READ] Line count: ${lineCount}`);
    } else if (msg.string) {
      const parsed = parseInt(msg.string.trim(), 10);
      if (!Number.isNaN(parsed)) {
        this.state.lineCount = parsed;
debugLog(`  [WRITE] Set line count: ${parsed}`);
      }
    }

    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle conference by number
   * From E sources (express.e:3779-3793)
   */
  handlePConf(msg: XIMMessage): void {
    const confNum = parseInt(msg.string || '');

debugLog(`[XIMBBSInfo] ${msg.command === XIMCommand.BB_PCONFNAME ? 'BB_PCONFNAME' : 'BB_PCONFLOCAL'}`);
debugLog(`  Conference number: ${confNum}`);

    if (confNum < 1 || confNum > 9) {
      this.messageParser.writeMessageString(msg.msgAddr, 'ERROR');
debugLog('  [ERROR] Invalid conference number');
    } else {
      const value = msg.command === XIMCommand.BB_PCONFNAME ? `Conference ${confNum}` : `/bbs/conf${confNum}`;
      this.messageParser.writeMessageString(msg.msgAddr, value);
debugLog(`  [RESULT] ${value}`);
    }

    this.reply(msg, 1);
  }

  /**
   * Handle main line command (BB_MAINLINE)
   *
   * From express.e:3794-3800:
   *   CASE BB_MAINLINE
   *     IF StrLen(params)>0
   *       StringF(tempstring,'\s \s',command,params)
   *     ELSE
   *       StrCopy(tempstring,command)
   *     ENDIF
   *     AstrCopy(msg.string,tempstring,200)
   *
   * Returns the command + parameters that invoked the door.
   */
  handleMainLine(msg: XIMMessage): void {
    const session: any = this.bbsSession || {};

    const fullCommandLine = session.doorParams || session.commandParams || '';
    const command = session.doorCommand || session.command || '';
    const result = fullCommandLine.trim() || command.trim();

debugLog(`[XIMBBSInfo] BB_MAINLINE: returning command="${result}"`);

    this.messageParser.writeMessageString(msg.msgAddr, result);
    const verify = this.messageParser.readString(
      msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
debugLog(`[XIMBBSInfo] BB_MAINLINE verify buffer: "${verify}"`);

    this.reply(msg, msg.data ?? 0);
  }

  private getExpressMajorVersion(): string {
    const session: any = this.bbsSession || {};
    const mimicVer = typeof session.mimicVer === 'string' ? session.mimicVer : '';
    if (mimicVer.length > 0) {
      return mimicVer;
    }

    // express.e uses the core expressVer string; avoid using web/app versions here.
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
   * Handle callers log
   * From E sources (express.e:3804-3805)
   */
  handleCallersLog(msg: XIMMessage): void {
    const logText = msg.string || '';

debugLog('[XIMBBSInfo] BB_CALLERSLOG - Write to callers log');
debugLog(`  Log text: "${logText}"`);

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

debugLog('[XIMBBSInfo] BB_UDLOG - Write to U/D log');
debugLog(`  Log text: "${logText}"`);

    if (logText.length > 0) {
      this.appendNodeLog('UDLog', logText);
    }

    this.reply(msg, 1);
  }

  /**
   * Handle task priority
   */
  handleTaskPri(msg: XIMMessage): void {
debugLog('[XIMBBSInfo] BB_TASKPRI - Task priority query');

    this.messageParser.writeData(msg.msgAddr, 0);
    this.reply(msg, 1);
  }

  /**
   * Handle chat flag
   */
  handleChat(msg: XIMMessage): void {
    const isFlag = msg.command === XIMCommand.BB_CHATFLAG;
debugLog(`[XIMBBSInfo] ${isFlag ? 'BB_CHATFLAG' : 'BB_CHATSET'} - Chat status`);

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
debugLog('[XIMBBSInfo] BB_DROPDTR - Drop DTR (hangup)');

    this.state.carrierDropped = true;
    this.reply(msg, 1);
  }

  /**
   * Handle get task
   * From E sources (express.e:3840-3841)
   */
  handleGetTask(msg: XIMMessage): void {
debugLog('[XIMBBSInfo] BB_GETTASK - Get task pointer');

    this.messageParser.writeData(msg.msgAddr, 0);
    this.reply(msg, 1);
  }

  /**
   * Handle NODE_BAUD, NODE_BAUDRATE, NODE_DEVICE, NODE_UNIT
   * From E sources (express.e:3842-3852)
   */
  handleNodeInfo(msg: XIMMessage): void {
    switch (msg.command) {
      case XIMCommand.NODE_BAUD:
        // Return online baud rate (e.g., 115200)
        const baud = (this.bbsSession as any)?.baudRate || 115200;
        this.messageParser.writeMessageString(msg.msgAddr, baud.toString());
debugLog(`[XIMBBSInfo] NODE_BAUD: ${baud}`);
        break;

      case XIMCommand.NODE_BAUDRATE:
        // Same as NODE_BAUD
        const baudRate = (this.bbsSession as any)?.baudRate || 115200;
        this.messageParser.writeMessageString(msg.msgAddr, baudRate.toString());
debugLog(`[XIMBBSInfo] NODE_BAUDRATE: ${baudRate}`);
        break;

      case XIMCommand.NODE_DEVICE:
        // Return serial device name (web uses TCP)
        const device = 'TCP:';
        this.messageParser.writeMessageString(msg.msgAddr, device);
debugLog(`[XIMBBSInfo] NODE_DEVICE: ${device}`);
        break;

      case XIMCommand.NODE_UNIT:
        // Return serial device unit (0 for web)
        this.messageParser.writeMessageString(msg.msgAddr, '0');
debugLog('[XIMBBSInfo] NODE_UNIT: 0');
        break;
    }
    this.reply(msg, 1);
  }

  /**
   * Handle MULTICOM - Return master node semaphore
   * From E sources (express.e:3909)
   *
   * Creates a multi-node data structure in emulator memory containing
   * information about all nodes. WHO doors like RTW read this structure
   * to display node status.
   *
   * Structure layout (from express.e:24226-24237):
   * - masterNode semaphore structure at baseAddr
   * - masterNode.myNode[] array at baseAddr+100 (after semaphore header)
   * - Each myNode[i] contains a pointer (.s field) to a singlePort structure
   * - singlePort structure layout (from express.e:13200-13213):
   *   +0:   semi (semaphore header, ~46 bytes)
   *   +84:  status (4 bytes) - node status code
   *   +88:  handle (31 bytes) - user name/handle
   *   +119: location (31 bytes) - user location
   *   +150: misc1 (100 bytes) - misc info (e.g., filename)
   *   +250: misc2 (100 bytes) - misc flags (first byte = OLM blocked)
   *   +350: baud (10 bytes) - baud rate text
   */
  /**
   * Handle MULTICOM - Get pointer to multi-node status structures.
   *
   * CRITICAL ARCHITECTURE (matches express.e):
   * - Structures are created ONCE when session starts (in AmigaDoorSession.initializeLibraries())
   * - This handler just returns the pointer (does NOT recreate structures)
   * - MulticomManager handles all structure creation and updates
   *
   * This matches express.e where ACP creates structures at startup, then express.e
   * just returns the pointer when doors call MULTICOM.
   */
  handleMulticom(msg: XIMMessage): void {
    const { multicomManager } = require('../../nodes/MulticomManager.js');

    // Get current node ID
    const nodeId = this.bbsSession?.nodeId || 1;

    console.error(`[XIMBBSInfo] MULTICOM called - nodeId=${nodeId}, msgAddr=0x${msg.msgAddr.toString(16)}`);

    // Get masterNode pointer from MulticomManager
    // Structures were already created in AmigaDoorSession.initializeLibraries()
    const masterNodePtr = multicomManager.getMasterNodePointer();

    console.error(`[XIMBBSInfo] MULTICOM - Returning masterNode ptr 0x${masterNodePtr.toString(16)} for node ${nodeId}`);

    // DEBUG: Log the message layout being used
    const msgLen = this.emulator.readMemory16(msg.msgAddr + 18); // mn_Length offset
    console.error(`[XIMBBSInfo] MULTICOM - msgLen=${msgLen} (0 means uninitialized)`);

    // CRITICAL FIX: RTW and other WHO doors use LONG layout and read from offset 0xf4
    // regardless of mn_Length. From RTW disassembly at 0x1e88: "move.l 0xf4(a0), d0"
    // The writeSemaphore function may skip writing if mn_Length is 0 (uninitialized),
    // so we must write directly to offset 0xf4 to ensure the pointer is available.
    const SEMAPHORE_OFFSET_LONG = 0xf4;
    this.emulator.writeMemory32(msg.msgAddr + SEMAPHORE_OFFSET_LONG, masterNodePtr);

    // Verify the write
    const writtenValue = this.emulator.readMemory32(msg.msgAddr + SEMAPHORE_OFFSET_LONG);
    console.error(`[XIMBBSInfo] MULTICOM - Wrote 0x${masterNodePtr.toString(16)} to msgAddr+0xf4, readback=0x${writtenValue.toString(16)}`);

    // DEBUG: Dump what's at masterNode memory for first 4 nodes
    const MY_NODE_ARRAY_BASE = 0x1E003A;
    const MY_NODE_SIZE = 124;
    const SINGLE_PORTS_BASE = 0x1E1000;
    const SINGLE_PORT_SIZE = 512;

    console.error(`[XIMBBSInfo] MULTICOM - Memory dump of node structures:`);
    for (let i = 0; i < 8; i++) {
      // Check myNode structure (where RTW might read from)
      const myNodeAddr = MY_NODE_ARRAY_BASE + (i * MY_NODE_SIZE);
      const myNodeHandleBytes: number[] = [];
      for (let j = 0; j < 20; j++) {
        const byte = this.emulator.readMemory(myNodeAddr + j);
        if (byte === 0) break;
        myNodeHandleBytes.push(byte);
      }
      const myNodeHandle = Buffer.from(myNodeHandleBytes).toString('ascii') || '(empty)';
      const sPtr = this.emulator.readMemory32(myNodeAddr + 0x74); // .s pointer (aligned offset)

      // Check singlePort structure
      const singlePortAddr = SINGLE_PORTS_BASE + (i * SINGLE_PORT_SIZE);
      const status = this.emulator.readMemory32(singlePortAddr + 0x52);
      const handleBytes: number[] = [];
      for (let j = 0; j < 20; j++) {
        const byte = this.emulator.readMemory(singlePortAddr + 0x56 + j);
        if (byte === 0) break;
        handleBytes.push(byte);
      }
      const handle = Buffer.from(handleBytes).toString('ascii') || '(empty)';

      console.error(`[XIMBBSInfo]   Node ${i}: myNode=0x${myNodeAddr.toString(16)} handle="${myNodeHandle}" .s=0x${sPtr.toString(16)} | singlePort=0x${singlePortAddr.toString(16)} status=${status} handle="${handle}"`);
    }

    // Also dump raw bytes at masterNode to see structure
    console.error(`[XIMBBSInfo] Raw masterNode header (first 64 bytes at 0x${masterNodePtr.toString(16)}):`);
    let hexDump = '';
    for (let i = 0; i < 64; i++) {
      if (i % 16 === 0) hexDump += `\n  0x${(masterNodePtr + i).toString(16).padStart(6, '0')}: `;
      hexDump += this.emulator.readMemory(masterNodePtr + i).toString(16).padStart(2, '0') + ' ';
    }
    console.error(hexDump)

    // Reply with current node ID
    this.reply(msg, nodeId);
  }

  /**
   * Handle CONF_ACCESS - Check conference access
   * From E sources (express.e:4023-4028)
   */
  handleConfAccess(msg: XIMMessage): void {
    const confNum = msg.data;
debugLog(`[XIMBBSInfo] CONF_ACCESS - Check access to conf ${confNum}`);

    // Get number of conferences
    let numConfs = 14;
    try {
      const confConfigPath = path.join(this.getBbsRoot(), 'ConfConfig.info');
      if (fs.existsSync(confConfigPath)) {
        const buffer = fs.readFileSync(confConfigPath);
        let currentString = '';
        const extracted: string[] = [];

        for (let i = 0; i < buffer.length; i++) {
          const charCode = buffer[i];
          if (charCode >= 32 && charCode <= 126) {
            currentString += String.fromCharCode(charCode);
          } else {
            if (currentString.length >= 2) extracted.push(currentString);
            currentString = '';
          }
        }

        for (const line of extracted) {
          const cleanLine = line.replace(/^[^a-zA-Z0-9+(%#']+/g, '').trim();
          const upperLine = cleanLine.toUpperCase();
          // Support both NCONFS= and NUMCONFS= formats
          if (upperLine.startsWith('NCONFS=')) {
            const val = parseInt(cleanLine.substring(7).trim(), 10);
            if (!isNaN(val)) numConfs = val;
          } else if (upperLine.startsWith('NUMCONFS=')) {
            const val = parseInt(cleanLine.substring(9).trim(), 10);
            if (!isNaN(val)) numConfs = val;
          }
        }
      }
    } catch { /* use default */ }

    let accessResult: number;
    if (confNum < 0 || confNum >= numConfs) {
      // Invalid conference number
      accessResult = 2;
    } else {
      // Check access from confAccess string (disk-based only)
      // state.confAccess comes from disk (user.data) via door.handler.ts
      // Do NOT fall back to bbsSession.confAccess - that may be SQLite data
      const confAccess = this.state.confAccess || '';
      const hasAccess = confAccess.length > confNum && confAccess[confNum].toUpperCase() === 'X';
      accessResult = hasAccess ? 1 : 0;
debugLog(`  confAccess="${confAccess}" (len=${confAccess.length}, from disk), check index ${confNum}, Access: ${hasAccess ? 'YES' : 'NO'}`);
    }
    // CRITICAL: Pass accessResult to reply, NOT hardcoded 1
    this.reply(msg, accessResult);
  }

  /**
   * Handle SIG_PLAYPEN - Get playpen directory path
   * From E sources (express.e:4196-4198)
   */
  handleSigPlaypen(msg: XIMMessage): void {
    const nodeId = this.getNodeId();
    // Return Amiga-style playpen path
    const playpen = `BBS:Node${nodeId}/Playpen/`;
    this.messageParser.writeMessageString(msg.msgAddr, playpen);
debugLog(`[XIMBBSInfo] SIG_PLAYPEN: ${playpen}`);
    this.reply(msg, 1);
  }

  /**
   * Handle GET_GNSFLAG - Get non-stop display flag
   * From E sources (express.e:4036-4037)
   */
  handleGetGNSFlag(msg: XIMMessage): void {
    const flag = this.state.nonStopText ? 1 : 0;
debugLog(`[XIMBBSInfo] GET_GNSFLAG: ${flag}`);
    this.messageParser.writeData(msg.msgAddr, flag);
    this.reply(msg, flag);
  }

  /**
   * Handle BB_CONFACCOUNT - Conference accounting enabled
   * From E sources (express.e:4183-4188)
   */
  handleConfAccount(msg: XIMMessage): void {
    // Most doors just want to know if conference accounting is enabled
    // Default to NO for simplicity
    const enabled = (this.bbsSession as any)?.confAccountingEnabled ? 'YES' : 'NO';
    this.messageParser.writeMessageString(msg.msgAddr, enabled);
debugLog(`[XIMBBSInfo] BB_CONFACCOUNT: ${enabled}`);
    this.reply(msg, 1);
  }

  /**
   * Handle ICONIFYQUERY - Is screen iconified?
   * From E sources (express.e:4199-4200)
   */
  handleIconifyQuery(msg: XIMMessage): void {
    // Web is never iconified
    this.messageParser.writeMessageString(msg.msgAddr, 'NO');
debugLog('[XIMBBSInfo] ICONIFYQUERY: NO');
    this.reply(msg, 1);
  }

  /**
   * Handle QUIET_DOWNLOAD - Get/set quiet download mode
   * From E sources (express.e:4215-4220)
   */
  handleQuietDownload(msg: XIMMessage): void {
    const isRead = !msg.string || msg.string[0] === '\0';
    if (isRead) {
      const quietMode = (this.state as any).quietDownload ? 1 : 0;
      this.messageParser.writeData(msg.msgAddr, quietMode);
debugLog(`[XIMBBSInfo] QUIET_DOWNLOAD [READ]: ${quietMode}`);
    } else {
      (this.state as any).quietDownload = msg.data !== 0;
debugLog(`[XIMBBSInfo] QUIET_DOWNLOAD [WRITE]: ${msg.data}`);
    }
    this.reply(msg, 1);
  }

  /**
   * Handle GET_XIMPORT - Get XIM port number
   * From E sources (express.e:4047-4048)
   */
  handleGetXimPort(msg: XIMMessage): void {
    // 1 = console, 2 = serial, 3 = both
    const ximPort = 3; // WebSocket acts like both
    this.messageParser.writeData(msg.msgAddr, ximPort);
debugLog(`[XIMBBSInfo] GET_XIMPORT: ${ximPort}`);
    this.reply(msg, ximPort);
  }

  /**
   * Handle password hash
   * From E sources (express.e:4029-4035)
   */
  handlePasswordHash(msg: XIMMessage): void {
    // For security, return a dummy hash
    const hash = '00000000000000000000000000000000';
    this.messageParser.writeMessageString(msg.msgAddr, hash);
debugLog('[XIMBBSInfo] PASSWORD_HASH: (hidden)');
    this.reply(msg, 1);
  }

  /**
   * Send reply to door
   */
  private reply(msg: XIMMessage, data: number): void {
    // Mark reply as handled so callers (XIMProcessor / polling loop) skip their
    // fallback replyMsg and we avoid double-delivering the same msg to the
    // door's reply port queue.
    this.state.replyHandled = true;
    // express.e replies only set msg.string/msg.data; do not modify strptr/fillers.
    this.messageParser.writeData(msg.msgAddr, data);

    // CRITICAL DEBUG: For BB_CONFNUM, log complete message state before reply
    if (msg.command === XIMCommand.BB_CONFNUM) {
      const finalString = this.messageParser.readString(
        msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
        DoorConstants.MESSAGE_STRING_CAPACITY
      );
      const finalData = this.emulator.readMemory32(msg.msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
      const finalCmd = this.emulator.readMemory32(msg.msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
debugLog(`[XIMBBSInfo][BB_CONFNUM] SENDING REPLY: cmd=${finalCmd}, data=${finalData}, string="${finalString}"`);
debugLog(`[XIMBBSInfo][BB_CONFNUM] Reply msgAddr=0x${msg.msgAddr.toString(16)}, about to call ReplyMsg`);
    }

    // Log outgoing reply to XIM structured logger
    const humanName = this.messageParser.getCommandName(msg.command);
    ximLogger.log('debug', 'send', this.state.doorCommand || 'UNKNOWN', this.bbsSession?.nodeId || 1, {
      type: `${humanName}_REPLY`,
      typeCode: msg.command,
      param: data,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      message: 'Reply to door BBS info query',
    });

    // CRITICAL FIX 2026-01-15: Detect which reply method to use based on msg.replyPort
    // - AEDoor.library-based doors (TurboLister) set mn_ReplyPort and poll THAT port
    // - Native XIM doors poll the AEDoorPort bidirectionally (replyPort often 0)
    // If message has valid replyPort, use ReplyMsg to send there (AEDoor.library mode)
    // Otherwise use bidirectional PutMsg to XIM port (native XIM mode)
    const msgReplyPort = msg.replyPort || 0;

    if (msgReplyPort !== 0) {
      // AEDoor.library mode: door polls its own reply port
      this.execLibrary.replyMsg(msg.msgAddr);
      debugLog(`[XIMBBSInfo] Reply sent via ReplyMsg to msg.replyPort=0x${msgReplyPort.toString(16)} (AEDoor.library mode)`);
    } else {
      // Native XIM mode: door polls AEDoorPort bidirectionally
      const ximPortAddr = this.state.ximPortAddr;
      const doorPortAddr = (this.state as any).doorPortAddr;
      const targetPort = ximPortAddr || doorPortAddr;

      if (targetPort && targetPort !== 0) {
        const NT_REPLYMSG = 6;
        this.emulator.writeMemory(msg.msgAddr + 8, NT_REPLYMSG);
        this.execLibrary.putMsg(targetPort, msg.msgAddr, { suppressDoorCallback: true });
        debugLog(`[XIMBBSInfo] Reply sent via PutMsg to port=0x${targetPort.toString(16)} (bidirectional XIM)`);
      } else {
        this.execLibrary.replyMsg(msg.msgAddr);
        debugLog(`[XIMBBSInfo] Reply sent via ReplyMsg (fallback)`);
      }
    }
  }
}

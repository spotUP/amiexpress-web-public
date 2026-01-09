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

console.log(`[XIMBBSInfo] JH_BBSNAME: "${bbsName}"`);

    this.messageParser.writeMessageString(msg.msgAddr, bbsName.slice(0, 41));

    this.reply(msg, msg.data ?? 0);
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

console.log(`[XIMBBSInfo] EXPRESS_VERSION: returning version="${version}"`);

    this.messageParser.writeMessageString(msg.msgAddr, version);

    // Verify what was written to buffer
    const verifyBuffer = this.messageParser.readString(
      msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
console.log(`[XIMBBSInfo] EXPRESS_VERSION verify buffer: "${verifyBuffer}"`);

    this.reply(msg, msg.data ?? 0);
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
        {
          // Return Amiga-style path like "BBS:Conf1/" (door expects this format)
          // Check both currentConference (GlobalStructures) and currentConf (legacy)
          const confId = (this.bbsSession as any)?.currentConference ?? (this.bbsSession as any)?.currentConf ?? this.bbsSession?.conferenceId ?? 1;
          value = `BBS:Conf${confId}/`;
console.log(`[XIMBBSInfo] BB_CONFLOCAL: "${value}"`);
        }
        break;

      case XIMCommand.BB_LOCAL:
        // Return Amiga-style BBS root path
        value = 'BBS:';
console.log(`[XIMBBSInfo] BB_LOCAL: "${value}"`);
        break;

      case XIMCommand.BB_CONFNUM:
        {
          // CRITICAL: Returns 0-based conference number (currentConf - 1)
          // Per express.e:3832: StringF(tempstring,'\d',currentConf-1)
          // Example: User in conference 29 → returns "28", conference 1 → returns "0"
          // Try multiple possible sources for current conference
          // Priority: currentConference > currentConf > conferenceId > user.lastConf > default to 1
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

          // CRITICAL DEBUG: Log buffer state BEFORE write to track "23" vs "2" issue
          const beforeWrite = this.messageParser.readString(
            msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
            DoorConstants.MESSAGE_STRING_CAPACITY
          );
console.log(`[XIMBBSInfo][BB_CONFNUM] BEFORE write: buffer="${beforeWrite}" (incoming from door)`);
console.log(`[XIMBBSInfo][BB_CONFNUM] Calculated value: "${value}" (0-based) from currentConfNum=${currentConfNum} (currentConf=${(this.bbsSession as any)?.currentConf})`);
console.log(`[XIMBBSInfo][BB_CONFNUM] Will write "${value}" to buffer at 0x${(msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET).toString(16)}`);
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

      // CONF_ACCESS (614) - Check user's access to a specific conference
      // Returns: 0=no access, 1=has access, 2=invalid conference
      // Per axcommon.e, this is the ONLY command at 614 (BB_NUMCONFS does NOT exist)
      case XIMCommand.ENVSTAT:
        if (msg.data) {
          // Read status: return currentStat as string
          const status = (this.bbsSession as any)?.currentStat ?? 0;
          this.messageParser.writeMessageString(msg.msgAddr, status.toString());
console.log(`[XIMBBSInfo] ENVSTAT [READ]: ${status}`);
        } else if (msg.string) {
          // Write status: update currentStat
          const newStatus = parseInt(msg.string.trim(), 10);
          if (!Number.isNaN(newStatus)) {
            (this.bbsSession as any).currentStat = newStatus;
console.log(`[XIMBBSInfo] ENVSTAT [WRITE]: ${newStatus}`);
          }
        }
        this.reply(msg, 1);
        return;
      case XIMCommand.CONF_ACCESS:
        this.handleConfAccess(msg);
        return;
    }

    if (isRead && value) {
      this.messageParser.writeMessageString(msg.msgAddr, value);
      if (msg.command === XIMCommand.BB_CONFNUM) {
        const verify = this.messageParser.readString(
          msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
          DoorConstants.MESSAGE_STRING_CAPACITY
        );
console.log(`[XIMBBSInfo][BB_CONFNUM] AFTER write: buffer="${verify}" (should be "${value}")`);

        // Also log all message fields to see complete state
        const data = this.emulator.readMemory32(msg.msgAddr + DoorConstants.MESSAGE_DATA_OFFSET);
        const cmd = this.emulator.readMemory32(msg.msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET);
console.log(`[XIMBBSInfo][BB_CONFNUM] Message state: cmd=${cmd}, data=${data}, string="${verify}"`);
      }
    } else if (!isRead && msg.string) {
      // Accept updated values (write mode)
      // CRITICAL: Only BB_CONFNAME and BB_CONFLOCAL support WRITE mode
      // BB_LOCAL is READ-ONLY per express.e:3708-3709
      switch (msg.command) {
        case XIMCommand.BB_CONFNAME:
          this.bbsSession.conferenceName = msg.string;
          break;
        case XIMCommand.BB_CONFLOCAL:
          this.bbsSession.conferencePath = msg.string;
          break;
        // BB_LOCAL intentionally omitted - READ-ONLY
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
        // express.e:3867-3868: msg.data:=screen.height
        // Return user's configured screen height (lines per screen)
        value = this.state.pauseLines ||
                (this.bbsSession as any)?.user?.linesPerScreen ||
                (this.bbsSession as any)?.user?.pageLength ||
                24;
console.log(`  BB_SCRHEIGHT: ${value}`);
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
console.log(`[XIMBBSInfo] BB_NONSTOPTEXT: ${this.state.nonStopText ? 'ENABLED' : 'DISABLED'} (data=${msg.data})`);
    this.reply(msg, msg.data ?? 0);
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

    this.reply(msg, msg.data ?? 0);
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

console.log(`[XIMBBSInfo] BB_MAINLINE: returning command="${result}"`);

    this.messageParser.writeMessageString(msg.msgAddr, result);
    const verify = this.messageParser.readString(
      msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET,
      DoorConstants.MESSAGE_STRING_CAPACITY
    );
console.log(`[XIMBBSInfo] BB_MAINLINE verify buffer: "${verify}"`);

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
    const expressVer = raw.trim().length > 0 ? raw.trim() : 'v5.3';

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
      return 'v5.3';
    }

    const major = parseInt(normalized, 10);
    if (Number.isFinite(major)) {
      return `v${major}`;
    }

    return 'v5.3';
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
   * Handle NODE_BAUD, NODE_BAUDRATE, NODE_DEVICE, NODE_UNIT
   * From E sources (express.e:3842-3852)
   */
  handleNodeInfo(msg: XIMMessage): void {
    switch (msg.command) {
      case XIMCommand.NODE_BAUD:
        // Return online baud rate (e.g., 115200)
        const baud = (this.bbsSession as any)?.baudRate || 115200;
        this.messageParser.writeMessageString(msg.msgAddr, baud.toString());
console.log(`[XIMBBSInfo] NODE_BAUD: ${baud}`);
        break;

      case XIMCommand.NODE_BAUDRATE:
        // Same as NODE_BAUD
        const baudRate = (this.bbsSession as any)?.baudRate || 115200;
        this.messageParser.writeMessageString(msg.msgAddr, baudRate.toString());
console.log(`[XIMBBSInfo] NODE_BAUDRATE: ${baudRate}`);
        break;

      case XIMCommand.NODE_DEVICE:
        // Return serial device name (web uses TCP)
        const device = 'TCP:';
        this.messageParser.writeMessageString(msg.msgAddr, device);
console.log(`[XIMBBSInfo] NODE_DEVICE: ${device}`);
        break;

      case XIMCommand.NODE_UNIT:
        // Return serial device unit (0 for web)
        this.messageParser.writeMessageString(msg.msgAddr, '0');
console.log('[XIMBBSInfo] NODE_UNIT: 0');
        break;
    }
    this.reply(msg, 1);
  }

  /**
   * Handle MULTICOM - Return master node semaphore
   * From E sources (express.e:3909)
   */
  handleMulticom(msg: XIMMessage): void {
console.log('[XIMBBSInfo] MULTICOM - Get master node semaphore');
    // Return a dummy semaphore pointer (0 = no multicom)
    this.messageParser.writeSemaphore(msg.msgAddr, 0);
    this.reply(msg, 0);
  }

  /**
   * Handle CONF_ACCESS - Check conference access
   * From E sources (express.e:4023-4028)
   */
  handleConfAccess(msg: XIMMessage): void {
    const confNum = msg.data;
console.log(`[XIMBBSInfo] CONF_ACCESS - Check access to conf ${confNum}`);

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
          if (cleanLine.toUpperCase().startsWith('NUMCONFS=')) {
            const val = parseInt(cleanLine.substring(9).trim(), 10);
            if (!isNaN(val)) numConfs = val;
          }
        }
      }
    } catch { /* use default */ }

    if (confNum < 0 || confNum >= numConfs) {
      // Invalid conference number
      this.messageParser.writeData(msg.msgAddr, 2); // 2 = invalid
    } else {
      // Check access from confAccess string (disk-based only)
      // state.confAccess comes from disk (user.data) via door.handler.ts
      // Do NOT fall back to bbsSession.confAccess - that may be SQLite data
      const confAccess = this.state.confAccess || '';
      const hasAccess = confAccess.length > confNum && confAccess[confNum].toUpperCase() === 'X';
      this.messageParser.writeData(msg.msgAddr, hasAccess ? 1 : 0);
console.log(`  confAccess="${confAccess}" (len=${confAccess.length}, from disk), check index ${confNum}, Access: ${hasAccess ? 'YES' : 'NO'}`);
    }
    this.reply(msg, 1);
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
console.log(`[XIMBBSInfo] SIG_PLAYPEN: ${playpen}`);
    this.reply(msg, 1);
  }

  /**
   * Handle GET_GNSFLAG - Get non-stop display flag
   * From E sources (express.e:4036-4037)
   */
  handleGetGNSFlag(msg: XIMMessage): void {
    const flag = this.state.nonStopText ? 1 : 0;
console.log(`[XIMBBSInfo] GET_GNSFLAG: ${flag}`);
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
console.log(`[XIMBBSInfo] BB_CONFACCOUNT: ${enabled}`);
    this.reply(msg, 1);
  }

  /**
   * Handle ICONIFYQUERY - Is screen iconified?
   * From E sources (express.e:4199-4200)
   */
  handleIconifyQuery(msg: XIMMessage): void {
    // Web is never iconified
    this.messageParser.writeMessageString(msg.msgAddr, 'NO');
console.log('[XIMBBSInfo] ICONIFYQUERY: NO');
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
console.log(`[XIMBBSInfo] QUIET_DOWNLOAD [READ]: ${quietMode}`);
    } else {
      (this.state as any).quietDownload = msg.data !== 0;
console.log(`[XIMBBSInfo] QUIET_DOWNLOAD [WRITE]: ${msg.data}`);
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
console.log(`[XIMBBSInfo] GET_XIMPORT: ${ximPort}`);
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
console.log('[XIMBBSInfo] PASSWORD_HASH: (hidden)');
    this.reply(msg, 1);
  }

  /**
   * Send reply to door
   */
  private reply(msg: XIMMessage, data: number): void {
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
console.log(`[XIMBBSInfo][BB_CONFNUM] SENDING REPLY: cmd=${finalCmd}, data=${finalData}, string="${finalString}"`);
console.log(`[XIMBBSInfo][BB_CONFNUM] Reply msgAddr=0x${msg.msgAddr.toString(16)}, about to call ReplyMsg`);
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

    this.execLibrary.replyMsg(msg.msgAddr);
  }
}

/**
 * XIM System Commands Handler
 *
 * Handles system-level XIM commands (registration, shutdown, chaining, etc).
 */

import * as fs from 'fs';
import * as path from 'path';
import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMCommand, XIMMessage, BBSSessionData, XIMState } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { DoorConstants } from '../DoorTypes';
import { ZmodemTransferManager, TransferDirection, TransferTransport } from '../../services/zmodem-transfer.service';
import { SysopDebugUtil } from '../../utils/sysop-debug.util';

export class XIMSystemCommandsHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;
  private state: XIMState;
  private ximPortAddr: number;
  private transferRawActive = false;

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
    this.ximPortAddr =
      (state as any).ximPortAddr ||
      (state as any).aePortAddr ||
      (state as any).doorPortAddr ||
      0;
  }

  /**
   * Handle door registration (JH_REGISTER)
   * From E sources (express.e:3379)
   */
  handleRegister(msg: XIMMessage): void {
    console.log('[XIMSystem] Door registering with BBS');

    // Seed msg->String with DoorReplyPort<n> like the Amiga reference log
    const strPtr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    const regNodeId =
      (this.bbsSession?.nodeId as number) ||
      (this.bbsSession as any)?.nodeNumber ||
      1;
    const seedString = `DoorReplyPort${regNodeId}`;
    this.messageParser.writeMessageString(msg.msgAddr, seedString);
    this.messageParser.writeStringPointer(msg.msgAddr, strPtr);
    this.messageParser.writeFiller1(msg.msgAddr, strPtr);
    this.messageParser.writeFiller2(msg.msgAddr, strPtr);
    // express.e: msg.command := userLineLen (screen height)
    const rawLineLen =
      this.bbsSession?.user?.lineLength ??
      this.bbsSession?.pauseLines ??
      this.bbsSession?.lineWrap;
    const lineLen =
      typeof rawLineLen === 'number' && rawLineLen > 0 ? rawLineLen : 29;
    this.messageParser.writeCommand(msg.msgAddr, lineLen);
    const dataOut =
      typeof msg.data === 'number' && !Number.isNaN(msg.data)
        ? msg.data
        : undefined;
    const nodeId = regNodeId;
    if (dataOut !== undefined) {
      this.messageParser.writeData(msg.msgAddr, dataOut);
    }
    this.messageParser.writeNodeId(msg.msgAddr, msg.nodeId ?? nodeId);
    this.messageParser.writeLineNumber(msg.msgAddr, 0);
    // Ensure length is sane; otherwise echo the message back untouched.
    const parsed = this.messageParser.parseMessage(msg.msgAddr);
    if (this.emulator.readMemory16(msg.msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET) === 0) {
      this.emulator.writeMemory16(msg.msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, DoorConstants.MESSAGE_TOTAL_LENGTH);
    }
    const parsedFinal = this.messageParser.parseMessage(msg.msgAddr);
    console.log(
      `[XIMSystem][RegisterReply] cmd=${parsedFinal.command} data=${parsedFinal.data} node=${parsedFinal.nodeId} strPtr=0x${(parsedFinal as any).stringPtr?.toString(
        16
      )} str="${parsedFinal.string}"`
    );
    console.log(
      `[XIMSystem][RegisterReply][dbg] wrote nodeId=${nodeId} data=${parsedFinal.data} lineLen=${lineLen}`
    );

    this.state.registered = true;
    this.state.shuttingDown = false;
    this.state.lineCount = 0;

    // Reply without mutating Data/Node/String fields; express.e reuses the door's message buffer
    this.execLibrary.replyMsg(msg.msgAddr);

    console.log(`[XIMSystem] Registration acknowledged`);

    // CRITICAL FIX: Populate BBSInfo AFTER library initialization
    // The real AEDoor.library's CreateComm() has set up the DIFace structure
    // and pointers. Now we populate the actual user data at those addresses.
    this.populateBBSInfoPostRegister(msg);
  }

  /**
   * Populate BBSInfo structure AFTER library initialization
   * This ensures user data is written to the correct memory locations
   * that the library's GetUserName/CopyLocationString functions will read from.
   */
  private populateBBSInfoPostRegister(msg: XIMMessage): void {
    console.log('[BBSInfo] Post-register population starting...');

    // Try to find the DIFace address - it may be in msg.data or we need to search
    // The library creates a DIFace structure and the door passes it in Register
    let difaceAddr = msg.data;

    // If data looks invalid, try to find DIFace via known patterns
    if (!difaceAddr || difaceAddr < 0x100 || difaceAddr > 0xFFFFFF) {
      console.log('[BBSInfo] Invalid DIFace address in msg.data, searching...');
      // The DIFace is typically allocated around 0x10000-0x20000 range
      // We can search for the signature or use the reply port to find it
      // For now, skip if we can't find a valid address
      console.warn('[BBSInfo] Could not find valid DIFace address, skipping BBSInfo population');
      return;
    }

    console.log(`[BBSInfo] DIFace address: 0x${difaceAddr.toString(16)}`);

    // Read the pointers that the library set up
    // DoorInfo+0x20 points to user name string location
    // DoorInfo+0x1c points to location string location
    const userPtr = this.emulator.readMemory32(difaceAddr + 0x20);
    const locPtr = this.emulator.readMemory32(difaceAddr + 0x1c);

    console.log(`[BBSInfo] User name pointer: 0x${userPtr.toString(16)}`);
    console.log(`[BBSInfo] Location pointer: 0x${locPtr.toString(16)}`);

    // Get actual user data from session
    const username = this.bbsSession?.user?.username || 'Guest';
    const location = this.bbsSession?.user?.location || 'Unknown';
    const bbsName = 'AmiExpress-Web';

    // Write user data to the addresses the library's pointers point to
    if (userPtr > 0x100 && userPtr < 0xFFFFFF) {
      this.writeCString(userPtr, username, 198);
      console.log(`[BBSInfo] Wrote username "${username}" to 0x${userPtr.toString(16)}`);
    }

    if (locPtr > 0x100 && locPtr < 0xFFFFFF) {
      this.writeCString(locPtr, location, 60);
      console.log(`[BBSInfo] Wrote location "${location}" to 0x${locPtr.toString(16)}`);
    }

    // Also populate other BBSInfo fields at known offsets
    // BBSInfo is at DIFace + 0x46
    const bbsInfoAddr = difaceAddr + 0x46;
    this.writeCString(bbsInfoAddr + 0x120, bbsName, 40); // BBS name at +0x120
    this.writeCString(bbsInfoAddr + 0x150, this.getFormattedDate(), 19); // Date at +0x150
    this.writeCString(bbsInfoAddr + 0x170, this.getFormattedTime(), 19); // Time at +0x170

    console.log(`[BBSInfo] Wrote BBS name "${bbsName}"`);
    console.log(`[BBSInfo] Wrote date "${this.getFormattedDate()}"`);
    console.log(`[BBSInfo] Wrote time "${this.getFormattedTime()}"`);

    // Read back verification
    if (userPtr > 0x100) {
      const verifyUser = this.readCString(userPtr, 198);
      console.log(`[BBSInfo] Verify user: "${verifyUser}"`);
    }
    if (locPtr > 0x100) {
      const verifyLoc = this.readCString(locPtr, 60);
      console.log(`[BBSInfo] Verify location: "${verifyLoc}"`);
    }

    console.log('[BBSInfo] Post-register population complete');
  }

  /**
   * Write C-style null-terminated string to memory
   */
  private writeCString(addr: number, text: string, maxLen: number): void {
    const truncated = text.slice(0, maxLen - 1);
    for (let i = 0; i < truncated.length; i++) {
      this.emulator.writeMemory(addr + i, truncated.charCodeAt(i));
    }
    this.emulator.writeMemory(addr + truncated.length, 0); // Null terminator
  }

  /**
   * Read C-style null-terminated string from memory
   */
  private readCString(addr: number, maxLen: number): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLen; i++) {
      const byte = this.emulator.readMemory(addr + i);
      if (byte === 0) break;
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Get formatted date string (MM/DD/YYYY)
   */
  private getFormattedDate(): string {
    const now = new Date();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${day}/${year}`;
  }

  /**
   * Get formatted time string (HH:MM:SS)
   */
  private getFormattedTime(): string {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Handle door shutdown (JH_SHUTDOWN)
   */
  handleShutdown(msg: XIMMessage): void {
    console.log('[XIMSystem] Door requesting shutdown');

    this.state.shuttingDown = true;
    this.state.registered = false;
    this.reply(msg, 1);

    console.log('[XIMSystem] Door completed execution');
  }

  /**
   * Handle RAWARROW (Toggle Raw Arrow Keys)
   * From E sources (express.e:3814-3815)
   */
  handleRawArrow(msg: XIMMessage): void {
    console.log('[XIMSystem] RAWARROW: Toggle raw arrow mode (no-op in web)');

    // Ack
    this.reply(msg, 1);
  }

  /**
   * Handle RETURNCOMMAND / RETURNCOMMAND2
   * From E sources (express.e:3492-3493, 4064-4065)
   */
  handleReturnCommand(msg: XIMMessage): void {
    const command = this.getMessageString(msg);

    console.log(`[XIMSystem] RETURNCOMMAND: "${command}"`);

    this.bbsSession.returnCommand = command;
    this.state.returnCommand = command;

    this.reply(msg, 1);
  }

  /**
   * Handle CHAIN (Chain to Another Door)
   * From E sources (express.e:3386-3387)
   */
  handleChain(msg: XIMMessage): void {
    console.log('[XIMSystem] CHAIN: Door requesting chain to another door');

    this.state.chainCommand = this.getMessageString(msg);
    this.reply(msg, 1);
  }

  /**
   * Handle ENVSTAT (Environment Status)
   * From E sources (express.e:3677-3683)
   */
  handleEnvStat(msg: XIMMessage): void {
    console.log('[XIMSystem] ENVSTAT - Environment status');

    const isRead = msg.data !== 0;
    if (isRead) {
      // Return current environment status from session (set by command-execution.handler.ts)
      // For file scan commands (FR, F, N, etc.), this will be 8 (ENV_FILES)
      const status = (this.bbsSession as any).currentStat || 0;
      this.messageParser.writeMessageString(msg.msgAddr, status.toString());
      console.log(`  [READ] Status: ${status}`);
    } else {
      const value = this.getMessageString(msg);
      if (value.length > 0) {
        (this.bbsSession as any).currentStat = parseInt(value) || 0;
        console.log(`  [WRITE] Set status: ${value}`);
      }
    }

    this.reply(msg, 1);
  }

  /**
   * Handle SV_NEWMSG (Server New Message)
   * From E sources (express.e:3684-3685)
   */
  handleSvNewMsg(msg: XIMMessage): void {
    const message = this.getMessageString(msg);

    console.log('[XIMSystem] SV_NEWMSG - Set server message');
    console.log(`  Message: "${message}"`);

    // Ack with Data=1 per express.e behavior
    this.messageParser.writeData(msg.msgAddr, 1);
    this.execLibrary.replyMsg(msg.msgAddr);
  }

  /**
   * Handle PRV_COMMAND (Private Command)
   * From E sources (express.e:3816-3818)
   */
  handlePrvCommand(msg: XIMMessage): void {
    const command = this.getMessageString(msg);

    console.log('[XIMSystem] PRV_COMMAND - Execute BBS command');
    console.log(`  Command: "${command}"`);

    this.state.prvCommand = command;
    // Execute immediately like express.e processCommand
    try {
      const { handleCommand } = require('../../handlers/command.handler');
      handleCommand(this.socket, this.bbsSession as any, command);
    } catch (err) {
      console.warn('[XIMSystem] PRV_COMMAND execution error:', err);
    }
    this.reply(msg, 1);
  }

  /**
   * Handle PRV_GROUP (Private Group)
   * From E sources (express.e:3819-3830)
   */
  handlePrvGroup(msg: XIMMessage): void {
    const groupData = this.getMessageString(msg);

    console.log('[XIMSystem] PRV_GROUP - Modify group settings');
    console.log(`  Group data: "${groupData}"`);

    // Update conference names/locations when targeting current conf
    const confNum = parseInt(groupData, 10);
    if (!Number.isNaN(confNum)) {
      (this.bbsSession as any).currentConf = confNum + 1;
    }
    this.reply(msg, 1);
  }

  /**
   * Handle JH_SIGBIT (Signal Bit Query)
   * From E sources (express.e:3463-3464)
   */
  handleSignalBit(msg: XIMMessage): void {
    console.log('[XIMSystem] JH_SIGBIT - Query signal bits');

    // Return a distinct signal mask; use msg.data when provided, otherwise default bit 1
    const bit = typeof msg.data === 'number' && msg.data > 0 ? msg.data : 1;
    const mask = 1 << (bit & 31);
    this.reply(msg, mask);
  }

  /**
   * Handle JH_MCI (MCI Processing)
   * From E sources (express.e:3456-3462)
   */
  handleMCI(msg: XIMMessage): void {
    const text = this.getMessageString(msg);

    console.log('[XIMSystem] JH_MCI - Process MCI codes');
    console.log(`  Text: "${text}"`);

    // Use the existing MCI processor to render codes the same way screens do
    try {
      const { parseMCI } = require('../../handlers/screen.handler');
      const result = parseMCI(text, this.bbsSession as any, {
        allowCommands: false,
        pauseAfter: msg.data !== 0,
      });
      if (result?.content) {
        this.socket.emit('ansi-output', result.content);
      } else {
        this.socket.emit('ansi-output', text + (msg.data !== 0 ? '\r\n' : ''));
      }
      if (msg.data !== 0) {
        // express.e: add CRLF and checkForPause
        this.socket.emit('ansi-output', '\r\n');
      }
    } catch (err) {
      console.warn('[XIMSystem] JH_MCI fallback:', err);
      this.socket.emit('ansi-output', text + (msg.data !== 0 ? '\r\n' : ''));
    }

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SG (Security Screen)
   * From E sources (express.e:3473-3474)
   */
  handleSecurityScreen(msg: XIMMessage): void {
    const screenName = this.getMessageString(msg);

    console.log('[XIMSystem] JH_SG - Display security screen');
    console.log(`  Screen: "${screenName}"`);

    const resolved = this.resolvePath(screenName);
    if (fs.existsSync(resolved)) {
      try {
        const content = fs.readFileSync(resolved, 'utf-8');
        this.socket.emit('ansi-output', content);
      } catch (err) {
        SysopDebugUtil.debugFileError(this.socket, this.bbsSession, 'read', resolved, err as Error);
        console.warn(`[XIMSystem] JH_SG failed to read ${resolved}:`, err);
      }
    } else {
      console.warn(`[XIMSystem] JH_SG: Screen not found at ${resolved}`);
    }

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SF (Show File)
   * From E sources (express.e:3475-3476)
   */
  handleShowFile(msg: XIMMessage): void {
    const fileName = this.getMessageString(msg);

    console.log('[XIMSystem] JH_SF - Show file');
    console.log(`  File: "${fileName}"`);

    const resolved = this.resolvePath(fileName);
    if (fs.existsSync(resolved)) {
      try {
        const content = fs.readFileSync(resolved, 'utf-8');
        this.socket.emit('ansi-output', content);
      } catch (err) {
        SysopDebugUtil.debugFileError(this.socket, this.bbsSession, 'read', resolved, err as Error);
        console.warn(`[XIMSystem] JH_SF failed to read ${resolved}:`, err);
      }
    } else {
      console.warn(`[XIMSystem] JH_SF: File not found at ${resolved}`);
    }

    this.reply(msg, 1);
  }

  /**
   * Handle JH_EF (Edit File)
   * From E sources (express.e:3477-3485, 1145-1154)
   */
  handleEditFile(msg: XIMMessage): void {
    const fileName = this.getMessageString(msg);

    console.log('[XIMSystem] JH_EF - Edit file');
    console.log(`  File: "${fileName}"`);

    this.messageParser.writeData(msg.msgAddr, 1);
    console.log('  [SUCCESS] File edit acknowledged');

    this.reply(msg, 1);
  }

  /**
   * Handle JH_FLAGFILE (Flag File)
   * From E sources (express.e:3490-3491, 1160-1161)
   */
  handleFlagFile(msg: XIMMessage): void {
    const fileName = this.getMessageString(msg);

    console.log('[XIMSystem] JH_FLAGFILE - Flag file for download');
    console.log(`  File: "${fileName}"`);

    // Persist flagged file on the session for host pickup (simplified queue)
    if (!Array.isArray((this.bbsSession as any).flaggedFiles)) {
      (this.bbsSession as any).flaggedFiles = [];
    }
    (this.bbsSession as any).flaggedFiles.push(fileName);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SHOWFLAGS (List flagged files)
   */
  handleShowFlags(msg: XIMMessage): void {
    const flagged = (this.bbsSession as any)?.flaggedFiles || [];
    const output = flagged.join('\r\n');
    this.messageParser.writeMessageString(msg.msgAddr, output);
    this.reply(msg, 1);
  }

  /**
   * Send reply to door
   */
  private reply(
    msg: XIMMessage,
    data: number,
    stringValue?: string,
    writeDataField: boolean = true
  ): void {
    if (typeof stringValue === 'string') {
      this.messageParser.writeMessageString(msg.msgAddr, stringValue);
    }
    if (writeDataField) {
      this.messageParser.writeData(msg.msgAddr, data);
    }
    this.execLibrary.replyMsg(msg.msgAddr);
  }

  /**
   * ZMODEM send (download to user) - emulate success/failure codes
   */
  handleZmodemSend(msg: XIMMessage): void {
    if (this.state.carrierDropped) {
      this.reply(msg, -2);
      return;
    }

    const targets = this.collectTransferList(msg, false);
    const resolved = targets
      .map((t) => ({ original: t, resolved: this.resolvePath(t) }))
      .filter((t) => t.resolved && this.pathExists(t.resolved));
    const staged = resolved.length > 0 ? this.stageDownloads(resolved.map((r) => r.resolved)) : null;

    console.log(
      `[XIMSystem] ZMODEMSEND: targets=${targets.join(', ')} staged=${staged}`
    );

    if (staged && staged.length > 0) {
      this.startZmodemTransfer('download', staged);
    }

    this.reply(msg, staged ? staged.length : 0);
  }

  /**
   * ZMODEM receive (upload from user)
   */
  handleZmodemReceive(msg: XIMMessage): void {
    if (this.state.carrierDropped) {
      this.reply(msg, -2);
      return;
    }

    const targetList = this.collectTransferList(msg, false);
    const dest = targetList[0] || '';
    const resolved = dest ? this.resolvePath(dest) : '';

    console.log(`[XIMSystem] ZMODEMRECEIVE: ${dest} -> ${resolved}`);

    if (!resolved) {
      this.reply(msg, 0);
      return;
    }

    const ensured = dest ? this.ensureUploadTarget(dest, resolved) : null;
    if (ensured) {
      this.startZmodemTransfer('upload', [ensured]);
    }
    this.reply(msg, ensured ? 1 : 0);
  }

  handleBatchZmodemSend(msg: XIMMessage): void {
    if (this.state.carrierDropped) {
      this.reply(msg, -2);
      return;
    }

    const targets = this.collectTransferList(msg, true);
    const resolved = targets.filter((t) => this.pathExists(this.resolvePath(t)));
    const staged = resolved.length > 0 ? this.stageDownloads(resolved.map((t) => this.resolvePath(t))) : null;

    console.log(
      `[XIMSystem] BATCHZMODEMSEND: count=${targets.length} staged=${staged}`
    );
    if (staged && staged.length > 0) {
      this.startZmodemTransfer('download', staged);
    }
    this.reply(msg, staged ? staged.length : 0);
  }

  handleNetTransfer(msg: XIMMessage): void {
    if (this.state.carrierDropped) {
      this.reply(msg, -2);
      return;
    }

    if (msg.command === XIMCommand.NETUPLOAD) {
      const targets = this.collectTransferList(msg, true);
      const dest = targets[0] || '';
      const resolved = dest ? this.resolvePath(dest) : '';
      console.log(`[XIMSystem] NETUPLOAD: ${dest} -> ${resolved}`);
      const ensured = dest ? this.ensureUploadTarget(dest, resolved) : null;
      if (ensured) {
        this.startZmodemTransfer('upload', [ensured]);
      }
      this.reply(msg, ensured ? 1 : 0);
      return;
    }

    const targets = this.collectTransferList(msg, false);
    const resolved = targets.filter((t) => this.pathExists(this.resolvePath(t)));
    const staged = resolved.length > 0 ? this.stageDownloads(resolved.map((t) => this.resolvePath(t))) : null;
    console.log(
      `[XIMSystem] NETDOWNLOAD: targets=${targets.join(',')} staged=${staged}`
    );
    if (staged && staged.length > 0) {
      this.startZmodemTransfer('download', staged);
    }
    this.reply(msg, staged ? staged.length : 0);
  }

  handleAcpCommand(msg: XIMMessage): void {
    const commandString = this.getMessageString(msg);
    const targetNode = typeof msg.lineNumber === 'number' ? msg.lineNumber : this.bbsSession?.nodeId || 0;
    console.log(
      `[XIMSystem] ACP_COMMAND: data=${msg.data} string="${commandString}" targetNode=${targetNode}`
    );
    (this.bbsSession as any).acpCommand = {
      code: msg.data,
      command: commandString,
      targetNode,
    };

    // Immediate side effects for known ACP codes (express.e shortcuts)
    switch (msg.data) {
      case 4: // Toggle chat
        (this.bbsSession as any).chatFlag = !(this.bbsSession as any).chatFlag;
        break;
      case 5: // Exit node / logoff
        (this.bbsSession as any).acpExit = true;
        break;
      case 10: // Offhook
        (this.bbsSession as any).offHook = true;
        break;
      case 11: // Quiet node
        (this.bbsSession as any).quietFlag = true;
        break;
      case -1: // Control command (no-op but record)
        break;
      case 1: // Sysop login
      case 2: // Instant login
      case 3: // AEShell
      case 6: // Local login
      case 8: // Accounts
      case 9: // Init modem
      case 13: // Node chat
      case 14: // SaveWin
      case 15: // NRAMS
        (this.bbsSession as any).quietFlag = false;
        break;
      case 7: // Reserve node
      case 12: // Node config
        (this.bbsSession as any).quietFlag = true;
        break;
      case 19: // Custom command
        break;
    }
    (this.bbsSession as any).acpLastAction = {
      code: msg.data,
      command: commandString,
      targetNode,
      timestamp: Date.now(),
    };
    // JH_UPDATE-like behavior: store last action for host/master handling
    this.reply(msg, 1);
  }

  handleAccountOrConf(msg: XIMMessage): void {
    switch (msg.command) {
      case XIMCommand.LOAD_ACCOUNT:
      case XIMCommand.EXT_LOAD_ACCOUNT:
        this.handleLoadAccountCommand(msg);
        break;
      case XIMCommand.SAVE_ACCOUNT:
      case XIMCommand.EXT_SAVE_ACCOUNT:
        this.handleSaveAccountCommand(msg);
        break;
      case XIMCommand.APPEND_ACCOUNT:
        this.handleAppendAccountCommand(msg);
        break;
      case XIMCommand.SEARCH_ACCOUNT:
        this.handleSearchAccountCommand(msg);
        break;
      case XIMCommand.LAST_ACCOUNTNUM:
        this.handleLastAccountNumCommand(msg);
        break;
      case XIMCommand.LOAD_CONFDB:
        this.handleLoadConfDbCommand(msg);
        break;
      case XIMCommand.SAVE_CONFDB:
        this.handleSaveConfDbCommand(msg);
        break;
      case XIMCommand.GET_CONFNUM:
        this.handleGetConfNumCommand(msg);
        break;
      default:
        this.reply(msg, 0);
    }
  }

  private resolvePath(amigaPath: string): string {
    const paths = this.getPaths();
    const resolved = paths.resolveAmigaPath(
      amigaPath,
      this.bbsSession?.nodeId ?? 0,
      undefined
    );
    if (this.pathExists(resolved)) {
      return resolved;
    }
    // If a bare filename, search Node{n}/Playpen for it (checkInPlaypens analogue)
    if (!/[/:\\]/.test(amigaPath)) {
      const playpenHit = this.checkInPlaypens(amigaPath);
      if (playpenHit) return playpenHit;
    }
    return resolved;
  }

  private getPaths(): BBSPaths {
    return new BBSPaths(
      this.bbsSession?.bbsPath ||
        process.env.BBS_DATA_DIR ||
        path.resolve(process.cwd())
    );
  }

  private pathExists(target: string): boolean {
    try {
      return fs.existsSync(target);
    } catch {
      return false;
    }
  }

  /**
   * Search all Node{n}/Playpen directories for a filename (express.e: checkInPlaypens)
   */
  private checkInPlaypens(filename: string): string | null {
    const root = this.getPaths().root();
    const maxNodes = 255;
    for (let i = 0; i < maxNodes; i++) {
      const nodeDir = path.join(root, `Node${i}`);
      if (!fs.existsSync(nodeDir)) continue;
      const candidate = path.join(nodeDir, 'Playpen', filename);
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    }
    return null;
  }

  private getPointerString(ptr?: number, maxLen: number = 255): string {
    if (!ptr || ptr <= 0) return '';
    return this.messageParser.readString(ptr, maxLen).replace(/\0.*$/, '');
  }

  private getMessageString(msg: XIMMessage): string {
    if (msg.string && msg.string.length > 0) {
      return msg.string;
    }
    const ptrStr = this.getPointerString(msg.stringPtr, DoorConstants.MESSAGE_STRING_CAPACITY);
    return ptrStr || '';
  }

  private collectTransferList(msg: XIMMessage, preferFiller1: boolean): string[] {
    const sources: string[] = [];
    if (preferFiller1 && msg.filler1) {
      const ptrStr = this.getPointerString(msg.filler1, 255);
      if (ptrStr) sources.push(ptrStr);
    }

    const ptrStr = this.getPointerString(msg.stringPtr, 255);
    if (ptrStr) sources.push(ptrStr);

    if (!preferFiller1 && msg.filler1) {
      const ptrAlt = this.getPointerString(msg.filler1, 255);
      if (ptrAlt) sources.push(ptrAlt);
    }

    if (msg.string) {
      sources.push(msg.string);
    }

    if (sources.length === 0) return [];

    const list: string[] = [];
    for (const raw of sources) {
      for (const item of this.parseFileList(raw)) {
        list.push(item);
      }
    }
    return list;
  }

  private parseFileList(raw: string): string[] {
    return raw
      .split(/[, \t\r\n]+/)
      .map((v) => v.trim())
      .filter((v) => v.length > 0);
  }

  private handleLoadAccountCommand(msg: XIMMessage): void {
    const slot = msg.data;
    const userPtr = msg.filler1 || 0;
    const keysPtr = msg.filler2 || 0;
    const miscPtr = msg.filler3 || 0;

    if (slot <= 0 || (!userPtr && !keysPtr && !miscPtr)) {
      this.reply(msg, 0);
      return;
    }

    const userBuf = userPtr ? this.readSlot(this.userDataPath(), slot, 239) : null;
    const keysBuf = keysPtr ? this.readSlot(this.userKeysPath(), slot, 54) : null;
    const miscBuf = miscPtr ? this.readSlot(this.userMiscPath(), slot, 256) : null;

    if (userBuf && userPtr) {
      this.writeBuffer(userPtr, userBuf);
    }
    if (keysBuf && keysPtr) {
      this.writeBuffer(keysPtr, keysBuf);
    }
    if (miscBuf && miscPtr) {
      this.writeBuffer(miscPtr, miscBuf);
    }

    const success = !!userBuf || !!keysBuf || !!miscBuf;
    this.messageParser.writeNodeId(msg.msgAddr, success ? 1 : 0);
    this.reply(msg, success ? 1 : 0);
  }

  private handleSaveAccountCommand(msg: XIMMessage): void {
    const userPtr = msg.filler1 || 0;
    const keysPtr = msg.filler2 || 0;
    const miscPtr = msg.filler3 || 0;

    if (!userPtr && !keysPtr && !miscPtr) {
      this.reply(msg, 0);
      return;
    }

    const userBuf = userPtr ? this.readBuffer(userPtr, 239) : null;
    const keysBuf = keysPtr ? this.readBuffer(keysPtr, 54) : null;
    const miscBuf = miscPtr ? this.readBuffer(miscPtr, 256) : null;

    let slot = userBuf ? this.readSlotNumber(userBuf) : 0;
    if (slot <= 0 && msg.data > 0) {
      slot = msg.data;
    }
    if (slot <= 0) {
      this.reply(msg, 0);
      return;
    }

    if (userBuf) {
      this.writeSlot(this.userDataPath(), slot, this.setSlotNumber(userBuf, slot), 239);
    }
    if (keysBuf) {
      this.writeSlot(
        this.userKeysPath(),
        slot,
        this.setUserKeysNumber(keysBuf, slot),
        54
      );
    }
    if (miscBuf) {
      this.writeSlot(this.userMiscPath(), slot, miscBuf, 256);
    }

    this.reply(msg, 1);
  }

  private handleAppendAccountCommand(msg: XIMMessage): void {
    const userPtr = msg.filler1 || 0;
    const keysPtr = msg.filler2 || 0;
    const miscPtr = msg.filler3 || 0;

    const slot = this.findFreeUserSlot();
    const userBuf = Buffer.alloc(239);
    const keysBuf = Buffer.alloc(54);
    const miscBuf = Buffer.alloc(256);

    this.setSlotNumber(userBuf, slot);
    this.setUserKeysNumber(keysBuf, slot);

    if (userPtr) this.writeBuffer(userPtr, userBuf);
    if (keysPtr) this.writeBuffer(keysPtr, keysBuf);
    if (miscPtr) this.writeBuffer(miscPtr, miscBuf);

    this.reply(msg, slot > 0 ? 1 : 0);
  }

  private handleSearchAccountCommand(msg: XIMMessage): void {
    const slot = msg.data;
    if (slot <= 0 || !msg.filler1) {
      this.reply(msg, 0);
      return;
    }

    const buf = this.readSlot(this.userKeysPath(), slot, 54);
    if (!buf) {
      this.reply(msg, 0);
      return;
    }

    this.writeBuffer(msg.filler1, buf);
    this.reply(msg, 1);
  }

  private handleLastAccountNumCommand(msg: XIMMessage): void {
    const dataPath = this.userDataPath();
    if (!fs.existsSync(dataPath)) {
      this.reply(msg, 0);
      return;
    }
    const stats = fs.statSync(dataPath);
    const total = Math.floor(stats.size / 239);
    this.reply(msg, total);
  }

  private handleLoadConfDbCommand(msg: XIMMessage): void {
    if (!msg.filler1 || msg.data <= 0) {
      this.reply(msg, 0);
      return;
    }

    const confNum = msg.nodeId && msg.nodeId > 0 ? msg.nodeId : this.bbsSession?.conferenceId || 1;
    const buf = this.readSlot(this.confDbPath(confNum), msg.data, 64);
    if (!buf) {
      this.reply(msg, 0);
      return;
    }

    this.writeBuffer(msg.filler1, buf);
    this.reply(msg, 1);
  }

  private handleSaveConfDbCommand(msg: XIMMessage): void {
    if (!msg.filler1 || msg.data <= 0) {
      this.reply(msg, 0);
      return;
    }

    const confNum = msg.nodeId && msg.nodeId > 0 ? msg.nodeId : this.bbsSession?.conferenceId || 1;
    const buf = this.readBuffer(msg.filler1, 64);
    this.writeSlot(this.confDbPath(confNum), msg.data, buf, 64);
    this.reply(msg, 1);
  }

  private handleGetConfNumCommand(msg: XIMMessage): void {
    const confNum = msg.data > 0 ? msg.data : this.bbsSession?.conferenceId || 1;
    const { name, path: confPath } = this.lookupConference(confNum);

    if (msg.filler1) {
      this.messageParser.writeString(msg.filler1, name, 54);
    }
    if (msg.filler2) {
      this.messageParser.writeString(msg.filler2, confPath, 54);
    }
    this.reply(msg, 1);
  }

  private userDataPath(): string {
    return path.join(this.getPaths().root(), 'User.data');
  }

  private lookupConference(confNum: number): { name: string; path: string } {
    const paths = this.getPaths();
    const confPath = paths.conference(confNum);

    // 1) Use ConfConfig.info if available
    try {
      const { loadConfConfig } = require('../../services/conf-config.service');
      const confConfig = loadConfConfig(paths.root());
      if (confConfig && confNum >= 1 && confNum <= confConfig.confCount) {
        const entry = confConfig.entries[confNum - 1];
        return {
          name: entry.name || `Conference ${confNum}`,
          path: entry.location || confPath,
        };
      }
    } catch (err) {
      console.warn('[XIMSystem] ConfConfig lookup failed:', err);
    }

    // 2) Fallback to Conf.DB handle if present
    try {
      const { conferenceFileManager } = require('../../services/ConferenceFileManager');
      const record = conferenceFileManager.readConferenceFile(confNum - 1);
      if (record && record.handle) {
        return { name: record.handle.trim(), path: confPath };
      }
    } catch (err) {
      console.warn('[XIMSystem] Conf.DB lookup failed:', err);
    }

    // 3) Last resort: generic name
    return { name: `Conference ${confNum}`, path: confPath };
  }

  private userKeysPath(): string {
    return path.join(this.getPaths().root(), 'User.keys');
  }

  private userMiscPath(): string {
    return path.join(this.getPaths().root(), 'user.misc');
  }

  private confDbPath(confNum: number): string {
    return path.join(this.getPaths().conference(confNum), 'Conf.DB');
  }

  private readSlot(filePath: string, slot: number, size: number): Buffer | null {
    try {
      if (!fs.existsSync(filePath)) return null;
      const fd = fs.openSync(filePath, 'r');
      try {
        const buffer = Buffer.alloc(size);
        const offset = (slot - 1) * size;
        const bytes = fs.readSync(fd, buffer, 0, size, offset);
        if (bytes < size) return null;
        return buffer;
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      console.error(`[XIMSystem] Failed to read slot ${slot} from ${filePath}:`, err);
      return null;
    }
  }

  private writeSlot(filePath: string, slot: number, buffer: Buffer, size: number): void {
    const target = Buffer.alloc(size);
    buffer.copy(target, 0, 0, Math.min(buffer.length, size));
    const offset = (slot - 1) * size;

    try {
      const dir = path.dirname(filePath);
      fs.mkdirSync(dir, { recursive: true });
      const fd = fs.openSync(filePath, fs.existsSync(filePath) ? 'r+' : 'w+');
      try {
        const stats = fs.fstatSync(fd);
        const needed = offset + size;
        if (stats.size < needed) {
          fs.writeSync(fd, Buffer.alloc(needed - stats.size), 0, needed - stats.size, stats.size);
        }
        fs.writeSync(fd, target, 0, size, offset);
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      console.error(`[XIMSystem] Failed to write slot ${slot} to ${filePath}:`, err);
    }
  }

  private readBuffer(addr: number, length: number): Buffer {
    const buf = Buffer.alloc(length);
    for (let i = 0; i < length; i++) {
      buf[i] = this.emulator.readMemory(addr + i);
    }
    return buf;
  }

  private writeBuffer(addr: number, buffer: Buffer): void {
    for (let i = 0; i < buffer.length; i++) {
      this.emulator.writeMemory(addr + i, buffer[i]);
    }
  }

  private readSlotNumber(buf: Buffer): number {
    if (buf.length < 85) return 0;
    const be = buf.readUInt16BE(83);
    const le = buf.readUInt16LE(83);
    return be !== 0 ? be : le;
  }

  private setSlotNumber(buf: Buffer, slot: number): Buffer {
    if (buf.length >= 85) {
      buf.writeUInt16BE(slot, 83);
      buf.writeUInt16LE(slot, 83);
    }
    return buf;
  }

  private setUserKeysNumber(buf: Buffer, slot: number): Buffer {
    if (buf.length >= 35) {
      buf.writeInt32BE(slot, 31);
      buf.writeInt32LE(slot, 31);
    }
    return buf;
  }

  private findFreeUserSlot(): number {
    const dataPath = this.userDataPath();
    if (!fs.existsSync(dataPath)) {
      return 1;
    }

    try {
      const fd = fs.openSync(dataPath, 'r');
      try {
        const stats = fs.fstatSync(fd);
        const count = Math.floor(stats.size / 239);
        const buf = Buffer.alloc(239);
        for (let i = 0; i < count; i++) {
          const bytes = fs.readSync(fd, buf, 0, 239, i * 239);
          if (bytes < 239) break;
          const be = buf.readUInt16BE(83);
          const le = buf.readUInt16LE(83);
          if (be === 0 || le === 0) {
            return i + 1;
          }
        }
        return count + 1;
      } finally {
        fs.closeSync(fd);
      }
    } catch (err) {
      console.error('[XIMSystem] findFreeUserSlot failed:', err);
      return 1;
    }
  }

  /**
   * Ensure an upload destination exists; if a directory is given, create a placeholder file.
   */
  private ensureUploadTarget(originalPath: string, resolvedPath: string): string | null {
    try {
      let targetPath = resolvedPath;
      const stat = fs.existsSync(resolvedPath) ? fs.statSync(resolvedPath) : null;

      // If a directory or trailing separator, place file in that directory using the provided filename (or default)
      if (stat?.isDirectory() || resolvedPath.endsWith(path.sep)) {
        const baseName =
          path.basename(originalPath) && path.basename(originalPath) !== path.sep
            ? path.basename(originalPath)
            : `upload_${Date.now()}.bin`;
        targetPath = path.join(resolvedPath, baseName);
      }

      // If no stat and no directory separators, place into node playpen
      if (!stat && !resolvedPath.includes(path.sep)) {
        const playpen = this.getPaths()
          .node(this.bbsSession?.nodeId ?? 0)
          .playpen();
        fs.mkdirSync(playpen, { recursive: true });
        const baseName =
          path.basename(originalPath) && path.basename(originalPath) !== path.sep
            ? path.basename(originalPath)
            : resolvedPath || `upload_${Date.now()}.bin`;
        targetPath = path.join(playpen, baseName);
      }

      fs.mkdirSync(path.dirname(targetPath), { recursive: true });

      return targetPath;
    } catch (err) {
      console.error('[XIMSystem] Failed to prepare upload target:', err);
      return null;
    }
  }

  /**
   * Gather outgoing downloads. Unlike the earlier staging copy, express.e sends the real file path;
   * here we just return existing resolved paths (no copy). Returns null on failure, [] if none.
   */
  private stageDownloads(resolvedFiles: string[]): string[] | null {
    try {
      const files = resolvedFiles.filter((p) => this.pathExists(p));
      return files;
    } catch (err) {
      console.error('[XIMSystem] stageDownloads failed:', err);
      return null;
    }
  }

  /**
   * Enable raw transfer mode and notify frontend to start raw channel
   */
  private startZmodemTransfer(direction: TransferDirection, paths: string[]): void {
    const sendFn =
      (this.bbsSession as any)?.transferRawSend ||
      ((buf: Buffer) => this.socket.emit('transfer-raw:data', buf));

    const transportType: 'web' | 'telnet' | 'ssh' =
      this.bbsSession?.connectionType === 'ssh'
        ? 'ssh'
        : this.bbsSession?.connectionType === 'telnet'
          ? 'telnet'
          : 'web';

    const transport: TransferTransport = {
      type: transportType,
      send: sendFn,
    };

    const manager = new ZmodemTransferManager({
      session: this.bbsSession as any,
      transport,
      direction,
      paths,
      onComplete: (_ok, detail) => {
        if (transport.type === 'web') {
          this.socket.emit('transfer-raw:complete');
        }
        const list = (detail?.received || detail?.sent || []).join(', ');
        if (list.length > 0) {
          this.socket.emit('ansi-output', `\r\nTransfer complete: ${list}\r\n`);
        } else {
          this.socket.emit('ansi-output', '\r\nTransfer complete.\r\n');
        }
      },
    });

    (this.bbsSession as any).transferRawSink = (buf: Buffer) => manager.handleInput(buf);
    (this.bbsSession as any).transferManager = manager;
    (this.bbsSession as any).transferRawActive = true;
    (this.bbsSession as any).transferRawSend = sendFn;

    // Notify frontend/web clients so they can start their side of the negotiation
    if (transport.type === 'web') {
      this.socket.emit('transfer-raw:init', {
        direction,
        paths,
      });
    } else {
      this.socket.emit(
        'ansi-output',
        `\r\nStarting ZMODEM ${direction === 'download' ? 'send' : 'receive'} ...\r\n`
      );
    }

    manager.start();
  }
}

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

import { conferenceAmigaPath } from '../conferences/conference-paths';
import { isIOCommand, isDataQueryCommand } from './xim/command-classes';
import { config as appConfig } from '../config';
import { MoiraEmulator } from './cpu/MoiraEmulator';
import { ExecLibrary } from './api/ExecLibrary';
import { Socket } from 'socket.io';
import { XIMCommand, BBSSessionData, XIMState, XIMMessage, isCommandInfoRequestCommand } from './xim/types';
import { DoorConstants } from './DoorTypes';
import { XIMMessageParser } from './xim/messages';
import { loggableXimString } from './xim/redact';
import { DEFAULT_PAUSE_LINES } from '../screens/screen-rows';
import { XIMIOHandler } from './xim/io';
import { XIMDataQueryHandler } from './xim/data-query';
import { XIMBBSInfoHandler } from './xim/bbs-info';
import { XIMSystemCommandsHandler } from './xim/system-commands';
import { handleSetPointer } from './xim/msgpointer';
import { handlePostMessage, postMessageAnswer } from './xim/postmsg';
import { userFieldAnswer } from './xim/userfield';
import type { BBSSession } from '../index';
import { ximDebugLogger } from './xim/debug-logger';
import { getDoorLogger, DoorLogger } from './DoorLogger';
import { ximLogger } from '../utils/XIMLogger';
import { debugLog } from '../utils/debug-log';
import * as amigafs from '../utils/amigafs';
import { debugRegistry } from '../debug/DebugRegistry';
import * as net from 'net';
import { amigaGaps, doorOf } from './instrumentation/amiga-gaps';
import { XIM_DOOR_COMMAND_ADDR } from './memory-map';

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
  // Reference to AEDoorLibrary for hybrid-door input-injection gating.
  // Wired up after construction because aedoor.library is built after XIMProtocol.
  private aedoorLibrary: any = null;

  /**
   * Wire up AEDoorLibrary (used only by shouldInjectNativeInput to detect
   * that a synchronous trap handler is stuck in waitForReply, where async
   * user input needs to be pushed into the door's replyPort via PutMsg).
   */
  setAedoorLibrary(aedoorLibrary: any): void {
    this.aedoorLibrary = aedoorLibrary;
  }

  // Specialized handlers
  private messageParser: XIMMessageParser;
  private ioHandler: XIMIOHandler;
  private dataQueryHandler: XIMDataQueryHandler;
  private bbsInfoHandler: XIMBBSInfoHandler;
  private systemCommandsHandler: XIMSystemCommandsHandler;
  private messageLogger: ((msg: XIMMessage, commandName?: string) => void) | null = null;
  private doorLogger: DoorLogger | null = null;

  // Telnet passthrough session state (express.e:3051-3302)
  private telnetState: {
    usernamePrompt: string;
    username: string;
    passwordPrompt: string;
    password: string;
    connection: net.Socket | null;
    connected: boolean;
    pendingMsgAddr: number;
    originalInputHandler: ((data: string) => void) | null;
  } = {
    usernamePrompt: '',
    username: '',
    passwordPrompt: '',
    password: '',
    connection: null,
    connected: false,
    pendingMsgAddr: 0,
    originalInputHandler: null
  };

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
debugLog(`[XIMProtocol] CONSTRUCTOR CALLED - bbsSession type: ${typeof bbsSession}, has doorCommand: ${!!bbsSession?.doorCommand}, has doorId: ${!!bbsSession?.doorId}`);
    this.doorCommand = bbsSession?.doorCommand || bbsSession?.doorId || bbsSession?.doorName || '';
debugLog(`[XIMProtocol] doorCommand="${this.doorCommand}" (from: doorCommand=${bbsSession?.doorCommand}, doorId=${bbsSession?.doorId}, doorName=${bbsSession?.doorName})`);

    // The door command string, in memory-map.ts "the XIM door command".
    if (this.doorCommand) {
      this.doorCommandAddr = XIM_DOOR_COMMAND_ADDR;
      const bufferSize = this.doorCommand.length + 1;

      // Write the command string to this fixed address
      for (let i = 0; i < this.doorCommand.length; i++) {
        this.emulator.writeMemory(this.doorCommandAddr + i, this.doorCommand.charCodeAt(i));
      }
      this.emulator.writeMemory(this.doorCommandAddr + this.doorCommand.length, 0); // null terminator

      // Verify immediately
      const verifyStr = this.emulator.readString(this.doorCommandAddr, bufferSize);
debugLog(`[XIMProtocol] Wrote door command to fixed address 0x${this.doorCommandAddr.toString(16)}`);
debugLog(`[XIMProtocol]   Wrote: "${this.doorCommand}" -> Read back: "${verifyStr}"`);
    }

    // Store iconLibrary for command .info file loading
    this.iconLibrary = iconLibrary;

    // Command .info files are NOT pre-loaded for doors: real AmiExpress does
    // not, and AquaScan works without DOORUSE tooltypes.

    const userLineLength =
      this.bbsSession?.user?.linesPerScreen ??
      this.bbsSession?.user?.lineLength ??
      this.bbsSession?.user?.pageLength;
    const defaultLineLength = userLineLength && userLineLength > 0 ? userLineLength : DEFAULT_PAUSE_LINES;
    const wrapWidth = this.bbsSession?.lineWrap ?? 80;

    // Generate unique debug ID to track state object identity
    const stateDebugId = `state_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
debugLog(`[XIMProtocol] Creating state object with debugId: ${stateDebugId}`);

    this.state = {
      registered: false,
      shuttingDown: false,
      nonStopText: !!this.bbsSession?.nonStopText,
      autoPauseEnabled: !!this.bbsSession?.autoPauseEnabled,
      lineCount: this.bbsSession?.lineCount ?? 0,
      lineWrap: wrapWidth,
      pauseLines: this.bbsSession?.pauseLines ?? defaultLineLength,
      language: this.bbsSession?.language || 'txt',
      // confAccess is read from disk files (user.data) by door.handler.ts
      // Do NOT fall back to bbsSession.user.confAccess - that's SQLite data
      // Default to full access (25 conferences) if not set
      confAccess: this.bbsSession?.confAccess || 'XXXXXXXXXXXXXXXXXXXXXXXXX',
      carrierDropped: false,
      rawArrow: false,  // Default: convert arrow escape sequences to internal codes
      transfering: false,  // File transfer in progress flag (express.e:3383)
      doorSilent: false,   // Silent door output flag (express.e:3383)
      returnCommand: this.bbsSession?.returnCommand,
      prvCommand: undefined,
      chainCommand: undefined,
      logonType: this.bbsSession?.logonType,
      doorCommand: this.doorCommand || undefined,
      _debugId: stateDebugId,  // Debug: track state object identity
      // CRITICAL: Pass XIM port address so handlers can send replies back
      ximPortAddr: doorPort,
      aePortAddr: doorPort,
      doorPortAddr: doorPort,
      // Native door detection - starts false, set by 500ms timer if no XIM commands
      isNativeDoor: false,
      // CRITICAL: Explicitly initialize usedXimInput to false for each door session
      // This prevents state leakage from previous door sessions
      usedXimInput: false,
    } as XIMState;

    console.log(`[XIMProtocol] New XIM state created with usedXimInput=${this.state.usedXimInput} doorPort=0x${doorPort.toString(16)}`);


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

    // Initialize door logger for XIM command logging
    const doorName = this.doorCommand || bbsSession?.doorName || bbsSession?.doorId || 'unknown';
    const nodeId = bbsSession?.nodeId || 1;
    this.doorLogger = getDoorLogger(doorName, nodeId);

debugLog('[XIMProtocol] Initialized');
debugLog(`  Door Port: 0x${doorPort.toString(16)}`);
debugLog(`  BBS Session: ${bbsSession ? 'Provided' : 'None'}`);
    if (bbsSession?.user) {
debugLog(`  User: ${bbsSession.user.username || 'Unknown'}`);
    }
  }

  setMessageLogger(logger: (msg: XIMMessage, commandName?: string) => void): void {
    this.messageLogger = logger;
  }

  /**
   * Update the XIM port address used for replies.
   * This is called when we discover the actual port the door created.
   * Native AEDoor.library creates its own AEDoorPort{nodeId}, which may be
   * different from the AEServer.{nodeId} we pre-created.
   */
  setXimPortAddress(addr: number): void {
console.log(`[XIMProtocol] setXimPortAddress: UPDATING port from 0x${this.doorPort.toString(16)} to 0x${addr.toString(16)}`);
debugLog(`[XIMProtocol] Updating port address from 0x${this.doorPort.toString(16)} to 0x${addr.toString(16)}`);
    this.doorPort = addr;
    this.state.ximPortAddr = addr;
    this.state.aePortAddr = addr;
    this.state.doorPortAddr = addr;
    // Also update the systemCommandsHandler's cached port address
    if ((this.systemCommandsHandler as any).ximPortAddr !== undefined) {
      (this.systemCommandsHandler as any).ximPortAddr = addr;
    }
  }

  /**
   * Check if waiting for line input from user
   */
  isWaitingForLineInput(): boolean {
    // JH_EF's editor too: its handler replies and resumes the door itself.
    return this.ioHandler.isWaitingForLineInput() || this.systemCommandsHandler.isEditingForCaller();
  }

  /**
   * Check if there's queued input available for immediate processing
   */
  hasQueuedInput(): boolean {
    return this.ioHandler.hasQueuedInput();
  }

  /**
   * Clear any queued input from before the door started.
   * Called when a new door session begins to prevent leftover keystrokes
   * (e.g., Enter presses during login) from auto-responding to door prompts.
   */
  clearQueuedInput(): void {
    this.ioHandler.clearQueuedInput();
  }

  /**
   * Queue input from terminal for door to read via GETKEY or JH_LI
   * Called from AmigaDoorSession when 'door:input' event received
   */
  /** True while a prompt is parked on the caller - see XIMIOHandler. */
  isWaitingForCaller(): boolean {
    return this.ioHandler.isWaitingForCaller() || this.systemCommandsHandler.isEditingForCaller();
  }

  queueInput(data: string): void {
    this.ioHandler.queueInput(data);
  }

  /**
   * Inject input directly to AEDoorPort for native 68K doors that poll GetMsg.
   * Native AEDoor.library doors don't send JH_HK commands - they poll GetMsg
   * waiting for BBS to proactively send JH_HK messages.
   *
   * This creates a JH_HK message and calls PutMsg to queue it on AEDoorPort.
   * The door's next GetMsg() call will receive the keystroke.
   */
  injectInputToNativeDoor(keyChar: string): void {
console.log(`[XIMProtocol] injectInputToNativeDoor CALLED with '${keyChar}' (0x${keyChar.charCodeAt(0).toString(16)}) registered=${this.state.registered} doorPort=0x${this.doorPort.toString(16)}`);
    if (!this.state.registered) {
console.log('[XIMProtocol] Cannot inject input - door not registered');
debugLog('[XIMProtocol] Cannot inject input - door not registered');
      return;
    }

    if (this.doorPort === 0) {
console.log('[XIMProtocol] Cannot inject input - no door port address');
debugLog('[XIMProtocol] Cannot inject input - no door port address');
      return;
    }

console.log(`[XIMProtocol] Injecting input '${keyChar}' (0x${keyChar.charCodeAt(0).toString(16)}) to AEDoorPort 0x${this.doorPort.toString(16)}`);
debugLog(`[XIMProtocol] Injecting input '${keyChar}' (0x${keyChar.charCodeAt(0).toString(16)}) to AEDoorPort 0x${this.doorPort.toString(16)}`);

    // Allocate memory for jhMessage structure
    const MEMF_PUBLIC_CLEAR = 0x10001;
    const msgSize = DoorConstants.MESSAGE_TOTAL_LENGTH; // 0x150 = 336 bytes (extended)
    const msgAddr = this.execLibrary.allocMem(msgSize, MEMF_PUBLIC_CLEAR);

    if (msgAddr === 0) {
console.error('[XIMProtocol] Failed to allocate message for input injection');
      return;
    }

debugLog(`[XIMProtocol] Allocated message at 0x${msgAddr.toString(16)}`);

    // Set up Exec message header (mn_Node + mn_ReplyPort + mn_Length)
    // Message header: offsets 0-19
    this.emulator.writeMemory(msgAddr + 8, 5);  // ln_Type = NT_MESSAGE
    this.emulator.writeMemory(msgAddr + 9, 0);  // ln_Pri = 0

    // mn_ReplyPort at offset 14 - use door's reply port so it can reply
    // If we don't have the door's reply port, use the AEDoorPort (door will see it's from BBS)
    const replyPort = this.doorReplyPort || this.doorPort;
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_REPLY_PORT_OFFSET, replyPort);

    // mn_Length at offset 18
    this.emulator.writeMemory16(msgAddr + DoorConstants.MESSAGE_LENGTH_OFFSET, msgSize);

    // Set jhMessage fields
    // Command = JH_HK (6) at offset 0xE0
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_COMMAND_OFFSET, XIMCommand.JH_HK);

    // Data = key code at offset 0xDC
    const keyCode = keyChar.charCodeAt(0);
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_DATA_OFFSET, keyCode);

    // Write key character to string buffer at offset 0x14
    this.emulator.writeMemory(msgAddr + DoorConstants.MESSAGE_STRING_OFFSET, keyCode);
    this.emulator.writeMemory(msgAddr + DoorConstants.MESSAGE_STRING_OFFSET + 1, 0); // null terminator

    // StringPtr at offset 0x100 - point to embedded string buffer
    const stringAddr = msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_STRING_PTR_OFFSET, stringAddr);

    // NodeId at offset 0xE4
    const nodeId = this.bbsSession?.nodeId ?? 1;
    this.emulator.writeMemory32(msgAddr + DoorConstants.MESSAGE_NODE_OFFSET, nodeId);

    // Log the injection
    ximLogger.log('debug', 'send', this.doorCommand || 'UNKNOWN', nodeId, {
      type: 'JH_HK',
      typeCode: XIMCommand.JH_HK,
      param: keyCode,
      data: keyChar,
    }, {
      msgAddr: `0x${msgAddr.toString(16)}`,
      message: 'Injected input to native door via PutMsg',
    });

    // CRITICAL FIX: Send to door's reply port, NOT AEDoorPort!
    // HYBRID doors (like quicklogin) poll their reply port for input, not AEDoorPort.
    // After sending XIM output commands, they wait on their reply port for input.
    const targetPort = this.doorReplyPort || this.doorPort;
    console.log(`[XIMProtocol] Injecting to port 0x${targetPort.toString(16)} (doorReplyPort=0x${(this.doorReplyPort || 0).toString(16)}, doorPort=0x${this.doorPort.toString(16)})`);
debugLog(`[XIMProtocol] Calling PutMsg(0x${targetPort.toString(16)}, 0x${msgAddr.toString(16)}) [reply port injection]`);
    this.execLibrary.putMsg(targetPort, msgAddr, { suppressDoorCallback: true });

debugLog(`[XIMProtocol] Input injected successfully`);
  }

  /**
   * Check if native door input injection should be used.
   * Returns true ONLY for truly native doors that poll GetMsg without XIM protocol.
   *
   * XIM doors (like dRE!WAll, JoinCnf) send JH_HK/JH_LI to request input - they
   * receive input via reply to their request, NOT via injected messages.
   *
   * Native doors don't speak XIM protocol - they just poll GetMsg waiting for
   * the BBS to send them input messages proactively.
   */
  shouldInjectNativeInput(): boolean {
    const isRegistered = this.state.registered;
    const isWaiting = this.ioHandler.isWaitingForLineInput();
    const isNativeDoor = this.state.isNativeDoor === true;
    const usedXimInput = this.state.usedXimInput === true;

console.log(`[XIMProtocol] shouldInjectNativeInput: registered=${isRegistered} waiting=${isWaiting} isNative=${isNativeDoor} usedXimInput=${usedXimInput} doorPort=0x${this.doorPort.toString(16)}`);
    debugLog(`[XIMProtocol] shouldInjectNativeInput: registered=${isRegistered} waiting=${isWaiting} isNative=${isNativeDoor} usedXimInput=${usedXimInput}`);

    // Must be registered
    if (!isRegistered) {
      return false;
    }

    // CRITICAL FIX 2026-01-15: If door has EVER used XIM input commands (JH_HK, JH_LI, JH_PM),
    // NEVER inject native input. The door expects replies to its requests, not injected messages.
    // This fixes dRE!WAll and other XIM doors that were receiving double messages.
    if (usedXimInput) {
      debugLog(`[XIMProtocol] shouldInjectNativeInput: Door used XIM input commands - NOT injecting`);
      return false;
    }

    // If waiting for line input/hotkey via XIM commands, don't inject
    // The door sent JH_HK and is waiting for a reply - use queueInput instead
    if (isWaiting) {
      return false;
    }

    // For native doors (detected by the 500ms post-register silence timer),
    // always inject. cancelOldStyleDoorTimer() clears isNativeDoor the moment
    // the door sends any XIM command, so this only stays true for doors that
    // never speak XIM at all.
    if (isNativeDoor) {
      return true;
    }

    // AEDoor.library hybrid case: doors like SysInfo/zOOsTAT call
    // AEDoor.library.Prompt(), whose C-side trap handler runs a synchronous
    // waitForReply tight loop polling the door's replyPort. The loop holds
    // the JS event loop, so async socket input can't land on the port in
    // time — without injection the loop times out every 10000 iters and the
    // door re-prompts forever. When waitForReply is active, push input as
    // JH_HK messages into replyPort so the polling sees them.
    //
    // Critically scoped: WarOLM / dRE!WAll / AquaScan don't go through
    // AEDoor.library.Prompt, so inWaitForReply is false for them and we
    // still skip the eager injection that 2026-04-20 removed.
    if (this.aedoorLibrary?.isInWaitForReply?.()) {
      debugLog(`[XIMProtocol] shouldInjectNativeInput: AEDoor.library in waitForReply - injecting`);
      return true;
    }

    return false;
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
debugLog('[XIMProtocol] Discovered door reply port: 0x' + msg.replyPort.toString(16));
    }

    return msg;
  }

  /**
   * Handle incoming XIM message from door
   * Routes to appropriate specialized handler based on command type
   */
  async handleMessage(msg: XIMMessage): Promise<void> {
    // Reset reply flag at the start of each message
    // System commands set this to true when they send their own reply
    this.state.replyHandled = false;

    const humanName = this.messageParser.getCommandName(msg.command);
    // What every log below says the String was: a password is withheld (redact.ts).
    const logged = loggableXimString(msg.command, msg.data, msg.string);
    console.log(`[XIMProtocol] handleMessage: cmd=${msg.command} (${humanName}) usedXimInput=${this.state.usedXimInput} string="${logged.substring(0, 50)}"`);

    // Push onto the live debug ring buffer (dev-only, no-op in production).
    // CRITICAL: uses a top-level static import of debugRegistry — NOT `await import()`.
    // Any async yield here would suspend handleMessage before handleDataQuery runs,
    // and the synchronous AEDoor.library trap path (waitForReply → XIMProcessor
    // callback in DoorLifecycleManager) would deliver a stale reply before the
    // data-query handler had a chance to write msg.string. See dRE!WAll bug:
    // Documentation/6-Progress/dRE_WALL_HANDOFF.md.
    if (process.env.NODE_ENV !== "production") {
      try {
        const rawNode = (this.bbsSession as any)?.nodeId ?? (this.bbsSession as any)?.nodeNumber;
        const nodeId = typeof rawNode === "string" ? parseInt(rawNode, 10) : rawNode;
        if (typeof nodeId === "number" && nodeId > 0) {
          debugRegistry.pushXIM(nodeId, {
            timestampMs: Date.now(),
            direction: "rx",
            cmd: msg.command,
            cmdName: humanName,
            data: msg.data ?? 0,
            node: msg.nodeId ?? nodeId,
            line: msg.lineNumber ?? 0,
            str: logged.slice(0, 200),
          });
        }
      } catch { /* debug ring push failure is fine */ }
    }

    // Log incoming message to XIM debug log
    ximDebugLogger.logMessage(msg.command, humanName, 'RECV', {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      data: msg.data,
      string: logged,
      stringPtr: msg.stringPtr ? `0x${msg.stringPtr.toString(16)}` : null,
      nodeId: msg.nodeId,
      lineNumber: msg.lineNumber
    });

    // Log to structured JSON logger
    ximLogger.log('debug', 'receive', this.doorCommand || 'UNKNOWN', this.bbsSession.nodeId || 1, {
      type: humanName,
      typeCode: msg.command,
      param: msg.data,
      data: logged || undefined,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      port: this.doorReplyPort ? `0x${this.doorReplyPort.toString(16)}` : undefined,
    });

debugLog(
      `[XIMProtocol] <<< XIM Command: ${msg.command} (${humanName}) data=${msg.data} string="${logged}"`
    );

    // Log in Amiga CONSOLE_DEBUG format for direct comparison with real Amiga logs
    // Note: This logs the REQUEST. The response will be logged by the handler after filling in values.
    if (ximLogger.isAmigaEnabled()) {
      ximLogger.logAmigaMessage(msg.command, msg.data, logged);
    }

    // Log to door log file for debugging
    if (this.doorLogger) {
      this.doorLogger.xim('RX', `${msg.command} (${humanName})`, `data=${msg.data} str="${logged}"`);
    }

    // AEDoor.library startup handshake:
    // - JH_INIT (cmd 0) with string "INIT"
    // - JH_STAT (cmd 1) with data pointing at node status and string "NODE ... STATUS READY"
    // These must be replied to without JH_LI/JH_REGISTER handling.
    const initString = (msg.string || '').trim().toUpperCase();
    const isAedoorInit =
      msg.command === XIMCommand.JH_LI &&
      initString === 'INIT';
    const isAedoorStat =
      msg.command === XIMCommand.JH_REGISTER &&
      msg.data !== undefined &&
      msg.data > 0x100 &&
      initString.startsWith('NODE ') &&
      initString.includes('STATUS');
    if (isAedoorInit || isAedoorStat) {
      const label = isAedoorInit ? 'JH_INIT' : 'JH_STAT';
debugLog(`[XIMProtocol] AEDoor handshake detected: ${label} (no reply needed)`);
      // CRITICAL: INIT/STAT messages have NULL reply port (mn_ReplyPort=0)
      // Door just reads them and continues - no reply needed
      // Calling ReplyMsg with NULL port causes errors
      const replyPort = this.emulator.readMemory32(msg.msgAddr + 14); // mn_ReplyPort at offset 14
      if (replyPort === 0) {
debugLog(`[XIMProtocol]   ${label} has NULL reply port - skipping ReplyMsg (correct behavior)`);
        return;
      }
      // Write XIM port into msg.command before replying — door reads this to discover
      // which port to use for subsequent BBS communication (express.e:3447).
      if (this.doorPort) {
        this.messageParser.writeCommand(msg.msgAddr, this.doorPort);
      }
      // Log outgoing reply to XIM structured logger
      ximLogger.log('debug', 'send', this.doorCommand || 'UNKNOWN', this.bbsSession.nodeId || 1, {
        type: `${label}_REPLY`,
        typeCode: msg.command,
        param: 0,
      }, {
        msgAddr: `0x${msg.msgAddr.toString(16)}`,
        message: 'AEDoor handshake reply',
      });
      this.execLibrary.replyMsg(msg.msgAddr);
      return;
    }

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

    // Cancel old-style door timer if we receive data/environment requests
    // This indicates a modern door that actively queries BBS state
    if (msg.command !== XIMCommand.JH_REGISTER) {
      this.systemCommandsHandler.cancelOldStyleDoorTimer(msg.command);
    }

    if (process.env.DREWALL_TRACE === '1' && msg.command === 100) {
      console.log(`[DT_NAME_DEBUG] router: cmd=${msg.command} shuttingDown=${this.state.shuttingDown} isSystem=${this.isSystemCommand(msg.command)} isIO=${isIOCommand(msg.command)} isDataQ=${isDataQueryCommand(msg.command)}`);
    }
    // Handle system commands first (register/shutdown and others)
    if (this.isSystemCommand(msg.command)) {
      this.handleSystemCommand(msg);
      return;
    }

    // NOTE: No registration gate! Express.e (lines 4352-4370) processes ALL XIM
    // messages without requiring JH_REGISTER first. Doors like zOOsTAT send JH_LI
    // before JH_REGISTER as part of their initialization sequence.
    // The registration just records the door is active - it doesn't gate commands.
    if (!this.state.registered) {
debugLog(`[XIMProtocol] Processing command ${humanName} before JH_REGISTER (allowed per express.e)`);
    }

    if (this.state.shuttingDown && msg.command !== XIMCommand.JH_SHUTDOWN) {
console.warn('[XIMProtocol] Door requested commands after shutdown, replying with 0');
      this.messageParser.writeData(msg.msgAddr, 0);
      // Log outgoing reply to XIM structured logger
      ximLogger.log('warn', 'send', this.doorCommand || 'UNKNOWN', this.bbsSession.nodeId || 1, {
        type: `${humanName}_REJECTED`,
        typeCode: msg.command,
        param: 0,
      }, {
        msgAddr: `0x${msg.msgAddr.toString(16)}`,
        message: 'Rejected: door shutting down',
      });
      this.execLibrary.replyMsg(msg.msgAddr);
      return;
    }

    // I/O Commands - handled by XIMIOHandler
    if (isIOCommand(msg.command)) {
      await this.handleIOCommand(msg);
      return;
    }

    // Data Query Commands (DT_*) - handled by XIMDataQueryHandler
    if (isDataQueryCommand(msg.command)) {
      this.dataQueryHandler.handleDataQuery(msg);
      return;
    }

    // Command-related handlers (GET_CUSTOM_MSGBASE_MENUCMD, GET_CMD_TOOLTYPE, etc.)
    // These MUST be checked BEFORE isBBSInfoCommand because they live in the same
    // numeric neighborhood (500-620) as BB_* commands such as BB_NONSTOPTEXT (525).
    // GET_CUSTOM_MSGBASE_MENUCMD uses command 605, so 525 is free for BB_NONSTOPTEXT.
    if (this.isCommandInfoRequest(msg.command)) {
      this.handleCommandInfoRequest(msg);
      return;
    }

    // BBS Info Commands (BB_*) - handled by XIMBBSInfoHandler
    if (this.isBBSInfoCommand(msg.command)) {
      this.handleBBSInfoCommand(msg);
      return;
    }

    // CMD 40: Custom prompt+input command used by doors like GetAnswer
    // The door sends a prompt string and expects to wait for user input
    // Handle like JH_PM (prompt message) - display string and wait for line input
    if (msg.command === 40) {
      debugLog(`[XIMProtocol] CMD 40 (custom prompt): "${msg.string}" - treating as prompt+input`);
      // Wait for line input via the IO handler
      // handleLineInput will display the string as the prompt
      // CRITICAL: Set data to positive value to force handleLineInput to wait for input
      // (data=0 causes auto-reply which breaks input prompts)
      // Create a copy of msg with data set to 80 (typical line length)
      const inputMsg = { ...msg, data: msg.data > 0 ? msg.data : 80 };
      await this.ioHandler.handleLineInput(inputMsg);
      return;
    }

    // Commands 21-99: Undefined gap between JH_* (0-20) and DT_* (100+) ranges
    // Some doors echo back the JH_REGISTER reply command value (which contains userLineLen).
    // Common values: 23 (user line length), 29 (default when no user logged in)
    // These appear to be capability/feature checks. Return 0 (not active/not supported).
    if (msg.command >= 21 && msg.command <= 99) {
      // Was a synchronous fs.appendFileSync per command on this hot path
      // (~3-5ms disk I/O each). Route through the gated debug logger instead.
      debugLog(`[XIMProtocol] CMD ${msg.command} (undefined range 21-99): data=${msg.data} -> replying 0`);
      this.sendReply(msg, 0);
      return;
    }

    // Unknown command - match express.e DEFAULT behavior (line 4221-4228)
    // express.e just logs a warning and does NOT modify msg.data - reply with data unchanged
debugLog(`[XIMProtocol] ⚠️ UNHANDLED COMMAND: ${msg.command} (0x${msg.command.toString(16)})`);
        amigaGaps.record('xim', `command ${msg.command} (0x${msg.command.toString(16)})`, doorOf(this.emulator));
debugLog(`[XIMProtocol]   Message details: msgAddr=0x${msg.msgAddr.toString(16)}, data=${msg.data}, string="${logged}"`);
    this.sendReply(msg, msg.data);
  }

  /**
   * Check if command is a command-info request (GET_CUSTOM_MSGBASE_MENUCMD, GET_CMD_TOOLTYPE)
   */
  private isCommandInfoRequest(command: number): boolean {
    // Single source of truth in xim/types.ts. 605 = GET_CUSTOM_MSGBASE_MENUCMD,
    // 707 = GET_CMD_TOOLTYPE. (Historically checked literal 551, but 551 is
    // SETMCIOFF — caught upstream by isSystemCommand — so that clause was dead
    // and GET_CMD_TOOLTYPE fell through to the unknown-command default.)
    if (isCommandInfoRequestCommand(command)) {
debugLog(`[XIMProtocol] isCommandInfoRequest(${command}) -> TRUE`);
      return true;
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

    if (command === XIMCommand.GET_CUSTOM_MSGBASE_PARAM1
        || command === XIMCommand.GET_CUSTOM_MSGBASE_PARAM2) {
      /*
       * express.e:3959-3962 - the two numbers a CUSTOM message base is called
       * with: WHICH message function (MAIL_READ, MAIL_CREATE, MAIL_SCAN, ...)
       * and WHICH conference. `customMsgbaseCmd` sets them immediately before
       * the launch (express.e:12433-12434) and `services/custom-msgbase.ts`
       * does the same here, on the session.
       *
       * ZERO when no custom invocation is in flight, which is what express.e's
       * globals hold at that point too (:273-274). A door reading 0 is being
       * told "you were not launched as a message base" - which is the answer
       * on every board that has no CUSTOM conference, and the reason SUBS
       * draws its full screen for an unrecognised launch.
       */
      const isParam1 = command === XIMCommand.GET_CUSTOM_MSGBASE_PARAM1;
      const value = Number(
        (isParam1
          ? (this.bbsSession as any)?.customMsgParam1
          : (this.bbsSession as any)?.customMsgParam2) || 0,
      );
debugLog(`[XIMProtocol] ${isParam1 ? 'GET_CUSTOM_MSGBASE_PARAM1' : 'GET_CUSTOM_MSGBASE_PARAM2'}: ${value}`);
      this.sendReply(msg, value);
      return;
    }

    if (command === XIMCommand.GET_CUSTOM_MSGBASE_MENUCMD) {
      /*
       * express.e:3974-3975 answers this with `customMsgCmd` - the command
       * LINE a CUSTOM message base was invoked with, empty for a scan or a
       * stats call that nobody typed.
       *
       * This port has always answered it with the name of the command that
       * launched the door instead ("FR", "SUBSCAN"), which doors here use for
       * their DOORUSE.<cmd> lookups and which SUBS uses to tell its two
       * registrations apart. That extension stays - removing it would break
       * every door on this board - but a real custom invocation WINS, because
       * inside one the express.e answer is the correct one and a door written
       * for a real Amiga expects it.
       */
      const customCmd = (this.bbsSession as any)?.customMsgCmd;
      const inCustomInvocation = (this.bbsSession as any)?.customMsgParam1 !== undefined;
      const cmdName = inCustomInvocation ? String(customCmd ?? '') : (this.doorCommand || '');
debugLog(`[XIMProtocol] GET_CUSTOM_MSGBASE_MENUCMD: "${cmdName}"`);

      // Always populate embedded buffer for doors without StringPtr.
      this.messageParser.writeMessageString(msg.msgAddr, cmdName);

      let pointerSet = false;
      // Refresh the string in fixed memory (in case it was overwritten)
      if (this.doorCommandAddr > 0 && cmdName) {
        for (let i = 0; i < cmdName.length; i++) {
          this.emulator.writeMemory(this.doorCommandAddr + i, cmdName.charCodeAt(i));
        }
        this.emulator.writeMemory(this.doorCommandAddr + cmdName.length, 0);

        // Set StringPtr to fixed memory location (if field exists)
        pointerSet = this.messageParser.writeStringPointer(msg.msgAddr, this.doorCommandAddr);
        if (pointerSet) {
          const stringContent = this.emulator.readString(this.doorCommandAddr, cmdName.length + 1);
debugLog(`[XIMProtocol]   StringPtr=0x${this.doorCommandAddr.toString(16)} (fixed) -> "${stringContent}"`);
        }
      }

      if (!pointerSet) {
        const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
        if (this.messageParser.writeStringPointer(msg.msgAddr, stringAddr)) {
debugLog(`[XIMProtocol]   StringPtr=0x${stringAddr.toString(16)} (message buffer)`);
        } else {
debugLog('[XIMProtocol]   StringPtr not available; using embedded buffer');
        }
      }

      this.sendReply(msg, cmdName.length);
    } else if (command === XIMCommand.GET_CMD_TOOLTYPE) {
      // GET_CMD_TOOLTYPE - Read tooltype from command's .info file
      // msg.string = tooltype key to look up (e.g., "DOORUSE.FR")
      // Returns the tooltype value from the .info file
      const tooltypeKey = (msg.string || '').toUpperCase();
      const cmdName = this.doorCommand || '';
debugLog(`[XIMProtocol] GET_CMD_TOOLTYPE: key="${tooltypeKey}" cmd="${cmdName}"`);

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
        // cmdName comes from the door, so the .info basename needs the
        // case-insensitive walk ("mtop" must reach "MTOP.info").
        if (amigafs.existsSync(infoPath)) {
          const tooltypes = parseInfoFile(infoPath);
          if (tooltypes.has(tooltypeKey)) {
            tooltypeValue = tooltypes.get(tooltypeKey) || '';
            found = 1;
debugLog(`[XIMProtocol]   Found "${tooltypeKey}"="${tooltypeValue}" in ${infoPath}`);
            break;
          }
        }
      }

      if (!found) {
debugLog(`[XIMProtocol]   Tooltype "${tooltypeKey}" not found`);
      }

      // Write string to embedded buffer
      this.messageParser.writeMessageString(msg.msgAddr, tooltypeValue);

      // Write pointer to the embedded string buffer (if field exists)
      const stringAddr = msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET;
      if (this.messageParser.writeStringPointer(msg.msgAddr, stringAddr)) {
debugLog(`[XIMProtocol]   Wrote tooltype value="${tooltypeValue}", StringPtr=0x${stringAddr.toString(16)}`);
      } else {
debugLog(`[XIMProtocol]   Wrote tooltype value="${tooltypeValue}", StringPtr not available`);
      }

      this.messageParser.writeData(msg.msgAddr, found);
      this.sendReply(msg, found);
    }
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
        this.ioHandler.handleSendMessagePtr(msg);
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
        await this.ioHandler.handleDisplayFileNonStop(msg);
        break;

      case XIMCommand.CHECK_TO_DISPLAY:
        await this.ioHandler.handleCheckToDisplay(msg);
        break;

      case XIMCommand.JH_DL:  // Alias for JH_ExtHK (both are value 15)
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

      /**
       * AEW_SETPOINTER (10300): advance the caller's read pointers from a
       * door. The board owns these on a real AmiExpress and there is no
       * command for a door to move them - see xim/msgpointer.ts for the
       * express.e evidence and the degradation contract.
       *
       * A WRITE, so it arrives with data 0, which is also exactly what an
       * AmiExpress that has never heard of the command replies. That is what
       * lets SUBS detect support without a version check: 1 means stored.
       */
      case XIMCommand.AEW_SETPOINTER:
        {
          const stored = await handleSetPointer(String(msg.string || ''), this.bbsSession);
          debugLog(`[XIMProtocol] AEW_SETPOINTER "${msg.string}" -> ${stored}`);
          this.sendReply(msg, stored);
        }
        break;

      /**
       * AEW_POSTMSG (10500): a door posts through the board's own save - see
       * xim/postmsg.ts. A WRITE carries one step of the post and is answered
       * 1/0; a READ answers in String with what happened.
       */
      case XIMCommand.AEW_POSTMSG:
        if (msg.data !== 0) {
          const answer = postMessageAnswer(this.bbsSession);
          this.messageParser.writeMessageString(msg.msgAddr, answer);
          debugLog(`[XIMProtocol] AEW_POSTMSG read -> "${answer}"`);
          this.sendReply(msg, answer.length);
        } else {
          const taken = await handlePostMessage(String(msg.string || ''), this.socket, this.bbsSession as unknown as BBSSession);
          debugLog(`[XIMProtocol] AEW_POSTMSG "${String(msg.string || '').slice(0, 40)}" -> ${taken}`);
          this.sendReply(msg, taken);
        }
        break;

      /**
       * AEW_USERFIELD (10600): the W door's field conversation - xim/userfield.ts.
       * A READ that carries its question in String; the answer goes back in
       * String and its length in Data, the ae_field_exchange contract.
       */
      case XIMCommand.AEW_USERFIELD: {
        let answer = '';
        try {
          answer = await userFieldAnswer(String(msg.string || ''), this.bbsSession as unknown as BBSSession, this.socket);
        } catch (err) {
          // An empty answer is "this board cannot answer": the door leaves
          // rather than waiting for a reply that never comes. No value logged.
          debugLog(`[XIMProtocol] AEW_USERFIELD failed: ${err instanceof Error ? err.message : 'error'}`);
        }
        // writeMessageString zeroes the whole 200-byte String first: a PASSWORD request's tail
        // (the confirm copy) must not stay in door memory behind a short answer.
        this.messageParser.writeString(msg.msgAddr + DoorConstants.MESSAGE_STRING_OFFSET, answer, 200);
        debugLog(`[XIMProtocol] AEW_USERFIELD ${loggableXimString(msg.command, msg.data, msg.string).split(' ')[0]} -> ${answer.length} bytes`);
        this.sendReply(msg, answer.length);
        break;
      }

      // Note: PG_SM, PG_UD, PG_US case handlers removed - they don't exist in axcommon.e
      // and conflicted with JH_REGISTER (1), JH_FLAGFILE (13), JH_SHOWFLAGS (14)
    }
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
      // Note: BB_NUMCONFS was removed - it doesn't exist in axcommon.e
      // Command 614 is ONLY CONF_ACCESS
      XIMCommand.BB_UDLOG,
      XIMCommand.BB_TASKPRI,
      XIMCommand.BB_CHATFLAG,
      XIMCommand.BB_CHATSET,
      XIMCommand.BB_DROPDTR,
      XIMCommand.BB_GETTASK,
      // Node info commands
      XIMCommand.NODE_BAUD,
      XIMCommand.NODE_BAUDRATE,
      XIMCommand.NODE_DEVICE,
      XIMCommand.NODE_UNIT,
      // Multicom
      XIMCommand.MULTICOM,
      // Conference access
      XIMCommand.CONF_ACCESS,
      // Playpen
      XIMCommand.SIG_PLAYPEN,
      // Display flags
      XIMCommand.GET_GNSFLAG,
      XIMCommand.GET_XIMPORT,
      // Conference accounting
      XIMCommand.BB_CONFACCOUNT,
      // Iconify
      XIMCommand.ICONIFYQUERY,
      // Quiet download
      XIMCommand.QUIET_DOWNLOAD,
      // Password
      XIMCommand.PASSWORD_HASH,
      // Message base location
      XIMCommand.MSGBASE_LOC,
      /*
       * The caller's message pointers - express.e:3963-3966, which answers
       * both in msg.data:
       *
       *     CASE LAST_READ    -> msg.data:=lastMsgReadConf
       *     CASE LAST_SCANNED -> msg.data:=lastNewReadConf
       *
       * Implemented only in session/DoorMessageHandler.processCommand, which
       * runs solely when `this.ximProtocol` is null (:594) - the live entry
       * point delegates at :590-593, so that switch is a dead fallback copy.
       * Neither number was in ANY predicate here, so both fell through to the
       * unknown-command default at :748-752, which replies with msg.data
       * UNCHANGED: a door that asked for its pointer got back the `1` it sent
       * as the read flag and could not tell. A parity gap, not a divergence.
       */
      XIMCommand.LAST_READ,
      XIMCommand.LAST_SCANNED,
    ];
    if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
debugLog(
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
debugLog(`[XIMProtocol] handleBBSInfoCommand called: cmd=${msg.command} doorParams="${(this.bbsSession as any)?.doorParams}"`);
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
        // Per doordocs.txt: these clear the INPUT BUFFER, not screen
        this.ioHandler.handlePurgeLine(msg);
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

      // Note: BB_NUMCONFS case removed - command 614 is CONF_ACCESS only
      // CONF_ACCESS is handled separately below

      // Node/modem info commands
      case XIMCommand.NODE_BAUD:
      case XIMCommand.NODE_BAUDRATE:
      case XIMCommand.NODE_DEVICE:
      case XIMCommand.NODE_UNIT:
        this.bbsInfoHandler.handleNodeInfo(msg);
        break;

      // Multicom semaphore
      case XIMCommand.MULTICOM:
        this.bbsInfoHandler.handleMulticom(msg);
        break;

      // Conference access check
      case XIMCommand.CONF_ACCESS:
        this.bbsInfoHandler.handleConfAccess(msg);
        break;

      // Playpen directory path
      case XIMCommand.SIG_PLAYPEN:
        this.bbsInfoHandler.handleSigPlaypen(msg);
        break;

      // Non-stop text flag
      case XIMCommand.GET_GNSFLAG:
        this.bbsInfoHandler.handleGetGNSFlag(msg);
        break;

      // Conference accounting
      case XIMCommand.BB_CONFACCOUNT:
        this.bbsInfoHandler.handleConfAccount(msg);
        break;

      // Screen iconified check
      case XIMCommand.ICONIFYQUERY:
        this.bbsInfoHandler.handleIconifyQuery(msg);
        break;

      // Quiet download mode
      case XIMCommand.QUIET_DOWNLOAD:
        this.bbsInfoHandler.handleQuietDownload(msg);
        break;

      // XIM port address
      case XIMCommand.GET_XIMPORT:
        this.bbsInfoHandler.handleGetXimPort(msg);
        break;

      // Password hash
      case XIMCommand.PASSWORD_HASH:
        this.bbsInfoHandler.handlePasswordHash(msg);
        break;

      // Message base location
      case XIMCommand.MSGBASE_LOC:
        {
          // MSGBASE_LOC (604): the message base this door is asking about.
          // ctop.e uses it to reach the message headers for top uploaders.
          //
          // Normally the caller's own conference - but a door invoked as a
          // conference's CUSTOM message base is asking about the conference
          // the BOARD named (param2), which during `MS` is not the one the
          // caller is standing in (express.e:25260-25268).
          const { doorConference } = require('../services/custom-msgbase');
          const confNum = doorConference(this.bbsSession) || 1;
          const msgBaseLoc = conferenceAmigaPath(appConfig.get('dataDir'), confNum, 'MsgBase');
debugLog(`[XIMProtocol] MSGBASE_LOC: "${msgBaseLoc}"`);
          this.messageParser.writeMessageString(msg.msgAddr, msgBaseLoc);
          this.sendReply(msg, 1);
        }
        break;

      // The caller's message pointers, both answered in msg.data
      // (express.e:3963-3966). sendReply IS the writeData, so the value goes
      // through it - writing it first and then replying with something else
      // is the bug that made BB_SCRWIDTH answer 1 for every door.
      case XIMCommand.LAST_READ:
        {
          const lastRead = Number((this.bbsSession as any)?.lastMsgReadConf || 0);
debugLog(`[XIMProtocol] LAST_READ: ${lastRead}`);
          this.sendReply(msg, lastRead);
        }
        break;

      case XIMCommand.LAST_SCANNED:
        {
          const lastScanned = Number((this.bbsSession as any)?.lastNewReadConf || 0);
debugLog(`[XIMProtocol] LAST_SCANNED: ${lastScanned}`);
          this.sendReply(msg, lastScanned);
        }
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
      // NOTE: JH_MCI, JH_SG, JH_SF are handled by io.ts (isIOCommand) for better
      // encoding support (ISO-8859-1), MCI processing, file candidate search,
      // ACS/language lookup, and async serialization. Do NOT add them here.
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
      // New production-ready system commands
      XIMCommand.INTERPRET_MCI,
      XIMCommand.CHECK_PLAYPEN_EXISTS,
      XIMCommand.SET_FILEATTACH,
      XIMCommand.DISABLE_FILE_ATTACH,
      XIMCommand.SETOVERIDE,
      XIMCommand.SETMCIOFF,
      XIMCommand.SIG_LI,
      XIMCommand.GET_MENU_COMMAND_CHAR,
      XIMCommand.CHOOSE_NAME,
      XIMCommand.EXT_CHOOSE_NAME,
      XIMCommand.CHECK_REALNAME,
      XIMCommand.CON_CURSOR,
      // Telnet passthrough commands (express.e:3051-3302)
      XIMCommand.TELNET_CONNECT,
      XIMCommand.TELNET_USERNAME_PROMPT,
      XIMCommand.TELNET_USERNAME,
      XIMCommand.TELNET_PASSWORD_PROMPT,
      XIMCommand.TELNET_PASSWORD,
    ];

    // Debug: log once to confirm runtime list
    if (command === XIMCommand.RAWARROW || command === XIMCommand.SV_NEWMSG) {
debugLog(
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
        // CRITICAL FIX 2026-01-15: Clear any buffered input from before the door started.
        // User may have pressed Enter multiple times during login, and those keystrokes
        // would otherwise auto-respond to the door's JH_HK prompts (ghost input bug).
        this.clearQueuedInput();
        this.systemCommandsHandler.handleRegister(msg);
        break;

      case XIMCommand.JH_SHUTDOWN:
        this.systemCommandsHandler.handleShutdown(msg);
        break;

      case XIMCommand.JH_SIGBIT:
        this.systemCommandsHandler.handleSignalBit(msg);
        break;

      // NOTE: JH_MCI, JH_SG, JH_SF are now handled by ioHandler (see isIOCommand)
      // for better encoding support, MCI processing, and file handling.

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

      // New production-ready system command handlers
      case XIMCommand.INTERPRET_MCI:
        this.systemCommandsHandler.handleInterpretMCI(msg);
        break;

      case XIMCommand.CHECK_PLAYPEN_EXISTS:
        this.systemCommandsHandler.handleCheckPlaypenExists(msg);
        break;

      case XIMCommand.SET_FILEATTACH:
        this.systemCommandsHandler.handleSetFileAttach(msg);
        break;

      case XIMCommand.DISABLE_FILE_ATTACH:
        this.systemCommandsHandler.handleDisableFileAttach(msg);
        break;

      case XIMCommand.SETOVERIDE:
        this.systemCommandsHandler.handleSetOverride(msg);
        break;

      case XIMCommand.SETMCIOFF:
        this.systemCommandsHandler.handleSetMCIOff(msg);
        break;

      case XIMCommand.SIG_LI:
        // express.e:4205-4207 — SIG_LI mirrors JH_LI but echoes '*' instead
        // of the literal char. Routed through the IO handler so it shares
        // the line-input pause/resume + queue-drain plumbing.
        this.ioHandler.handleSecureLineInput(msg);
        break;

      case XIMCommand.GET_MENU_COMMAND_CHAR:
        this.systemCommandsHandler.handleGetMenuCommandChar(msg);
        break;

      case XIMCommand.CHOOSE_NAME:
      case XIMCommand.EXT_CHOOSE_NAME:
        this.systemCommandsHandler.handleChooseName(msg);
        break;

      case XIMCommand.CHECK_REALNAME:
        this.systemCommandsHandler.handleCheckRealname(msg);
        break;

      case XIMCommand.CON_CURSOR:
        this.systemCommandsHandler.handleConCursor(msg);
        break;

      // Telnet passthrough commands (express.e:3051-3302)
      case XIMCommand.TELNET_USERNAME_PROMPT:
        debugLog(`[XIMProtocol] TELNET_USERNAME_PROMPT: "${msg.string}"`);
        this.telnetState.usernamePrompt = msg.string || '';
        this.sendReply(msg, 0);
        break;

      case XIMCommand.TELNET_USERNAME:
        debugLog(`[XIMProtocol] TELNET_USERNAME: "${msg.string}"`);
        this.telnetState.username = msg.string || '';
        this.sendReply(msg, 0);
        break;

      case XIMCommand.TELNET_PASSWORD_PROMPT:
        debugLog(`[XIMProtocol] TELNET_PASSWORD_PROMPT: "${msg.string}"`);
        this.telnetState.passwordPrompt = msg.string || '';
        this.sendReply(msg, 0);
        break;

      case XIMCommand.TELNET_PASSWORD:
        debugLog(`[XIMProtocol] TELNET_PASSWORD: (hidden)`);
        this.telnetState.password = msg.string || '';
        this.sendReply(msg, 0);
        break;

      case XIMCommand.TELNET_CONNECT:
        // BLOCKING call - don't reply until telnet session ends
        debugLog(`[XIMProtocol] TELNET_CONNECT: "${msg.string}" port=${msg.data}`);
        this.handleTelnetConnect(msg);
        // NO sendReply here - will be sent when session ends
        break;
    }
  }

  /**
   * Handle TELNET_CONNECT command (express.e:3051-3302)
   * Opens TCP connection to remote host and establishes bidirectional passthrough
   * This is a BLOCKING call - emulator pauses until user disconnects (ESC)
   */
  private handleTelnetConnect(msg: XIMMessage): void {
    const host = msg.string || '';
    let port = msg.data || 23;
    if (port === 0) port = 23;

    this.telnetState.pendingMsgAddr = msg.msgAddr;

    debugLog(`[XIMProtocol] TELNET_CONNECT: Connecting to ${host}:${port}`);
    this.socket.emit('ansi-output', `\r\nConnecting to ${host}:${port}...\r\n`);

    // Close any existing connection first
    if (this.telnetState.connection) {
      debugLog(`[XIMProtocol] TELNET_CONNECT: Closing existing connection`);
      this.telnetState.connection.destroy();
      this.telnetState.connection = null;
    }

    // Create TCP connection with 30 second timeout
    const telnetSocket = net.createConnection({ host, port, timeout: 30000 });
    this.telnetState.connection = telnetSocket;
    this.telnetState.connected = false;

    telnetSocket.on('connect', () => {
      this.telnetState.connected = true;
      debugLog(`[XIMProtocol] TELNET_CONNECT: Connected to ${host}:${port}`);
      this.socket.emit('ansi-output', `Connected to ${host}.\r\n`);
      this.socket.emit('ansi-output', "Escape character is '^]'.\r\n\r\n");
    });

    telnetSocket.on('data', (data: Buffer) => {
      // Filter telnet IAC commands, pass through clean data
      const filtered = this.filterTelnetIAC(data, telnetSocket);
      if (filtered.length > 0) {
        this.socket.emit('ansi-output', filtered.toString('binary'));
      }
      // Check for auto-login prompts
      this.checkTelnetAutoLogin(data, telnetSocket);
    });

    telnetSocket.on('close', () => {
      debugLog(`[XIMProtocol] TELNET_CONNECT: Connection closed`);
      this.socket.emit('ansi-output', '\r\nConnection closed.\r\n');
      this.cleanupTelnetSession();
    });

    telnetSocket.on('error', (err: Error) => {
      debugLog(`[XIMProtocol] TELNET_CONNECT: Error - ${err.message}`);
      this.socket.emit('ansi-output', `\r\nConnection error: ${err.message}\r\n`);
      this.cleanupTelnetSession();
    });

    telnetSocket.on('timeout', () => {
      debugLog(`[XIMProtocol] TELNET_CONNECT: Connection timeout`);
      this.socket.emit('ansi-output', '\r\nConnection timed out.\r\n');
      telnetSocket.destroy();
      this.cleanupTelnetSession();
    });

    // Set up input handler and pause emulator
    this.setupTelnetInputHandler(telnetSocket);
    this.emulator.pause();
    debugLog(`[XIMProtocol] TELNET_CONNECT: Emulator paused, waiting for telnet session to end`);
  }

  /**
   * Filter telnet IAC (Interpret As Command) sequences (express.e:3218-3269)
   */
  private filterTelnetIAC(data: Buffer, telnetSocket: net.Socket): Buffer {
    const IAC = 255, WILL = 251, WONT = 252, DO = 253, DONT = 254, SB = 250, SE = 240;
    const ECHO = 1, SGA = 3;
    const filtered: number[] = [];
    let i = 0;

    while (i < data.length) {
      if (data[i] === IAC && i + 1 < data.length) {
        const cmd = data[i + 1];
        if (cmd === IAC) {
          filtered.push(IAC);
          i += 2;
        } else if (cmd === WILL && i + 2 < data.length) {
          const option = data[i + 2];
          if (option === ECHO || option === SGA) {
            telnetSocket.write(Buffer.from([IAC, DO, option]));
          } else {
            telnetSocket.write(Buffer.from([IAC, DONT, option]));
          }
          i += 3;
        } else if (cmd === WONT && i + 2 < data.length) {
          telnetSocket.write(Buffer.from([IAC, DONT, data[i + 2]]));
          i += 3;
        } else if (cmd === DO && i + 2 < data.length) {
          telnetSocket.write(Buffer.from([IAC, WONT, data[i + 2]]));
          i += 3;
        } else if (cmd === DONT && i + 2 < data.length) {
          telnetSocket.write(Buffer.from([IAC, WONT, data[i + 2]]));
          i += 3;
        } else if (cmd === SB) {
          let j = i + 2;
          while (j < data.length - 1) {
            if (data[j] === IAC && data[j + 1] === SE) { j += 2; break; }
            j++;
          }
          i = j;
        } else {
          i += 2;
        }
      } else {
        filtered.push(data[i]);
        i++;
      }
    }
    return Buffer.from(filtered);
  }

  /**
   * Check for auto-login prompts (express.e:3271-3284)
   */
  private checkTelnetAutoLogin(data: Buffer, telnetSocket: net.Socket): void {
    const text = data.toString().toLowerCase();
    if (this.telnetState.username && this.telnetState.usernamePrompt) {
      if (text.includes(this.telnetState.usernamePrompt.toLowerCase())) {
        debugLog(`[XIMProtocol] Auto-login: sending username`);
        telnetSocket.write(this.telnetState.username + '\r\n');
        this.telnetState.username = '';
      }
    }
    if (this.telnetState.password && this.telnetState.passwordPrompt) {
      if (text.includes(this.telnetState.passwordPrompt.toLowerCase())) {
        debugLog(`[XIMProtocol] Auto-login: sending password`);
        telnetSocket.write(this.telnetState.password + '\r\n');
        this.telnetState.password = '';
      }
    }
  }

  /**
   * Set up input handler for telnet session
   */
  private setupTelnetInputHandler(telnetSocket: net.Socket): void {
    const telnetInputHandler = (data: string) => {
      // ESC (0x1B) or Ctrl+] (0x1D) disconnects
      if (data === '\x1b' || data === '\x1d') {
        debugLog(`[XIMProtocol] Telnet: User requested disconnect`);
        this.socket.emit('ansi-output', '\r\n[Disconnecting...]\r\n');
        telnetSocket.destroy();
        return;
      }
      if (this.telnetState.connected && telnetSocket && !telnetSocket.destroyed) {
        telnetSocket.write(data);
      }
    };

    // Store original handler and replace with telnet handler
    const listeners = this.socket.listeners('door:input');
    this.telnetState.originalInputHandler = listeners[0] as ((data: string) => void) || null;
    this.socket.removeAllListeners('door:input');
    this.socket.on('door:input', telnetInputHandler);
    debugLog(`[XIMProtocol] Telnet input handler set up`);
  }

  /**
   * Clean up telnet session and resume door execution
   */
  private cleanupTelnetSession(): void {
    debugLog(`[XIMProtocol] Cleaning up telnet session`);

    if (this.telnetState.connection && !this.telnetState.connection.destroyed) {
      this.telnetState.connection.destroy();
    }

    // Restore original input handler
    this.socket.removeAllListeners('door:input');
    if (this.telnetState.originalInputHandler) {
      this.socket.on('door:input', this.telnetState.originalInputHandler);
    }

    // Reply to pending TELNET_CONNECT message
    const pendingMsgAddr = this.telnetState.pendingMsgAddr;
    if (pendingMsgAddr) {
      debugLog(`[XIMProtocol] Telnet session ended - replying to TELNET_CONNECT`);
      this.messageParser.writeData(pendingMsgAddr, 0);
      this.execLibrary.replyMsg(pendingMsgAddr);
      this.emulator.resume();
      debugLog(`[XIMProtocol] Emulator resumed after telnet session`);
    }

    // Reset state
    this.telnetState = {
      usernamePrompt: '',
      username: '',
      passwordPrompt: '',
      password: '',
      connection: null,
      connected: false,
      pendingMsgAddr: 0,
      originalInputHandler: null
    };
  }

  /**
   * Send reply to door via bidirectional XIM protocol
   *
   * CRITICAL FIX 2026-01-13: XIM doors use BIDIRECTIONAL communication on ONE port.
   * Door sends messages TO AEDoorPort AND polls SAME port for replies.
   * Standard ReplyMsg() sends to mn_ReplyPort which causes door to miss replies.
   * Must use PutMsg() back to the AEDoorPort where door is polling.
   *
   * Bug was: Only JH_REGISTER used bidirectional, other commands used replyMsg()
   * causing doors to loop waiting for replies they never see.
   */
  private sendReply(msg: any, data: number): void {
    const humanName = this.messageParser.getCommandName(msg.command);

    // Log outgoing reply to XIM debug log
    ximDebugLogger.logMessage(msg.command, humanName, 'SEND', {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      reply_data: data
    });

    // Log to structured JSON logger
    ximLogger.log('debug', 'send', this.doorCommand || 'UNKNOWN', this.bbsSession.nodeId || 1, {
      type: `${humanName}_REPLY`,
      typeCode: msg.command,
      param: data,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      message: 'Reply to door request',
    });

    this.messageParser.writeData(msg.msgAddr, data);
    this.state.replyHandled = true;

    // CRITICAL FIX 2026-01-14: Use standard ReplyMsg() to send reply to door's mn_ReplyPort
    // The door calls Wait() on its reply port's signal bit (typically 0x21000), NOT on AEDoorPort (0x40000)
    // Using bidirectional PutMsg to AEDoorPort signals the wrong bit and leaves the door stuck in Wait()
    this.execLibrary.replyMsg(msg.msgAddr);
    debugLog(`[XIMProtocol] Reply sent via ReplyMsg to door's reply port 0x${msg.replyPort?.toString(16) || 'unknown'}`)
  }

  /**
   * Get a snapshot of XIM state for host usage after door exit
   */
  getStateSnapshot(): XIMState {
    const debugId = (this.state as any)._debugId || 'UNKNOWN';
    console.log(`[XIMProtocol] getStateSnapshot called - debugId="${debugId}" returnCommand="${this.state.returnCommand || 'NONE'}", chainCommand="${this.state.chainCommand || 'NONE'}"`);
debugLog(`[XIMProtocol] getStateSnapshot called - debugId="${debugId}" returnCommand="${this.state.returnCommand || 'NONE'}", chainCommand="${this.state.chainCommand || 'NONE'}"`);
    return { ...this.state };
  }

  /**
   * Check if the door has requested shutdown via JH_SHUTDOWN
   */
  isShuttingDown(): boolean {
    return this.state.shuttingDown;
  }

  /**
   * Check if the reply for the current message was already handled internally
   * (e.g., by system commands that send their own reply)
   */
  wasReplyHandled(): boolean {
    return this.state.replyHandled === true;
  }

}

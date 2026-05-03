/**
 * XIM System Commands Handler
 *
 * Handles system-level XIM commands (registration, shutdown, chaining, etc).
 */

import * as fs from 'fs';
import * as amigafs from '../../utils/amigafs';
import * as path from 'path';
import { Socket } from 'socket.io';
import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { XIMCommand, XIMMessage, BBSSessionData, XIMState, ENVStatus } from './types';
import { XIMMessageParser } from './messages';
import { ExecLibrary } from '../api/ExecLibrary';
import { BBSPaths } from '../../utils/bbs-paths.util';
import { DoorConstants } from '../DoorTypes';
import { ZmodemTransferManager, TransferDirection, TransferTransport } from '../../services/zmodem-transfer.service';
import { SysopDebugUtil } from '../../utils/sysop-debug.util';
import { ximLogger } from '../../utils/XIMLogger';
import { getSystemTime } from '../../utils/date-time.util';
import { debugLog } from '../../utils/debug-log';
import { convertAmigaTextForTerminal } from '../../utils/ansi-conversion.util';
import { getConferenceToolFlags } from '../../utils/conference-tooltypes.util';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const iconv = require('iconv-lite');

export class XIMSystemCommandsHandler {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private socket: Socket;
  private messageParser: XIMMessageParser;
  private bbsSession: BBSSessionData;
  private state: XIMState;
  private ximPortAddr: number;
  private transferRawActive = false;

  // Old-style door compatibility fallback
  private oldStyleDoorTimer: NodeJS.Timeout | null = null;
  private receivedPostRegisterMessage: boolean = false;

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
   * Cancel old-style door timer when door sends data/environment requests
   * This indicates it's a modern door that actively queries BBS state
   */
  cancelOldStyleDoorTimer(command: number): void {
    // Input requests (JH_HK, JH_LI, JH_PM) indicate this IS an XIM door, not a native door
    // XIM doors use the XIM protocol for I/O - we should NOT inject input for them
    const isInputRequest =
      command === XIMCommand.JH_HK ||
      command === XIMCommand.JH_LI ||
      command === XIMCommand.JH_PM;

    if (isInputRequest) {
      // This door uses XIM input commands - it's definitely an XIM door, not native
      if (this.oldStyleDoorTimer) {
        debugLog(`[XIMSystem] Door sent XIM input request (cmd=${command}) - canceling native fallback`);
        clearTimeout(this.oldStyleDoorTimer);
        this.oldStyleDoorTimer = null;
      }
      this.receivedPostRegisterMessage = true;
      this.state.isNativeDoor = false;
      return;
    }

    // Data/environment requests - this is a modern XIM door
    if (this.oldStyleDoorTimer) {
      debugLog(`[XIMSystem] Received post-register data request (cmd=${command}) - canceling old-style fallback`);
      clearTimeout(this.oldStyleDoorTimer);
      this.oldStyleDoorTimer = null;
      this.receivedPostRegisterMessage = true;
      this.state.isNativeDoor = false; // Definitely not native
    }
  }

  /**
   * Handle door registration (JH_REGISTER)
   * From E sources (express.e:3379-3381)
   *
   * express.e JH_REGISTER does NOT output msg.string - it only:
   *   msg.command := IF loggedOnUser<>NIL THEN userLineLen ELSE 29
   *   nodesPtr[] := nodesPtr[]+1
   * Doors that need output use JH_WRITE/JH_SM AFTER registration.
   */
  handleRegister(msg: XIMMessage): void {
    debugLog(`[XIMSystem] Door registering with BBS, data=${msg.data}`);

    // NOTE: express.e does NOT output msg.string for JH_REGISTER (see lines 3379-3381)
    // Doors display their banners via JH_WRITE/JH_SM after registration, not via JH_REGISTER.
    // Previous "compatibility" output was incorrect and caused doubled output.

    // express.e: for JH_REGISTER, return userLineLen in msg->Command. We also mirror
    // it into msg->Data — see the WEB_: note below the writeCommand call for why.
    const rawLineLen =
      this.bbsSession?.user?.linesPerScreen ??
      this.bbsSession?.user?.lineLength ??
      this.bbsSession?.user?.pageLength;
    // express.e:3380: msg.command:=IF loggedOnUser<>NIL THEN userLineLen ELSE 29
    // Three cases:
    //   1. No user logged on → 29 (express.e default).
    //   2. User logged on with explicit positive linesPerScreen → that value.
    //   3. User logged on but linesPerScreen=0/missing ("unlimited" convention)
    //      → 9999. JoinCnf 4.0 paginates by equality (cmp.l <userLineLen>,
    //      counter; bne skip-prompt). With 9999 the equality never matches
    //      a sub-9999-line banner. With 0 the door treats it as "broken
    //      threshold" and collapses to a single fail-safe prompt screen,
    //      which is worse than pagination.
    const hasUser = !!this.bbsSession?.user;
    const lineLen = !hasUser
      ? 29
      : (typeof rawLineLen === 'number' && rawLineLen > 0 ? rawLineLen : 9999);
    this.messageParser.writeCommand(msg.msgAddr, lineLen);
    // WEB_: divergence from express.e:3380 (which only writes msg.command).
    // AEKIT-based 68K doors (SRH/TList/TLP2 disasm at TLP2:0x24f4 reads msg->data
    // at offset 0xdc) use a generic CheckMessage() that returns msg->Data for ALL
    // replies — they never read msg->Command after JH_REGISTER, so they end up
    // with userLineLen=0 and the door's own paginator triggers (Pause)... after
    // every line. Reference: Documentation/7-Reference Sources/AEKIT101/Sources/
    // MISC/AEDoor.c line 171 (`ret = XIM_Msg->Data;`) — official Amiga Express
    // door kit. Mirror userLineLen into msg.data so both reader styles see the
    // right threshold. Additive: express.e-style doors that read command are
    // unaffected because we still write command.
    this.messageParser.writeData(msg.msgAddr, lineLen);
    const parsedFinal = this.messageParser.parseMessage(msg.msgAddr);
    if (!parsedFinal.messageLength) {
console.warn('[XIMSystem][RegisterReply] mn_Length is 0; optional fields disabled');
    }
debugLog(
      `[XIMSystem][RegisterReply] cmd=${parsedFinal.command} data=${parsedFinal.data} node=${parsedFinal.nodeId} strPtr=0x${(parsedFinal as any).stringPtr?.toString(
        16
      )} str="${parsedFinal.string}"`
    );
debugLog(
      `[XIMSystem][RegisterReply][dbg] wrote cmd(lineLen)=${lineLen} data=${parsedFinal.data}`
    );

    this.state.registered = true;
    this.state.shuttingDown = false;
    this.state.lineCount = 0;

    // WEB_*: TLP2-style doors (SRH/TList/TLP2) read linesPerScreen from BSS at
    // a4+0x3022 (disasm-confirmed: cmp.l 0x3022(a4), d0 is the pause threshold).
    // They receive lineLen in msg.data but never copy it into BSS — it stays 0
    // (BSS-initialized), so every line triggers a pause. Patch the BSS slot now
    // while A4 is live and the register-reply hasn't returned yet.
    // Only safe for doors that use this exact offset; TLP2 disasm confirms 0x3022.
    {
      const a4 = this.emulator.getRegister(12); // A4 = register 12 in MOIRA
      if (a4 > 0x1000) {
        this.emulator.writeMemory32(a4 + 0x3022, lineLen);
        debugLog(`[XIMSystem] WEB_* TLP2 BSS patch: wrote lineLen=${lineLen} to A4(0x${a4.toString(16)})+0x3022=0x${(a4+0x3022).toString(16)}`);
      }
    }

    // express.e does not modify node/line/strptr/fillers for JH_REGISTER.

    // CRITICAL FIX (Dec 26 - restored Jan 8): XIM doors use BIDIRECTIONAL communication on ONE port
    // Door sends messages TO AEDoorPort AND polls SAME port for replies
    // Standard ReplyMsg() sends to mn_ReplyPort which causes door to miss replies
    // Must use PutMsg() back to the AEDoorPort where door is polling
    //
    // Reference: Documentation/6-Progress/archive/2025-12/RTW_DEBUG_SESSION_DEC25.md lines 280-356
    // express.e does call ReplyMsg BUT for NATIVE AEDoor protocol doors (different from XIM)

    // Log outgoing reply to XIM structured logger
    ximLogger.log('debug', 'send', this.state.doorCommand || 'UNKNOWN', this.bbsSession?.nodeId || 1, {
      type: 'JH_REGISTER_REPLY',
      typeCode: XIMCommand.JH_REGISTER,
      param: lineLen,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      message: 'Door registration acknowledged',
    });

    // CRITICAL FIX 2026-01-14: Use standard ReplyMsg() for JH_REGISTER_REPLY
    // The door's mn_ReplyPort (e.g., 0x104500) has a signal bit that the door
    // is waiting for in Wait(). Using PutMsg to AEDoorPort signals the WRONG bit
    // (AEDoorPort's bit 18 vs door's reply port bit 12 or 17).
    // ReplyMsg sends to mn_ReplyPort and signals the correct task/bit.
    this.execLibrary.replyMsg(msg.msgAddr);
debugLog(`[XIMSystem] Reply sent via ReplyMsg to door's reply port 0x${msg.replyPort?.toString(16) || 'unknown'}`)

debugLog(`[XIMSystem] Registration acknowledged`);
    // express.e only sets msg.command for JH_REGISTER; avoid post-register memory writes.

    // Old-style door compatibility: Wait 500ms after JH_REGISTER.
    // If no follow-up data requests arrive, assume old door that needs native input injection.
    // Modern XIM doors (Bulls, AquaScan) send BB_/DT_ requests immediately after registration.
    // Old XIM doors (WALL, JoinCnf) send JH_HK and expect reply - they DON'T need injection.
    // True native doors (non-XIM) poll GetMsg without sending any XIM commands.
    this.receivedPostRegisterMessage = false;
    this.state.isNativeDoor = false; // Default: not a native door until proven
    this.oldStyleDoorTimer = setTimeout(() => {
      if (!this.receivedPostRegisterMessage) {
        // No data requests after 500ms - could be old-style XIM door or native door
        // Old-style XIM doors will eventually send JH_HK (we should NOT inject)
        // True native doors poll GetMsg without any XIM commands (we SHOULD inject)
        // For now, mark as native so shouldInjectNativeInput() can work
        // BUT only if we haven't received ANY XIM commands (not even JH_HK)
        this.state.isNativeDoor = true;
        debugLog('[XIMSystem] No post-register data requests after 500ms');
        debugLog('[XIMSystem] Marking door as potentially native (may need input injection)');
      } else {
        debugLog('[XIMSystem] Modern XIM door detected - uses XIM protocol for I/O');
      }
    }, 500);
  }

  /**
   * Populate BBSInfo structure AFTER library initialization
   * This ensures user data is written to the correct memory locations
   * that the library's GetUserName/CopyLocationString functions will read from.
   */
  private populateBBSInfoPostRegister(msg: XIMMessage): void {
debugLog('[BBSInfo] Post-register population starting...');

    // Try to find the DIFace address using known structure relationships
    // The DIFace structure layout:
    //   0x00: dif_AEPort (pointer to AEDoorPort)
    //   0x04: dif_MsgPort (pointer to door's reply port)
    //   0x08: dif_Message (pointer to embedded jhMessage)
    //   0x46: jhMessage structure (embedded, DIFACE_MSG_OFFSET)
    //
    // Since jhMessage is embedded at DIFace+0x46, we can calculate:
    // DIFace = msg.address - 0x46
    const DIFACE_MSG_OFFSET = 0x46;
    let difaceAddr = msg.data;

    // First try: Calculate from message address (most reliable)
    // The message address points to the jhMessage within the DIFace
    if ((!difaceAddr || difaceAddr < 0x100 || difaceAddr > 0xFFFFFF) && msg.msgAddr > 0x100) {
      const calculatedDIFace = msg.msgAddr - DIFACE_MSG_OFFSET;
debugLog(`[BBSInfo] Calculating DIFace from message address: 0x${msg.msgAddr.toString(16)} - 0x46 = 0x${calculatedDIFace.toString(16)}`);

      // Verify the calculated address looks valid
      if (calculatedDIFace > 0x100 && calculatedDIFace < 0xFFFFFF) {
        // Check if this looks like a DIFace by verifying the message pointer at offset 0x08
        try {
          const storedMsgPtr = this.emulator.readMemory32(calculatedDIFace + 0x08);
          const storedReplyPort = this.emulator.readMemory32(calculatedDIFace + 0x04);
          const storedAEPort = this.emulator.readMemory32(calculatedDIFace + 0x00);

debugLog(`[BBSInfo] Verifying calculated DIFace at 0x${calculatedDIFace.toString(16)}:`);
debugLog(`[BBSInfo]   dif_AEPort (0x00): 0x${storedAEPort.toString(16)}`);
debugLog(`[BBSInfo]   dif_MsgPort (0x04): 0x${storedReplyPort.toString(16)}`);
debugLog(`[BBSInfo]   dif_Message (0x08): 0x${storedMsgPtr.toString(16)}`);

          // The message pointer at offset 0x08 should equal the message address
          // OR be very close (within the DIFace structure)
          if (storedMsgPtr === msg.msgAddr ||
              (storedMsgPtr > calculatedDIFace && storedMsgPtr < calculatedDIFace + 0x300)) {
debugLog(`[BBSInfo] DIFace verified! Message pointer matches.`);
            difaceAddr = calculatedDIFace;
          } else if (storedReplyPort === msg.replyPort && storedAEPort >= 0xa0000 && storedAEPort < 0xa2000) {
debugLog(`[BBSInfo] DIFace verified via reply port and AEPort match.`);
            difaceAddr = calculatedDIFace;
          } else {
debugLog(`[BBSInfo] Calculated DIFace verification failed, trying search...`);
          }
        } catch (e) {
debugLog(`[BBSInfo] Could not read from calculated DIFace address`);
        }
      }
    }

    // Fallback: Search memory for DIFace using reply port
    if (!difaceAddr || difaceAddr < 0x100 || difaceAddr > 0xFFFFFF) {
debugLog('[BBSInfo] Searching for DIFace via reply port...');

      const replyPort = msg.replyPort;
      if (replyPort && replyPort > 0x100) {
debugLog(`[BBSInfo] Searching for DIFace with replyPort=0x${replyPort.toString(16)}`);

        // Search memory for structures where offset 0x04 = replyPort
        const searchRanges = [
          { start: 0x100000, end: 0x150000 },  // Primary allocation area
          { start: 0x150000, end: 0x200000 },  // Extended area
          { start: 0x10000, end: 0x30000 },    // Lower memory
        ];

        for (const range of searchRanges) {
          for (let addr = range.start; addr < range.end; addr += 4) {
            try {
              const storedPort = this.emulator.readMemory32(addr + 0x04);
              if (storedPort === replyPort) {
                const aePort = this.emulator.readMemory32(addr + 0x00);
                const msgPtr = this.emulator.readMemory32(addr + 0x08);

                if (aePort >= 0xa0000 && aePort < 0xa2000 &&
                    msgPtr > addr && msgPtr < addr + 0x300) {
debugLog(`[BBSInfo] Found DIFace at 0x${addr.toString(16)}`);
debugLog(`[BBSInfo]   dif_AEPort: 0x${aePort.toString(16)}`);
debugLog(`[BBSInfo]   dif_MsgPort: 0x${storedPort.toString(16)}`);
debugLog(`[BBSInfo]   dif_Message: 0x${msgPtr.toString(16)}`);
                  difaceAddr = addr;
                  break;
                }
              }
            } catch {
              // Skip unreadable memory
            }
          }
          if (difaceAddr > 0x100) break;
        }
      }

      if (!difaceAddr || difaceAddr < 0x100) {
console.warn('[BBSInfo] Could not find valid DIFace address, skipping BBSInfo population');
        return;
      }
    }

debugLog(`[BBSInfo] DIFace address: 0x${difaceAddr.toString(16)}`);

    // Read the pointers that the library set up
    // DoorInfo+0x20 points to user name string location
    // DoorInfo+0x1c points to location string location
    const userPtr = this.emulator.readMemory32(difaceAddr + 0x20);
    const locPtr = this.emulator.readMemory32(difaceAddr + 0x1c);

debugLog(`[BBSInfo] User name pointer: 0x${userPtr.toString(16)}`);
debugLog(`[BBSInfo] Location pointer: 0x${locPtr.toString(16)}`);

    // Get actual user data from session
    const username = this.bbsSession?.user?.username || 'Guest';
    const location = this.bbsSession?.user?.location || 'Unknown';
    const bbsName = 'AmiExpress-Web';

    // Write user data to the addresses the library's pointers point to
    if (userPtr > 0x100 && userPtr < 0xFFFFFF) {
      this.writeCString(userPtr, username, 198);
debugLog(`[BBSInfo] Wrote username "${username}" to 0x${userPtr.toString(16)}`);
    }

    if (locPtr > 0x100 && locPtr < 0xFFFFFF) {
      this.writeCString(locPtr, location, 60);
debugLog(`[BBSInfo] Wrote location "${location}" to 0x${locPtr.toString(16)}`);
    }

    // DISABLED: These writes were corrupting the message structure!
    // The native AEDoor.library uses different structure offsets than we assumed.
    // Message is at DIFace + 0x164, not 0x46. Writing to DIFace + 0x46 + offsets
    // was overwriting the message header including the reply port field.
    //
    // The native library handles BBSInfo population via XIM commands (DT_NAME, etc.)
    // so we don't need to pre-populate these fields.
    //
    // Previously:
    //   bbsInfoAddr = difaceAddr + 0x46 = 0x100056
    //   Wrote BBS name at 0x100056 + 0x120 = 0x100176
    //   But message is at 0x100174, so this overwrote message+2
    //   "AmiExpress-Web" wrote "eb\0\0" at message+14 (reply port offset)
    //   Corrupted reply port from 0xa0300 to 0x65620000

debugLog('[BBSInfo] Skipping BBSInfo field writes (native library handles via XIM commands)');
debugLog('[BBSInfo] Post-register population complete');
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
    const now = getSystemTime();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const day = now.getDate().toString().padStart(2, '0');
    const year = now.getFullYear();
    return `${month}/${day}/${year}`;
  }

  /**
   * Get formatted time string (HH:MM:SS)
   */
  private getFormattedTime(): string {
    const now = getSystemTime();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    const seconds = now.getSeconds().toString().padStart(2, '0');
    return `${hours}:${minutes}:${seconds}`;
  }

  /**
   * Handle door shutdown (JH_SHUTDOWN)
   */
  handleShutdown(msg: XIMMessage): void {
debugLog('[XIMSystem] Door requesting shutdown');

    this.state.shuttingDown = true;
    this.state.registered = false;
    this.reply(msg, msg.data ?? 0);

debugLog('[XIMSystem] Door completed execution');
  }

  /**
   * Handle RAWARROW (Toggle Raw Arrow Keys)
   * From E sources (express.e:3814-3815)
   *
   * When rawArrow=FALSE (default): ESC[A/B/C/D are converted to UPARROW(4)/DOWNARROW(5)/RIGHTARROW(3)/LEFTARROW(2)
   * When rawArrow=TRUE: Raw escape sequence bytes are passed through (27, '[', 'A', etc.)
   */
  handleRawArrow(msg: XIMMessage): void {
    // Toggle rawArrow state
    this.state.rawArrow = !this.state.rawArrow;

debugLog(`[XIMSystem] RAWARROW: Toggle raw arrow mode -> ${this.state.rawArrow ? 'ON (raw)' : 'OFF (convert)'}`);

    // Ack
    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle RETURNCOMMAND / RETURNCOMMAND2
   * From E sources (express.e:3492-3493, 4064-4065)
   */
  handleReturnCommand(msg: XIMMessage): void {
    const command = this.getMessageString(msg);

    console.log(`[XIMSystem] handleReturnCommand called: command="${command}"`);
debugLog(`[XIMSystem] RETURNCOMMAND: "${command}" -> state.returnCommand set`);

    this.bbsSession.returnCommand = command;
    this.state.returnCommand = command;

    // Verify it was set
    console.log(`[XIMSystem] RETURNCOMMAND: state.returnCommand now="${this.state.returnCommand}"`);
debugLog(`[XIMSystem] RETURNCOMMAND verify: state.returnCommand="${this.state.returnCommand}"`);

    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle CHAIN (Chain to Another Door)
   * From E sources (express.e:3386-3387)
   */
  handleChain(msg: XIMMessage): void {
debugLog('[XIMSystem] CHAIN: Door requesting chain to another door');

    this.state.chainCommand = this.getMessageString(msg);
    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle ENVSTAT (Environment Status)
   * From E sources (express.e:3677-3683)
   * From assembly (aedoor.i): ENV_DROPPED = -1 when carrier lost
   */
  handleEnvStat(msg: XIMMessage): void {
debugLog('[XIMSystem] ENVSTAT - Environment status');

    const isRead = msg.data !== 0;
    if (isRead) {
      // Per assembly sources: return -1 (ENV_DROPPED) when carrier is lost
      if (this.state.carrierDropped) {
        this.messageParser.writeMessageString(msg.msgAddr, ENVStatus.ENV_DROPPED.toString());
debugLog(`  [READ] Status: ${ENVStatus.ENV_DROPPED} (carrier dropped)`);
      } else {
        // Return current environment status from session (set by command-execution.handler.ts)
        // For file scan commands (FR, F, N, etc.), this will be 8 (ENV_FILES)
        const status = (this.bbsSession as any).currentStat || ENVStatus.ENV_IDLE;
        this.messageParser.writeMessageString(msg.msgAddr, status.toString());
debugLog(`  [READ] Status: ${status}`);
      }
    } else {
      const value = this.getMessageString(msg);
      if (value.length > 0) {
        (this.bbsSession as any).currentStat = parseInt(value) || ENVStatus.ENV_IDLE;
debugLog(`  [WRITE] Set status: ${value}`);
      }
    }

    // express.e leaves msg.data unchanged for ENVSTAT responses.
    this.reply(msg, msg.data ?? 0);
  }

  /**
   * Handle SV_NEWMSG (Server New Message)
   * From E sources (express.e:3684-3685)
   */
  handleSvNewMsg(msg: XIMMessage): void {
    const message = this.getMessageString(msg);

debugLog('[XIMSystem] SV_NEWMSG - Set server message');
debugLog(`  Message: "${message}"`);

    // Ack with Data=1 per express.e behavior
    this.reply(msg, 1);
  }

  /**
   * Handle PRV_COMMAND (Private Command)
   * From E sources (express.e:3816-3818)
   */
  handlePrvCommand(msg: XIMMessage): void {
    const command = this.getMessageString(msg);

debugLog('[XIMSystem] PRV_COMMAND - Execute BBS command');
debugLog(`  Command: "${command}"`);

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

debugLog('[XIMSystem] PRV_GROUP - Modify group settings');
debugLog(`  Group data: "${groupData}"`);

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
debugLog('[XIMSystem] JH_SIGBIT - Query signal bits');

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

debugLog('[XIMSystem] JH_MCI - Process MCI codes');
debugLog(`  Text: "${text}"`);

    // Use the existing MCI processor to render codes the same way screens do
    try {
      const { parseMCI } = require('../../handlers/screen.handler');
      const result = parseMCI(text, this.bbsSession as any, {
        allowCommands: false,
        pauseAfter: msg.data !== 0,
      });
      if (result?.content) {
        this.socket.emit('ansi-output', convertAmigaTextForTerminal(result.content));
      } else {
        this.socket.emit('ansi-output', convertAmigaTextForTerminal(text + (msg.data !== 0 ? '\r\n' : '')));
      }
      if (msg.data !== 0) {
        // express.e: add CRLF and checkForPause
        this.socket.emit('ansi-output', '\r\n');
      }
    } catch (err) {
console.warn('[XIMSystem] JH_MCI fallback:', err);
      this.socket.emit('ansi-output', convertAmigaTextForTerminal(text + (msg.data !== 0 ? '\r\n' : '')));
    }

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SG (Security Screen)
   * From E sources (express.e:3473-3474)
   */
  handleSecurityScreen(msg: XIMMessage): void {
    const screenName = this.getMessageString(msg);

debugLog('[XIMSystem] JH_SG - Display security screen');
debugLog(`  Screen: "${screenName}"`);

    const resolved = this.resolvePath(screenName);
    if (amigafs.existsSync(resolved)) {
      try {
        // Read as binary buffer and convert from ISO-8859-1 (Amiga encoding) to UTF-8
        const rawBuffer = amigafs.readFileSync(resolved) as Buffer;
        let content = iconv.decode(rawBuffer, 'iso-8859-1');

        // Apply full Amiga text conversion (ANSI codes + line endings)
        content = convertAmigaTextForTerminal(content);

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

debugLog('[XIMSystem] JH_SF - Show file');
debugLog(`  File: "${fileName}"`);

    const resolved = this.resolvePath(fileName);
    if (amigafs.existsSync(resolved)) {
      try {
        // Read as binary buffer and convert from ISO-8859-1 (Amiga encoding) to UTF-8
        const rawBuffer = amigafs.readFileSync(resolved) as Buffer;
        let content = iconv.decode(rawBuffer, 'iso-8859-1');

        // Apply full Amiga text conversion (ANSI codes + line endings)
        content = convertAmigaTextForTerminal(content);

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

debugLog('[XIMSystem] JH_EF - Edit file');
debugLog(`  File: "${fileName}"`);

    this.messageParser.writeData(msg.msgAddr, 1);
debugLog('  [SUCCESS] File edit acknowledged');

    this.reply(msg, 1);
  }

  /**
   * Handle JH_FLAGFILE (Flag File)
   * From E sources (express.e:3490-3491, 1160-1161)
   */
  handleFlagFile(msg: XIMMessage): void {
    const fileName = this.getMessageString(msg);

debugLog('[XIMSystem] JH_FLAGFILE - Flag file for download');
debugLog(`  File: "${fileName}"`);

    // Persist flagged file on the session for host pickup
    // Store as object with filename and confNum for download handler compatibility
    if (!Array.isArray((this.bbsSession as any).flaggedFiles)) {
      (this.bbsSession as any).flaggedFiles = [];
    }

    // Get current conference from session
    const confNum = (this.bbsSession as any).currentConf || 1;

    (this.bbsSession as any).flaggedFiles.push({
      filename: fileName,
      confNum: confNum
    });

debugLog(`[XIMSystem] Flagged "${fileName}" in conf ${confNum}, total flagged: ${(this.bbsSession as any).flaggedFiles.length}`);

    this.reply(msg, 1);
  }

  /**
   * Handle JH_SHOWFLAGS (List flagged files)
   */
  handleShowFlags(msg: XIMMessage): void {
    const flagged = (this.bbsSession as any)?.flaggedFiles || [];
    // Extract filenames from objects (handle both old string format and new object format)
    const filenames = flagged.map((f: any) => typeof f === 'string' ? f : (f.filename || f.fileName || f.name || ''));
    const output = filenames.filter((n: string) => n).join('\r\n');
    this.messageParser.writeMessageString(msg.msgAddr, output);
    this.reply(msg, flagged.length);
  }

  /**
   * Send reply to door via bidirectional XIM protocol
   *
   * CRITICAL FIX 2026-01-20: Detect if door uses native AEDoor.library or direct XIM
   * - Native AEDoor.library doors: Set mn_ReplyPort to their own reply port → use replyMsg()
   * - Direct XIM doors (RTW, Bulls): Set mn_ReplyPort to AEDoorPort → use bidirectional mode
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
    // express.e replies only set msg.string/msg.data; do not modify strptr/fillers.

    // Log outgoing reply to XIM structured logger
    const humanName = this.messageParser.getCommandName(msg.command);
    ximLogger.log('debug', 'send', this.state.doorCommand || 'UNKNOWN', this.bbsSession?.nodeId || 1, {
      type: `${humanName}_REPLY`,
      typeCode: msg.command,
      param: data,
      data: stringValue,
    }, {
      msgAddr: `0x${msg.msgAddr.toString(16)}`,
      message: 'Reply to door request',
    });

    // CRITICAL: Detect if door is using native AEDoor.library or direct XIM protocol
    // Native aedoor.library sets mn_ReplyPort to door's own reply port (NOT AEDoorPort)
    // Direct XIM doors (RTW, Bulls) set mn_ReplyPort to AEDoorPort for bidirectional flow
    const replyPortAddr = this.emulator.readMemory32(msg.msgAddr + 14); // mn_ReplyPort offset
    const useBidirectional = (replyPortAddr === this.ximPortAddr || replyPortAddr === 0);

    if (useBidirectional && this.ximPortAddr !== 0) {
      // Direct XIM door - use bidirectional protocol (reply to AEDoorPort)
      const NT_REPLYMSG = 6;
      this.emulator.writeMemory(msg.msgAddr + 8, NT_REPLYMSG);
      this.execLibrary.putMsg(this.ximPortAddr, msg.msgAddr, { suppressDoorCallback: true });
      debugLog(`[XIMSystem] Reply sent via PutMsg to ximPort=0x${this.ximPortAddr.toString(16)} (bidirectional XIM)`);
    } else {
      // Native AEDoor.library door - use standard reply mechanism
      // The door set mn_ReplyPort to its own reply port, so use replyMsg()
      this.execLibrary.replyMsg(msg.msgAddr);
      debugLog(`[XIMSystem] Reply sent via ReplyMsg to replyPort=0x${replyPortAddr.toString(16)} (native aedoor.library)`);
    }

    // Mark reply as handled so DoorLifecycleManager doesn't send a duplicate
    this.state.replyHandled = true;
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

debugLog(
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

debugLog(`[XIMSystem] ZMODEMRECEIVE: ${dest} -> ${resolved}`);

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

debugLog(
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
debugLog(`[XIMSystem] NETUPLOAD: ${dest} -> ${resolved}`);
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
debugLog(
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
debugLog(
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
      return amigafs.existsSync(target);
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
      if (!amigafs.existsSync(nodeDir)) continue;
      const candidate = path.join(nodeDir, 'Playpen', filename);
      if (amigafs.existsSync(candidate)) {
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

    // AQUASCAN_DEBUG: log loadAccount calls — AquaScan uses this to read user struct
    try {
      const fsLog = require('fs');
      let nameField = '';
      if (userBuf) {
        nameField = userBuf.slice(0, 31).toString('latin1').replace(/\0+.*$/, '');
      }
      fsLog.appendFileSync('/tmp/aquascan-debug.log',
        `[${new Date().toISOString()}] LOAD_ACCOUNT slot=${slot} userPtr=0x${userPtr.toString(16)} userBuf?=${!!userBuf} name="${nameField}"\n`
      );
    } catch (_) {}

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
    if (!amigafs.existsSync(dataPath)) {
      this.reply(msg, 0);
      return;
    }
    const stats = amigafs.statSync(dataPath);
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
      if (!amigafs.existsSync(filePath)) return null;
      const fd = amigafs.openSync(filePath, 'r');
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
      amigafs.mkdirSync(dir, { recursive: true });
      const fd = amigafs.openSync(filePath, amigafs.existsSync(filePath) ? 'r+' : 'w+');
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
    return buf.readUInt16BE(83);
  }

  private setSlotNumber(buf: Buffer, slot: number): Buffer {
    if (buf.length >= 85) {
      buf.writeUInt16BE(slot, 83);
    }
    return buf;
  }

  private setUserKeysNumber(buf: Buffer, slot: number): Buffer {
    if (buf.length >= 35) {
      buf.writeInt32BE(slot, 31);
    }
    return buf;
  }

  private findFreeUserSlot(): number {
    const dataPath = this.userDataPath();
    if (!amigafs.existsSync(dataPath)) {
      return 1;
    }

    try {
      const fd = amigafs.openSync(dataPath, 'r');
      try {
        const stats = fs.fstatSync(fd);
        const count = Math.floor(stats.size / 239);
        const buf = Buffer.alloc(239);
        for (let i = 0; i < count; i++) {
          const bytes = fs.readSync(fd, buf, 0, 239, i * 239);
          if (bytes < 239) break;
          if (buf.readUInt16BE(83) === 0) {
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
      const stat = amigafs.existsSync(resolvedPath) ? amigafs.statSync(resolvedPath) : null;

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
        amigafs.mkdirSync(playpen, { recursive: true });
        const baseName =
          path.basename(originalPath) && path.basename(originalPath) !== path.sep
            ? path.basename(originalPath)
            : resolvedPath || `upload_${Date.now()}.bin`;
        targetPath = path.join(playpen, baseName);
      }

      amigafs.mkdirSync(path.dirname(targetPath), { recursive: true });

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

  // =========================================================================
  // NEW SYSTEM COMMAND HANDLERS (express.e production-ready implementation)
  // =========================================================================

  /**
   * Handle INTERPRET_MCI (621)
   * express.e:4044-4046: Process MCI codes without displaying output
   * Returns the interpreted result in msg.string
   */
  handleInterpretMCI(msg: XIMMessage): void {
    const mciText = this.getMessageString(msg);
debugLog(`[XIMSystem] INTERPRET_MCI: "${mciText.substring(0, 40)}..."`);

    // Process MCI codes and return result
    // For now, return the string as-is (most doors just want variable substitution)
    const processed = this.processMCIString(mciText);

    this.messageParser.writeMessageString(msg.msgAddr, processed);

debugLog(`[XIMSystem]   Processed: "${processed.substring(0, 40)}..."`);
    this.reply(msg, processed.length);
  }

  /**
   * Simple MCI variable substitution for INTERPRET_MCI
   */
  private processMCIString(text: string): string {
    let result = text;

    // Replace common MCI codes with session data
    const user = this.bbsSession?.user;
    const nodeId = this.bbsSession?.nodeId ?? 0;

    result = result.replace(/~US/gi, user?.username || 'Guest');
    result = result.replace(/~LO/gi, user?.location || 'Unknown');
    result = result.replace(/~ND/gi, nodeId.toString());
    result = result.replace(/~BN/gi, this.bbsSession?.bbsName || 'AmiExpress-Web');
    result = result.replace(/~SO/gi, this.bbsSession?.sysopName || 'Sysop');
    result = result.replace(/~CF/gi, this.bbsSession?.conferenceName || 'Main');
    result = result.replace(/~SL/gi, (user?.secLevel ?? 10).toString());

    // Date/time codes
    const now = getSystemTime();
    result = result.replace(/~TI/gi, now.toLocaleTimeString());
    result = result.replace(/~DA/gi, now.toLocaleDateString());

    return result;
  }

  /**
   * Handle CHECK_PLAYPEN_EXISTS (632)
   * express.e:4066-4068: Check if file exists in playpen or globally
   */
  handleCheckPlaypenExists(msg: XIMMessage): void {
    const filename = this.getMessageString(msg);
debugLog(`[XIMSystem] CHECK_PLAYPEN_EXISTS: "${filename}"`);

    let exists = 0;

    // First check directly
    const resolved = this.resolvePath(filename);
    if (this.pathExists(resolved)) {
      exists = 1;
debugLog(`[XIMSystem]   Found at: ${resolved}`);
    } else {
      // Check in playpens (express.e: checkInPlaypens)
      const playpenHit = this.checkInPlaypens(filename);
      if (playpenHit) {
        exists = 1;
debugLog(`[XIMSystem]   Found in playpen: ${playpenHit}`);
      } else {
debugLog(`[XIMSystem]   Not found`);
      }
    }

    this.reply(msg, exists);
  }

  /**
   * Handle SET_FILEATTACH (620)
   * express.e:4042-4043: Set file attachment mode for message editor
   */
  handleSetFileAttach(msg: XIMMessage): void {
    const enabled = msg.data !== 0;
debugLog(`[XIMSystem] SET_FILEATTACH: ${enabled}`);

    (this.state as any).fileAttach = enabled;
    (this.bbsSession as any).fileAttach = enabled;

    this.reply(msg, 1);
  }

  /**
   * Handle DISABLE_FILE_ATTACH (625)
   * express.e:4053-4054: Disable file attachment mode
   */
  handleDisableFileAttach(msg: XIMMessage): void {
    const disabled = msg.data !== 0;
debugLog(`[XIMSystem] DISABLE_FILE_ATTACH: ${disabled}`);

    (this.state as any).disallowFileAttach = disabled;
    (this.bbsSession as any).disallowFileAttach = disabled;

    this.reply(msg, 1);
  }

  /**
   * Handle SETOVERIDE (549)
   * express.e:3953-3954: Set override mode for BBS commands
   */
  handleSetOverride(msg: XIMMessage): void {
    const mode = msg.data;
debugLog(`[XIMSystem] SETOVERIDE: ${mode}`);

    (this.state as any).overrideMode = mode;
    (this.bbsSession as any).overrideMode = mode;

    this.reply(msg, 1);
  }

  /**
   * Handle SETMCIOFF (551)
   * express.e:3957-3958: Disable MCI processing
   */
  handleSetMCIOff(msg: XIMMessage): void {
    const off = msg.data !== 0;
debugLog(`[XIMSystem] SETMCIOFF: ${off}`);

    (this.state as any).mciOff = off;
    (this.bbsSession as any).mciOff = off;

    this.reply(msg, 1);
  }

  /**
   * Handle SIG_LI (912)
   * express.e:4205-4207: Secure line input (password mode, no echo)
   * This is like JH_LI but the input is not echoed to screen
   */
  handleSecureLineInput(msg: XIMMessage): void {
    const maxLen = msg.data > 0 ? msg.data : 80;
debugLog(`[XIMSystem] SIG_LI: maxLen=${maxLen} (secure input, no echo)`);

    // For now, return empty string - actual implementation would need
    // frontend support for password input mode
    // The door expects the result in msg.string
    this.messageParser.writeMessageString(msg.msgAddr, '');

    // TODO: Implement actual secure line input via socket event
    // This would emit 'door:password-input' and wait for response
debugLog(`[XIMSystem]   NOTE: SIG_LI not fully implemented - returning empty string`);

    this.reply(msg, 0);
  }

  /**
   * Handle GET_MENU_COMMAND_CHAR (623)
   * express.e:4049-4050: Get menu command character
   */
  handleGetMenuCommandChar(msg: XIMMessage): void {
    // Return the current menu command character (default is ':')
    const cmdChar = (this.bbsSession as any)?.menuCommandChar || ':';
debugLog(`[XIMSystem] GET_MENU_COMMAND_CHAR: '${cmdChar}'`);

    this.messageParser.writeData(msg.msgAddr, cmdChar.charCodeAt(0));
    this.reply(msg, cmdChar.charCodeAt(0));
  }

  /**
   * Handle CHOOSE_NAME / EXT_CHOOSE_NAME (619/635)
   * express.e:4069-4077: Name picker dialog for user lookup
   */
  handleChooseName(msg: XIMMessage): void {
    const searchName = this.getMessageString(msg);
    const maxLen = msg.data > 0 ? msg.data : 31;
debugLog(`[XIMSystem] CHOOSE_NAME: search="${searchName}" maxLen=${maxLen}`);

    // For now, just return the search string as-is
    // Full implementation would search user database and show picker
    const result = searchName.slice(0, maxLen);
    this.messageParser.writeMessageString(msg.msgAddr, result);

    // Write user data to filler pointers if provided
    // msg.filler1 = user struct, msg.filler2 = userkeys struct
    // For now, leave them unchanged

    this.reply(msg, result.length > 0 ? 1 : 0);
  }

  /**
   * Handle CHECK_REALNAME (636)
   * express.e:4078-4087 — Check what name flavour the current msgbase requires.
   *   2 = USERNAME required (TO: must match an existing handle/username)
   *   1 = REALNAME required (TO: must be a real name)
   *   0 = handle/alias OK (default)
   *
   * USERNAME beats REALNAME if both are set on the same conference.
   * Per-msgbase tooltypes (USERNAME.<n> / REALNAME.<n>) override conf-wide ones.
   */
  handleCheckRealname(msg: XIMMessage): void {
    const confNum = this.bbsSession?.conferenceId || 1;
    const msgBaseNum = (this.bbsSession as any)?.msgBaseNum
      ?? (this.bbsSession as any)?.currentMsgBase
      ?? 0;
    const flags = getConferenceToolFlags(confNum);

    let result = 0;
    if (flags.requireUsernameMsgBases.has(msgBaseNum) || flags.requireUsername) {
      result = 2;
    } else if (flags.requireRealnameMsgBases.has(msgBaseNum) || flags.requireRealname) {
      result = 1;
    }

debugLog(`[XIMSystem] CHECK_REALNAME conf=${confNum} mb=${msgBaseNum} → ${result}`);
    this.reply(msg, result);
  }

  /**
   * Handle CON_CURSOR (705)
   * express.e:4121-4126: Turn console cursor on/off
   */
  handleConCursor(msg: XIMMessage): void {
    const cursorOn = msg.data !== 0;
debugLog(`[XIMSystem] CON_CURSOR: ${cursorOn ? 'ON' : 'OFF'}`);

    // Emit cursor control to frontend
    if (cursorOn) {
      this.socket.emit('ansi-output', '\x1b[?25h'); // Show cursor
    } else {
      this.socket.emit('ansi-output', '\x1b[?25l'); // Hide cursor
    }

    this.reply(msg, 1);
  }
}

import { Socket } from "socket.io";
import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { ExecLibrary } from "./ExecLibrary";
import { XIMCommand } from "../xim/types";
import { getSystemTime } from '../../utils/date-time.util';

interface DoorInterfaceState {
  difaceAddr: number;
  bbsPortAddr: number;        // 0x00: dif_AEPort
  replyPortAddr: number;      // 0x04: dif_ReplyPort
  messageAddr: number;        // 0x08: dif_Message
  eventHookAddr: number;      // 0x08: dif_EventHook (was missing)
  nameBufAddr: number;        // 0x0C: dif_NameBuf (16 bytes)
  bbsInfoAddr: number;        // 0x46: dif_BBSInfo
  nodeBufAddr: number;        // 0xDC: dif_NodeBuf
  nodeStateAddr: number;      // 0xE4: dif_NodeState (CRITICAL for Bulls)
  dataPtr: number;            // 0x1C: dif_DataPtr
  stringPtr: number;          // 0x20: dif_String
  replyNameAddr: number;      // 0x0C: dif_ReplyName
  nodeId: number;
  stringCapacity: number;
}

interface PromptState {
  state: DoorInterfaceState;
  maxlen: number;
  resolve: (value: string) => void;
}

const MEMF_CLEAR = 1 << 16;
const DIFACE_SIZE = 0x146;  // Complete DoorInfo structure size
const DIFACE_MSG_OFFSET = 0x46;
const DIFACE_EVENT_HOOK_OFFSET = 0x08;
const DIFACE_NAME_BUF_OFFSET = 0x0C;
const DIFACE_BBS_INFO_OFFSET = 0x46;
const DIFACE_NODE_BUF_OFFSET = 0xDC;
const DIFACE_NODE_STATE_OFFSET = 0xE4;
const DIFACE_REPLY_NAME_OFFSET = 0x0c;
const DIFACE_DATA_PTR_OFFSET = 0x1c;
const DIFACE_STRING_PTR_OFFSET = 0x20;
// jhMessage structure offsets (from DoorHeader.h):
// Message(20) + String[200](offset 20/0x14) + Data(offset 220/0xDC) + Command(offset 224/0xE0)
const MESSAGE_STRING_OFFSET = 0x14;   // 20 - start of String[200] buffer
const MESSAGE_DATA_OFFSET = 0xDC;     // 220 - int Data field
const MESSAGE_COMMAND_OFFSET = 0xE0;  // 224 - int Command field
const MESSAGE_REPLY_PORT_OFFSET = 14;
const MESSAGE_LENGTH_OFFSET = 18;
const MESSAGE_LENGTH = 0x100;  // mn_Length = 256 bytes (matches native AEDoor.library line 213)
// CRITICAL: Native AEDoor.library uses 198-char limit (DBEQ D1=0xC6 in sendStrCmd/copyStr)
// The DBEQ instruction decrements D1 from 198 to -1, allowing 199 iterations
// but the last write is the null terminator, giving 198 actual chars.
const MESSAGE_STRING_CAPACITY = 198;

/**
 * AEDoor.library Bridge Class
 *
 * ============================================================================
 * ARCHITECTURAL STATUS (2026-01-08) - TRAP-BASED (ACTIVE)
 * ============================================================================
 *
 * HISTORY:
 * - 2024: TypeScript trap-based implementation (working)
 * - Dec 2025: Switched to native AEDoor.library binary (broken)
 * - Jan 2026: Restored trap-based implementation (working)
 *
 * CURRENT ARCHITECTURE:
 * - LibraryTraps.ts installs ILLEGAL instruction traps at library vectors
 * - When doors call library functions, traps intercept and call methods
 *   in this class (createComm, writeStr, hotKey, etc.)
 * - This TypeScript code constructs XIM messages and sends them to the BBS
 * - Messages route through XIMProtocol.handleMessage()
 *
 * WHY NOT NATIVE:
 * - Native AEDoor.library binary (./Libs/AEDoor.library) exists but doesn't work
 * - Native code expects DoorInfo/NodeStatus structures we don't initialize properly
 * - Doors using native library exit immediately without sending XIM messages
 * - Trap-based approach gives us full control over XIM protocol
 *
 * DOORINFO STRUCTURE (DIFace):
 * The real 68K AEDoor.library allocates a DIFace structure that contains:
 *   0x00: dif_AEPort   -> Pointer to AEDoorPortX (BBS message port)
 *   0x04: dif_MsgPort  -> Pointer to the door's reply port
 *   0x08: dif_Message  -> Pointer to embedded jhMessage record
 *   0x0C: dif_ReplyName[16]
 *   0x1C: dif_DataPtr  -> Pointer to jhMessage.data
 *   0x20: dif_String   -> Pointer to jhMessage.string[200]
 *
 * Using the disassembly of Libs/AEDoor.library we reproduce the same layout
 * so that 68K doors see exactly what they expect.
 * ============================================================================
 */
export class AEDoorLibrary {
  private socket: Socket;
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private sessionData: any;
  private interfaces = new Map<number, DoorInterfaceState>();
  private activePrompt: PromptState | null = null;

  // Callback to process XIM messages synchronously during waitForReply
  // This is needed because trap handlers are synchronous and can't yield to async polling
  private processXIMMessageCallback: ((bbsPortAddr: number) => void) | null = null;

  constructor(
    socket: Socket,
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    sessionData: any
  ) {
    this.socket = socket;
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.sessionData = sessionData;

    this.setupInputHandler();
  }

  /**
   * Set callback for processing XIM messages synchronously
   * This is called from waitForReply to process pending messages
   * The callback should:
   * 1. Get message from bbsPortAddr via getMsg
   * 2. Parse and handle the XIM command
   * 3. Send reply via replyMsg
   */
  setXIMProcessor(callback: (bbsPortAddr: number) => void): void {
    this.processXIMMessageCallback = callback;
  }

  /**
   * Hook terminal input events for Prompt()/GetStr()
   */
  private setupInputHandler(): void {
    this.socket.on("door:input", (data: string) => {
      if (!this.activePrompt) {
        return;
      }

      const { state, maxlen, resolve } = this.activePrompt;
      const trimmed = data.slice(0, maxlen);

      this.writeCString(state.stringPtr, trimmed, state.stringCapacity);
      this.emulator.resume();
      this.activePrompt = null;
      resolve(trimmed);
    });
  }

  /**
   * CreateComm() - LVO -30
   *
   * Establishes the DIFace, reply port, and jhMessage structure.
   *
   * CRITICAL FIX 2025-12-16: Re-enabled trap to populate BBSInfo for native doors
   * Previously disabled, causing user data queries to return garbage.
   */
  createComm(): number {
    const nodeId = this.resolveNodeId();
console.log(`[AEDoorLibrary] CreateComm for node ${nodeId}`);
    const bbsPortAddr = this.findBbsPort(nodeId);

    if (bbsPortAddr === 0) {
console.warn(`[AEDoorLibrary] CreateComm: AEDoorPort${nodeId} not found`);
      this.emulator.setRegister(0, 0);
      return 0;
    }

    const difaceAddr = this.execLibrary.allocMem(DIFACE_SIZE, MEMF_CLEAR);
    if (difaceAddr === 0) {
console.warn("[AEDoorLibrary] CreateComm: AllocMem failed");
      this.emulator.setRegister(0, 0);
      return 0;
    }

    const messageAddr = difaceAddr + DIFACE_MSG_OFFSET;
    const replyNameAddr = difaceAddr + DIFACE_REPLY_NAME_OFFSET;
    const replyName = `DoorReplyPort${nodeId}`;
    this.writeCString(replyNameAddr, replyName, 16);

    const replyPortAddr = this.execLibrary.createPort(replyNameAddr, 0);
    if (replyPortAddr === 0) {
console.warn("[AEDoorLibrary] CreateComm: CreatePort failed");
      this.execLibrary.freeMem(difaceAddr, DIFACE_SIZE);
      this.emulator.setRegister(0, 0);
      return 0;
    }

    const stringPtr = messageAddr + MESSAGE_STRING_OFFSET;
    const dataPtr = messageAddr + MESSAGE_DATA_OFFSET;

    this.emulator.writeMemory32(difaceAddr + 0x00, bbsPortAddr);
    this.emulator.writeMemory32(difaceAddr + 0x04, replyPortAddr);
    this.emulator.writeMemory32(difaceAddr + 0x08, messageAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_DATA_PTR_OFFSET, dataPtr);
    this.emulator.writeMemory32(
      difaceAddr + DIFACE_STRING_PTR_OFFSET,
      stringPtr
    );

    this.emulator.writeMemory32(
      messageAddr + MESSAGE_REPLY_PORT_OFFSET,
      replyPortAddr
    );
    this.emulator.writeMemory16(
      messageAddr + MESSAGE_LENGTH_OFFSET,
      MESSAGE_LENGTH
    );
    this.emulator.writeMemory32(messageAddr + MESSAGE_COMMAND_OFFSET, 0);
    this.emulator.writeMemory32(messageAddr + MESSAGE_DATA_OFFSET, 0);
    this.clearBuffer(stringPtr, MESSAGE_STRING_CAPACITY);

    // Allocate additional buffers required by DoorInfo structure
    const eventHookAddr = this.execLibrary.allocMem(4, MEMF_CLEAR); // 4 bytes for event hook pointer
    const nameBufAddr = this.execLibrary.allocMem(16, MEMF_CLEAR);  // 16 bytes for CLI/SysOp name
    const bbsInfoAddr = this.execLibrary.allocMem(152, MEMF_CLEAR); // BBS info buffer
    const nodeBufAddr = this.execLibrary.allocMem(255, MEMF_CLEAR);   // Per-node status buffer
    const nodeStateAddr = this.execLibrary.allocMem(512, MEMF_CLEAR); // Node state data (CRITICAL)

    // Initialize DoorInfo structure with all required fields
    this.emulator.writeMemory32(difaceAddr + DIFACE_EVENT_HOOK_OFFSET, eventHookAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_NAME_BUF_OFFSET, nameBufAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_BBS_INFO_OFFSET, bbsInfoAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_NODE_BUF_OFFSET, nodeBufAddr);
    this.emulator.writeMemory32(difaceAddr + DIFACE_NODE_STATE_OFFSET, nodeStateAddr);

    // Initialize node state data (critical for Bulls door and others)
    // Format: [word count][security level][user data...]
    this.emulator.writeMemory16(nodeStateAddr, 255);     // Word count
    this.emulator.writeMemory16(nodeStateAddr + 2, 100); // Security level
    this.emulator.writeMemory16(nodeStateAddr + 4, nodeId); // Node ID
    this.emulator.writeMemory16(nodeStateAddr + 6, 1); // Active flag
    this.emulator.writeMemory16(nodeStateAddr + 8, 0); // Reserved
    this.emulator.writeMemory16(nodeStateAddr + 10, 0); // Reserved
    this.emulator.writeMemory16(nodeStateAddr + 12, 0); // Reserved
    this.emulator.writeMemory16(nodeStateAddr + 14, 0); // Reserved

    const state: DoorInterfaceState = {
      difaceAddr,
      bbsPortAddr,
      replyPortAddr,
      messageAddr,
      eventHookAddr,
      nameBufAddr,
      bbsInfoAddr,
      nodeBufAddr,
      nodeStateAddr,
      dataPtr,
      stringPtr,
      replyNameAddr,
      nodeId,
      stringCapacity: MESSAGE_STRING_CAPACITY,
    };

    // Store door command name in name buffer (for doors that need to know how they were launched)
    const commandName = this.getDoorCommandName();
    if (commandName) {
      this.writeCString(nameBufAddr, commandName, 16); // CLI name buffer is 16 bytes
    }

    this.interfaces.set(difaceAddr, state);
    this.emulator.setRegister(0, difaceAddr);

    // CRITICAL FIX 2025-12-16: Populate BBSInfo with actual user data
    // This ensures getname(), getlocation(), getbbsname(), GetTheDate(), GetTheTime()
    // return correct values instead of garbage
    this.populateBBSInfo(difaceAddr);

    // NOTE: Do NOT send unsolicited startup messages here!
    // XIM doors expect REPLIES to messages they send, not unsolicited messages.
    // The door will send JH_REGISTER and wait for the reply.

    return difaceAddr;
  }

  /**
   * Populate BBSInfo structure with actual user data
   *
   * CRITICAL FIX 2025-12-16: This method populates the BBSInfo structure
   * that AEDoor.library's query functions (getname, getlocation, getbbsname,
   * GetTheDate, GetTheTime) read from.
   *
   * Without this, doors see garbage data for user information.
   *
   * @param difaceAddr - Address of DIFace structure
   */
  private populateBBSInfo(difaceAddr: number): void {
console.log(`[AEDoorLibrary] Populating BBSInfo at DIFace 0x${difaceAddr.toString(16)}`);

    // BBSInfo is at DIFace + 0x46
    const bbsInfoAddr = difaceAddr + 0x46;

    // Get user data from session
    const username = this.sessionData?.user?.username || 'Guest';
    const location = this.sessionData?.user?.location || 'Unknown';
    const bbsName = 'AmiExpress-Web';

    // Get current date and time
    const now = getSystemTime();
    const dateStr = now.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    }).replace(/\//g, '-'); // MM-DD-YYYY
    const timeStr = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }); // HH:MM:SS

    // CRITICAL: Write node ID to BBSInfo+0xf (RTW and other doors read this!)
    // RTW reads node number from offset 0xf to format "AEDoorPort%d" port name
    const nodeId = this.resolveNodeId();
    this.emulator.writeMemory(bbsInfoAddr + 0xf, nodeId); // Node ID as byte at +0xf
console.log(`[AEDoorLibrary] Wrote node ID ${nodeId} to BBSInfo+0xf`);

    // Write to BBSInfo structure at known offsets
    // Based on AEDoor.library disassembly and XIM system-commands.ts
    this.writeCString(bbsInfoAddr + 0x14, username, 198);  // User name at +0x14
    this.writeCString(bbsInfoAddr + 0xdc, location, 60);   // Location at +0xdc
    this.writeCString(bbsInfoAddr + 0x120, bbsName, 40);   // BBS name at +0x120
    this.writeCString(bbsInfoAddr + 0x150, dateStr, 19);   // Date at +0x150
    this.writeCString(bbsInfoAddr + 0x170, timeStr, 19);   // Time at +0x170

    // Write numeric fields for doors like ZooStats that read user status from BBSInfo
    // user.id can be string or number
    const userIdRaw = this.sessionData?.user?.id;
    const userSlot = typeof userIdRaw === 'string' ? parseInt(userIdRaw, 10) || nodeId : (userIdRaw ?? nodeId);
    const secLevel = this.sessionData?.user?.secLevel ?? 10;
    const conference = (this.sessionData as any)?.currentConf ?? 1;
    // timeRemaining can be at session level (minutes) or user.timeLimit (seconds)
    const sessionTimeRemaining = (this.sessionData as any)?.timeRemaining;
    const timeRemaining = sessionTimeRemaining ?? Math.floor((this.sessionData?.user?.timeLimit ?? 3600) / 60);
    const uploads = this.sessionData?.user?.uploads ?? 0;
    const downloads = this.sessionData?.user?.downloads ?? 0;

    // Write numeric values to BBSInfo structure (16-bit integers, big-endian for 68K)
    this.emulator.writeMemory16(bbsInfoAddr + 0x00, userSlot);      // User slot at +0x00
    this.emulator.writeMemory16(bbsInfoAddr + 0x02, secLevel);      // Security level at +0x02
    this.emulator.writeMemory16(bbsInfoAddr + 0x04, conference);    // Conference at +0x04
    this.emulator.writeMemory16(bbsInfoAddr + 0x06, timeRemaining); // Time remaining at +0x06
    this.emulator.writeMemory16(bbsInfoAddr + 0x08, uploads);       // Uploads at +0x08
    this.emulator.writeMemory16(bbsInfoAddr + 0x0a, downloads);     // Downloads at +0x0a

console.log(`[AEDoorLibrary] Numeric fields: slot=${userSlot} secLevel=${secLevel} conf=${conference} time=${timeRemaining}`);

    // CRITICAL: Do NOT overwrite DoorInfo+0x1c (dif_Data) and DoorInfo+0x20 (dif_String)!
    // These MUST point to the message buffer (JHM_Data and JHM_String), not to BBSInfo.
    // They are correctly set in createComm() and used by getData/getString/prompt/etc.
    // BBSInfo is a separate structure at 0x46 for direct user data access.

console.log(`[AEDoorLibrary] BBSInfo populated:`);
console.log(`[AEDoorLibrary]   Username: "${username}" at 0x${(bbsInfoAddr + 0x14).toString(16)}`);
console.log(`[AEDoorLibrary]   Location: "${location}" at 0x${(bbsInfoAddr + 0xdc).toString(16)}`);
console.log(`[AEDoorLibrary]   BBS Name: "${bbsName}" at 0x${(bbsInfoAddr + 0x120).toString(16)}`);
console.log(`[AEDoorLibrary]   Date: "${dateStr}" at 0x${(bbsInfoAddr + 0x150).toString(16)}`);
console.log(`[AEDoorLibrary]   Time: "${timeStr}" at 0x${(bbsInfoAddr + 0x170).toString(16)}`);

    // Read back verification
    const verifyUser = this.readCString(bbsInfoAddr + 0x14, 198);
    const verifyLoc = this.readCString(bbsInfoAddr + 0xdc, 60);
    const verifyBbs = this.readCString(bbsInfoAddr + 0x120, 40);

console.log(`[AEDoorLibrary] Verification read-back:`);
console.log(`[AEDoorLibrary]   Username: "${verifyUser}"`);
console.log(`[AEDoorLibrary]   Location: "${verifyLoc}"`);
console.log(`[AEDoorLibrary]   BBS Name: "${verifyBbs}"`);
  }

  /**
   * DeleteComm() - LVO -36
   *
   * Native behavior (from aedoor.library.asm lines 248-269):
   *   deleteComm:
   *       MOVEM.L D1-D7/A2-A6,-(SP)
   *   deleteComm2:
   *       MOVEQ   #JH_SHUTDOWN,D0  ; D0 = 2 (JH_SHUTDOWN)
   *       BSR.W   sendCmd          ; Send shutdown command
   *   deleteComm3:
   *       ... (save pointers, get SysBase)
   *       JSR     _LVORemPort(A6)  ; Remove reply port
   *       JSR     _LVOFreeSignal(A6) ; Free signal
   *   deleteComm4:
   *       JSR     _LVOFreeMem(A6)  ; Free 326 bytes
   *       MOVEQ   #0,D0            ; Return 0
   *       MOVEM.L (SP)+,D1-D7/A2-A6
   *       RTS
   *
   * Register inputs:
   *   A1 = DoorInfo pointer
   *
   * Returns:
   *   D0 = 0
   */
  deleteComm(): void {
    const state = this.getStateFromA1();
    if (!state) {
      return;
    }

    console.log(`[AEDoorLibrary] DeleteComm for DIFace 0x${state.difaceAddr.toString(16)}`);

    // Send JH_SHUTDOWN (command 2) like native does
    this.dispatchCommand(state, XIMCommand.JH_SHUTDOWN, {});

    // Remove from interfaces map
    this.interfaces.delete(state.difaceAddr);

    // Cleanup: Remove port, free signal, free memory
    if (state.replyPortAddr) {
      this.execLibrary.deleteMsgPort(state.replyPortAddr);
    }

    // Free additional buffers we allocated in createComm
    if (state.eventHookAddr) this.execLibrary.freeMem(state.eventHookAddr, 4);
    if (state.nameBufAddr) this.execLibrary.freeMem(state.nameBufAddr, 16);
    if (state.bbsInfoAddr) this.execLibrary.freeMem(state.bbsInfoAddr, 152);
    if (state.nodeBufAddr) this.execLibrary.freeMem(state.nodeBufAddr, 255);
    if (state.nodeStateAddr) this.execLibrary.freeMem(state.nodeStateAddr, 512);

    // Free main DoorInfo structure
    this.execLibrary.freeMem(state.difaceAddr, DIFACE_SIZE);

    // Return 0 (native does this)
    this.emulator.setRegister(0, 0);
  }

  /**
   * SendCmd() - LVO -42
   */
  sendCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const result = this.dispatchCommand(state, command, {
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SendStrCmd() - LVO -48
   */
  sendStrCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const stringAddr = this.emulator.getRegister(8);
    const text = this.readCString(stringAddr, state.stringCapacity);
    const result = this.dispatchCommand(state, command, {
      string: text,
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SendDataCmd() - LVO -54
   */
  sendDataCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const dataValue = this.emulator.getRegister(1);
    const result = this.dispatchCommand(state, command, { data: dataValue });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SendStrDataCmd() - LVO -60
   */
  sendStrDataCmd(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const command = this.emulator.getRegister(0);
    const dataValue = this.emulator.getRegister(1);
    const stringAddr = this.emulator.getRegister(8);
    const text = this.readCString(stringAddr, state.stringCapacity);

    const result = this.dispatchCommand(state, command, {
      string: text,
      data: dataValue,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * GetData() - LVO -66
   *
   * Returns pointer to the data field inside the jhMessage.
   */
  getData(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const dataPtr = this.emulator.readMemory32(
      state.difaceAddr + DIFACE_DATA_PTR_OFFSET
    );
    this.emulator.setRegister(0, dataPtr);
    return dataPtr;
  }

  /**
   * GetString() - LVO -72
   *
   * Returns pointer to the shared string buffer (jhMessage.string).
   */
  getString(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const stringPtr = this.emulator.readMemory32(
      state.difaceAddr + DIFACE_STRING_PTR_OFFSET
    );
    // DEBUG: Log what the door reads
    const stringContent = this.readCString(stringPtr, 40);
    console.log(`[AEDoorLibrary] getString() -> 0x${stringPtr.toString(16)}, content: "${stringContent}"`);
    this.emulator.setRegister(0, stringPtr);
    return stringPtr;
  }

  /**
   * Prompt() - LVO -78
   *
   * Native behavior (from aedoor.library.asm lines 330-342):
   *   prompt:
   *       MOVEQ   #JH_PM,D0        ; Command = 5 (Prompt Message)
   *       BSR.S   sendStrDataCmd   ; Send with string from A0, data from D1
   *       MOVEA.L dif_Data(A1),A0  ; A0 = pointer to JHM_Data
   *       MOVEQ   #-1,D0           ; D0 = -1
   *       CMP.L   (A0),D0          ; Compare JHM_Data value with -1
   *       BEQ.S   .nostr           ; If equal, carrier lost
   *       MOVE.L  dif_String(A1),D0 ; Return string pointer
   *       RTS
   *   .nostr:
   *       MOVEQ   #0,D0            ; Return 0
   *       RTS
   *
   * Register inputs:
   *   A0 = prompt string pointer
   *   D1 = max length (passed to BBS)
   *   A1 = DoorInfo pointer
   *
   * Returns:
   *   D0 = stringPtr (user input) or 0 if carrier lost
   */
  prompt(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const promptAddr = this.emulator.getRegister(8);  // A0 = prompt string
    const maxlen = this.emulator.getRegister(1);      // D1 = max length
    const promptText = promptAddr ? this.readCString(promptAddr, MESSAGE_STRING_CAPACITY) : "";

    console.log(`[AEDoorLibrary] Prompt(maxlen=${maxlen}) -> "${promptText}"`);

    // Send JH_PM (command 5) with prompt string from A0, data from D1
    const result = this.dispatchCommand(state, XIMCommand.JH_PM, {
      string: promptText,
      data: maxlen,
    });

    // Check for carrier lost (data = -1)
    const dataValue = this.emulator.readMemory32(state.dataPtr);
    if (dataValue === 0xFFFFFFFF) { // -1 as unsigned 32-bit
      this.emulator.setRegister(0, 0);
      return 0;
    }

    // DEBUG: Log the result string
    const resultStr = this.readCString(state.stringPtr, 40);
    console.log(`[AEDoorLibrary] Prompt() completed -> stringPtr=0x${state.stringPtr.toString(16)} content: "${resultStr}"`);

    // Return string pointer (where user input is stored)
    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * WriteStr() - LVO -84
   *
   * Native behavior (from aedoor.library.asm lines 344-368):
   * 1. Copies string to msg buffer in 198-char chunks
   * 2. For each full chunk, sends JH_SM with data=0 (no newline)
   * 3. For final chunk, sends JH_SM with original newline flag
   * 4. Uses command JH_SM (4), NOT JH_WRITE (3)
   *
   * Register inputs:
   *   A0 = string pointer
   *   D0 = newline flag (0=no newline, 1=add newline after final chunk)
   */
  writeStr(): number {
    const state = this.getStateFromA1();

    // Handle direct calls from vbcc/C doors (no XIM state)
    if (!state) {
      const stringAddr = this.emulator.getRegister(8); // A0 = text pointer
      const text = this.readCString(stringAddr, 4096);
      console.log(`[AEDoorLibrary] WriteStr(direct): "${text}"`);
      this.socket.emit("ansi-output", text);
      this.emulator.setRegister(0, 0); // Success
      return 0;
    }

    // Handle XIM doors with state
    const stringAddr = this.emulator.getRegister(8); // A0 = string pointer
    // Native aedoor.library libFunc11 masks D1 to bit 0:
    //   MOVEQ #1,D7
    //   AND.B D1,D7
    // Other bits are ignored. SysInfo passes D1=2; without masking we were
    // forwarding msg.data=2, which handleSendMessage (data !== 0) treated
    // as "add newline" and injected extra blank lines between box sections.
    const newlineFlag = this.emulator.getRegister(1) & 1; // D1 bit 0 only
    const fullText = this.readCString(stringAddr, 4096); // Read full string (may be > 198 chars)

    // Chunk string into 198-char pieces like native (DBEQ D1=0xC6)
    let offset = 0;
    let result = 0;

    while (offset < fullText.length) {
      const remaining = fullText.length - offset;
      const chunkLen = Math.min(remaining, MESSAGE_STRING_CAPACITY);
      const chunk = fullText.substring(offset, offset + chunkLen);
      const isLastChunk = offset + chunkLen >= fullText.length;

      // For intermediate chunks: data=0 (no newline)
      // For final chunk: data=original newline flag
      let chunkText = chunk;
      if (isLastChunk && newlineFlag) {
        chunkText += "\r\n";
      }

      // Native aedoor.library WriteStr puts D1 (newline flag) into msg.data
      // and the string into msg.string (embedded). `useStringPointer: true`
      // would overwrite msg.data with state.stringPtr, causing every JH_SM
      // to look like "data != 0 → add newline" to handleSendMessage and
      // break multi-chunk box-drawing output (SysInfo borders, zOOsTAT).
      // options.string already gets written to state.stringPtr inside
      // dispatchCommand, so leaving useStringPointer off is the correct
      // mirror of the 68K side.
      result = this.dispatchCommand(state, XIMCommand.JH_SM, {
        string: chunkText,
        data: isLastChunk ? newlineFlag : 0,
      });

      offset += chunkLen;
    }

    // Handle empty string case
    if (fullText.length === 0) {
      let text = "";
      if (newlineFlag) {
        text = "\r\n";
      }
      result = this.dispatchCommand(state, XIMCommand.JH_SM, {
        string: text,
        data: newlineFlag,
      });
    }

    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * ShowGFile() - LVO -90
   *
   * Native behavior (from aedoor.library.asm lines 373-375):
   *   MOVEQ #JH_SG,D0     ; Command = 7
   *   BRA.W sendStrCmd    ; Jump to sendStrCmd
   *
   * Sends command 7 with filename string from A0.
   *
   * Register inputs:
   *   A0 = filename string pointer
   *   A1 = DoorInfo pointer
   */
  showGFile(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const filenameAddr = this.emulator.getRegister(8); // A0 = filename (NOT A2!)
    const filename = this.readCString(filenameAddr, MESSAGE_STRING_CAPACITY);
    const result = this.dispatchCommand(state, XIMCommand.JH_SG, {
      string: filename,
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * ShowFile() - LVO -96
   *
   * Native behavior (from aedoor.library.asm lines 377-379):
   *   MOVEQ #JH_SF,D0     ; Command = 8
   *   BRA.W sendStrCmd    ; Jump to sendStrCmd
   *
   * Sends command 8 with filename string from A0.
   *
   * Register inputs:
   *   A0 = filename string pointer
   *   A1 = DoorInfo pointer
   */
  showFile(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const filenameAddr = this.emulator.getRegister(8); // A0 = filename (NOT A2!)
    const filename = this.readCString(filenameAddr, MESSAGE_STRING_CAPACITY);
    const result = this.dispatchCommand(state, XIMCommand.JH_SF, {
      string: filename,
      useStringPointer: true,
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * SetDT() - LVO -102
   *
   * Native behavior (from aedoor.library.asm lines 381-387):
   * Shared function with getDT, differentiated by D1 flag.
   * For setDT (D1=0): Writes string from A0 to user data field.
   *
   * Register inputs:
   *   D0 = data type field (DT_NAME, DT_LOCATION, etc.)
   *   D1 = 0 (write mode - setDT)
   *   A0 = pointer to string value to write
   *   A1 = DoorInfo pointer
   */
  setDT(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const dataType = this.emulator.getRegister(0);
    const valueAddr = this.emulator.getRegister(8); // A0 = string pointer (NOT A2!)
    const value = this.readCString(valueAddr, state.stringCapacity);

    const result = this.dispatchCommand(state, dataType, {
      string: value,
      data: 0, // D1=0 for write mode
    });
    this.emulator.setRegister(0, result);
    return result;
  }

  /**
   * GetDT() - LVO -108
   *
   * Native behavior (from aedoor.library.asm lines 381-399):
   * Shared function with setDT, differentiated by D1 flag.
   * For getDT (D1=1): Reads user data field into msg.string.
   *
   * Register inputs:
   *   D0 = data type field (DT_NAME, DT_LOCATION, etc.)
   *   D1 = 1 (read mode - getDT)
   *   A1 = DoorInfo pointer
   *
   * Returns:
   *   D0 = stringPtr (pointer to result in msg buffer)
   *   Returns 0 if carrier lost (data = -1)
   *
   * NOTE: Native getDT does NOT copy to a destination buffer.
   * The door calls copyStr() separately if it needs to copy the result.
   */
  getDT(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const dataType = this.emulator.getRegister(0);
    const result = this.dispatchCommand(state, dataType, {
      data: 1, // D1=1 for read mode
    });

    // Native checks dif_Data for carrier lost (-1)
    // If carrier lost, return 0; otherwise return stringPtr
    if (result === -1) {
      this.emulator.setRegister(0, 0);
      return 0;
    }

    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * GetStr() - LVO -114
   *
   * Native behavior (from aedoor.library.asm lines 389-401):
   *   getStr:
   *       MOVEQ   #0,D0           ; D0 = 0 (JH_LI command)
   *       BSR.W   sendStrDataCmd  ; Send with string from A0, data from D1
   *       MOVEA.L dif_Data(A1),A0 ; A0 = pointer to JHM_Data
   *       MOVEQ   #-1,D0          ; D0 = -1
   *       CMP.L   (A0),D0         ; Compare JHM_Data value with -1
   *       BEQ.S   .nostr          ; If equal, carrier lost
   *       MOVE.L  dif_String(A1),D0 ; Return string pointer
   *       RTS
   *   .nostr:
   *       MOVEQ   #0,D0           ; Return 0
   *       RTS
   *
   * Register inputs:
   *   A0 = default/prompt string pointer (may be NULL)
   *   D1 = data value (passed to BBS, e.g., max length)
   *   A1 = DoorInfo pointer
   *
   * Returns:
   *   D0 = stringPtr (user input) or 0 if carrier lost
   */
  getStr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const defaultAddr = this.emulator.getRegister(8);  // A0 = default/prompt string
    const dataValue = this.emulator.getRegister(1);    // D1 = data value
    const defaultStr = defaultAddr ? this.readCString(defaultAddr, MESSAGE_STRING_CAPACITY) : "";

    console.log(`[AEDoorLibrary] GetStr(data=${dataValue}) -> "${defaultStr}"`);

    // Send command 0 (JH_LI) with string from A0, data from D1
    const result = this.dispatchCommand(state, XIMCommand.JH_LI, {
      string: defaultStr,
      data: dataValue,
    });

    // Check for carrier lost (data = -1)
    const replyData = this.emulator.readMemory32(state.dataPtr);
    if (replyData === 0xFFFFFFFF) { // -1 as unsigned 32-bit
      this.emulator.setRegister(0, 0);
      return 0;
    }

    // DEBUG: Log the result string
    const resultStr = this.readCString(state.stringPtr, 40);
    console.log(`[AEDoorLibrary] GetStr() completed -> stringPtr=0x${state.stringPtr.toString(16)} content: "${resultStr}"`);

    // Return string pointer (where user input is stored)
    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * CopyStr() - LVO -120
   *
   * Native behavior (from aedoor.library.asm lines 406-409):
   * Copies string FROM stringPtr (library buffer) TO door's buffer (A0).
   * Uses DBEQ loop with 198 char limit.
   *
   * Register inputs:
   *   A0 = destination buffer (door's storage) - NOT A2!
   *   A1 = DoorInfo pointer
   *   (D0 is used internally, but native uses fixed 198 char limit)
   *
   * Returns:
   *   D0 = destination buffer pointer
   */
  copyStr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    const destAddr = this.emulator.getRegister(8); // A0 = destination (NOT A2!)
    // Native uses fixed 198 char limit (DBEQ D1=0xC6)
    const maxlen = MESSAGE_STRING_CAPACITY;

    // Copy FROM stringPtr (library's buffer with GetDT result) TO destAddr (door's buffer)
    const source = this.readCString(state.stringPtr, maxlen);
    // DEBUG: Log what's being copied
    console.log(`[AEDoorLibrary] copyStr() from 0x${state.stringPtr.toString(16)} to 0x${destAddr.toString(16)}: "${source.slice(0, 40)}"`);
    if (destAddr) {
      this.writeCString(destAddr, source, maxlen);
      this.emulator.setRegister(0, destAddr);
      return destAddr;
    }

    this.emulator.setRegister(0, state.stringPtr);
    return state.stringPtr;
  }

  /**
   * HotKey() - LVO -126
   *
   * Native behavior (from aedoor.library.asm lines 414-425):
   *   hotKey:
   *       MOVEQ   #6,D0           ; D0 = 6 (JH_HK command)
   *       BSR.W   sendStrCmd      ; Send with prompt string from A0
   *       MOVEA.L dif_Data(A1),A0 ; A0 = pointer to JHM_Data
   *       MOVE.L  (A0),D0         ; D0 = JHM_Data value
   *       BMI.S   .exit           ; If negative, return D0 (error/carrier lost)
   *       MOVEA.L dif_String(A1),A0 ; A0 = string buffer
   *       MOVEQ   #0,D0           ; Clear D0
   *       MOVE.B  (A0),D0         ; D0 = first byte of string (the key)
   *       MOVEQ   #0,D1           ; D1 = 0
   *   .exit:
   *       RTS
   *
   * Register inputs:
   *   A0 = prompt string pointer (may be NULL)
   *   A1 = DoorInfo pointer
   *
   * Returns:
   *   D0 = character code (0-255) if key pressed
   *   D0 = negative value if error/carrier lost
   *   D1 = 0 on success
   */
  hotKey(): number {
    const state = this.getStateFromA1();
    if (!state) {
      this.emulator.setRegister(0, -1);
      return -1;
    }

    const promptAddr = this.emulator.getRegister(8);  // A0 = prompt string
    const promptText = promptAddr ? this.readCString(promptAddr, MESSAGE_STRING_CAPACITY) : "";

    console.log(`[AEDoorLibrary] HotKey() prompt="${promptText}"`);

    // Send JH_HK (command 6) with prompt string from A0
    const result = this.dispatchCommand(state, XIMCommand.JH_HK, {
      string: promptText,
      useStringPointer: true,
    });

    // Check reply data value
    const dataValue = this.emulator.readMemory32(state.dataPtr);

    // If data is negative (signed), return it as error/carrier lost
    if ((dataValue & 0x80000000) !== 0) {
      // Convert to signed 32-bit
      const signedValue = dataValue | 0;
      this.emulator.setRegister(0, signedValue);
      console.log(`[AEDoorLibrary] HotKey() -> error/carrier lost: ${signedValue}`);
      return signedValue;
    }

    // Get first character from string buffer
    const charCode = this.emulator.readMemory(state.stringPtr);
    this.emulator.setRegister(0, charCode);
    this.emulator.setRegister(1, 0);  // D1 = 0 on success

    console.log(`[AEDoorLibrary] HotKey() -> char: ${charCode} ('${String.fromCharCode(charCode)}')`);
    return charCode;
  }

  /**
   * PreCreateComm() - LVO -132
   *
   * Native behavior (from aedoor.library.asm lines 427-431):
   *   preCreateComm:
   *       MOVEM.L D1-D7/A2-A6,-(SP)
   *       BSR.W   createComm      ; Call createComm
   *       MOVEA.L D0,A1           ; A1 = DoorInfo pointer
   *       BRA.W   deleteComm3     ; Jump to cleanup (WITHOUT JH_SHUTDOWN)
   *
   * This function:
   * 1. Creates a comm handle (calls createComm)
   * 2. Immediately cleans up WITHOUT sending JH_SHUTDOWN
   * 3. Returns 0
   *
   * Used for initialization testing.
   */
  preCreateComm(): number {
    console.log(`[AEDoorLibrary] PreCreateComm: creating and immediately cleaning up`);

    // Call createComm to allocate and set up DoorInfo
    const difaceAddr = this.createComm();

    if (difaceAddr === 0) {
      this.emulator.setRegister(0, 0);
      return 0;
    }

    // Set A1 = DoorInfo pointer (for cleanup)
    this.emulator.setRegister(9, difaceAddr);

    // Get state and clean up WITHOUT sending JH_SHUTDOWN (deleteComm3 path)
    const state = this.interfaces.get(difaceAddr);
    if (state) {
      // Remove from interfaces map
      this.interfaces.delete(state.difaceAddr);

      // Cleanup: Remove port, free signal, free memory (but NO JH_SHUTDOWN)
      if (state.replyPortAddr) {
        this.execLibrary.deleteMsgPort(state.replyPortAddr);
      }

      // Free additional buffers
      if (state.eventHookAddr) this.execLibrary.freeMem(state.eventHookAddr, 4);
      if (state.nameBufAddr) this.execLibrary.freeMem(state.nameBufAddr, 16);
      if (state.bbsInfoAddr) this.execLibrary.freeMem(state.bbsInfoAddr, 152);
      if (state.nodeBufAddr) this.execLibrary.freeMem(state.nodeBufAddr, 255);
      if (state.nodeStateAddr) this.execLibrary.freeMem(state.nodeStateAddr, 512);

      // Free main DoorInfo structure
      this.execLibrary.freeMem(state.difaceAddr, DIFACE_SIZE);
    }

    // Return 0 (native does this)
    this.emulator.setRegister(0, 0);
    return 0;
  }

  /**
   * PostDeleteComm() - LVO -138
   *
   * Native behavior (from aedoor.library.asm lines 433-439):
   *   postDeleteComm:
   *       MOVEM.L D1-D7/A2-A6,-(SP)
   *       BSR.W   createComm      ; Call createComm
   *       MOVEA.L D0,A1           ; A1 = DoorInfo pointer
   *       MOVEQ   #JH_SHUTDOWN,D0 ; D0 = 2 (JH_SHUTDOWN)
   *       PEA     deleteComm2(PC) ; Push return address (deleteComm2)
   *       BRA.W   sendCmd         ; Call sendCmd, returns to deleteComm2
   *
   * This function:
   * 1. Creates a comm handle (calls createComm)
   * 2. Sends JH_SHUTDOWN command
   * 3. Cleans up (full deleteComm path)
   * 4. Returns 0
   *
   * Used for graceful door termination.
   */
  postDeleteComm(): number {
    console.log(`[AEDoorLibrary] PostDeleteComm: creating, shutting down, and cleaning up`);

    // Call createComm to allocate and set up DoorInfo
    const difaceAddr = this.createComm();

    if (difaceAddr === 0) {
      this.emulator.setRegister(0, 0);
      return 0;
    }

    // Set A1 = DoorInfo pointer
    this.emulator.setRegister(9, difaceAddr);

    // Get state
    const state = this.interfaces.get(difaceAddr);
    if (state) {
      // Send JH_SHUTDOWN (command 2) like native does
      this.dispatchCommand(state, XIMCommand.JH_SHUTDOWN, {});

      // Remove from interfaces map
      this.interfaces.delete(state.difaceAddr);

      // Full cleanup: Remove port, free signal, free memory
      if (state.replyPortAddr) {
        this.execLibrary.deleteMsgPort(state.replyPortAddr);
      }

      // Free additional buffers
      if (state.eventHookAddr) this.execLibrary.freeMem(state.eventHookAddr, 4);
      if (state.nameBufAddr) this.execLibrary.freeMem(state.nameBufAddr, 16);
      if (state.bbsInfoAddr) this.execLibrary.freeMem(state.bbsInfoAddr, 152);
      if (state.nodeBufAddr) this.execLibrary.freeMem(state.nodeBufAddr, 255);
      if (state.nodeStateAddr) this.execLibrary.freeMem(state.nodeStateAddr, 512);

      // Free main DoorInfo structure
      this.execLibrary.freeMem(state.difaceAddr, DIFACE_SIZE);
    }

    // Return 0 (native does this)
    this.emulator.setRegister(0, 0);
    return 0;
  }

  // ============================================================================
  // NEW LVO IMPLEMENTATIONS - Based on disassembly analysis
  // ============================================================================

  /**
   * SetNodeData (LVO -42, Address 0x02b2)
   * Sets node-specific data at BBSInfo+0xdc
   *
   * Input: A1 = DoorInfo pointer, D1 = data value
   * Output: none
   */
  setNodeData(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const dataValue = this.emulator.getRegister(1); // D1
    const bbsInfoAddr = state.bbsInfoAddr;

    // Write data to BBSInfo+0xdc (location area)
    this.emulator.writeMemory32(bbsInfoAddr + 0xdc, dataValue);

console.log(`[AEDoorLibrary] SetNodeData: wrote 0x${dataValue.toString(16)} to BBSInfo+0xdc`);
  }

  /**
   * SetStringData (LVO -48, Address 0x02c2)
   * Sets string data in BBSInfo structure
   *
   * Input: A1 = DoorInfo pointer, D1 = data value
   * Output: none
   */
  setStringData(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const dataValue = this.emulator.getRegister(1); // D1
    const bbsInfoAddr = state.bbsInfoAddr;

    // Write data to BBSInfo+0xdc
    this.emulator.writeMemory32(bbsInfoAddr + 0xdc, dataValue);

console.log(`[AEDoorLibrary] SetStringData: wrote 0x${dataValue.toString(16)} to BBSInfo+0xdc`);
  }

  /**
   * CopyUserString (LVO -54, Address 0x02d2)
   * Copies user string to BBSInfo+0x14
   *
   * Input: A1 = DoorInfo pointer, A0 = source string pointer (optional)
   * Output: none
   */
  copyUserString(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const sourceAddr = this.emulator.getRegister(8); // A0
    const bbsInfoAddr = state.bbsInfoAddr;
    const destAddr = bbsInfoAddr + 0x14; // User name location

    if (sourceAddr && sourceAddr !== 0) {
      // Copy string from source to BBSInfo+0x14
      const sourceStr = this.readCString(sourceAddr, 198);
      this.writeCString(destAddr, sourceStr, 198);
console.log(`[AEDoorLibrary] CopyUserString: copied "${sourceStr}" to BBSInfo+0x14`);
    }
  }

  /**
   * SendControlMessage (LVO -60, Address 0x02f2)
   * Sends control message to AEDoorPort
   *
   * Input: A1 = DoorInfo pointer, D0 = command
   * Output: none
   */
  sendControlMessage(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const command = this.emulator.getRegister(0); // D0
    const bbsInfoAddr = state.bbsInfoAddr;

    // Write command to BBSInfo+0xe0
    this.emulator.writeMemory32(bbsInfoAddr + 0xe0, command);

    // Send message to BBS port
    this.execLibrary.putMsg(state.bbsPortAddr, state.messageAddr);

console.log(`[AEDoorLibrary] SendControlMessage: command=0x${command.toString(16)}`);
  }

  /**
   * GetUserPtr (LVO -66, Address 0x032c)
   * Returns pointer at DoorInfo+0x1c (location pointer)
   *
   * Based on disassembly line 328:
   *   0x0000032c: move.l 0x1c(a1), d0
   *
   * Input: A1 = DoorInfo pointer
   * Output: D0 = pointer to location string
   */
  getUserPtr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    // Read pointer at DoorInfo+0x1c
    const ptr = this.emulator.readMemory32(state.difaceAddr + 0x1c);
    this.emulator.setRegister(0, ptr);

console.log(`[AEDoorLibrary] GetUserPtr: returning 0x${ptr.toString(16)} from DoorInfo+0x1c`);
    return ptr;
  }

  /**
   * GetLocationPtr (LVO -72, Address 0x0332)
   * Returns pointer at DoorInfo+0x20 (user name pointer)
   *
   * Based on disassembly line 330:
   *   0x00000332: move.l 0x20(a1), d0
   *
   * Input: A1 = DoorInfo pointer
   * Output: D0 = pointer to user name string
   */
  getLocationPtr(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    // Read pointer at DoorInfo+0x20
    const ptr = this.emulator.readMemory32(state.difaceAddr + 0x20);
    this.emulator.setRegister(0, ptr);

console.log(`[AEDoorLibrary] GetLocationPtr: returning 0x${ptr.toString(16)} from DoorInfo+0x20`);
    return ptr;
  }

  /**
   * GetUserName (LVO -78, Address 0x0338)
   * Gets user name string
   *
   * Based on disassembly lines 332-349:
   *   - Calls SetStringData with command 5
   *   - Checks if BBSInfo+0xdc contains valid data (not 0xffffffff)
   *   - Returns pointer at DoorInfo+0x20 if valid, else 0
   *
   * Input: A1 = DoorInfo pointer
   * Output: D0 = pointer to user name string (or 0)
   */
  getUserName(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    // Call SetStringData with command 5
    this.emulator.setRegister(0, 5);
    this.setStringData();

    // Check if BBSInfo+0xdc contains valid data
    const locationPtr = this.emulator.readMemory32(state.difaceAddr + 0x1c);
    if (locationPtr !== 0) {
      const checkValue = this.emulator.readMemory32(locationPtr);
      if (checkValue === 0xffffffff) {
        // Invalid - return 0
        this.emulator.setRegister(0, 0);
console.log(`[AEDoorLibrary] GetUserName: invalid data (0xffffffff), returning 0`);
        return 0;
      }
    }

    // Return pointer at DoorInfo+0x20 (user name)
    const userNamePtr = this.emulator.readMemory32(state.difaceAddr + 0x20);
    this.emulator.setRegister(0, userNamePtr);

console.log(`[AEDoorLibrary] GetUserName: returning 0x${userNamePtr.toString(16)}`);
    return userNamePtr;
  }

  /**
   * WriteUserData (LVO -84, Address 0x0350)
   * Writes user data with buffering
   *
   * Input: A1 = DoorInfo pointer, A0 = string pointer, D1 = flags
   * Output: none
   */
  writeUserData(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const stringAddr = this.emulator.getRegister(8); // A0
    const flags = this.emulator.getRegister(1); // D1
    const text = this.readCString(stringAddr, 198);

    // Copy to BBSInfo+0x20 (user data area)
    const userPtr = this.emulator.readMemory32(state.difaceAddr + 0x20);
    this.writeCString(userPtr, text, 198);

console.log(`[AEDoorLibrary] WriteUserData: wrote "${text}" with flags=0x${flags.toString(16)}`);
  }

  /**
   * FlushBuffer (LVO -90, Address 0x0388)
   * Flushes write buffer (sets command 4, data 0)
   *
   * Input: A1 = DoorInfo pointer
   * Output: none
   */
  flushBuffer(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    // Set command 4, data 0
    this.emulator.setRegister(0, 4);
    this.emulator.setRegister(1, 0);
    this.setStringData();

console.log(`[AEDoorLibrary] FlushBuffer: flushed buffer`);
  }

  /**
   * SetBBSName (LVO -96, Address 0x038e)
   * Sets BBS name string (command 7)
   *
   * Input: A1 = DoorInfo pointer, A0 = string pointer
   * Output: none
   */
  setBBSName(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const stringAddr = this.emulator.getRegister(8); // A0

    // Call SetStringData with command 7
    this.emulator.setRegister(0, 7);
    this.copyUserString();

console.log(`[AEDoorLibrary] SetBBSName: set BBS name`);
  }

  /**
   * SetDateTime (LVO -102, Address 0x0394)
   * Sets date/time strings (command 8)
   *
   * Input: A1 = DoorInfo pointer, A0 = string pointer
   * Output: none
   */
  setDateTime(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const stringAddr = this.emulator.getRegister(8); // A0

    // Call SetStringData with command 8
    this.emulator.setRegister(0, 8);
    this.copyUserString();

console.log(`[AEDoorLibrary] SetDateTime: set date/time`);
  }

  /**
   * ClearNodeFlags (LVO -108, Address 0x039a)
   * Clears node status flags (sets to 0)
   *
   * Input: A1 = DoorInfo pointer
   * Output: none
   */
  clearNodeFlags(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    // Set data to 0
    this.emulator.setRegister(1, 0);
    this.setStringData();

console.log(`[AEDoorLibrary] ClearNodeFlags: cleared flags`);
  }

  /**
   * SetNodeFlags (LVO -114, Address 0x03a0)
   * Sets node status flags (sets to 1)
   *
   * Input: A1 = DoorInfo pointer
   * Output: none
   */
  setNodeFlags(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    // Set data to 1
    this.emulator.setRegister(1, 1);
    this.setStringData();

console.log(`[AEDoorLibrary] SetNodeFlags: set flags`);
  }

  /**
   * GetNodeStatus (LVO -120, Address 0x03a6)
   * Gets node status (checks flags, returns location or user pointer)
   *
   * Based on disassembly lines 378-387:
   *   - Calls SetStringData with command 0
   *   - Checks if BBSInfo+0xdc contains valid data
   *   - Returns DoorInfo+0x20 if valid, else 0
   *
   * Input: A1 = DoorInfo pointer
   * Output: D0 = pointer to user/location string (or 0)
   */
  getNodeStatus(): number {
    const state = this.getStateFromA1();
    if (!state) return 0;

    // Call SetStringData with command 0
    this.emulator.setRegister(0, 0);
    this.setStringData();

    // Check if BBSInfo+0xdc contains valid data
    const locationPtr = this.emulator.readMemory32(state.difaceAddr + 0x1c);
    if (locationPtr !== 0) {
      const checkValue = this.emulator.readMemory32(locationPtr);
      if (checkValue === 0xffffffff) {
        // Invalid - return 0
        this.emulator.setRegister(0, 0);
console.log(`[AEDoorLibrary] GetNodeStatus: invalid data, returning 0`);
        return 0;
      }
    }

    // Return pointer at DoorInfo+0x20
    const statusPtr = this.emulator.readMemory32(state.difaceAddr + 0x20);
    this.emulator.setRegister(0, statusPtr);

console.log(`[AEDoorLibrary] GetNodeStatus: returning 0x${statusPtr.toString(16)}`);
    return statusPtr;
  }

  /**
   * CopyLocationString (LVO -126, Address 0x03c0)
   * Copies location string from DoorInfo+0x20 to output buffer
   *
   * Based on disassembly lines 388-396:
   *   0x000003c0: move.l a1, -(a7)           ; Save A1
   *   0x000003c2: movea.l 0x20(a1), a1      ; A1 = pointer at DoorInfo+0x20
   *   0x000003c6: move.w 0xc6, d0           ; Max 198 bytes
   *   0x000003ca: move.b (a1)+, (a0)+       ; Copy byte
   *   0x000003cc: dbeq d0, 0x3ca            ; Loop until null or count
   *   0x000003d0: clr.b (a0)                ; Null terminate
   *   0x000003d2: movea.l (a7)+, a1         ; Restore A1
   *
   * Input: A1 = DoorInfo pointer, A0 = output buffer
   * Output: String copied to buffer
   */
  copyLocationString(): void {
    const state = this.getStateFromA1();
    if (!state) return;

    const outputAddr = this.emulator.getRegister(8); // A0
    if (outputAddr === 0) return;

    // Get pointer at DoorInfo+0x20
    const sourcePtr = this.emulator.readMemory32(state.difaceAddr + 0x20);
    if (sourcePtr === 0) return;

    // Copy up to 198 bytes (0xc6)
    const sourceStr = this.readCString(sourcePtr, 198);
    this.writeCString(outputAddr, sourceStr, 198);

console.log(`[AEDoorLibrary] CopyLocationString: copied "${sourceStr}" to 0x${outputAddr.toString(16)}`);
  }

  /**
   * GetNodeInput (LVO -132, Address 0x03d6)
   * Gets node input character
   *
   * Based on disassembly lines 397-407:
   *   - Calls SetStringData with command 6
   *   - Checks if data >= 0
   *   - Returns first character from string if valid, else -1
   *
   * Input: A1 = DoorInfo pointer, A0 = string pointer
   * Output: D0 = character code (or -1), D1 = 0
   */
  getNodeInput(): number {
    const state = this.getStateFromA1();
    if (!state) return -1;

    const stringAddr = this.emulator.getRegister(8); // A0

    // Call SetStringData with command 6
    this.emulator.setRegister(0, 6);
    this.copyUserString();

    // Check if data is valid (>= 0)
    const locationPtr = this.emulator.readMemory32(state.difaceAddr + 0x1c);
    if (locationPtr !== 0) {
      const dataValue = this.emulator.readMemory32(locationPtr);
      if ((dataValue & 0x80000000) !== 0) {
        // Negative - return -1
        this.emulator.setRegister(0, -1);
        this.emulator.setRegister(1, 0);
console.log(`[AEDoorLibrary] GetNodeInput: no input, returning -1`);
        return -1;
      }
    }

    // Get first character from string
    const userPtr = this.emulator.readMemory32(state.difaceAddr + 0x20);
    if (userPtr !== 0) {
      const charCode = this.emulator.readMemory(userPtr);
      this.emulator.setRegister(0, charCode);
      this.emulator.setRegister(1, 0);
console.log(`[AEDoorLibrary] GetNodeInput: returning character 0x${charCode.toString(16)}`);
      return charCode;
    }

    this.emulator.setRegister(0, -1);
    this.emulator.setRegister(1, 0);
    return -1;
  }

  /**
   * InitNewDoor (LVO -138, Address 0x03f0)
   * Initializes new door (wrapper for CreateComm)
   *
   * Input: D1-D7/A2-A6 preserved
   * Output: D0 = DoorInfo pointer, A1 = DoorInfo pointer
   */
  initNewDoor(): number {
console.log(`[AEDoorLibrary] InitNewDoor: calling CreateComm`);

    // Call CreateComm
    const difaceAddr = this.createComm();

    // Set both D0 and A1 to DoorInfo pointer
    this.emulator.setRegister(0, difaceAddr);
    this.emulator.setRegister(9, difaceAddr); // A1

    return difaceAddr;
  }

  /**
   * InitAndSendStatus (LVO -144, Address 0x03fe)
   * Initializes door and sends status message
   *
   * Input: D1-D7/A2-A6 preserved
   * Output: D0 = DoorInfo pointer, A1 = DoorInfo pointer
   */
  initAndSendStatus(): number {
console.log(`[AEDoorLibrary] InitAndSendStatus: calling CreateComm`);

    // Call CreateComm
    const difaceAddr = this.createComm();

    // Set both D0 and A1
    this.emulator.setRegister(0, difaceAddr);
    this.emulator.setRegister(9, difaceAddr); // A1

    // NOTE: Do NOT send unsolicited messages to the door's reply port.
    // XIM doors expect REPLIES to their messages, not unsolicited notifications.
    // The door will send JH_REGISTER and other commands, then wait for replies.

    return difaceAddr;
  }

  /**
   * Send a properly formatted JH message to door's reply port
   */
  private sendJHMessage(state: DoorInterfaceState, command: number, data: number, strData: string): void {
    // Create properly formatted AEDoor message
    // struct Message (20 bytes) + AEDoor extension (variable size)
    const msgSize = 256; // Enough for full AEDoor message structure
    const msgAddr = this.execLibrary.allocMem(msgSize, MEMF_CLEAR);
    if (msgAddr === 0) {
console.warn("[AEDoorLibrary] Failed to allocate JH message");
      return;
    }

    // === Exec Message Structure (20 bytes) ===
    // mn_Node.ln_Succ (4 bytes) = 0
    this.emulator.writeMemory32(msgAddr + 0, 0);
    // mn_Node.ln_Pred (4 bytes) = 0
    this.emulator.writeMemory32(msgAddr + 4, 0);
    // mn_Node.ln_Type (1 byte) = NT_MESSAGE (5)
    this.emulator.writeMemory(msgAddr + 8, 5);
    // mn_Node.ln_Pri (1 byte) = 0
    this.emulator.writeMemory(msgAddr + 9, 0);
    // mn_Node.ln_Name (4 bytes) = 0
    this.emulator.writeMemory32(msgAddr + 10, 0);
    // mn_ReplyPort (4 bytes) = state.replyPortAddr
    this.emulator.writeMemory32(msgAddr + 14, state.replyPortAddr);
    // mn_Length (2 bytes) = msgSize
    this.emulator.writeMemory16(msgAddr + 18, msgSize);

    // === AEDoor Message Extension (jhMessage fields) ===
    // jhMessage structure: Message(20) + String[200](0x14) + Data(0xDC) + Command(0xE0)
    // command = specified command at offset 224 (0xE0)
    this.emulator.writeMemory32(msgAddr + MESSAGE_COMMAND_OFFSET, command);
    // data = specified data at offset 220 (0xDC)
    this.emulator.writeMemory32(msgAddr + MESSAGE_DATA_OFFSET, data);
    // string data = specified string at offset 20 (0x14)
    if (strData) {
      for (let i = 0; i < strData.length && i < MESSAGE_STRING_CAPACITY; i++) {
        this.emulator.writeMemory(msgAddr + MESSAGE_STRING_OFFSET + i, strData.charCodeAt(i));
      }
    }
    this.emulator.writeMemory(msgAddr + MESSAGE_STRING_OFFSET + (strData ? strData.length : 0), 0); // null terminator

    // Put message in door's reply port to trigger GetMsg() return
    this.execLibrary.putMsg(state.replyPortAddr, msgAddr);

console.log(`[AEDoorLibrary] Sent JH message: command=${command}, data=0x${data.toString(16)}`);
  }

  /**
   * Send initial ready messages to door's reply port
   *
   * After CreateComm, AEDoor sends TWO messages (per express.e disassembly):
   * 1. JH_INIT (command 0) - Basic initialization notification
   * 2. JH_STAT (command 1) - Node status with user data (points to DoorInfo+0xE4)
   */
  private sendInitialReadyMessage(state: DoorInterfaceState): void {
    // Send FIRST message: JH_INIT (command 0) - Basic initialization
    this.sendJHMessage(state, 0, state.nodeId, ""); // JH_INIT with node ID

    // Send SECOND message: JH_STAT (command 1) - Node status with user data
    // Data points to DoorInfo+0xE4 (nodeStateAddr) containing node status
    this.sendJHMessage(state, 1, state.nodeStateAddr, ""); // JH_STAT with pointer to node state data

console.log(`[AEDoorLibrary] ✅ Sent both AEDoor startup messages:`);
console.log(`[AEDoorLibrary]   1. JH_INIT (0) - Basic initialization`);
console.log(`[AEDoorLibrary]   2. JH_STAT (1) - Node status data at 0x${state.nodeStateAddr.toString(16)}`);
console.log(`[AEDoorLibrary] XIM door should now receive both messages and proceed`);
  }

  /**
   * Get the door command name that launched this door
   */
  private getDoorCommandName(): string {
    // This should come from the session/command that launched the door
    // For now, return a default - this needs to be passed from the door handler
    return "UNKNOWN";
  }

  /**
   * Resolve node number from registers or session data.
   */
  private resolveNodeId(): number {
    const sessionNode =
      typeof this.sessionData?.nodeId === "number"
        ? this.sessionData.nodeId
        : 0;

    const d0 = this.emulator.getRegister(0);
    if (d0 >= 0x30 && d0 <= 0x39) {
      return d0 - 0x30;
    }

    if (d0 > 0x200) {
      const str = this.readCString(d0, 4);
      const parsed = parseInt(str, 10);
      if (!Number.isNaN(parsed)) {
        return parsed;
      }
    }

    return sessionNode;
  }

  /**
   * Locate BBS message port for this node (tries both XIM and SIM port names).
   * Per express.e:4316-4320: XIM doors use AEDoorPort{n}, SIM doors use DoorControl{n}
   */
  private findBbsPort(nodeId: number): number {
    // Try both XIM (AEDoorPort) and SIM (DoorControl) port naming conventions
    const portNames = [
      `DoorControl${nodeId}`,   // SIM/SUP/TIM/IIM - express.e:4319
      `AEDoorPort${nodeId}`,    // XIM - express.e:4317
      "DoorControl",            // Fallback simple SIM port
      "AEDoorPort"              // Fallback simple XIM port
    ];
    for (const name of portNames) {
      const addr = this.createTempCString(name);
      if (addr === 0) continue;
      const portAddr = this.execLibrary.findPort(addr);
      this.execLibrary.freeMem(addr, name.length + 1);
      if (portAddr !== 0) {
console.log(`[AEDoorLibrary] Found BBS port "${name}" at 0x${portAddr.toString(16)}`);
        return portAddr;
      }
    }
    return 0;
  }

  /**
   * Helper: create temporary C string in emulated memory.
   */
  private createTempCString(text: string): number {
    const size = text.length + 1;
    const addr = this.execLibrary.allocMem(size, MEMF_CLEAR);
    if (addr === 0) {
      return 0;
    }
    for (let i = 0; i < text.length; i++) {
      this.emulator.writeMemory(addr + i, text.charCodeAt(i));
    }
    this.emulator.writeMemory(addr + text.length, 0);
    return addr;
  }

  /**
   * Helper: write ASCII string (NUL terminated) to emulator memory.
   */
  private writeCString(addr: number, str: string, maxLength: number): void {
    const length = Math.min(str.length, maxLength - 1);
    for (let i = 0; i < length; i++) {
      this.emulator.writeMemory(addr + i, str.charCodeAt(i));
    }
    this.emulator.writeMemory(addr + length, 0);
  }

  /**
   * Helper: read ASCII string from emulator memory.
   */
  private readCString(addr: number, maxLength: number): string {
    if (!addr) {
      return "";
    }

    const bytes: number[] = [];
    for (let i = 0; i < maxLength; i++) {
      const value = this.emulator.readMemory(addr + i);
      if (value === 0) break;
      bytes.push(value);
    }

    return String.fromCharCode(...bytes);
  }

  private clearBuffer(addr: number, length: number): void {
    for (let i = 0; i < length; i++) {
      this.emulator.writeMemory(addr + i, 0);
    }
  }

  private getStateFromA1(): DoorInterfaceState | null {
    const difaceAddr = this.emulator.getRegister(9); // A1
    if (difaceAddr === 0) {
console.warn("[AEDoorLibrary] Missing DIFace pointer in A1");
      return null;
    }
    const state = this.interfaces.get(difaceAddr);
    if (!state) {
console.warn(
        `[AEDoorLibrary] Unknown DIFace 0x${difaceAddr.toString(16)}`
      );
      return null;
    }
    return state;
  }

  private dispatchCommand(
    state: DoorInterfaceState,
    command: number,
    options: { string?: string; data?: number; useStringPointer?: boolean } = {}
  ): number {
    if (command === XIMCommand.JH_REGISTER) {
      const replyName = this.readCString(
        state.replyNameAddr,
        state.stringCapacity
      );
      this.writeCString(state.stringPtr, replyName, state.stringCapacity);
      options = { ...options, data: 0, useStringPointer: false };
    } else if (options.string !== undefined) {
      this.writeCString(state.stringPtr, options.string, state.stringCapacity);
    }

    if (options.useStringPointer) {
      this.emulator.writeMemory32(state.dataPtr, state.stringPtr);
    } else if (typeof options.data === "number") {
      this.emulator.writeMemory32(state.dataPtr, options.data);
    }

    this.emulator.writeMemory32(
      state.messageAddr + MESSAGE_COMMAND_OFFSET,
      command
    );
    this.emulator.writeMemory32(
      state.messageAddr + MESSAGE_REPLY_PORT_OFFSET,
      state.replyPortAddr
    );

    this.execLibrary.putMsg(state.bbsPortAddr, state.messageAddr);
    const replied = this.waitForReply(state, command);
    if (!replied) {
      return -1;
    }

    return this.emulator.readMemory32(state.dataPtr);
  }

  private waitForReply(state: DoorInterfaceState, command: number): boolean {
    for (let i = 0; i < 10000; i++) {
      // CRITICAL FIX 2026-01-08: Process XIM messages synchronously!
      // We're inside a trap handler, so the async polling loop can't run.
      // The door sent a message to the BBS, we need to process it and send
      // the reply before the door's getMsg finds it.
      if (this.processXIMMessageCallback && state.bbsPortAddr) {
        this.processXIMMessageCallback(state.bbsPortAddr);
      }

      const msgAddr = this.execLibrary.getMsg(state.replyPortAddr);
      if (msgAddr !== 0) {
        return true;
      }
    }
    console.warn(`[AEDoorLibrary] No reply for command ${command} after 10000 iterations`);
    return false;
  }

  /**
   * Expose string buffer pointer for tests
   */
  getStringBufferPointer(): number {
    const state = [...this.interfaces.values()][0];
    return state ? state.stringPtr : 0;
  }

  /**
   * Whether a prompt is currently active (used by emulator loop)
   */
  isWaitingForInput(): boolean {
    return this.activePrompt !== null;
  }
}

/**
 * DreamDoor.library Emulation
 *
 * DayDream BBS compatibility layer for 68K doors.
 * Provides InquirePointers-based access to BBS data structures.
 *
 * LVO Offsets:
 *   -6:  InitDoor
 *   -12: InquirePointers
 *   -18: Prompt
 *   -24: SendString
 *   -30: GetKey
 *   -36: DisplayFile
 *   -42: DDCommand
 *   -48: CloseDoor
 *   -54: JoinConference
 *   -60: XprSend
 *   -66: ScanFileDirs
 *   -72: Disconnect
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';

// DreamDoor structure offsets
const POINTERS_STRUCT = {
  dp_DoorParams: 0x00,    // Door parameter string pointer
  dp_DayDream: 0x04,      // DayDream config structure pointer
  dp_CurrUser: 0x08,      // Current user structure pointer
  dp_CurrConf: 0x0C,      // Current conference structure pointer
  dp_CurrentNode: 0x10,   // Current node info pointer
  dp_BpsRate: 0x14,       // BPS rate value
  dp_IODevice: 0x18,      // I/O device info pointer
  dp_DoorCmd: 0x1C,       // Door command override pointer
  dp_SIZEOF: 0x20,        // Total structure size (32 bytes)
};

// User structure offsets (DayDream format)
const USER_STRUCT = {
  USER_HANDLE: 0x00,           // User login name (32 bytes)
  USER_PASSWORD: 0x20,         // User password (32 bytes)
  USER_LOCATION: 0x40,         // Location/Organization (32 bytes)
  USER_VOICEPHONE: 0x60,       // Phone number (16 bytes)
  USER_SECURITYLEVEL: 0x70,    // Access level (byte)
  USER_BYTERATIO: 0x71,        // Upload/download ratio (byte)
  USER_PUBMESSAGES: 0x72,      // Public messages posted (word)
  USER_ULFILES: 0x74,          // Upload files count (word)
  USER_DLFILES: 0x76,          // Download files count (word)
  USER_CONNECTIONS: 0x78,      // Times called (word)
  USER_LASTCALL: 0x7A,         // Last call time (word)
  USER_DAILYTIMELIMIT: 0x7C,   // Daily time limit minutes (word)
  USER_TIMEREMAINING: 0x7E,    // Time remaining minutes (word)
  USER_ULBYTES: 0x80,          // Upload bytes (long)
  USER_DLBYTES: 0x84,          // Download bytes (long)
  USER_SCREENLENGTH: 0x88,     // Screen length preference (byte)
  USER_SIZEOF: 0x90,           // Total size (144 bytes)
};

// Conference structure offsets
const CONF_STRUCT = {
  CONF_NUMBER: 0x00,    // Conference ID (byte)
  CONF_NAME: 0x01,      // Conference name string (59 bytes)
  CONF_SIZEOF: 0x3C,    // Total size (60 bytes)
};

// DayDream config offsets
const CONFIG_STRUCT = {
  CFG_BBSNAME: 0x00,    // BBS name (64 bytes)
  CFG_SYSOPNAME: 0x40,  // Sysop name (32 bytes)
  CFG_SIZEOF: 0x80,     // Total size (128 bytes)
};

export class DreamDoorLibrary {
  private emulator: MoiraEmulator;
  private bbsSession: any = {};
  private socket: any = null;

  // Memory allocations for structures
  private pointersAddr: number = 0;
  private userStructAddr: number = 0;
  private confStructAddr: number = 0;
  private configStructAddr: number = 0;
  private nodeInfoAddr: number = 0;
  private doorHandle: number = 0;
  private initialized: boolean = false;

  // Base address for DreamDoor allocations
  private static readonly DREAMDOOR_BASE = 0xE0000;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Set session data for door operations
   */
  setSession(bbsSession: any, socket: any): void {
    this.bbsSession = bbsSession || {};
    this.socket = socket;
  }

  /**
   * InitDoor (LVO -6)
   * Initialize door and return handle
   * Input: A0 = Node ID string
   * Output: D0 = Door handle (0 on failure)
   */
  initDoor(nodeIdAddr: number): number {
    const nodeId = this.emulator.readString(nodeIdAddr, 16);
    console.log(`[DreamDoor] InitDoor: nodeId="${nodeId}"`);

    if (this.initialized) {
      console.log(`[DreamDoor] Already initialized, returning existing handle`);
      return this.doorHandle;
    }

    // Allocate memory for all structures
    this.allocateStructures();

    // Populate structures with BBS data
    this.populateUserStruct();
    this.populateConfStruct();
    this.populateConfigStruct();
    this.populatePointersStruct();

    this.initialized = true;
    this.doorHandle = DreamDoorLibrary.DREAMDOOR_BASE;

    console.log(`[DreamDoor] InitDoor complete, handle=0x${this.doorHandle.toString(16)}`);
    return this.doorHandle;
  }

  /**
   * InquirePointers (LVO -12)
   * Fill pointers structure with BBS data pointers
   * Input: A0 = Pointers buffer, D0 = Door handle
   * Output: D0 unchanged
   */
  inquirePointers(pointersBufferAddr: number, handle: number): number {
    console.log(`[DreamDoor] InquirePointers: buffer=0x${pointersBufferAddr.toString(16)}, handle=0x${handle.toString(16)}`);

    if (!this.initialized) {
      console.warn(`[DreamDoor] InquirePointers called before InitDoor`);
      return handle;
    }

    // Write pointers to caller's buffer
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_DoorParams, 0);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_DayDream, this.configStructAddr);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_CurrUser, this.userStructAddr);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_CurrConf, this.confStructAddr);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_CurrentNode, this.nodeInfoAddr);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_BpsRate, 115200);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_IODevice, 0);
    this.emulator.writeMemory32(pointersBufferAddr + POINTERS_STRUCT.dp_DoorCmd, 0);

    console.log(`[DreamDoor] InquirePointers: userStruct=0x${this.userStructAddr.toString(16)}, confStruct=0x${this.confStructAddr.toString(16)}`);
    return handle;
  }

  /**
   * Prompt (LVO -18)
   * Display prompt and get user input
   * Input: D0 = handle, A0 = message buffer, D1 = info, D2 = display mode, D3 = input mode
   * Output: D0 = response (0=abort, 1=continue, -1=error)
   */
  prompt(handle: number, msgBufferAddr: number, displayMode: number, inputMode: number): number {
    console.log(`[DreamDoor] Prompt: handle=0x${handle.toString(16)}, display=${displayMode}, input=${inputMode}`);

    // Read prompt string from buffer
    const promptStr = this.emulator.readString(msgBufferAddr, 200);

    if (displayMode !== 0 && promptStr) {
      this.socket.emit('ansi-output', promptStr);
    }

    // If no input required, return success
    if (inputMode === 0) {
      return 1;
    }

    // Input handling would be async - return 1 for now
    // Real implementation would need to coordinate with input handler
    return 1;
  }

  /**
   * SendString (LVO -24)
   * Send text string to user terminal
   * Input: D0 = handle, A0 = string pointer
   * Output: D0 unchanged
   */
  sendString(handle: number, stringAddr: number): number {
    const str = this.emulator.readString(stringAddr, 500);
    console.log(`[DreamDoor] SendString: "${str.substring(0, 50)}..."`);

    if (str) {
      this.socket.emit('ansi-output', str);
    }

    return handle;
  }

  /**
   * GetKey (LVO -30)
   * Get single key press
   * Input: D0 = handle, D1 = prompt mode
   * Output: D0 = key code (0 if none)
   */
  getKey(handle: number, promptMode: number): number {
    console.log(`[DreamDoor] GetKey: handle=0x${handle.toString(16)}, promptMode=${promptMode}`);
    // Key input would be async - return 0 for now
    // Real implementation would coordinate with input handler
    return 0;
  }

  /**
   * DisplayFile (LVO -36)
   * Display file with optional pause
   * Input: D0 = handle, A0 = filename, D1 = pause flag
   * Output: D0 unchanged
   */
  displayFile(handle: number, filenameAddr: number, pauseFlag: number): number {
    const filename = this.emulator.readString(filenameAddr, 256);
    console.log(`[DreamDoor] DisplayFile: "${filename}", pause=${pauseFlag}`);

    // File display would be handled by BBS file display system
    // For now, just log it

    return handle;
  }

  /**
   * DDCommand (LVO -42)
   * Execute door command
   * Input: D0 = handle, A0 = command string
   * Output: D0 unchanged
   */
  ddCommand(handle: number, commandAddr: number): number {
    const command = this.emulator.readString(commandAddr, 256);
    console.log(`[DreamDoor] DDCommand: "${command}"`);

    // Command execution would be handled by BBS command system

    return handle;
  }

  /**
   * CloseDoor (LVO -48)
   * Close door and cleanup resources
   * Input: D0 = handle
   * Output: D0 unchanged
   */
  closeDoor(handle: number): number {
    console.log(`[DreamDoor] CloseDoor: handle=0x${handle.toString(16)}`);

    this.initialized = false;
    this.doorHandle = 0;

    return handle;
  }

  /**
   * JoinConference (LVO -54)
   * Switch to different conference
   * Input: D0 = handle, D1 = conference number
   * Output: D0 unchanged
   */
  joinConference(handle: number, confNum: number): number {
    console.log(`[DreamDoor] JoinConference: conf=${confNum}`);

    // Conference switching would be handled by BBS

    return handle;
  }

  /**
   * XprSend (LVO -60)
   * Xmodem/Zmodem protocol handler
   * Input: D0 = handle, A0 = file buffer, A1 = output buffer
   * Output: D0 unchanged
   */
  xprSend(handle: number, fileBufferAddr: number, outputBufferAddr: number): number {
    console.log(`[DreamDoor] XprSend: fileBuffer=0x${fileBufferAddr.toString(16)}`);

    // Protocol handling would be done by transfer system

    return handle;
  }

  /**
   * ScanFileDirs (LVO -66)
   * Scan file directories in conference
   * Input: D0 = handle, D1 = conference number
   * Output: D0 unchanged
   */
  scanFileDirs(handle: number, confNum: number): number {
    console.log(`[DreamDoor] ScanFileDirs: conf=${confNum}`);

    return handle;
  }

  /**
   * Disconnect (LVO -72)
   * Drop DTR line, disconnect user
   * Input: D0 = handle
   * Output: D0 unchanged
   */
  disconnect(handle: number): number {
    console.log(`[DreamDoor] Disconnect`);

    // Disconnect would be handled by BBS connection manager

    return handle;
  }

  // =========================================================================
  // Private helper methods
  // =========================================================================

  private allocateStructures(): void {
    let addr = DreamDoorLibrary.DREAMDOOR_BASE;

    // Allocate pointers structure
    this.pointersAddr = addr;
    addr += POINTERS_STRUCT.dp_SIZEOF;

    // Allocate user structure
    this.userStructAddr = addr;
    addr += USER_STRUCT.USER_SIZEOF;

    // Allocate conference structure
    this.confStructAddr = addr;
    addr += CONF_STRUCT.CONF_SIZEOF;

    // Allocate config structure
    this.configStructAddr = addr;
    addr += CONFIG_STRUCT.CFG_SIZEOF;

    // Allocate node info (small struct)
    this.nodeInfoAddr = addr;
    addr += 32;

    console.log(`[DreamDoor] Allocated structures: pointers=0x${this.pointersAddr.toString(16)}, user=0x${this.userStructAddr.toString(16)}, conf=0x${this.confStructAddr.toString(16)}, config=0x${this.configStructAddr.toString(16)}`);
  }

  private populateUserStruct(): void {
    const user = this.bbsSession.user || {};
    const addr = this.userStructAddr;

    // Write user handle/name
    this.writeString(addr + USER_STRUCT.USER_HANDLE, user.name || 'Guest', 31);

    // Write location
    this.writeString(addr + USER_STRUCT.USER_LOCATION, user.location || 'Unknown', 31);

    // Write phone
    this.writeString(addr + USER_STRUCT.USER_VOICEPHONE, user.phone || '', 15);

    // Write numeric fields
    this.emulator.writeMemory(addr + USER_STRUCT.USER_SECURITYLEVEL, user.securityLevel || 10);
    this.emulator.writeMemory(addr + USER_STRUCT.USER_BYTERATIO, user.ratio || 0);
    this.emulator.writeMemory16(addr + USER_STRUCT.USER_PUBMESSAGES, user.messagesPosted || 0);
    this.emulator.writeMemory16(addr + USER_STRUCT.USER_ULFILES, user.uploads || 0);
    this.emulator.writeMemory16(addr + USER_STRUCT.USER_DLFILES, user.downloads || 0);
    this.emulator.writeMemory16(addr + USER_STRUCT.USER_CONNECTIONS, user.timesCalled || 1);
    this.emulator.writeMemory16(addr + USER_STRUCT.USER_DAILYTIMELIMIT, user.dailyTimeLimit || 60);
    this.emulator.writeMemory16(addr + USER_STRUCT.USER_TIMEREMAINING, user.timeRemaining || 60);
    this.emulator.writeMemory32(addr + USER_STRUCT.USER_ULBYTES, user.bytesUploaded || 0);
    this.emulator.writeMemory32(addr + USER_STRUCT.USER_DLBYTES, user.bytesDownloaded || 0);
    this.emulator.writeMemory(addr + USER_STRUCT.USER_SCREENLENGTH, user.screenLength || 24);
  }

  private populateConfStruct(): void {
    const addr = this.confStructAddr;

    // Conference number
    this.emulator.writeMemory(addr + CONF_STRUCT.CONF_NUMBER, this.bbsSession.conferenceId || 1);

    // Conference name
    this.writeString(addr + CONF_STRUCT.CONF_NAME, this.bbsSession.conferenceName || 'Main', 58);
  }

  private populateConfigStruct(): void {
    const addr = this.configStructAddr;

    // BBS name
    this.writeString(addr + CONFIG_STRUCT.CFG_BBSNAME, this.bbsSession.bbsName || 'AmiExpress-Web', 63);

    // Sysop name
    this.writeString(addr + CONFIG_STRUCT.CFG_SYSOPNAME, this.bbsSession.sysopName || 'Sysop', 31);
  }

  private populatePointersStruct(): void {
    const addr = this.pointersAddr;

    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_DoorParams, 0);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_DayDream, this.configStructAddr);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_CurrUser, this.userStructAddr);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_CurrConf, this.confStructAddr);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_CurrentNode, this.nodeInfoAddr);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_BpsRate, 115200);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_IODevice, 0);
    this.emulator.writeMemory32(addr + POINTERS_STRUCT.dp_DoorCmd, 0);
  }

  private writeString(addr: number, str: string, maxLen: number): void {
    const bytes = Buffer.from(str.substring(0, maxLen), 'ascii');
    for (let i = 0; i < bytes.length; i++) {
      this.emulator.writeMemory(addr + i, bytes[i]);
    }
    // Null terminate
    this.emulator.writeMemory(addr + bytes.length, 0);
  }
}

/**
 * DreamDoor.library Emulation
 *
 * DayDream BBS compatibility layer for 68K doors.
 * Provides InquirePointers-based access to BBS data structures.
 *
 * LVO offsets live in `../dd/dd-constants.ts` (DD_LVO) — this file only
 * implements the vector bodies and struct population; the vectors table
 * (Task 3) wires DD_LVO entries to these methods.
 *
 * Struct offsets (DP_OFFSET/USER_OFFSET/CONF_OFFSET/CFG_OFFSET/DP_SIZEOF)
 * come from Task 1's `dd-constants.ts`, which is the confirmed/inferred
 * source of truth recovered by RE (see that file's header comment). Fields
 * not covered by Task 1 (struct total sizes beyond DP_SIZEOF, the node-info
 * sub-struct layout beyond its confirmed node-id byte) are still guesses —
 * each is called out below with an "unconfirmed" comment rather than
 * silently presented as fact.
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { DP_OFFSET, DP_SIZEOF, USER_OFFSET, CONF_OFFSET, CFG_OFFSET } from '../dd/dd-constants';

const MEMF_CLEAR = 1 << 16;

/**
 * USER_SIZEOF is not part of Task 1's confirmed offset table (only field
 * offsets within the USER struct are confirmed/inferred). The highest
 * confirmed/inferred field is USER_TIMEREMAINING@0x102 (word, ends at
 * 0x104); size the struct to 0x110 to leave headroom for fields that exist
 * in the real struct but haven't been RE'd yet.
 */
const USER_SIZEOF = 0x110;

/**
 * CONF_SIZEOF is unconfirmed by Task 1 (only CONF_NUMBER@0/CONF_NAME@1 are
 * known). Kept generous for the conference-name string plus headroom.
 */
const CONF_SIZEOF = 0x3c;

/**
 * CFG_SIZEOF is unconfirmed by Task 1 (only CFG_SYSOPNAME@0x1a, a sub-field
 * of dp_DayDream, is confirmed). Kept generous for headroom; we only
 * populate the confirmed field below — no BBS-name offset is guessed.
 */
const CFG_SIZEOF = 0x80;

/**
 * Node-info sub-struct pointed to by dp_CurrentNode. Task 1 confirms only
 * the node-id byte's sub-offset (+0x0e); the rest of the layout, including
 * total size, is unconfirmed and sized generously for headroom.
 */
const NODE_INFO_NODEID_OFFSET = 0x0e;
const NODE_INFO_SIZEOF = 0x20;

/** Minimal exec.library allocator surface DreamDoorLibrary depends on. */
export interface DreamDoorMemAllocator {
  allocMem(size: number, flags?: number): number;
  freeMem(addr: number, size: number): void;
}

/** Socket surface DreamDoorLibrary needs to push terminal output. */
export interface DreamDoorSocketLike {
  emit(event: string, ...args: unknown[]): unknown;
}

export interface DreamDoorSessionUser {
  name?: string;
  location?: string;
  phone?: string;
  securityLevel?: number;
  ratio?: number;
  messagesPosted?: number;
  uploads?: number;
  downloads?: number;
  timesCalled?: number;
  dailyTimeLimit?: number;
  timeRemaining?: number;
  bytesUploaded?: number;
  bytesDownloaded?: number;
  screenLength?: number;
}

export interface DreamDoorSession {
  user?: DreamDoorSessionUser;
  bbsName?: string;
  sysopName?: string;
  conferenceName?: string;
  conferenceId?: number;
}

export class DreamDoorLibrary {
  private emulator: MoiraEmulator;
  private alloc: DreamDoorMemAllocator;
  private bbsSession: DreamDoorSession = {};
  private socket: DreamDoorSocketLike | null = null;

  // Memory allocations for structures (allocated via the injected exec
  // allocator — never a fixed base address, see Task 2 brief).
  private pointersAddr = 0;
  private userStructAddr = 0;
  private confStructAddr = 0;
  private configStructAddr = 0;
  private nodeInfoAddr = 0;
  private doorHandle = 0;
  private initialized = false;

  constructor(emulator: MoiraEmulator, alloc: DreamDoorMemAllocator) {
    this.emulator = emulator;
    this.alloc = alloc;
  }

  /**
   * Set session data for door operations
   */
  setSession(bbsSession: DreamDoorSession | null | undefined, socket: DreamDoorSocketLike | null): void {
    this.bbsSession = bbsSession || {};
    this.socket = socket;
  }

  /**
   * InitDoor (DD_LVO.InitDoor)
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

    // Allocate memory for all structures via the injected exec allocator.
    this.allocateStructures();

    // Populate structures with BBS data
    this.populateUserStruct();
    this.populateConfStruct();
    this.populateConfigStruct();
    this.populatePointersStruct();

    const parsedNodeId = parseInt(nodeId, 10);
    this.emulator.writeMemory(
      this.nodeInfoAddr + NODE_INFO_NODEID_OFFSET,
      Number.isNaN(parsedNodeId) ? 1 : parsedNodeId & 0xff
    );

    this.initialized = true;
    // The Pointers struct address doubles as the opaque door handle — it's
    // a real allocation from the injected allocator, so it can never
    // collide with another library's fixed base address.
    this.doorHandle = this.pointersAddr;

    console.log(`[DreamDoor] InitDoor complete, handle=0x${this.doorHandle.toString(16)}`);
    return this.doorHandle;
  }

  /**
   * InquirePointers (DD_LVO.InquirePointers)
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

    this.writePointersFields(pointersBufferAddr);

    console.log(`[DreamDoor] InquirePointers: userStruct=0x${this.userStructAddr.toString(16)}, confStruct=0x${this.confStructAddr.toString(16)}`);
    return handle;
  }

  /**
   * Prompt (DD_LVO.Prompt)
   * Display prompt and get user input.
   * Real calling convention: prompt(handle, bufferAddr, promptTextAddr, maxLen, mode).
   * bufferAddr/maxLen (where typed input lands) are wired but unused until
   * Task 4 makes this a real deferred/blocking call; for now the body only
   * emits the prompt text synchronously and returns success.
   */
  prompt(handle: number, bufferAddr: number, promptTextAddr: number, maxLen: number, mode: number): number {
    console.log(
      `[DreamDoor] Prompt: handle=0x${handle.toString(16)}, buffer=0x${bufferAddr.toString(16)}, maxLen=${maxLen}, mode=${mode}`
    );

    const promptStr = this.emulator.readString(promptTextAddr, 200);

    if (mode !== 0 && promptStr) {
      this.socket?.emit('ansi-output', promptStr);
    }

    // TODO(Task 4): block on real user input into bufferAddr (capped at
    // maxLen) instead of returning success immediately.
    return 1;
  }

  /**
   * SendString (DD_LVO.SendString)
   * Send text string to user terminal
   * Input: D0 = handle, A0 = string pointer
   * Output: D0 unchanged
   */
  sendString(handle: number, stringAddr: number): number {
    const str = this.emulator.readString(stringAddr, 500);
    console.log(`[DreamDoor] SendString: "${str.substring(0, 50)}..."`);

    if (str) {
      this.socket?.emit('ansi-output', str);
    }

    return handle;
  }

  /**
   * GetKey (DD_LVO.GetKey)
   * Get single key press.
   * Real calling convention: getKey(handle, flags).
   * Still a synchronous stub — Task 4 makes this a real deferred/blocking
   * call coordinated with the input handler.
   */
  getKey(handle: number, flags: number): number {
    console.log(`[DreamDoor] GetKey: handle=0x${handle.toString(16)}, flags=${flags}`);
    // TODO(Task 4): block for real key input instead of returning 0.
    return 0;
  }

  /**
   * DisplayFile (DD_LVO.DisplayFile)
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
   * DDCommand (DD_LVO.DDCommand)
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
   * CloseDoor (DD_LVO.CloseDoor)
   * Close door and cleanup resources
   * Input: D0 = handle
   * Output: D0 unchanged
   */
  closeDoor(handle: number): number {
    console.log(`[DreamDoor] CloseDoor: handle=0x${handle.toString(16)}`);

    if (this.initialized) {
      this.alloc.freeMem(this.pointersAddr, DP_SIZEOF);
      this.alloc.freeMem(this.userStructAddr, USER_SIZEOF);
      this.alloc.freeMem(this.confStructAddr, CONF_SIZEOF);
      this.alloc.freeMem(this.configStructAddr, CFG_SIZEOF);
      this.alloc.freeMem(this.nodeInfoAddr, NODE_INFO_SIZEOF);
    }

    this.pointersAddr = 0;
    this.userStructAddr = 0;
    this.confStructAddr = 0;
    this.configStructAddr = 0;
    this.nodeInfoAddr = 0;
    this.initialized = false;
    this.doorHandle = 0;

    return handle;
  }

  /**
   * JoinConference (DD_LVO.JoinConference)
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
   * XprSend (DD_LVO.XprSend)
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
   * ScanFileDirs (DD_LVO.ScanFileDirs)
   * Scan file directories in conference
   * Input: D0 = handle, D1 = conference number
   * Output: D0 unchanged
   */
  scanFileDirs(handle: number, confNum: number): number {
    console.log(`[DreamDoor] ScanFileDirs: conf=${confNum}`);

    return handle;
  }

  /**
   * Disconnect (DD_LVO.Disconnect)
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
    // Real exec allocations — can never collide with another library's
    // fixed base address (this was the bug: a hardcoded 0xE0000 DREAMDOOR_BASE
    // collided with ExecLibrary's INTUITION_LIB_ADDR at 0x0e0000).
    this.pointersAddr = this.alloc.allocMem(DP_SIZEOF, MEMF_CLEAR);
    this.userStructAddr = this.alloc.allocMem(USER_SIZEOF, MEMF_CLEAR);
    this.confStructAddr = this.alloc.allocMem(CONF_SIZEOF, MEMF_CLEAR);
    this.configStructAddr = this.alloc.allocMem(CFG_SIZEOF, MEMF_CLEAR);
    this.nodeInfoAddr = this.alloc.allocMem(NODE_INFO_SIZEOF, MEMF_CLEAR);

    console.log(
      `[DreamDoor] Allocated structures: pointers=0x${this.pointersAddr.toString(16)}, user=0x${this.userStructAddr.toString(16)}, conf=0x${this.confStructAddr.toString(16)}, config=0x${this.configStructAddr.toString(16)}, node=0x${this.nodeInfoAddr.toString(16)}`
    );
  }

  private populateUserStruct(): void {
    const user = this.bbsSession.user || {};
    const addr = this.userStructAddr;

    // Confirmed/inferred string fields (USER_OFFSET, dd-constants.ts).
    // maxLen values are capped to the gap before the NEXT confirmed field
    // so a long value can never clobber a field at a higher offset.
    this.writeString(addr + USER_OFFSET.USER_HANDLE, user.name || 'Guest', 25); // gap to USER_ORGANIZATION@0x34
    this.writeString(addr + USER_OFFSET.USER_ORGANIZATION, user.location || 'Unknown', 46); // gap to USER_VOICEPHONE@0x63
    this.writeString(addr + USER_OFFSET.USER_VOICEPHONE, user.phone || '', 15); // well within gap to USER_ULBYTES@0xbc
    // USER_PASSWORD@0x78 is intentionally left zeroed — doors get session
    // state, not the plaintext password.

    // Confirmed/inferred numeric fields.
    this.emulator.writeMemory(addr + USER_OFFSET.USER_SCREENLENGTH, user.screenLength || 24);
    this.emulator.writeMemory32(addr + USER_OFFSET.USER_ULBYTES, user.bytesUploaded || 0);
    this.emulator.writeMemory32(addr + USER_OFFSET.USER_DLBYTES, user.bytesDownloaded || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_ULFILES, user.uploads || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_DLFILES, user.downloads || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_PUBMESSAGES, user.messagesPosted || 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_CONNECTIONS, user.timesCalled || 1);
    this.emulator.writeMemory(addr + USER_OFFSET.USER_BYTERATIO, user.ratio || 0);
    this.emulator.writeMemory(addr + USER_OFFSET.USER_SECURITYLEVEL, user.securityLevel || 10);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_LASTCALL, 0);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_DAILYTIMELIMIT, user.dailyTimeLimit || 60);
    this.emulator.writeMemory16(addr + USER_OFFSET.USER_TIMEREMAINING, user.timeRemaining || 60);
  }

  private populateConfStruct(): void {
    const addr = this.confStructAddr;

    this.emulator.writeMemory(addr + CONF_OFFSET.CONF_NUMBER, this.bbsSession.conferenceId || 1);
    this.writeString(addr + CONF_OFFSET.CONF_NAME, this.bbsSession.conferenceName || 'Main', 58);
  }

  private populateConfigStruct(): void {
    const addr = this.configStructAddr;

    // Only CFG_SYSOPNAME is confirmed (dp_DayDream sub-field @+0x1a). No
    // BBS-name offset is guessed here — see CFG_SIZEOF comment above.
    this.writeString(addr + CFG_OFFSET.CFG_SYSOPNAME, this.bbsSession.sysopName || 'Sysop', 31);
  }

  private populatePointersStruct(): void {
    this.writePointersFields(this.pointersAddr);
  }

  /** Shared by populatePointersStruct (internal copy) and InquirePointers (caller's buffer). */
  private writePointersFields(addr: number): void {
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_DayDream, this.configStructAddr);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_CurrConf, this.confStructAddr);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_CurrUser, this.userStructAddr);
    // dp_DoorParams isn't written by the real library's InquirePointers reply
    // (a confirmed gap — see dd-constants.ts), but we populate it anyway
    // since both sides (this emulation and our own doors) agree on the layout.
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_DoorParams, 0);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_BpsRate, 115200);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_IODevice, 0);
    this.emulator.writeMemory32(addr + DP_OFFSET.dp_CurrentNode, this.nodeInfoAddr);
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

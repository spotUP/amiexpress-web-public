/**
 * Exec.library Emulation for XIM Door Execution
 *
 * Following vAmiga's ExecBase structure and Amiga Exec.library API
 * Reference: Docs/vAmiga/Core/Misc/OSDebugger/OSDebuggerTypes.h
 *
 * This implements the core Exec.library functions that doors use,
 * WITHOUT full hardware emulation or ROM boot.
 */

import { MoiraEmulator, CPURegister } from "../cpu/MoiraEmulator";
import * as fs from "fs";
import * as amigafs from "../../utils/amigafs";
import * as path from "path";
import { debugLog } from "../../utils/debug-log";
import { notifySysop } from "../../utils/sysop-alert.util";
import { getSystemTime } from '../../utils/date-time.util';
import * as memoryMap from "../memory-map";

/**
 * ExecBase structure (616 bytes for V36+)
 * Located at address pointed to by 0x000004
 */
interface ExecBaseStructure {
  address: number; // Where ExecBase lives in memory

  // Library node (34 bytes)
  version: number; // lib_Version (20): Major version
  revision: number; // lib_Revision (22): Minor revision
  idString: number; // lib_IdString (24): Pointer to version string

  // ExecBase specific
  softVer: number; // SoftVer (34): Kickstart version
  thisTask: number; // ThisTask (276): Current task pointer

  // Lists
  libList: number; // LibList (378): Head of library list
  taskReady: number; // TaskReady (406): Ready tasks

  // V36 additions
  eclockFrequency: number; // ex_EClockFrequency (568): E-clock freq
}

/**
 * Library structure (34 bytes)
 */
interface LibraryNode {
  address: number; // Where library lives
  name: string; // Library name
  version: number; // Version
  revision: number; // Revision
  openCount: number; // Number of opens
  negSize: number; // Jump table size (negative offset)
  posSize: number; // Data size (positive offset)
}

/**
 * Task structure (minimal)
 */
interface Task {
  address: number;
  name: string;
  node: number;
  sigRecvd: number; // Signals received/pending (bits OR'd together) - ALIAS: pendingSignals
  sigWait: number; // Signals waiting for (0 = not waiting) - ALIAS: waitingSignals
  state: number; // Task state (TS_READY, TS_WAIT, etc.)
  msgPort: number; // Message port address (for Process structure)
  isWaiting: boolean; // True if task is blocked in Wait()
}

/**
 * Message Port structure
 * Used for inter-process communication
 */
interface MessagePort {
  address: number; // Port address in memory
  name: string; // Port name (if public)
  messages: number[]; // Queue of message addresses
  sigBit: number; // Signal bit
  sigTask: number; // Task to signal
  signaled: boolean; // Has message arrived
}

/**
 * Exec.library implementation for door execution
 *
 * Phase 1 Implementation:
 * - ExecBase structure creation
 * - OpenLibrary/CloseLibrary
 * - FindTask
 * - AllocMem/FreeMem
 */
export class ExecLibrary {
  private emulator: MoiraEmulator;
  private execBase: ExecBaseStructure;
  private libraries: Map<string, LibraryNode> = new Map();
  private currentTask: Task;
  private bbsTask: Task; // BBS handler task (owns AEDoorPort)

  // Memory allocation tracking
  private allocations: Map<number, number> = new Map(); // address -> size
  private allocVecBlocks?: Map<number, { size: number; headerAddr: number }>; // AllocVec tracking
  // Start allocations at 0x100000 (1MB) to avoid overlap with door code segments
  // Door code starts at 0x1000 and large doors can exceed 100KB
  private nextFreeMemory: number = memoryMap.ALLOCMEM_HEAP_BASE;
  // Free list for simple reuse
  private freeList: { addr: number; size: number }[] = [];

  // Message port tracking
  private messagePorts: Map<number, MessagePort> = new Map(); // address -> port
  private repliedMessages: Set<number> = new Set(); // track messages we've replied to via ReplyMsg
  private publicPorts: Map<string, number> = new Map(); // lower-case name -> address

  // Semaphore tracking
  private publicSemaphores: Map<string, number> = new Map(); // name -> address

  // Signal allocation tracking (32 signals, bits 0-31)
  private allocatedSignals: number = 0; // Bitmask of allocated signals

  // Set of port addresses currently linked into ExecBase->PortList.
  // RemPort/AddPort vector handlers consult this BEFORE touching the
  // ln_Succ/ln_Pred pointers: a door that calls RemPort on a port we
  // never added (very common — AEDoor libraries do their own port
  // mgmt, plus some doors mistakenly RemPort their reply port) would
  // otherwise read garbage at port+0/+4 and overwrite the global list
  // head/tailPred with junk. The Set is the source of truth; the
  // emulator memory mirrors it.
  private portsInExecList: Set<number> = new Set();

  // Standard signal bit definitions (from exec/tasks.h)
  private static readonly SIGBREAKB_CTRL_C = 12; // Bit number for CTRL-C
  private static readonly SIGBREAKF_CTRL_C = 1 << 12; // Signal mask (0x1000)

  // Memory limits (Amiga classic has 16MB max addressable memory)
  private static readonly MAX_MEMORY = 0x1000000; // 16MB limit
  private static readonly MAX_SINGLE_ALLOC = 0x800000; // 8MB max single allocation (sanity check)
  private static readonly MEMORY_WARNING_THRESHOLD = 0xc00000; // 12MB - warn when exceeded

  private static readonly ROM_START = 0xf80000;
  private static readonly ROM_END = 0xffffff;
  // AROS extension ROM range
  private static readonly EXT_ROM_START = 0xe00000;
  private static readonly EXT_ROM_END = 0xe7ffff;
  private static readonly RTC_MATCHWORD = 0x4afc;
  private static readonly RTF_AUTOINIT = 1 << 7;
  private static readonly NT_LIBRARY = 9;
  private romResidentCache?: Map<string, number>;
  private pendingTrapJumpPc: number | null = null;
  private pendingTrapJumpName: string | null = null;
  private pendingTrapReturnAddr: number | null = null;
  private pendingTrapSavedSp: number | null = null;
  private pendingOpenLibraryName: string | null = null;
  private pendingForcedReturn: boolean = false;

  // Door message callback - called when door sends message to AEDoorPort
  private doorMessageCallback:
    | ((portAddr: number, msgAddr: number) => void)
    | null = null;

  // FIM message callback - called when a FAME BBS door PutMsg()s to
  // FAMEDoorPort<node>. Mirrors doorMessageCallback but for the FIM
  // protocol (FIMProtocol.handleMessage), registered by AmigaDoorSession.
  private fimMessageCallback: ((msgAddr: number) => void) | null = null;

  // Flag set when WaitPort returns 0 (no messages) - signals execution loop to poll XIM
  // This fixes doors that use tight WaitPort loops (Bulls, FR) vs Wait() (AquaScan)
  private needsXIMPoll: boolean = false;
  private static instanceCounter = 0;
  private instanceId: number;

  // Flag set when Wait() blocks - tells handleTrap NOT to advance PC
  // This allows Wait() to be re-executed after Signal() wakes the door
  private isWaitBlocking: boolean = false;

  // Door init callback - called when door calls CreatePort (initialization complete)
  private doorInitCallback: (() => void) | null = null;
  private doorPortAddr: number = 0;
  private lastWaitPortReturnAddr: number = 0;
  private waitPortReturnCallback: ((addr: number) => void) | null = null;

  // Library loader for real native libraries
  private libraryLoader: any = null;
  private useNativeLibraries: boolean = false;

  // Host-owned AEDoor messages that must not be freed by doors (jhMessage buffers)
  private protectedMessages: Set<number> = new Set();

  // Memory Layout (per vamos/Amiga conventions):
  // 0x000000-0x0007FF: Exception vectors, scratch
  // 0x001000-0x07FFFF: Door code segments (512KB max)
  // 0x080000+: System structures and library stubs
  // 0x100000+: AllocMem heap
  //
  // The addresses themselves live in ../memory-map.ts, which is also what
  // enforces the door-segment ceiling above — a second copy here is how the
  // "512KB max" line stayed a comment instead of a rule.
  private readonly EXEC_BASE_ADDR = memoryMap.EXEC_BASE_ADDR;
  private readonly DOS_LIB_ADDR = memoryMap.DOS_LIB_ADDR;
  private readonly AEDOOR_LIB_ADDR = memoryMap.AEDOOR_LIB_ADDR;
  private readonly ICON_LIB_ADDR = memoryMap.ICON_LIB_ADDR;
  private readonly INTUITION_LIB_ADDR = memoryMap.INTUITION_LIB_ADDR;
  private readonly GRAPHICS_LIB_ADDR = memoryMap.GRAPHICS_LIB_ADDR;
  private readonly UTILITY_LIB_ADDR = memoryMap.UTILITY_LIB_ADDR;
  private readonly BSDSOCKET_LIB_ADDR = memoryMap.BSDSOCKET_LIB_ADDR;
  private readonly AMISSLMASTER_LIB_ADDR = memoryMap.AMISSLMASTER_LIB_ADDR;
  private readonly AMISSL_LIB_ADDR = memoryMap.AMISSL_LIB_ADDR;
  private readonly DREAMDOOR_LIB_ADDR = memoryMap.DREAMDOOR_LIB_ADDR;
  private readonly REXXSUPPORT_LIB_ADDR = memoryMap.REXXSUPPORT_LIB_ADDR;
  private readonly REXXARPLIB_LIB_ADDR = memoryMap.REXXARPLIB_LIB_ADDR;
  private readonly FAME_LIB_ADDR = memoryMap.FAME_LIB_ADDR;
  private nextStubLibraryAddr = memoryMap.ALLOCMEM_HEAP_BASE; // fallback base for unknown stub libraries (1MB+)
  private readonly PORT_LIST_OFFSET = 392;
  private currentStackLower = 0;
  private currentStackUpper = 0;
  private rawDoFmtCount = 0;
  private rawDoFmtScratchPtr = 0;
  private rawDoFmtReturnStub = 0;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
    this.instanceId = ++ExecLibrary.instanceCounter;
    debugLog(`[ExecLibrary] Created instance #${this.instanceId}`);

    // Initialize ExecBase structure. idString/libList/taskReady are stubbed
    // as NULL — AmiExpress doors don't walk lib_IdString or the system library
    // / task lists, so populating them buys nothing. Wire up real values only
    // if a real door is ever observed dereferencing them.
    this.execBase = {
      address: this.EXEC_BASE_ADDR,
      version: 40, // Kickstart 3.1 exec.library 40.10
      revision: 10,
      idString: 0,
      softVer: 40, // Kickstart 3.1
      thisTask: 0, // Will be set when creating task
      libList: 0,
      taskReady: 0,
      eclockFrequency: 709379, // PAL E-clock frequency
    };

    // Create BBS handler task (owns AEDoorPort, handles door messages)
    // BBS task at 0x088000 - between ExecBase and Door Task
    const bbsTaskAddr = 0x088000;
    const bbsMsgPortAddr = 0x08805c;
    this.bbsTask = {
      address: bbsTaskAddr,
      name: "BBS Handler",
      node: bbsTaskAddr,
      sigRecvd: 0,
      sigWait: 0,
      state: 0, // TS_READY
      msgPort: bbsMsgPortAddr,
      isWaiting: false,
    };

    // Register BBS task's message port
    this.messagePorts.set(bbsMsgPortAddr, {
      address: bbsMsgPortAddr,
      name: "BBS Handler Port",
      messages: [],
      sigBit: 0,
      sigTask: bbsTaskAddr,
      signaled: false,
    });

    // Create current task (the door itself)
    // Will be allocated dynamically after door segments are loaded
    // to avoid overlapping with door's BSS/DATA segments
    this.currentTask = {
      address: 0, // Will be set by allocateDoorTask()
      name: "Door Task",
      node: 0,
      sigRecvd: 0,
      sigWait: 0,
      state: 0,
      msgPort: 0, // Will be set by allocateDoorTask()
      isWaiting: false,
    };
    this.execBase.thisTask = 0; // Will be set by allocateDoorTask()

debugLog("[ExecLibrary] Initialized");
debugLog(
      `[ExecLibrary] ExecBase at 0x${this.execBase.address.toString(16)}`
    );
  }

  /**
   * File-based debug logging for visibility (writes to backend.log directly)
   * This bypasses console.log filtering issues
   */
  // PERFORMANCE: Debug logging disabled by default - causes severe slowdown
  // due to synchronous file I/O on every GetMsg call (30-40ms polling loops)
  // Enable with DEBUG_EXEC=1 environment variable if needed for debugging
  private static readonly EXEC_DEBUG_ENABLED = process.env.DEBUG_EXEC === '1';

  private logExecDebug(message: string): void {
    if (!ExecLibrary.EXEC_DEBUG_ENABLED) return;

    try {
      // BBS_DATA_DIR, or this checkout's root - not one developer's
      // absolute path, which on any other machine names a directory that
      // does not exist and sends the debug log nowhere.
      const bbsRoot = process.env.BBS_DATA_DIR || path.resolve(__dirname, '../../../../..');
      const logFile = path.join(bbsRoot, "logs", "backend.log");
      const line = `[ExecDebug] ${getSystemTime().toISOString()} ${message}\n`;
      fs.appendFileSync(logFile, line, { encoding: "utf8" });
    } catch (e) {
      // Log error to console as fallback
console.error(`[ExecDebug] Failed to write log: ${e}`);
    }
  }

  /**
   * Track current stack bounds for StackSwap symmetry.
   */
  setStackBounds(lower: number, size: number): void {
    this.currentStackLower = lower >>> 0;
    this.currentStackUpper = (lower + size) >>> 0;
debugLog(
      `[ExecLibrary] Stack bounds set: lower=0x${this.currentStackLower.toString(
        16
      )} upper=0x${this.currentStackUpper.toString(16)}`
    );
  }

  getStackUpper(): number {
    return this.currentStackUpper;
  }

  getStackLower(): number {
    return this.currentStackLower;
  }

  /**
   * Allocate door Task structure dynamically after door segments.
   * CRITICAL: Must be called AFTER door segments are loaded to avoid overlap.
   *
   * @param doorSegmentEnd - End address of door's highest segment (CODE/BSS/DATA)
   */
  allocateDoorTask(doorSegmentEnd: number): void {
    // Allocate Task structure after door segments with 4KB padding for safety
    // Align to 256-byte boundary for structure alignment
    const taskAddr = ((doorSegmentEnd + 0x1000 + 0xFF) & ~0xFF) >>> 0;
    const taskMsgPortAddr = (taskAddr + 0x5C) >>> 0; // Process msg port at task + 0x5C

    this.currentTask.address = taskAddr;
    this.currentTask.node = taskAddr;
    this.currentTask.msgPort = taskMsgPortAddr;
    this.execBase.thisTask = taskAddr;

    // Register the task's message port
    // CRITICAL FIX 2026-01-20: Use sigBit=18 to avoid conflict with door Wait() masks
    // AquaScan/FR doors use Wait(0x21000) which waits for bits 12 OR 17.
    // Auto-allocated sigBit was returning 16, which accumulated in sigRecvd and never cleared,
    // causing doors to loop forever. Bit 18 doesn't conflict with common door Wait masks.
    this.messagePorts.set(taskMsgPortAddr, {
      address: taskMsgPortAddr,
      name: "Door Task Port",
      messages: [],
      sigBit: 18,  // Use bit 18 instead of auto-allocated bit
      sigTask: taskAddr,
      signaled: false,
    });

    // Write ExecBase.thisTask to memory
    this.emulator.writeMemory32(this.execBase.address + 276, taskAddr);

    // Write the Task/Process structure to memory
    this.writeTaskToMemory(this.currentTask);

debugLog(
      `[ExecLibrary] *** DYNAMIC TASK ALLOCATION ***\n` +
      `  Door segments end at: 0x${doorSegmentEnd.toString(16)}\n` +
      `  Task structure allocated at: 0x${taskAddr.toString(16)}\n` +
      `  Task message port at: 0x${taskMsgPortAddr.toString(16)}\n` +
      `  ExecBase.thisTask updated to: 0x${taskAddr.toString(16)}`
    );
  }

  /**
   * Set callback for when door sends message to AEDoorPort
   * This allows AmigaDoorSession to process messages via trap interception
   * instead of polling GetMsg()
   */
  setDoorMessageCallback(
    callback: (portAddr: number, msgAddr: number) => void
  ): void {
    this.doorMessageCallback = callback;
  }

  /**
   * Set callback for when a FAME BBS door sends a message to
   * FAMEDoorPort<node>. Mirrors setDoorMessageCallback for the FIM protocol.
   */
  setFimMessageCallback(callback: (msgAddr: number) => void): void {
    this.fimMessageCallback = callback;
  }

  /**
   * Check if XIM polling is needed (WaitPort returned 0)
   * Used by execution loop to trigger immediate XIM polling for doors in tight WaitPort loops
   */
  getNeedsXIMPoll(): boolean {
    // Debug: Log which instance is being checked
    if (this.needsXIMPoll) {
      debugLog(`[ExecLibrary] getNeedsXIMPoll() returning TRUE (instance=${this.instanceId})`);
    }
    return this.needsXIMPoll;
  }

  /**
   * Clear the XIM poll flag after polling is done
   */
  clearNeedsXIMPoll(): void {
    this.needsXIMPoll = false;
  }

  /**
   * Check if Wait() is blocking and needs special handling
   * When true, handleTrap should NOT advance PC - Wait() will be re-executed after Signal()
   */
  consumeIsWaitBlocking(): boolean {
    const was = this.isWaitBlocking;
    this.isWaitBlocking = false;
    return was;
  }

  recordWaitPortReturn(returnAddr: number): void {
debugLog(
      `[ExecLibrary] Storing WaitPort return address 0x${returnAddr.toString(
        16
      )}`
    );
    this.lastWaitPortReturnAddr = returnAddr;
    if (this.waitPortReturnCallback) {
      this.waitPortReturnCallback(returnAddr);
    }
  }

  getLastWaitPortReturnAddr(): number {
    return this.lastWaitPortReturnAddr;
  }

  setWaitPortReturnCallback(callback: (addr: number) => void): void {
    this.waitPortReturnCallback = callback;
  }

  setDoorPortAddress(addr: number): void {
    this.doorPortAddr = addr;
  }
  getDoorPortAddress(): number {
    return this.doorPortAddr;
  }

  /** Allow callers to mark host-owned jhMessage buffers as protected from FreeMem. */
  registerProtectedMessage(msgAddr: number): void {
    if (msgAddr && msgAddr >= 0x100) {
      this.protectedMessages.add(msgAddr);
    }
  }

  /**
   * When Exec hands a message pointer back to the door (WaitPort/GetMsg),
   * mark it protected so the door cannot FreeMem the host-owned buffer.
   */
  private protectReturnedMessage(msgAddr: number, context: string): void {
    if (!msgAddr || msgAddr < 0x100) {
      return;
    }
    if (!this.protectedMessages.has(msgAddr)) {
debugLog(
        `[ExecLibrary] Protecting message from ${context}: 0x${msgAddr.toString(
          16
        )}`
      );
    }
    this.registerProtectedMessage(msgAddr);
  }

  /**
   * Set callback for when door calls CreatePort (initialization complete)
   * This allows AmigaDoorSession to set pr_CLI after door has initialized
   */
  setDoorInitCallback(callback: () => void): void {
    this.doorInitCallback = callback;
  }

  /**
   * Initialize the Exec system
   * - Create ExecBase structure in memory
   * - Set pointer at 0x000004
   * - Create initial task
   * - Override ROM exception vectors with simple handlers
   */
  initialize(): void {
debugLog("[ExecLibrary] Creating ExecBase structure...");

    // ROM loaded but its exception handlers expect fully booted system
    // Override with our simple handlers that skip instructions
    this.setupExceptionVectors();

    // Write ExecBase pointer at 0x000004 (absolute address 4)
    this.emulator.writeMemory32(0x000004, this.execBase.address);
debugLog(
      `[ExecLibrary] Wrote ExecBase pointer at 0x000004 -> 0x${this.execBase.address.toString(
        16
      )}`
    );

    // CRITICAL: SAS/C compiled programs often read ExecBase from 0xC instead of 0x4!
    // The DIAGNOSTIC door does: movea.l 0xc.l, a6 to get ExecBase
    // Write ExecBase at 0xC as well to support this pattern
    this.emulator.writeMemory32(0x00000c, this.execBase.address);
debugLog(
      `[ExecLibrary] Wrote ExecBase pointer at 0x00000C -> 0x${this.execBase.address.toString(
        16
      )} (SAS/C pattern)`
    );

    // Write random seed at 0x100 for doors that need entropy
    // This provides a different value each time a door runs
    const randomSeed = (Date.now() & 0xFFFFFFFF) ^ (Math.random() * 0xFFFFFFFF >>> 0);
    this.emulator.writeMemory32(0x00000400, randomSeed);

    // Create stub function for unknown system vectors
    // Some programs (like GetAnswer) load function pointers from low memory
    // We create a stub that just does RTS (return immediately)
    // MUST be in chip RAM (0x000000-0x1FFFFF) - using area after exception handlers
    const STUB_FUNCTION_ADDR = 0x180f00; // After exception handlers (0x180000-0x180800)
    this.emulator.writeMemory16(STUB_FUNCTION_ADDR, 0x4e75); // RTS instruction
debugLog(
      `[ExecLibrary] Created stub function at 0x${STUB_FUNCTION_ADDR.toString(
        16
      )}`
    );

    // Point common low memory vectors to stub function
    // These might be used by C runtime or BBS-specific code
    const LOW_MEMORY_VECTORS = [
      0x00f4, // Used by GetAnswer door
      0x00f8, // Potential related vector
      0x00fc, // Potential related vector
    ];

    for (const addr of LOW_MEMORY_VECTORS) {
      this.emulator.writeMemory32(addr, STUB_FUNCTION_ADDR);
debugLog(
        `[ExecLibrary] Stub vector at 0x${addr
          .toString(16)
          .padStart(4, "0")} -> 0x${STUB_FUNCTION_ADDR.toString(16)}`
      );
    }

    // Write ExecBase structure to memory
    this.writeExecBaseToMemory();

    // NOTE: Task structure will be written by allocateDoorTask() after door segments load
    // This avoids overlapping with door's BSS/DATA segments

debugLog("[ExecLibrary] ExecBase initialized successfully");
  }

  /**
   * Set up exception vector table (0x00-0xFF)
   *
   * The 68000 exception vector table contains pointers to exception handlers.
   * When an exception occurs, the CPU jumps to the address stored in the vector.
   *
   * We create handlers that skip the offending instruction to prevent infinite loops.
   */
  private setupExceptionVectors(): void {
debugLog("[ExecLibrary] Setting up exception vectors...");

    // Exception handler code location - MUST be within chip RAM (0x000000-0x1FFFFF)
    // The vAmiga-style WASM memory only maps chip RAM (2MB) and ROM (512KB at 0xF80000)
    // Pages 0x20-0xF7 are unmapped and writes are silently ignored!
    // Use 0x180000 (1.5MB into chip RAM) - safe distance from door code/data
    const EXCEPTION_HANDLER_BASE = 0x180000;

    // Create exception handlers that skip the offending instruction
    for (let i = 0; i < 64; i++) {
      const handlerAddr = EXCEPTION_HANDLER_BASE + i * 32;

      // Exception handler code:
      // ADDQ.L #2, 2(SP)    ; Skip 2 bytes (most 68000 instructions are 2+ bytes)
      // RTE                 ; Return from exception
      //
      // This increments the return PC by 2, skipping the instruction that caused the exception

      // ADDQ.L #2, 2(SP) = 0x5AAF 0x0002
      this.emulator.writeMemory16(handlerAddr + 0, 0x5aaf);
      this.emulator.writeMemory16(handlerAddr + 2, 0x0002);

      // RTE = 0x4E73
      this.emulator.writeMemory16(handlerAddr + 4, 0x4e73);

      // Write the handler address to the exception vector
      const vectorAddr = i * 4;
      this.emulator.writeMemory32(vectorAddr, handlerAddr);
    }

    // Verify handler 4 (Illegal Instruction) was written correctly
    const handler4Addr = EXCEPTION_HANDLER_BASE + 4 * 32; // 0xf00080
    const verifyWord0 = this.emulator.readMemory16(handler4Addr);
    const verifyWord1 = this.emulator.readMemory16(handler4Addr + 2);
    const verifyWord2 = this.emulator.readMemory16(handler4Addr + 4);
debugLog(
      `[ExecLibrary] Handler 4 at 0x${handler4Addr.toString(
        16
      )}: [${verifyWord0.toString(16)}, ${verifyWord1.toString(
        16
      )}, ${verifyWord2.toString(16)}] (expected: 5aaf, 2, 4e73)`
    );

debugLog("[ExecLibrary] Exception vectors initialized (0x00-0xFF)");
debugLog(
      `[ExecLibrary] Exception handlers at 0x${EXCEPTION_HANDLER_BASE.toString(
        16
      )}`
    );
debugLog(
      "[ExecLibrary] Handlers skip offending instruction (+2 bytes) and RTE"
    );
  }

  /**
   * Write ExecBase structure to emulator memory
   * Following the structure from vAmiga
   */
  private writeExecBaseToMemory(): void {
    const addr = this.execBase.address;

    // Library node header (34 bytes)
    // For now, minimal initialization
    this.emulator.writeMemory16(addr + 20, this.execBase.version); // lib_Version
    this.emulator.writeMemory16(addr + 22, this.execBase.revision); // lib_Revision
    this.emulator.writeMemory32(addr + 24, this.execBase.idString); // lib_IdString

    // ExecBase specific fields
    this.emulator.writeMemory16(addr + 34, this.execBase.softVer); // SoftVer
    this.emulator.writeMemory32(addr + 276, this.execBase.thisTask); // ThisTask
    this.emulator.writeMemory32(addr + 378, this.execBase.libList); // LibList
    this.initializeExecList(addr + this.PORT_LIST_OFFSET); // PortList

    // V36 additions
    this.emulator.writeMemory32(addr + 568, this.execBase.eclockFrequency); // ex_EClockFrequency

debugLog(
      `[ExecLibrary] ExecBase structure written to 0x${addr.toString(16)}`
    );
debugLog(
      `[ExecLibrary]   Version: ${this.execBase.version}.${this.execBase.revision}`
    );
debugLog(
      `[ExecLibrary]   ThisTask: 0x${this.execBase.thisTask.toString(16)}`
    );
  }

  /**
   * Write Task/Process structure to memory
   *
   * Doors expect a Process structure (Task + additional fields).
   * Process structure layout (from dos/dosextens.h):
   *   struct Task pr_Task (92 bytes = 0x5C)
   *   struct MsgPort pr_MsgPort (starts at offset 0x5C)
   *
   * Task structure layout (from exec/tasks.h):
   *   struct Node tc_Node (14 bytes)
   *     ln_Succ (4), ln_Pred (4), ln_Type (1), ln_Pri (1), ln_Name (4)
   *   tc_Flags (1), tc_State (1)
   *   tc_IDNestCnt (1), tc_TDNestCnt (1)
   *   tc_SigAlloc (4), tc_SigWait (4), tc_SigRecvd (4), tc_SigExcept (4)
   *   tc_TrapAlloc (2), tc_TrapAble (2)
   *   tc_ExceptData (4), tc_ExceptCode (4), tc_TrapData (4), tc_TrapCode (4)
   *   tc_SPReg (4), tc_SPLower (4), tc_SPUpper (4)
   *   tc_Switch (4), tc_Launch (4)
   *   struct List tc_MemEntry (14 bytes), tc_UserData (4)
   *   Total: 92 bytes (0x5C)
   *
   * MsgPort structure layout (from exec/ports.h):
   *   struct Node mp_Node (14 bytes)
   *   mp_Flags (1), mp_SigBit (1)
   *   mp_SigTask (4)
   *   struct List mp_MsgList (14 bytes)
   *   Total: 34 bytes
   */
  private writeTaskToMemory(task: Task): void {
    const addr = task.address;

    // Write Task structure (92 bytes)
    // Node header
    this.emulator.writeMemory32(addr + 0x00, 0); // ln_Succ
    this.emulator.writeMemory32(addr + 0x04, 0); // ln_Pred
    this.emulator.writeMemory(addr + 0x08, 1); // ln_Type = NT_TASK
    this.emulator.writeMemory(addr + 0x09, 0); // ln_Pri
    this.emulator.writeMemory32(addr + 0x0a, 0); // ln_Name (TODO: write name string)

    // Task fields
    this.emulator.writeMemory(addr + 0x0e, 0); // tc_Flags
    this.emulator.writeMemory(addr + 0x0f, 2); // tc_State = TS_RUN
    this.emulator.writeMemory(addr + 0x10, 0); // tc_IDNestCnt
    this.emulator.writeMemory(addr + 0x11, 0); // tc_TDNestCnt

    // Signal fields
    this.emulator.writeMemory32(addr + 0x12, 0); // tc_SigAlloc
    this.emulator.writeMemory32(addr + 0x16, task.sigWait); // tc_SigWait
    this.emulator.writeMemory32(addr + 0x1a, task.sigRecvd); // tc_SigRecvd
    this.emulator.writeMemory32(addr + 0x1e, 0); // tc_SigExcept

    // Trap fields
    this.emulator.writeMemory16(addr + 0x22, 0); // tc_TrapAlloc
    this.emulator.writeMemory16(addr + 0x24, 0); // tc_TrapAble

    // Exception/Trap handlers
    this.emulator.writeMemory32(addr + 0x26, 0); // tc_ExceptData
    this.emulator.writeMemory32(addr + 0x2a, 0); // tc_ExceptCode
    this.emulator.writeMemory32(addr + 0x2e, 0); // tc_TrapData
    this.emulator.writeMemory32(addr + 0x32, 0); // tc_TrapCode

    // Stack pointers
    this.emulator.writeMemory32(addr + 0x36, 0); // tc_SPReg
    this.emulator.writeMemory32(addr + 0x3a, 0); // tc_SPLower
    this.emulator.writeMemory32(addr + 0x3e, 0); // tc_SPUpper

    // Switch/Launch
    this.emulator.writeMemory32(addr + 0x42, 0); // tc_Switch
    this.emulator.writeMemory32(addr + 0x46, 0); // tc_Launch

    // MemEntry list (empty list)
    this.emulator.writeMemory32(addr + 0x4a, addr + 0x4e); // lh_Head -> lh_Tail
    this.emulator.writeMemory32(addr + 0x4e, 0); // lh_Tail = NULL
    this.emulator.writeMemory32(addr + 0x52, addr + 0x4a); // lh_TailPred -> lh_Head
    this.emulator.writeMemory(addr + 0x56, 0); // lh_Type
    this.emulator.writeMemory(addr + 0x57, 0); // l_pad

    // UserData
    this.emulator.writeMemory32(addr + 0x58, 0); // tc_UserData

    // Write Process pr_MsgPort structure at offset 0x5C
    const msgPortAddr = task.msgPort;

    // MsgPort Node header
    this.emulator.writeMemory32(msgPortAddr + 0x00, 0); // ln_Succ
    this.emulator.writeMemory32(msgPortAddr + 0x04, 0); // ln_Pred
    this.emulator.writeMemory(msgPortAddr + 0x08, 4); // ln_Type = NT_MSGPORT
    this.emulator.writeMemory(msgPortAddr + 0x09, 0); // ln_Pri
    this.emulator.writeMemory32(msgPortAddr + 0x0a, 0); // ln_Name

    // MsgPort fields
    this.emulator.writeMemory(msgPortAddr + 0x0e, 0); // mp_Flags = PA_SIGNAL
    this.emulator.writeMemory(msgPortAddr + 0x0f, 0); // mp_SigBit
    this.emulator.writeMemory32(msgPortAddr + 0x10, task.address); // mp_SigTask = task

    // MsgPort message list (empty list)
    this.emulator.writeMemory32(msgPortAddr + 0x14, msgPortAddr + 0x18); // lh_Head -> lh_Tail
    this.emulator.writeMemory32(msgPortAddr + 0x18, 0); // lh_Tail = NULL
    this.emulator.writeMemory32(msgPortAddr + 0x1c, msgPortAddr + 0x14); // lh_TailPred -> lh_Head
    this.emulator.writeMemory(msgPortAddr + 0x20, 5); // lh_Type = NT_MESSAGE
    this.emulator.writeMemory(msgPortAddr + 0x21, 0); // l_pad

    // CRITICAL: Write Process structure fields beyond Task
    // pr_CLI at offset 0xAC - MUST be 0 for BBS doors (non-zero = CLI/shell)
    // Doors check this field to detect if they're running from shell vs BBS
    this.emulator.writeMemory32(addr + 0xac, 0); // pr_CLI = NULL (not a CLI process)

    // Other Process fields that should be zero for a BBS door
    this.emulator.writeMemory32(addr + 0x98, 0); // pr_CurrentDir = NULL
    this.emulator.writeMemory32(addr + 0xb0, 0); // pr_ConsoleTask = NULL
    this.emulator.writeMemory32(addr + 0xb4, 0); // pr_FileSystemTask = NULL
    this.emulator.writeMemory32(addr + 0xb8, 0); // pr_CIS = NULL (no CLI input stream)
    this.emulator.writeMemory32(addr + 0xbc, 0); // pr_COS = NULL (no CLI output stream)

debugLog(
      `[ExecLibrary] Task/Process structure written to 0x${task.address.toString(
        16
      )}`
    );
debugLog(`[ExecLibrary]   pr_MsgPort at 0x${msgPortAddr.toString(16)}`);
debugLog(`[ExecLibrary]   pr_CLI at 0x${(addr + 0xac).toString(16)} = 0 (BBS door, not CLI)`);
  }

  /**
   * OpenLibrary(name, version) -> library base or NULL
   *
   * Opens a library and returns its base address.
   * Returns NULL if library cannot be opened.
   *
   * Implementation: Return stub library structures for known libraries
   */
  // Callbacks for when a library is opened (used to install traps).
  // Multiple independent consumers register here (LibraryManager installs
  // library-specific trap vectors; AmigaDoorSession sends startup messages
  // on AEDoor.library open, etc.) — this must be a compose/list, not a
  // single overwritable slot. A single slot meant the second registration
  // silently discarded the first (see the fame.library trap-install bug:
  // LibraryManager's fame.library branch never ran because
  // AmigaDoorSession.setupComponentCallbacks() replaced the whole callback).
  private libraryOpenedCallbacks: Array<(name: string, addr: number) => void> = [];
  private nativeLibraryFlags = new Map<string, boolean>();

  /**
   * Register a callback for when a library is opened. All registered
   * callbacks fire, in registration order, on every OpenLibrary() call site
   * below (`notifyLibraryOpened`).
   */
  addLibraryOpenedCallback(
    callback: (name: string, addr: number) => void
  ): void {
    this.libraryOpenedCallbacks.push(callback);
  }

  /**
   * @deprecated Use addLibraryOpenedCallback — this now APPENDS rather than
   * replaces (kept as an alias so existing call sites keep working without
   * change; the old single-slot "last writer wins" behavior silently
   * dropped every earlier registration, which is the root cause fixed here).
   */
  setLibraryOpenedCallback(
    callback: (name: string, addr: number) => void
  ): void {
    this.addLibraryOpenedCallback(callback);
  }

  private notifyLibraryOpened(name: string, addr: number): void {
    for (const callback of this.libraryOpenedCallbacks) {
      callback(name, addr);
    }
  }

  isLibraryNative(name: string): boolean {
    const lower = name.toLowerCase();
    if (this.nativeLibraryFlags.has(name)) {
      return this.nativeLibraryFlags.get(name) === true;
    }
    if (this.nativeLibraryFlags.has(lower)) {
      return this.nativeLibraryFlags.get(lower) === true;
    }
    return false;
  }

  private setLibraryNativeFlag(name: string, isNative: boolean): void {
    const lower = name.toLowerCase();
    this.nativeLibraryFlags.set(name, isNative);
    this.nativeLibraryFlags.set(lower, isNative);
  }

  /**
   * Set the library loader for hybrid native library support
   */
  setLibraryLoader(libraryLoader: any, useNativeLibraries: boolean): void {
    this.libraryLoader = libraryLoader;
    this.useNativeLibraries = useNativeLibraries;
debugLog(
      `[ExecLibrary] Library loader set - native libraries: ${
        useNativeLibraries ? "enabled" : "disabled"
      }`
    );
  }

  /**
   * Handle hybrid library opening - try real library first, fall back to stub
   */
  openLibraryHybrid(
    name: string,
    minVersion: number,
    allowTrapJump: boolean = false
  ): { success: boolean; address: number; isNative: boolean } {
debugLog(`[ExecLibrary] Hybrid OpenLibrary("${name}", ${minVersion})`);

    // Try ROM resident modules (e.g. Kickstart/AROS residents) first so InitResident runs
    if (this.useNativeLibraries) {
      const romLibrary = this.openLibraryFromRomResident(
        name,
        minVersion,
        allowTrapJump
      );
      if (romLibrary) {
        this.setLibraryNativeFlag(name, true);
        return { success: true, address: romLibrary, isNative: true };
      }
      // NOTE: If hasPendingTrapJump(), the trap is scheduled but we continue to try
      // disk/stub libraries. The trap will execute later. We do NOT return address 0
      // here because that breaks doors expecting a valid library base immediately.
      if (this.hasPendingTrapJump()) {
debugLog(
          `[ExecLibrary] InitResident trap scheduled for ${name}, continuing with disk/stub loading`
        );
        // Fall through to try disk libraries or stubs
      }
    }

    // Try real native library first if enabled
    if (this.useNativeLibraries && this.libraryLoader) {
      // CRITICAL: Skip LibraryLoader for AEDoor.library if already loaded by fallback
      // The fallback loader creates JMP table at specific address; reloading breaks it
      const existingCheck =
        this.libraries.get(name) || this.libraries.get(name.toLowerCase());
      if (existingCheck && name.toLowerCase() === "aedoor.library") {
debugLog(
          `[ExecLibrary] AEDoor.library already loaded at 0x${existingCheck.address.toString(
            16
          )} - using existing (has JMP table)`
        );
        existingCheck.openCount = (existingCheck.openCount || 0) + 1;
        this.writeLibraryToMemory(existingCheck);
        this.notifyLibraryOpened(name, existingCheck.address);

        // CRITICAL: Create AEDoorPort dynamically when AEDoor.library is opened by the door
        this.createDynamicAEDoorPort(name);

        this.setLibraryNativeFlag(name, true);
        return {
          success: true,
          address: existingCheck.address,
          isNative: true,
        };
      }

      const realLibrary = this.libraryLoader.loadLibrary(name, minVersion);
      if (realLibrary) {
debugLog(
          `[ExecLibrary] ✅ Loaded REAL ${name} at 0x${realLibrary.baseAddress.toString(
            16
          )}`
        );

        // If a placeholder already exists (from preregistration), upgrade it to the real base
        const existing =
          this.libraries.get(name) || this.libraries.get(name.toLowerCase());
        if (existing) {
          existing.address = realLibrary.baseAddress;
          existing.version = realLibrary.version || existing.version;
          existing.revision = 0;
          existing.openCount = (existing.openCount || 0) + 1;
          this.writeLibraryToMemory(existing);
debugLog(
            `[ExecLibrary]   Upgraded placeholder for ${name} -> real base 0x${existing.address.toString(
              16
            )}, count=${existing.openCount}`
          );

          // Notify callback with the real address
          this.notifyLibraryOpened(name, realLibrary.baseAddress);

          // CRITICAL: Create AEDoorPort dynamically when AEDoor.library is opened by the door
          this.createDynamicAEDoorPort(name);

          this.setLibraryNativeFlag(name, true);
          return { success: true, address: existing.address, isNative: true };
        }

        // Create library node for real library
        const lib: LibraryNode = {
          address: realLibrary.baseAddress,
          name: name,
          version: realLibrary.version,
          revision: 0,
          openCount: 1,
          negSize: 30,
          posSize: 34,
        };

        this.libraries.set(name, lib);
        this.writeLibraryToMemory(lib);

        // Notify callback
        this.notifyLibraryOpened(name, realLibrary.baseAddress);

        // CRITICAL: Create AEDoorPort dynamically when AEDoor.library is opened by the door
        // (not on initial pre-open by LibraryManager)
        this.createDynamicAEDoorPort(name);

        this.setLibraryNativeFlag(name, true);
        return {
          success: true,
          address: realLibrary.baseAddress,
          isNative: true,
        };
      } else {
debugLog(`[ExecLibrary] ⚠️ Real library not found, using stub`);
      }
    }

    // Fall back to stub library
    const stubAddr = this.openLibraryStub(name, minVersion);
    if (stubAddr !== 0) {
      this.setLibraryNativeFlag(name, false);
      return { success: true, address: stubAddr, isNative: false };
    }

debugLog(`[ExecLibrary] ❌ Failed to open ${name}`);
    this.setLibraryNativeFlag(name, false);
    return { success: false, address: 0, isNative: false };
  }

  /**
   * Open stub library (original implementation)
   */
  private openLibraryStub(name: string, version: number): number {
    const lower = name.toLowerCase();
    const fixed = this.getFixedStubLibrarySpec(lower);
    if (fixed) {
      const existing = this.libraries.get(name) || this.libraries.get(lower);
      if (existing) {
        existing.address = fixed.address;
        existing.openCount++;
        if (version > existing.version) {
          existing.version = version;
          existing.revision = fixed.revision;
        }
        this.writeLibraryToMemory(existing);
        if (fixed.stubJumpTableEntries) {
          this.fillStubJumpTable(existing.address, fixed.stubJumpTableEntries);
        }
debugLog(
          `[ExecLibrary]   Reusing registered ${name} at 0x${existing.address.toString(
            16
          )}, count=${existing.openCount}`
        );
        // CRITICAL FIX: Always call callback to ensure vectors are installed
        // This was missing, causing icon.library GetDiskObject traps to not work
        this.notifyLibraryOpened(name, existing.address);
        return existing.address;
      }

      const lib: LibraryNode = {
        address: fixed.address,
        name,
        version: Math.max(version, fixed.version),
        revision: fixed.revision,
        openCount: 1,
        negSize: 30,
        posSize: 34,
      };
      this.libraries.set(name, lib);
      if (lower !== name) {
        this.libraries.set(lower, lib);
      }
      this.writeLibraryToMemory(lib);
      if (fixed.stubJumpTableEntries) {
        this.fillStubJumpTable(lib.address, fixed.stubJumpTableEntries);
      }
debugLog(
        `[ExecLibrary]   Opened STUB ${name} at 0x${fixed.address.toString(
          16
        )}, v${lib.version}.${lib.revision}`
      );
      this.notifyLibraryOpened(name, lib.address);
      return lib.address;
    }

    const existing =
      this.libraries.get(name) || this.libraries.get(name.toLowerCase());
    if (existing) {
      existing.openCount++;
      if (version > existing.version) {
        existing.version = version;
        existing.revision = 0;
        this.writeLibraryToMemory(existing);
      }
debugLog(
        `[ExecLibrary]   Reusing registered ${name} at 0x${existing.address.toString(
          16
        )}, count=${existing.openCount}`
      );
      // CRITICAL FIX: Always call callback to ensure vectors are installed
      this.notifyLibraryOpened(name, existing.address);
      return existing.address;
    }

    // Create library structure based on name
    let libAddr = 0;
    let libVersion = 0;
    let libRevision = 0;

    switch (lower) {
      case "aedoor.library":
        libAddr = this.AEDOOR_LIB_ADDR;
        libVersion = 2; // V-AWAIT door requires version 2+
        libRevision = 0;
        break;

      default:
        libAddr = this.nextStubLibraryAddr;
        this.nextStubLibraryAddr += 0x010000;
        libVersion = version;
        libRevision = 0;
debugLog(
          `[ExecLibrary]   Opened generic stub library "${name}" at 0x${libAddr.toString(
            16
          )}`
        );
        break;
    }

    // Check version requirement (allow graceful upgrade for stubs)
    if (version > libVersion) {
debugLog(
        `[ExecLibrary]   Version ${version} > available ${libVersion}, proceeding with stub (compat mode)`
      );
      libVersion = version;
    }

    // Create library node
    const lib: LibraryNode = {
      address: libAddr,
      name: name,
      version: libVersion,
      revision: libRevision,
      openCount: 1,
      negSize: 30, // Standard jump table size
      posSize: 34, // Standard library structure size
    };

    this.libraries.set(name, lib);
    if (lower !== name) {
      this.libraries.set(lower, lib);
    }

    // Write library structure to memory
    this.writeLibraryToMemory(lib);

debugLog(
      `[ExecLibrary]   Opened STUB ${name} at 0x${libAddr.toString(
        16
      )}, v${libVersion}.${libRevision}`
    );

    // Notify callback (used to install library traps)
    this.notifyLibraryOpened(name, libAddr);

    return libAddr;
  }

  private getFixedStubLibrarySpec(
    name: string
  ): {
    address: number;
    version: number;
    revision: number;
    stubJumpTableEntries?: number;
  } | null {
    switch (name) {
      case "exec.library":
        return { address: this.EXEC_BASE_ADDR, version: 37, revision: 175 };
      case "dos.library":
        return { address: this.DOS_LIB_ADDR, version: 37, revision: 0 };
      case "icon.library":
        return { address: this.ICON_LIB_ADDR, version: 37, revision: 0 };
      case "intuition.library":
        return {
          address: this.INTUITION_LIB_ADDR,
          version: 36,
          revision: 0,
          stubJumpTableEntries: 64,
        };
      case "graphics.library":
        return {
          address: this.GRAPHICS_LIB_ADDR,
          version: 36,
          revision: 0,
          stubJumpTableEntries: 64,
        };
      case "utility.library":
        return {
          address: this.UTILITY_LIB_ADDR,
          version: 37,
          revision: 0,
          stubJumpTableEntries: 64,
        };
      case "bsdsocket.library":
        return {
          address: this.BSDSOCKET_LIB_ADDR,
          version: 4,
          revision: 0,
          stubJumpTableEntries: 60,
        };
      case "amisslmaster.library":
        return {
          address: this.AMISSLMASTER_LIB_ADDR,
          version: 4,
          revision: 0,
          stubJumpTableEntries: 10,
        };
      case "amissl.library":
        return {
          address: this.AMISSL_LIB_ADDR,
          version: 4,
          revision: 0,
          stubJumpTableEntries: 500,
        };
      // LVO range spans -6 through -144 = 24 slots at 6-byte spacing
      // (confirmed, dd-constants.ts). 20 truncated before DDCommand@-132
      // and the unnamed -138/-144 slots.
      case "dreamdoor.library":
        return {
          address: this.DREAMDOOR_LIB_ADDR,
          version: 1,
          revision: 0,
          stubJumpTableEntries: 24,
        };
      case "rexxsupport.library":
        return {
          address: this.REXXSUPPORT_LIB_ADDR,
          version: 34,
          revision: 0,
          stubJumpTableEntries: 30,
        };
      case "rexxarplib.library":
        return {
          address: this.REXXARPLIB_LIB_ADDR,
          version: 34,
          revision: 0,
          stubJumpTableEntries: 30,
        };
      case "fame.library":
        return {
          address: this.FAME_LIB_ADDR,
          version: 6,
          revision: 0,
          stubJumpTableEntries: 80,
        };
      default:
        return null;
    }
  }

  private openLibraryFromRomResident(
    name: string,
    minVersion: number,
    allowTrapJump: boolean
  ): number | null {
debugLog(`[ExecLibrary] Looking for ROM resident: ${name}`);
    const residentAddr = this.findRomResidentByName(name);
    if (!residentAddr) {
debugLog(`[ExecLibrary]   ROM resident ${name} not found in ROM`);
      return null;
    }
    const version = this.emulator.readMemory(residentAddr + 11);
    if (version < minVersion) {
debugLog(
        `[ExecLibrary]   ROM resident ${name} v${version} < required ${minVersion}`
      );
      return null;
    }
    const libBase = this.initResident(residentAddr, 0, allowTrapJump);
    if (!libBase) {
      return null;
    }
debugLog(
      `[ExecLibrary]   Opened ROM resident ${name} at 0x${libBase.toString(16)}`
    );
    return libBase;
  }

  private findRomResidentByName(name: string): number | null {
    if (!this.emulator) return null;
    if (!this.romResidentCache) {
      this.romResidentCache = this.scanRomResidents();
    }
    const addr = this.romResidentCache.get(name.toLowerCase());
    return addr ?? null;
  }

  private scanRomResidents(): Map<string, number> {
    const map = new Map<string, number>();

    // Helper function to scan a ROM range
    const scanRange = (start: number, end: number, label: string) => {
debugLog(
        `[ExecLibrary] Scanning ${label} for resident modules (0x${start.toString(16)} - 0x${end.toString(16)})...`
      );
      let foundCount = 0;
      for (let addr = start; addr + 24 <= end; addr += 2) {
        try {
          if (this.emulator.readMemory16(addr) !== ExecLibrary.RTC_MATCHWORD) {
            continue;
          }
          const matchTag = this.emulator.readMemory32(addr + 2);
          if (matchTag !== addr) {
            continue;
          }
          const namePtr = this.emulator.readMemory32(addr + 14);
          if (namePtr) {
            const name = this.emulator.readString(namePtr, 128);
            if (name) {
debugLog(
                `[ExecLibrary]   Found ROM resident: ${name} at 0x${addr.toString(16)}`
              );
              map.set(name.toLowerCase(), addr);
              foundCount++;
            }
          }
          const endSkip = this.emulator.readMemory32(addr + 6);
          if (endSkip > addr && endSkip <= end) {
            addr = (endSkip & ~1) - 2;
          }
        } catch (e) {
          // Memory read error - skip this address
          continue;
        }
      }
debugLog(`[ExecLibrary] ${label} scan: ${foundCount} modules found`);
    };

    // Scan main ROM (0xF80000-0xFFFFFF)
    scanRange(ExecLibrary.ROM_START, ExecLibrary.ROM_END, "Main ROM");

    // For AROS, also scan extension ROM (0xE00000-0xE7FFFF)
    // Check if extension ROM is mapped by trying to read from it
    try {
      const testByte = this.emulator.readMemory16(ExecLibrary.EXT_ROM_START);
      if (testByte !== 0) {
        scanRange(ExecLibrary.EXT_ROM_START, ExecLibrary.EXT_ROM_END, "Extension ROM (AROS)");
      }
    } catch (e) {
      // Extension ROM not mapped - this is normal for Kickstart
    }

debugLog(
      `[ExecLibrary] ROM resident scan complete: ${map.size} total modules found`
    );
    if (map.size > 0) {
debugLog(
        `[ExecLibrary] ROM modules: ${Array.from(map.keys()).join(", ")}`
      );
    }
    return map;
  }

  private initResident(
    residentAddr: number,
    segList: number,
    allowTrapJump: boolean = false
  ): number {
    if (!residentAddr) return 0;
    const matchWord = this.emulator.readMemory16(residentAddr);
    if (matchWord !== ExecLibrary.RTC_MATCHWORD) {
      return 0;
    }
    const matchTag = this.emulator.readMemory32(residentAddr + 2);
    if (matchTag !== residentAddr) {
      return 0;
    }
    const flags = this.emulator.readMemory(residentAddr + 10);
    const version = this.emulator.readMemory(residentAddr + 11);
    const type = this.emulator.readMemory(residentAddr + 12);
    const namePtr = this.emulator.readMemory32(residentAddr + 14);
    const initPtr = this.emulator.readMemory32(residentAddr + 22);
    const name = namePtr
      ? this.emulator.readString(namePtr, 128)
      : "<resident>";

    let hasAutoInit = (flags & ExecLibrary.RTF_AUTOINIT) !== 0;
    if (!hasAutoInit && initPtr) {
      if (this.isAutoInitStruct(initPtr)) {
        hasAutoInit = true;
console.warn(
          `[ExecLibrary] Resident ${name} missing AUTOINIT flag; treating rt_Init as AutoInit`
        );
      }
    }
    if (!hasAutoInit) {
      if (initPtr) {
        const posSize = this.emulator.readMemory32(initPtr);
        const functionsAddr = this.emulator.readMemory32(initPtr + 4);
        const initStructAddr = this.emulator.readMemory32(initPtr + 8);
        const initFuncAddr = this.emulator.readMemory32(initPtr + 12);
console.warn(
          `[ExecLibrary]   rt_Init details for ${name}: posSize=0x${posSize.toString(
            16
          )} funcs=0x${functionsAddr.toString(
            16
          )} initStruct=0x${initStructAddr.toString(
            16
          )} initFunc=0x${initFuncAddr.toString(16)}`
        );
      }
      if (allowTrapJump && initPtr) {
        this.requestTrapJump(initPtr, segList, name);
        return 0;
      }
console.warn(
        `[ExecLibrary] Resident ${name} has no AUTOINIT; skipping InitResident`
      );
      return 0;
    }

    if (type !== ExecLibrary.NT_LIBRARY) {
console.warn(
        `[ExecLibrary] Resident ${name} type=${type} not supported in InitResident`
      );
      return 0;
    }

    const posSize = this.emulator.readMemory32(initPtr);
    const functionsAddr = this.emulator.readMemory32(initPtr + 4);
    const initStructAddr = this.emulator.readMemory32(initPtr + 8);
    const initFuncAddr = this.emulator.readMemory32(initPtr + 12);

    const libBase = this.makeLibraryFromAutoInit(
      functionsAddr,
      initStructAddr,
      initFuncAddr,
      posSize,
      segList,
      name,
      version
    );
    return libBase;
  }

  private makeLibraryFromAutoInit(
    functionsAddr: number,
    initStructAddr: number,
    initFuncAddr: number,
    posSize: number,
    segList: number,
    name: string,
    version: number
  ): number {
    const { count, relative } = this.countFunctionEntries(functionsAddr);
    if (count === 0) {
console.warn(`[ExecLibrary] No functions found for ${name}`);
      return 0;
    }
    const negSize = count * 6;
    const totalSize = posSize + negSize;
    const allocBase = this.allocMem(totalSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
    if (!allocBase) {
      return 0;
    }
    const libBase = allocBase + negSize;
    this.buildJumpTable(libBase, functionsAddr, relative, count);
    if (initStructAddr) {
      this.initStruct(initStructAddr, libBase, posSize);
    }
    if (initFuncAddr) {
debugLog(
        `[ExecLibrary] NOTE: Init function for ${name} at 0x${initFuncAddr.toString(
          16
        )} not executed`
      );
    }

    const lib: LibraryNode = {
      address: libBase,
      name,
      version,
      revision: 0,
      openCount: 1,
      negSize,
      posSize,
    };
    this.libraries.set(name, lib);
    const lower = name.toLowerCase();
    if (lower !== name) {
      this.libraries.set(lower, lib);
    }
    this.writeLibraryToMemory(lib);
    return libBase;
  }

  private isAutoInitStruct(initPtr: number): boolean {
    if (!initPtr) return false;
    const posSize = this.emulator.readMemory32(initPtr);
    const functionsAddr = this.emulator.readMemory32(initPtr + 4);
    const initStructAddr = this.emulator.readMemory32(initPtr + 8);
    const initFuncAddr = this.emulator.readMemory32(initPtr + 12);

    if (posSize < 34 || posSize > 0x10000) return false;
    if (!this.isRomAddress(functionsAddr)) return false;
    if (initStructAddr !== 0 && !this.isRomAddress(initStructAddr))
      return false;
    if (initFuncAddr !== 0 && !this.isRomAddress(initFuncAddr)) return false;

    const { count } = this.countFunctionEntries(functionsAddr);
    if (count === 0 || count > 4096) return false;
    return true;
  }

  private isRomAddress(addr: number): boolean {
    return addr >= ExecLibrary.ROM_START && addr <= ExecLibrary.ROM_END;
  }

  private requestTrapJump(
    targetPc: number,
    segList: number,
    name: string
  ): void {
    this.pendingTrapJumpPc = targetPc;
    this.pendingTrapJumpName = name;
    this.emulator.setRegister(0, 0);
    this.emulator.setRegister(8, segList); // A0
    this.emulator.setRegister(14, this.execBase.address); // A6
debugLog(
      `[ExecLibrary] Scheduled InitResident jump to 0x${targetPc.toString(
        16
      )} for ${name}`
    );
  }

  consumeTrapJump(): { pc: number; name: string } | null {
    const pc = this.pendingTrapJumpPc;
    const name = this.pendingTrapJumpName;
    this.pendingTrapJumpPc = null;
    this.pendingTrapJumpName = null;
    if (pc === null || !name) {
      return null;
    }
    return { pc, name };
  }

  hasPendingTrapJump(): boolean {
    return this.pendingTrapJumpPc !== null;
  }

  setTrapReturnContext(
    returnAddr: number,
    spBeforePush: number,
    name: string
  ): void {
    this.pendingTrapReturnAddr = returnAddr;
    this.pendingTrapSavedSp = spBeforePush;
    this.pendingOpenLibraryName = name;
  }

  consumeForcedReturn(): boolean {
    const forced = this.pendingForcedReturn;
    this.pendingForcedReturn = false;
    return forced;
  }

  handleRomInitAlert(): number {
    if (
      this.pendingTrapReturnAddr === null ||
      this.pendingTrapSavedSp === null ||
      !this.pendingOpenLibraryName
    ) {
      return 0;
    }
    const stubAddr = this.openLibraryStub(this.pendingOpenLibraryName, 0);
    this.emulator.setRegister(0, stubAddr);
    this.emulator.setRegister(15, this.pendingTrapSavedSp);
    this.emulator.setRegister(16, this.pendingTrapReturnAddr);
    this.emulator.refillPrefetch();
    this.pendingForcedReturn = true;
console.warn(
      `[ExecLibrary] ROM init alert: falling back to stub ${
        this.pendingOpenLibraryName
      } at 0x${stubAddr.toString(16)}`
    );
    this.pendingTrapReturnAddr = null;
    this.pendingTrapSavedSp = null;
    this.pendingOpenLibraryName = null;
    this.pendingTrapJumpPc = null;
    this.pendingTrapJumpName = null;
    return stubAddr;
  }

  findResidentByName(name: string): number {
    const addr = this.findRomResidentByName(name);
    return addr ?? 0;
  }

  initResidentTrap(residentAddr: number, segList: number): number {
    return this.initResident(residentAddr, segList, true);
  }

  private countFunctionEntries(functionsAddr: number): {
    count: number;
    relative: boolean;
  } {
    if (!functionsAddr) return { count: 0, relative: false };
    const firstWord = this.emulator.readMemory16(functionsAddr);
    const relative = firstWord === 0xffff;
    let count = 0;
    if (relative) {
      let ptr = functionsAddr + 2;
      while (true) {
        const word = this.emulator.readMemory16(ptr);
        if (word === 0xffff) break;
        count += 1;
        ptr += 2;
      }
    } else {
      let ptr = functionsAddr;
      while (true) {
        const func = this.emulator.readMemory32(ptr);
        if (func === 0xffffffff) break;
        count += 1;
        ptr += 4;
      }
    }
    return { count, relative };
  }

  private buildJumpTable(
    baseAddr: number,
    functionsAddr: number,
    relative: boolean,
    count: number,
    relativeBase?: number
  ): void {
    const base = relativeBase ?? functionsAddr;
    let ptr = functionsAddr + (relative ? 2 : 0);
    for (let i = 0; i < count; i++) {
      let funcAddr = 0;
      if (relative) {
        const disp = this.emulator.readMemory16(ptr);
        const signed = disp & 0x8000 ? disp - 0x10000 : disp;
        funcAddr = (base + signed) >>> 0;
        ptr += 2;
      } else {
        funcAddr = this.emulator.readMemory32(ptr);
        ptr += 4;
      }
      const entryAddr = baseAddr - (i + 1) * 6;
      this.emulator.writeMemory16(entryAddr, 0x4ef9);
      this.emulator.writeMemory32(entryAddr + 2, funcAddr);
    }
  }

  private initStruct(
    initTableAddr: number,
    memAddr: number,
    size: number
  ): void {
    if (size > 0) {
      for (let i = 0; i < size; i++) {
        this.emulator.writeMemory(memAddr + i, 0);
      }
    }
    let tablePtr = initTableAddr;
    let destOffset = 0;
    const readAlignedWord = (): number => {
      if (tablePtr & 1) tablePtr += 1;
      const value = this.emulator.readMemory16(tablePtr);
      tablePtr += 2;
      return value;
    };
    const readByte = (): number => {
      const value = this.emulator.readMemory(tablePtr);
      tablePtr += 1;
      return value;
    };
    while (true) {
      if (tablePtr & 1) tablePtr += 1;
      const cmd = this.emulator.readMemory(tablePtr);
      tablePtr += 1;
      if (cmd === 0) break;
      const dd = (cmd >> 6) & 0x3;
      const ss = (cmd >> 4) & 0x3;
      const count = (cmd & 0x0f) + 1;
      const repeat = dd === 1;
      if (dd === 2) {
        destOffset = readByte();
      } else if (dd === 3) {
        if (tablePtr & 1) tablePtr += 1;
        const b1 = readByte();
        const b2 = readByte();
        const b3 = readByte();
        destOffset = (b1 << 16) | (b2 << 8) | b3;
      }

      const writeValue = (sizeBytes: number, value: number) => {
        const destAddr = memAddr + destOffset;
        if (sizeBytes === 4) {
          this.emulator.writeMemory32(destAddr, value >>> 0);
        } else if (sizeBytes === 2) {
          this.emulator.writeMemory16(destAddr, value & 0xffff);
        } else {
          this.emulator.writeMemory(destAddr, value & 0xff);
        }
        destOffset += sizeBytes;
      };

      const readValue = (): { value: number; sizeBytes: number } => {
        if (ss === 0) {
          const high = readAlignedWord();
          const low = readAlignedWord();
          return { value: ((high << 16) | low) >>> 0, sizeBytes: 4 };
        }
        if (ss === 1) {
          return { value: readAlignedWord(), sizeBytes: 2 };
        }
        if (ss === 2) {
          return { value: readByte(), sizeBytes: 1 };
        }
        return { value: 0, sizeBytes: 1 };
      };

      let first = readValue();
      if (repeat) {
        for (let i = 0; i < count; i++) {
          writeValue(first.sizeBytes, first.value);
        }
      } else {
        writeValue(first.sizeBytes, first.value);
        for (let i = 1; i < count; i++) {
          const next = readValue();
          writeValue(next.sizeBytes, next.value);
        }
      }
    }
  }

  initStructForTrap(
    initTableAddr: number,
    memAddr: number,
    size: number
  ): void {
    this.initStruct(initTableAddr, memAddr, size);
  }

  makeLibrary(
    vectorsAddr: number,
    initStructAddr: number,
    initFuncAddr: number,
    dataSize: number,
    segList: number
  ): number {
    if (!vectorsAddr) {
console.warn("[ExecLibrary] MakeLibrary called with null vectors");
      return 0;
    }
    const { count, relative } = this.countFunctionEntries(vectorsAddr);
    if (count === 0) {
console.warn("[ExecLibrary] MakeLibrary found no vectors");
      return 0;
    }
    const negSize = count * 6;
    const totalSize = dataSize + negSize;
    const allocBase = this.allocMem(totalSize, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
    if (!allocBase) {
      return 0;
    }
    const libBase = allocBase + negSize;
    this.buildJumpTable(libBase, vectorsAddr, relative, count);
    if (initStructAddr) {
      this.initStruct(initStructAddr, libBase, dataSize);
    }
    if (initFuncAddr) {
console.warn(
        `[ExecLibrary] MakeLibrary init func 0x${initFuncAddr.toString(
          16
        )} not executed`
      );
    }
    // Minimal library node setup so callers can use lib base immediately.
    this.emulator.writeMemory16(libBase + 16, negSize);
    this.emulator.writeMemory16(libBase + 18, dataSize);
    return libBase;
  }

  makeFunctions(
    targetAddr: number,
    functionArrayAddr: number,
    funcDispBase: number
  ): number {
    if (!targetAddr || !functionArrayAddr) {
      return 0;
    }
    const { count, relative } = this.countFunctionEntries(functionArrayAddr);
    if (count === 0) {
      return 0;
    }
    const negSize = count * 6;
    const base = funcDispBase || functionArrayAddr;
    this.buildJumpTable(targetAddr, functionArrayAddr, relative, count, base);
    return negSize;
  }

  /**
   * Handle library function calls (legacy trap-handling path).
   *
   * The live trap dispatch is `LibraryTraps.handleTrapByOffset` —
   * `handleCall` was originally driven by AmigaDosEnvironment but that
   * class has been deleted. Some early loader codepaths still fall back
   * here when a library hasn't been wired into the trap set yet, so this
   * dispatcher remains as a backstop.
   */
  handleCall(offset: number): boolean {
debugLog(`[ExecLibrary] handleCall(offset=${offset})`);

    // Handle common Exec.library functions - CORRECTED LVOs from exec.library.lvos.i
    switch (offset) {
      case -552: // _LVOOpenLibrary
debugLog(
          `[ExecLibrary]   *** OpenLibrary trap called (LVO -552) ***`
        );
        // CORRECT: A1 = library name (register 9), D0 = version (register 0)
        // Reference: https://wiki.amigaos.net/wiki/Exec_Libraries
        // OpenLibrary(libName, version) -> A1=libName, D0=version, returns D0=library
        const nameAddr = this.emulator.getRegister(9); // A1 = library name
        const version = this.emulator.getRegister(0); // D0 = minimum version
        const libResult = this.openLibrary(nameAddr, version);
        this.emulator.setRegister(0, libResult); // Return library base in D0
        return true;

      case -414: // _LVOCloseLibrary (CORRECTED from wrong -36)
debugLog(
          `[ExecLibrary]   *** CloseLibrary trap called (LVO -414) ***`
        );
        // FIXED: A1 = register 9 (not 13 which is A5)
        const libAddr = this.emulator.getRegister(9); // A1
        if (libAddr !== 0) {
          this.closeLibrary(libAddr);
          this.emulator.setRegister(0, 0); // Return 0 (success)
        }
        return true;

      case -294: // _LVOFindTask ✓
debugLog(`[ExecLibrary]   FindTask trap called`);
        // FIXED: A1 = register 9 (not 13 which is A5)
        const nameAddr2 = this.emulator.getRegister(9); // A1
        const result = this.findTask(nameAddr2);
        this.emulator.setRegister(0, result);
        return true;

      case -198: // _LVOAllocMem ✓
debugLog(`[ExecLibrary]   AllocMem trap called`);
        const size = this.emulator.getRegister(0); // D0
        const flags = this.emulator.getRegister(1); // D1
        const allocResult = this.allocMem(size, flags);
        this.emulator.setRegister(0, allocResult);
        return true;

      case -210: // _LVOFreeMem ✓
debugLog(`[ExecLibrary]   FreeMem trap called`);
        // Note: FreeMem uses A1 for address, D0 for size per AmigaOS spec
        const addr = this.emulator.getRegister(9); // A1 = memory block
        const freeSize = this.emulator.getRegister(0); // D0 = size
        this.freeMem(addr, freeSize);
        this.emulator.setRegister(0, 0);
        return true;

      case -390: // _LVOFindPort ✓
debugLog(`[ExecLibrary]   FindPort trap called`);
        // FIXED: A1 = register 9 (not 13 which is A5)
        const portNameAddr = this.emulator.getRegister(9); // A1
        const portNameStr = portNameAddr
          ? this.emulator.readString(portNameAddr)
          : "<null>";
debugLog(
          `[ExecLibrary][Trap][FindPort] A1=0x${portNameAddr.toString(
            16
          )} "${portNameStr}"`
        );
        const portResult = this.findPort(portNameAddr);
        this.emulator.setRegister(0, portResult);
        return true;

      case -300: // _LVOSetTaskPri - CORRECTED from -282 (off by 18!)
debugLog(
          `[ExecLibrary]   *** SetTaskPri trap called (LVO -300 CORRECTED) ***`
        );
        // FIXED: A1 = register 9 (not 13 which is A5)
        const taskAddr = this.emulator.getRegister(9); // A1
        const newPri = this.emulator.getRegister(0); // D0
        const priResult = this.setTaskPri(taskAddr, newPri);
        this.emulator.setRegister(0, priResult);
        return true;

      case -96: // _LVOFindResident
debugLog(`[ExecLibrary]   FindResident trap called`);
        const resNameAddr = this.emulator.getRegister(9); // A1
        const resName = resNameAddr
          ? this.emulator.readString(resNameAddr, 128)
          : "";
        const resAddr = resName ? this.findRomResidentByName(resName) : null;
        this.emulator.setRegister(0, resAddr ?? 0);
        return true;

      case -102: // _LVOInitResident
debugLog(`[ExecLibrary]   InitResident trap called`);
        const residentAddr = this.emulator.getRegister(9); // A1
        const segList = this.emulator.getRegister(1); // D1
        const libBase = this.initResidentTrap(residentAddr, segList);
        this.emulator.setRegister(0, libBase);
        return true;

      // *** SEMAPHORE FUNCTIONS (V36+) - CORRECTED LVO OFFSETS ***
      case -558: // _LVOInitSemaphore - CORRECTED from -348 (off by 210!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: InitSemaphore() (LVO -558 CORRECTED) ***`
        );
        const initSemAddr = this.emulator.getRegister(8); // A0
        this.initSemaphore(initSemAddr);
        return true;

      case -564: // _LVOObtainSemaphore - CORRECTED from -300 (off by 264!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: ObtainSemaphore() (LVO -564 CORRECTED) ***`
        );
        const obtainSemAddr = this.emulator.getRegister(8); // A0
        this.obtainSemaphore(obtainSemAddr);
        return true;

      case -570: // _LVOReleaseSemaphore - CORRECTED from -312 (off by 258!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: ReleaseSemaphore() (LVO -570 CORRECTED) ***`
        );
        const releaseSemAddr = this.emulator.getRegister(8); // A0
        this.releaseSemaphore(releaseSemAddr);
        return true;

      case -576: // _LVOAttemptSemaphore - CORRECTED from -588 (off by 12)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: AttemptSemaphore() (LVO -576 CORRECTED) ***`
        );
        const attemptSemAddr = this.emulator.getRegister(8); // A0
        const attemptResult = this.attemptSemaphore(attemptSemAddr);
        this.emulator.setRegister(0, attemptResult);
        return true;

      case -594: // _LVOFindSemaphore - CORRECTED from -432 (off by 162!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: FindSemaphore() (LVO -594 CORRECTED) ***`
        );
        const findSemNameAddr = this.emulator.getRegister(9); // A1
        const findSemResult = this.findSemaphore(findSemNameAddr);
        this.emulator.setRegister(0, findSemResult);
        return true;

      case -600: // _LVOAddSemaphore - CORRECTED from -438 (off by 162!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: AddSemaphore() (LVO -600 CORRECTED) ***`
        );
        const addSemAddr = this.emulator.getRegister(9); // A1
        this.addSemaphore(addSemAddr);
        return true;

      case -606: // _LVORemSemaphore - CORRECTED from -444 (off by 162!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: RemSemaphore() (LVO -606 CORRECTED) ***`
        );
        const remSemAddr = this.emulator.getRegister(9); // A1
        this.remSemaphore(remSemAddr);
        return true;

      case -330: // _LVOAllocSignal
debugLog(`[ExecLibrary]   AllocSignal trap called`);
        const sigNum = this.emulator.getRegister(0); // D0
        const sigResult = this.AllocSignal(sigNum);
        this.emulator.setRegister(0, sigResult);
        return true;

      case -336: // _LVOFreeSignal
debugLog(`[ExecLibrary]   FreeSignal trap called`);
        const freeSigNum = this.emulator.getRegister(0); // D0 = signal number to free
        this.freeSignal(freeSigNum);
        return true;

      case -306: // _LVOSetSignal
debugLog(`[ExecLibrary]   SetSignal trap called`);
        const newSignals = this.emulator.getRegister(0); // D0
        const signalMask = this.emulator.getRegister(1); // D1
        const oldSignals = this.setSignal(newSignals, signalMask);
        this.emulator.setRegister(0, oldSignals);
        return true;

      case -318: // _LVOWait - Wait for signals (blocks until signal received)
debugLog(`[ExecLibrary] *** INTERCEPTED: Wait() (LVO -318) ***`);
        const waitSignalMask = this.emulator.getRegister(0); // D0 = signal mask to wait for
        const waitResult = this.wait(waitSignalMask);
        this.emulator.setRegister(0, waitResult); // Return received signals in D0
        return true;

      case -324: // _LVOSignal - Send signals to a task (wakes waiting task)
debugLog(`[ExecLibrary] *** INTERCEPTED: Signal() (LVO -324) ***`);
        const signalTaskAddr = this.emulator.getRegister(9); // A1 = task address
        const signalBits = this.emulator.getRegister(0); // D0 = signal bits to send
        this.signal(signalTaskAddr, signalBits);
        return true;

      // *** I/O REQUEST FUNCTIONS (V36+) - CORRECTED LVO OFFSETS ***
      case -456: // _LVODoIO - CORRECTED from -516 (off by 60!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: DoIO() (LVO -456 CORRECTED) ***`
        );
        const doIOAddr = this.emulator.getRegister(9); // A1
        const doIOResult = this.doIO(doIOAddr);
        this.emulator.setRegister(0, doIOResult);
        return true;

      case -462: // _LVOSendIO - CORRECTED from -522 (off by 60!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: SendIO() (LVO -462 CORRECTED) ***`
        );
        const sendIOAddr = this.emulator.getRegister(9); // A1
        this.sendIO(sendIOAddr);
        return true;

      case -468: // _LVOCheckIO - CORRECTED from -528 (off by 60!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: CheckIO() (LVO -468 CORRECTED) ***`
        );
        const checkIOAddr = this.emulator.getRegister(9); // A1
        const checkIOResult = this.checkIO(checkIOAddr);
        this.emulator.setRegister(0, checkIOResult);
        return true;

      case -654: // _LVOCreateIORequest - CORRECTED from -504 (off by 150!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: CreateIORequest() (LVO -654 CORRECTED) ***`
        );
        const createIOPort = this.emulator.getRegister(8); // A0
        const createIOSize = this.emulator.getRegister(0); // D0
        const createIOResult = this.createIORequest(createIOPort, createIOSize);
        this.emulator.setRegister(0, createIOResult);
        return true;

      case -660: // _LVODeleteIORequest - CORRECTED from -510 (off by 150!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: DeleteIORequest() (LVO -660 CORRECTED) ***`
        );
        const deleteIOAddr = this.emulator.getRegister(8); // A0
        this.deleteIORequest(deleteIOAddr);
        return true;

      // *** LIST OPERATIONS - CORRECTED LVO OFFSETS ***
      case -234: // _LVOInsert - CORRECTED from -252 (REVERSED with Remove!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: Insert() (LVO -234 CORRECTED) ***`
        );
        const insertList = this.emulator.getRegister(8); // A0
        const insertNode = this.emulator.getRegister(9); // A1
        const insertAfter = this.emulator.getRegister(10); // A2
        this.insert(insertList, insertNode, insertAfter);
        return true;

      case -240: // _LVOAddHead - CORRECTED from -258 (off by 18!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: AddHead() (LVO -240 CORRECTED) ***`
        );
        const addHeadList = this.emulator.getRegister(8); // A0
        const addHeadNode = this.emulator.getRegister(9); // A1
        this.addHead(addHeadList, addHeadNode);
        return true;

      case -246: // _LVOAddTail - CORRECTED from -264 (off by 18!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: AddTail() (LVO -246 CORRECTED) ***`
        );
        const addTailList = this.emulator.getRegister(8); // A0
        const addTailNode = this.emulator.getRegister(9); // A1
        this.addTail(addTailList, addTailNode);
        return true;

      case -252: // _LVORemove - CORRECTED from -246 (off by 6)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: Remove() (LVO -252 CORRECTED) ***`
        );
        const removeNode = this.emulator.getRegister(9); // A1
        this.remove(removeNode);
        return true;

      case -258: // _LVORemHead - CORRECTED from -234 (off by 24!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: RemHead() (LVO -258 CORRECTED) ***`
        );
        const remHeadList = this.emulator.getRegister(8); // A0
        const remHeadResult = this.remHead(remHeadList);
        this.emulator.setRegister(0, remHeadResult);
        return true;

      case -264: // _LVORemTail - CORRECTED from -240 (off by 24!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: RemTail() (LVO -264 CORRECTED) ***`
        );
        const remTailList = this.emulator.getRegister(8); // A0
        const remTailResult = this.remTail(remTailList);
        this.emulator.setRegister(0, remTailResult);
        return true;

      // *** INTERRUPT CONTROL & MEMORY - CORRECTED LVO OFFSETS ***
      case -120: // _LVODisable - CORRECTED from -162 (off by 42!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: Disable() (LVO -120 CORRECTED) ***`
        );
        this.disable();
        return true;

      case -126: // _LVOEnable - CORRECTED from -168 (off by 42!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: Enable() (LVO -126 CORRECTED) ***`
        );
        this.enable();
        return true;

      case -132: // _LVOForbid - CORRECTED from -174 (off by 42!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: Forbid() (LVO -132 CORRECTED) ***`
        );
        this.forbid();
        return true;

      case -138: // _LVOPermit - CORRECTED from -180 (off by 42!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: Permit() (LVO -138 CORRECTED) ***`
        );
        this.permit();
        return true;

      case -216: // _LVOAvailMem - CORRECTED from -210 (off by 6, was conflicting with FreeMem!)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: AvailMem() (LVO -216 CORRECTED) ***`
        );
        const availMemReq = this.emulator.getRegister(1); // D1
        const availMemResult = this.availMem(availMemReq);
        this.emulator.setRegister(0, availMemResult);
        return true;

      // NOTE: PutMsg (-366), GetMsg (-372), and WaitPort (-384) are now handled
      // by LibraryTraps + exec-vectors.ts (native ROM + trap system).
      // The old intercepts here were causing DOUBLE TRAPPING which corrupted A0.
      // Dec 27-28 refactor moved these to LibraryTraps for Kickstart ROM compatibility.

      // *** MEMORY COPY FUNCTIONS (V36+) - CORRECTED LVO OFFSETS ***
      case -624: // _LVOCopyMem - CORRECTED from -474 (duplicate removed)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: CopyMem() (LVO -624 CORRECT) ***`
        );
        const copySource624 = this.emulator.getRegister(8); // A0
        const copyDest624 = this.emulator.getRegister(9); // A1
        const copyLength624 = this.emulator.getRegister(0); // D0
        this.copyMem(copySource624, copyDest624, copyLength624);
        return true;

      case -630: // _LVOCopyMemQuick - CORRECTED from -480 (duplicate removed)
debugLog(
          `[ExecLibrary] *** INTERCEPTED: CopyMemQuick() (LVO -630 CORRECT) ***`
        );
        const quickSource630 = this.emulator.getRegister(8); // A0
        const quickDest630 = this.emulator.getRegister(9); // A1
        const quickLength630 = this.emulator.getRegister(0); // D0
        this.copyMemQuick(quickSource630, quickDest630, quickLength630);
        return true;

      case -684: // _LVOAllocVec - P0 CRITICAL (CORRECTED from -552)
debugLog(`[ExecLibrary] *** INTERCEPTED: AllocVec() (LVO -684) ***`);
        const vecSize = this.emulator.getRegister(0); // D0
        const vecFlags = this.emulator.getRegister(1); // D1
        const vecResult = this.allocVec(vecSize, vecFlags);
        this.emulator.setRegister(0, vecResult);
        return true;

      case -690: // _LVOFreeVec - P0 CRITICAL (CORRECTED from -558)
debugLog(`[ExecLibrary] *** INTERCEPTED: FreeVec() (LVO -690) ***`);
        const vecAddr = this.emulator.getRegister(9); // A1
        this.freeVec(vecAddr);
        return true;

      case -732: // _LVOStackSwap
debugLog(
          `[ExecLibrary] *** INTERCEPTED: StackSwap() (LVO -732) ***`
        );
        const stackSwapStructAddr = this.emulator.getRegister(8); // A0
        this.stackSwap(stackSwapStructAddr);
        return true;

      default:
        // COMPREHENSIVE STUB IMPLEMENTATION FOR ALL UNIMPLEMENTED FUNCTIONS
console.warn(
          `[exec.library] STUB: Unimplemented function at LVO ${offset}`
        );

        // Exec library functions return pointers (non-zero) or 0 for failure
        // Default: Return 0 (failure) in D0
        this.emulator.setRegister(CPURegister.D0, 0);

        const d0 = this.emulator.getRegister(CPURegister.D0);
        const d1 = this.emulator.getRegister(CPURegister.D1);
        const a0 = this.emulator.getRegister(CPURegister.A0);
        const a1 = this.emulator.getRegister(CPURegister.A1);
console.warn(
          `[exec.library]   Context: D0=0x${d0.toString(16)} D1=0x${d1.toString(
            16
          )} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)}`
        );
console.warn(
          `[exec.library]   Returning D0=0 (failure) - door should handle gracefully`
        );

        return true; // Return true to indicate we handled it (with a stub)
    }
  }

  openLibrary(nameAddr: number, version: number): number {
    // Read library name from memory
    const name = this.emulator.readString(nameAddr);
    const pc = this.emulator.getRegister(CPURegister.PC);
debugLog(
      `[ExecLibrary][OpenLibrary] pc=0x${pc.toString(16)} "${name}" v${version}`
    );

    // Use hybrid approach
    const result = this.openLibraryHybrid(name, version, true);

    if (result.success) {
debugLog(
        `[ExecLibrary]   Hybrid OpenLibrary SUCCESS - ${
          result.isNative ? "NATIVE" : "STUB"
        } library at 0x${result.address.toString(16)}`
      );

      // Always log dos.library opens as they're critical for door operation
      if (name.toLowerCase() === "dos.library") {
        console.log(
          `[ExecLibrary] *** dos.library opened - base=0x${result.address.toString(16)} *** Door should store this and use it for all DOS calls`
        );
      }

      return result.address;
    } else {
debugLog(`[ExecLibrary]   Hybrid OpenLibrary FAILED - returning NULL`);
      return 0;
    }
  }

  /**
   * Create AEDoorPort dynamically when AEDoor.library is opened
   * XIM doors expect port to NOT exist at startup (duplicate check),
   * but DO exist when library is opened (for IPC)
   *
   * CRITICAL: Only create on SUBSEQUENT opens (openCount > 1), not initial pre-open.
   * LibraryManager pre-opens AEDoor.library before door starts, which would create
   * port too early and fail duplicate-instance check.
   */
  private createDynamicAEDoorPort(libraryName: string): void {
    if (libraryName.toLowerCase() !== "aedoor.library") {
      return;
    }

    // Check if this is the initial pre-open (openCount will be 1)
    // Only create port on SECOND open (when door itself calls OpenLibrary)
    const lib =
      this.libraries.get(libraryName) ||
      this.libraries.get(libraryName.toLowerCase());
    if (!lib || lib.openCount <= 1) {
debugLog(
        `[ExecLibrary]   Skipping AEDoorPort creation on pre-open (openCount=${
          lib?.openCount || 0
        })`
      );
      return;
    }

    // Get node ID from global BBS session
    const globalAny = global as any;
    const nodeId =
      globalAny?.currentBbsSession?.nodeId ??
      globalAny?.currentBbsSession?.nodeNumber ??
      1;
    const portName = `AEDoorPort${nodeId}`;

    // Check if port already exists
    const tempAddr = 0x500; // Temporary address for port name lookup
    this.emulator.writeString(tempAddr, portName);
    const existingPortAddr = this.findPort(tempAddr);

    if (!existingPortAddr || existingPortAddr === 0) {
      // CRITICAL FIX (Jan 4 - reapplied): Create AEDoorPort with Door Task as owner
      // When BBS sends message via PutMsg(), it Signal()s the door task to wake it up.
      // Using bbsTask (Dec 27 fix) signals wrong task causing doors to hang.
      // Use sigBit=12 because doors hardcode 0x1000 in Wait() mask
      const AEDOORPORT_SIGBIT = 12;
      const portAddr = this.createPublicPort(portName, this.currentTask, AEDOORPORT_SIGBIT);
debugLog(
        `[ExecLibrary]   Created ${portName} at 0x${portAddr.toString(
          16
        )} owned by Door Task (0x${this.currentTask.address.toString(
          16
        )}, sigBit=${AEDOORPORT_SIGBIT}) - (dynamic XIM port on door's OpenLibrary call)`
      );
    } else {
debugLog(
        `[ExecLibrary]   ${portName} already exists at 0x${existingPortAddr.toString(
          16
        )} (reusing)`
      );
    }
  }

  /**
   * CloseLibrary(library)
   *
   * Closes a library (decrements open count)
   */
  closeLibrary(libAddr: number): void {
    // Find library by address
    for (const [name, lib] of this.libraries.entries()) {
      if (lib.address === libAddr) {
        const lower = name.toLowerCase();
        // Keep core libraries resident for the life of the process; some doors
        // call CloseLibrary(dos.library) during teardown and then continue executing.
        // Dropping vectors or deleting the entry can corrupt subsequent calls.
        // Mirror classic behavior by ignoring CloseLibrary for exec/dos/aedoor/icon.
        if (
          lower === "dos.library" ||
          lower === "exec.library" ||
          lower === "aedoor.library" ||
          lower === "icon.library"
        ) {
debugLog(
            `[ExecLibrary] CloseLibrary(${name}) ignored (kept resident)`
          );
          return;
        }

        lib.openCount--;
debugLog(
          `[ExecLibrary] CloseLibrary(${name}), count=${lib.openCount}`
        );

        if (lib.openCount <= 0) {
          this.libraries.delete(name);
debugLog(`[ExecLibrary]   Library ${name} fully closed`);
        }
        return;
      }
    }

debugLog(
      `[ExecLibrary] CloseLibrary(0x${libAddr.toString(16)}) - unknown library`
    );
  }

  /**
   * Load real AEDoor.library binary from disk
   * This loads the actual compiled Amiga library and copies it into emulated memory
   */
  loadRealAEDoorLibrary(): boolean {
    try {
debugLog(`[ExecLibrary] ============================================`);
debugLog(`[ExecLibrary] Loading REAL AEDoor.library binary`);
debugLog(`[ExecLibrary] Using LibraryLoader for proper HUNK parsing`);
debugLog(`[ExecLibrary] ============================================`);

      // Use LibraryLoader if available, fall back to manual load
      if (this.libraryLoader) {
        const loadedLib = this.libraryLoader.loadLibrary("AEDoor.library", 0);

        if (loadedLib) {
debugLog(
            `[ExecLibrary] ✅ AEDoor.library loaded via LibraryLoader`
          );
debugLog(
            `[ExecLibrary]   Base address: 0x${loadedLib.baseAddress.toString(
              16
            )}`
          );
debugLog(
            `[ExecLibrary]   Jump table entries: ${loadedLib.jumpTable.size}`
          );
debugLog(
            `[ExecLibrary]   Code segments: ${loadedLib.codeSegments.length}`
          );
debugLog(
            `[ExecLibrary]   Data segments: ${loadedLib.dataSegments.length}`
          );

          // Register in libraries list
          // LibraryLoader now properly parses $VER string for version.revision
          // Example: "$VER: AEDoorLib 2.7 (18 May 1996)" -> version=2, revision=7
          // Fallback to version 2 if parsing fails (doors require >= 2)
          const aedoorVersion = loadedLib.version > 0 ? loadedLib.version : 2;
          const aedoorRevision = loadedLib.revision || 0;
          const lib: LibraryNode = {
            address: loadedLib.baseAddress,
            name: "AEDoor.library",
            version: aedoorVersion,
            revision: aedoorRevision,
            openCount: 0,
            negSize: 30, // Standard Amiga library header size
            posSize: 34,
          };
          this.libraries.set("AEDoor.library", lib);
          this.libraries.set("aedoor.library", lib);
          this.writeLibraryToMemory(lib);
          const baseAddr = loadedLib.baseAddress;

          if (process.env.DEBUG_68K_NATIVE === '1') {
            const probeOffsets = [0x0, 0x10, 0x20, 0x100, 0x170, 0x278, 0x388];
            const probeBytes: string[] = [];
            for (const off of probeOffsets) {
              const b0 = this.emulator.readMemory(baseAddr + off);
              const b1 = this.emulator.readMemory(baseAddr + off + 1);
              const b2 = this.emulator.readMemory(baseAddr + off + 2);
              const b3 = this.emulator.readMemory(baseAddr + off + 3);
              probeBytes.push(
                `+0x${off.toString(16)}=0x${b0.toString(16).padStart(2,'0')}${b1.toString(16).padStart(2,'0')}${b2.toString(16).padStart(2,'0')}${b3.toString(16).padStart(2,'0')}`
              );
            }
debugLog(
              `[ExecLibrary] AEDoor mem probe @0x${baseAddr.toString(
                16
              )}: ${probeBytes.join(' ')}`
            );
          }

          // CRITICAL: Write system library bases that native AEDoor code expects!
          // Native code does: movea.l 0x22(a6), a6 to get ExecBase
          const execBaseAddr = this.execBase.address;
          const dosBase = this.getLibraryBase("dos.library");

          // lib+0x22 (34) = ExecBase - CRITICAL for PutMsg/GetMsg etc
          this.emulator.writeMemory32(
            loadedLib.baseAddress + 0x22,
            execBaseAddr
          );
          // lib+0x26 (38) = dos.library base
          this.emulator.writeMemory32(
            loadedLib.baseAddress + 0x26,
            dosBase || 0
          );

debugLog(
            `[ExecLibrary] CRITICAL: Set lib+0x22 = ExecBase 0x${execBaseAddr.toString(
              16
            )}`
          );
debugLog(
            `[ExecLibrary] CRITICAL: Set lib+0x26 = dos.library 0x${(
              dosBase || 0
            ).toString(16)}`
          );

          // CRITICAL: Create JMP table at negative offsets for library function calls
          // When a door does JSR -42(A6), it jumps to base-42 which must have a JMP instruction
          const aedoorJmpTable: Array<{
            lvo: number;
            fileOffset: number;
            name: string;
          }> = [
            { lvo: -6, fileOffset: 0x100, name: "Open" },
            { lvo: -12, fileOffset: 0x10e, name: "Close" },
            { lvo: -18, fileOffset: 0x124, name: "Expunge" },
            { lvo: -24, fileOffset: 0x16c, name: "Reserved" },
            { lvo: -30, fileOffset: 0x170, name: "CreateComm" },
            { lvo: -36, fileOffset: 0x278, name: "DeleteComm" },
            { lvo: -42, fileOffset: 0x388, name: "SendCmd" },
            { lvo: -48, fileOffset: 0x38e, name: "SendStrCmd" },
            { lvo: -54, fileOffset: 0x394, name: "SendDataCmd" },
            { lvo: -60, fileOffset: 0x39a, name: "SendStrDataCmd" },
            { lvo: -66, fileOffset: 0x3a0, name: "GetData" },
            { lvo: -72, fileOffset: 0x3a6, name: "GetString" },
            { lvo: -78, fileOffset: 0x338, name: "Prompt" },
            { lvo: -84, fileOffset: 0x350, name: "WriteStr" },
            { lvo: -90, fileOffset: 0x350, name: "ShowGFile" },
            { lvo: -96, fileOffset: 0x350, name: "ShowFile" },
            { lvo: -102, fileOffset: 0x394, name: "SetDT" },
            { lvo: -108, fileOffset: 0x38e, name: "GetDT" },
            { lvo: -114, fileOffset: 0x3a6, name: "GetStr" },
            { lvo: -120, fileOffset: 0x3c0, name: "CopyStr" },
            { lvo: -126, fileOffset: 0x3d6, name: "HotKey" },
            { lvo: -132, fileOffset: 0x3fe, name: "PreCreateComm" },
            { lvo: -138, fileOffset: 0x278, name: "PostDeleteComm" },
          ];

debugLog(
            `[ExecLibrary] Creating JMP table for AEDoor.library at 0x${baseAddr.toString(
              16
            )}:`
          );
          for (const func of aedoorJmpTable) {
            const targetAddr = baseAddr + (func.fileOffset - 0x20);
            const jmpAddr = baseAddr + func.lvo; // Negative offset from base

            // Write JMP.L instruction (0x4EF9) followed by target address
            this.emulator.writeMemory16(jmpAddr, 0x4ef9);
            this.emulator.writeMemory32(jmpAddr + 2, targetAddr);

debugLog(
              `[ExecLibrary]   LVO ${func.lvo} (${
                func.name
              }): JMP at 0x${jmpAddr.toString(16)} -> 0x${targetAddr.toString(
                16
              )}`
            );
          }

debugLog(
            `[ExecLibrary] AEDoor.library registered in library list`
          );
debugLog(
            `[ExecLibrary] ============================================`
          );
          return true;
        } else {
debugLog(
            `[ExecLibrary] ⚠️  LibraryLoader failed, trying fallback`
          );
        }
      }

      // Fallback: Manual load (basic, for compatibility)
debugLog(`[ExecLibrary] Using fallback manual loader`);

      const candidates: string[] = [];
      try {
        const { config } = require("../../config");
        const dataDir = config.getConfig().dataDir;
        candidates.push(path.join(dataDir, "Libs", "AEDoor.library"));
        candidates.push(
          path.join(path.resolve(dataDir, ".."), "Libs", "AEDoor.library")
        );
      } catch (err) {
        // config not available in some test contexts
      }
      candidates.push(path.join(process.cwd(), "Libs", "AEDoor.library"));

      const libPath = candidates.find((p) => amigafs.existsSync(p));

      if (!libPath) {
        const msg = `[ExecLibrary] ❌ ERROR: AEDoor.library not found`;
debugLog(msg);
debugLog(`[ExecLibrary] Searched: ${candidates.join(", ")}`);
        try {
          const globalAny: any = global as any;
          const session = globalAny?.currentBbsSession;
          notifySysop(session, msg);
        } catch (_) {
          /* ignore */
        }
        return false;
      }

debugLog(`[ExecLibrary] Found: ${libPath}`);
      const binary = amigafs.readFileSync(libPath) as Buffer;
debugLog(`[ExecLibrary] Read ${binary.length} bytes`);

      // Manual HUNK load (basic - just copy code section)
      // NOTE: This doesn't handle relocations properly!
      const codeStart = 0x20; // From hexdump analysis
      const codeSize = 0x3f0; // ~1KB code+data
      const destAddr = this.AEDOOR_LIB_ADDR;

      for (let i = 0; i < codeSize && codeStart + i < binary.length; i++) {
        this.emulator.writeMemory(destAddr + i, binary[codeStart + i]);
      }

      // CRITICAL: Create JMP table at negative offsets for native library calls
      // When a door does JSR -84(A6), it needs a JMP instruction at base-84
      // that points to the actual WriteStr code in the loaded library.
      //
      // LVO to file offset mapping (from disassembly analysis):
      // Memory address = destAddr + (fileOffset - codeStart)
      const aedoorFunctionTable: Array<{
        lvo: number;
        fileOffset: number;
        name: string;
      }> = [
        // Standard library functions
        { lvo: -6, fileOffset: 0x100, name: "Open" },
        { lvo: -12, fileOffset: 0x10e, name: "Close" },
        { lvo: -18, fileOffset: 0x124, name: "Expunge" },
        { lvo: -24, fileOffset: 0x16c, name: "Reserved" },
        // AEDoor.library specific functions
        { lvo: -30, fileOffset: 0x170, name: "CreateComm" },
        { lvo: -36, fileOffset: 0x278, name: "DeleteComm" },
        { lvo: -42, fileOffset: 0x388, name: "SendCmd" },
        { lvo: -48, fileOffset: 0x38e, name: "SendStrCmd" },
        { lvo: -54, fileOffset: 0x394, name: "SendDataCmd" },
        { lvo: -60, fileOffset: 0x39a, name: "SendStrDataCmd" },
        { lvo: -66, fileOffset: 0x3a0, name: "GetData" },
        { lvo: -72, fileOffset: 0x3a6, name: "GetString" },
        { lvo: -78, fileOffset: 0x338, name: "Prompt" },
        { lvo: -84, fileOffset: 0x350, name: "WriteStr" }, // sendmessage() uses this!
        { lvo: -90, fileOffset: 0x350, name: "ShowGFile" }, // fallback to WriteStr
        { lvo: -96, fileOffset: 0x350, name: "ShowFile" }, // fallback to WriteStr
        { lvo: -102, fileOffset: 0x394, name: "SetDT" },
        { lvo: -108, fileOffset: 0x38e, name: "GetDT" },
        { lvo: -114, fileOffset: 0x3a6, name: "GetStr" },
        { lvo: -120, fileOffset: 0x3c0, name: "CopyStr" },
        { lvo: -126, fileOffset: 0x3d6, name: "HotKey" },
        { lvo: -132, fileOffset: 0x3fe, name: "PreCreateComm" },
        { lvo: -138, fileOffset: 0x278, name: "PostDeleteComm" }, // same as DeleteComm
      ];

debugLog(
        `[ExecLibrary] Creating native JMP table at negative offsets:`
      );
      for (const func of aedoorFunctionTable) {
        const targetAddr = destAddr + (func.fileOffset - codeStart);
        const jmpAddr = destAddr + func.lvo; // Negative offset from base

        // Write JMP.L instruction (0x4EF9) followed by target address
        this.emulator.writeMemory16(jmpAddr, 0x4ef9);
        this.emulator.writeMemory32(jmpAddr + 2, targetAddr);

debugLog(
          `[ExecLibrary]   LVO ${func.lvo} (${
            func.name
          }): JMP at 0x${jmpAddr.toString(16)} -> 0x${targetAddr.toString(16)}`
        );
      }

      const lib: LibraryNode = {
        address: destAddr,
        name: "AEDoor.library",
        version: 2,
        revision: 0,
        openCount: 0,
        negSize: 30,
        posSize: 34,
      };
      this.libraries.set("AEDoor.library", lib);
      this.libraries.set("aedoor.library", lib);
      this.writeLibraryToMemory(lib);

      // CRITICAL: Write system library bases that native AEDoor code expects!
      // Native code does: movea.l 0x22(a6), a6 to get ExecBase
      // These offsets are AEDoor-specific, not standard Library fields
      const execBaseAddr = this.execBase.address;
      const dosBase = this.getLibraryBase("dos.library");

      // lib+0x22 (34) = ExecBase - CRITICAL for PutMsg/GetMsg etc
      this.emulator.writeMemory32(destAddr + 0x22, execBaseAddr);
      // lib+0x26 (38) = dos.library base
      this.emulator.writeMemory32(destAddr + 0x26, dosBase || 0);

debugLog(
        `[ExecLibrary] CRITICAL: Set lib+0x22 = ExecBase 0x${execBaseAddr.toString(
          16
        )}`
      );
debugLog(
        `[ExecLibrary] CRITICAL: Set lib+0x26 = dos.library 0x${(
          dosBase || 0
        ).toString(16)}`
      );

debugLog(
        `[ExecLibrary] Fallback load complete (basic, no relocations)`
      );
debugLog(
        `[ExecLibrary]   Base: 0x${destAddr.toString(
          16
        )}, Size: ${codeSize} bytes`
      );
debugLog(`[ExecLibrary] ============================================`);
      return true;
    } catch (error) {
debugLog(`[ExecLibrary] ❌ ERROR loading AEDoor.library:`, error);
      return false;
    }
  }

  /**
   * FindTask(name) -> task pointer or NULL
   *
   * Finds a task by name.
   * If name is NULL, returns current task.
   */
  findTask(nameAddr: number): number {
    if (nameAddr === 0) {
      // NULL name = return current task
debugLog(
        `[ExecLibrary] FindTask(NULL) -> 0x${this.currentTask.address.toString(
          16
        )} (current task)`
      );
      return this.currentTask.address;
    }

    const name = this.emulator.readString(nameAddr);
debugLog(`[ExecLibrary] FindTask("${name}")`);

    // For now, only support finding current task
    if (name === this.currentTask.name) {
      return this.currentTask.address;
    }

debugLog(`[ExecLibrary]   Task not found`);
    return 0; // NULL
  }

  /**
   * AllocMem(size, flags) -> memory address or NULL
   *
   * Allocates memory block of specified size
   * Returns 0 (NULL) on failure (out of memory or invalid size)
   */
  allocMem(size: number, flags: number): number {
    // Bounds check: reject zero or negative sizes
    if (size <= 0) {
debugLog(
        `[ExecLibrary] AllocMem(${size}, 0x${flags.toString(
          16
        )}) - FAILED: invalid size`
      );
      return 0;
    }

    // Bounds check: reject unreasonably large single allocations
    if (size > ExecLibrary.MAX_SINGLE_ALLOC) {
debugLog(
        `[ExecLibrary] AllocMem(${size}, 0x${flags.toString(
          16
        )}) - FAILED: exceeds max single allocation (${
          ExecLibrary.MAX_SINGLE_ALLOC
        })`
      );
      return 0;
    }

    // Align size to 4-byte boundary
    const alignedSize = (size + 3) & ~3;

    // Try to reuse a free block of sufficient size (best-fit for better memory usage)
    let addr = 0;
    let bestFitIndex = -1;
    let bestFitSize = Infinity;

    for (let i = 0; i < this.freeList.length; i++) {
      const block = this.freeList[i];
      if (block.size >= alignedSize && block.size < bestFitSize) {
        bestFitIndex = i;
        bestFitSize = block.size;
        // Perfect fit - use immediately
        if (block.size === alignedSize) break;
      }
    }

    if (bestFitIndex !== -1) {
      const block = this.freeList[bestFitIndex];
      addr = block.addr;

      // If block is significantly larger, split it
      const remainder = block.size - alignedSize;
      if (remainder >= 32) {
        // Only split if remainder is worth tracking (32+ bytes)
        block.addr += alignedSize;
        block.size = remainder;
      } else {
        // Use entire block
        this.freeList.splice(bestFitIndex, 1);
      }
    }

    // Fallback to bump allocator
    if (addr === 0) {
      // Check if allocation would exceed memory limit
      if (this.nextFreeMemory + alignedSize > ExecLibrary.MAX_MEMORY) {
debugLog(
          `[ExecLibrary] AllocMem(${size}, 0x${flags.toString(
            16
          )}) - FAILED: would exceed ${ExecLibrary.MAX_MEMORY} (16MB) limit`
        );
        return 0;
      }

      addr = this.nextFreeMemory;
      this.nextFreeMemory += alignedSize;

      // Warn if approaching memory limit
      if (this.nextFreeMemory > ExecLibrary.MEMORY_WARNING_THRESHOLD) {
debugLog(
          `[ExecLibrary] WARNING: Memory usage at ${(
            (this.nextFreeMemory / ExecLibrary.MAX_MEMORY) *
            100
          ).toFixed(1)}% (${this.nextFreeMemory} bytes)`
        );
      }
    }

    // Track allocation
    this.allocations.set(addr, alignedSize);

    // Clear memory if MEMF_CLEAR flag is set (bit 16)
    if (flags & (1 << 16)) {
      for (let i = 0; i < alignedSize; i++) {
        this.emulator.writeMemory(addr + i, 0);
      }
    }

debugLog(
      `[ExecLibrary] AllocMem(${size}, 0x${flags.toString(
        16
      )}) -> 0x${addr.toString(16)}`
    );
    return addr;
  }

  /**
   * FreeMem(address, size)
   *
   * Frees previously allocated memory with heap coalescing
   * Adjacent free blocks are merged to reduce fragmentation
   */
  freeMem(addr: number, size: number): void {
    try {
      // Generic protection: skip freeing host-owned jhMessage buffers
      if (this.protectedMessages.has(addr)) {
debugLog(
          `[ExecLibrary] FreeMem(0x${addr.toString(
            16
          )}, ${size}) - skipped (protected message buffer)`
        );
        return;
      }
    } catch {
      /* ignore */
    }

    const allocation = this.allocations.get(addr);
    if (allocation) {
      this.allocations.delete(addr);
debugLog(
        `[ExecLibrary] FreeMem(0x${addr.toString(
          16
        )}, ${size}) - freed ${allocation} bytes`
      );

      // Simple stack-like reuse: if freeing the topmost block, rewind bump pointer
      if (addr + allocation === this.nextFreeMemory) {
        this.nextFreeMemory = addr;

        // Also check if we can coalesce with the highest free block
        // to further rewind the bump pointer
        let coalesced = true;
        while (coalesced && this.freeList.length > 0) {
          coalesced = false;
          for (let i = this.freeList.length - 1; i >= 0; i--) {
            const block = this.freeList[i];
            if (block.addr + block.size === this.nextFreeMemory) {
              this.nextFreeMemory = block.addr;
              this.freeList.splice(i, 1);
              coalesced = true;
              break;
            }
          }
        }
      } else {
        // Try to coalesce with adjacent blocks in free list
        let newBlock = { addr, size: allocation };
        let merged = true;

        while (merged) {
          merged = false;
          for (let i = 0; i < this.freeList.length; i++) {
            const block = this.freeList[i];

            // Check if this block is immediately before newBlock
            if (block.addr + block.size === newBlock.addr) {
              newBlock.addr = block.addr;
              newBlock.size += block.size;
              this.freeList.splice(i, 1);
              merged = true;
              break;
            }

            // Check if this block is immediately after newBlock
            if (newBlock.addr + newBlock.size === block.addr) {
              newBlock.size += block.size;
              this.freeList.splice(i, 1);
              merged = true;
              break;
            }
          }
        }

        // Add the (possibly merged) block to free list
        this.freeList.push(newBlock);

        // Keep free list sorted by address for better cache locality
        this.freeList.sort((a, b) => a.addr - b.addr);

        // Limit free list size to prevent memory bloat (keep largest blocks)
        if (this.freeList.length > 100) {
          this.freeList.sort((a, b) => b.size - a.size);
          this.freeList = this.freeList.slice(0, 50);
          this.freeList.sort((a, b) => a.addr - b.addr);
        }
      }
    } else {
debugLog(
        `[ExecLibrary] FreeMem(0x${addr.toString(16)}, ${size}) - not tracked`
      );
    }
  }

  /**
   * Reset allocator base (used to mirror vamos entry stack expectations).
   */
  setAllocBase(addr: number): void {
    this.nextFreeMemory = addr >>> 0;
    this.freeList = [];
    this.allocations.clear();
debugLog(
      `[ExecLibrary] Allocator base reset to 0x${this.nextFreeMemory.toString(
        16
      )}`
    );
  }

  /**
   * Write Library structure to memory
   */
  private writeLibraryToMemory(lib: LibraryNode): void {
    const addr = lib.address;

    // Write library node header
    this.emulator.writeMemory16(addr + 16, lib.negSize); // lib_NegSize
    this.emulator.writeMemory16(addr + 18, lib.posSize); // lib_PosSize
    this.emulator.writeMemory16(addr + 20, lib.version); // lib_Version
    this.emulator.writeMemory16(addr + 22, lib.revision); // lib_Revision
    this.emulator.writeMemory16(addr + 32, lib.openCount); // lib_OpenCnt

debugLog(
      `[ExecLibrary]   Library structure written: ${lib.name} v${lib.version}.${lib.revision}`
    );
  }

  /**
   * Get ExecBase address
   */
  getExecBaseAddress(): number {
    return this.execBase.address;
  }

  /**
   * Get current task address
   */
  getCurrentTaskAddress(): number {
    return this.currentTask.address;
  }

  getCurrentTaskMsgPort(): number {
    return this.currentTask.msgPort;
  }

  /**
   * Get library base address by name
   */
  getLibraryBase(name: string): number {
    const lib =
      this.libraries.get(name) || this.libraries.get(name.toLowerCase());
    return lib ? lib.address : 0;
  }

  /**
   * Reverse of getLibraryBase: name of the library whose vector table contains
   * `addr` (i.e. the library base >= addr and closest above it). Used by the
   * call ledger to attribute a trap PC to a library. Returns '' if none match.
   */
  getLibraryNameForAddress(addr: number): string {
    let best = '';
    let bestBase = -1;
    for (const [name, lib] of this.libraries) {
      // Vectors live below the base (negative offsets). Accept a generous
      // window (1KB) — real LVO tables are well within it.
      if (addr <= lib.address && addr >= lib.address - 1024 && lib.address > bestBase) {
        best = name;
        bestBase = lib.address;
      }
    }
    return best;
  }

  /**
   * Pre-register a library placeholder so getLibraryBase() returns a stable
   * address even before OpenLibrary is called.
   */
  registerLibraryPlaceholder(
    name: string,
    version: number = 0,
    revision: number = 0
  ): void {
    const lower = name.toLowerCase();
    if (this.libraries.has(name) || this.libraries.has(lower)) {
      return;
    }
    const libAddr = this.nextStubLibraryAddr;
    this.nextStubLibraryAddr += 0x010000;
    const lib: LibraryNode = {
      address: libAddr,
      name,
      version,
      revision,
      openCount: 0,
      negSize: 30,
      posSize: 34,
    };
    this.libraries.set(name, lib);
    if (lower !== name) {
      this.libraries.set(lower, lib);
    }
    this.writeLibraryToMemory(lib);
debugLog(
      `[ExecLibrary]   Registered library placeholder "${name}" at 0x${libAddr.toString(
        16
      )}`
    );
  }

  /**
   * Fill a stub jump table with RTS instructions (offsets are negative words from base)
   * Ensures unimplemented calls return cleanly.
   */
  private fillStubJumpTable(baseAddr: number, entryCount: number): void {
    // Jump table lives in the negative space before the library base; each entry is 6 bytes
    let offset = -entryCount * 6;
    for (let i = 0; i < entryCount; i++) {
      const entryAddr = baseAddr + offset;
      this.emulator.writeMemory16(entryAddr, 0x4e75); // RTS
      offset += 6;
    }
  }

  private autoRegisterPort(portAddr: number): MessagePort | null {
debugLog(`[ExecLibrary][autoRegisterPort] Called for port=0x${portAddr.toString(16)}`);
    if (portAddr === 0) {
      return null;
    }

    const existing = this.messagePorts.get(portAddr);
    if (existing) {
debugLog(`[ExecLibrary][autoRegisterPort] Port already exists, returning existing`);
      return existing;
    }
debugLog(`[ExecLibrary][autoRegisterPort] Port not found, registering new port...`);


    try {
      const namePtr = this.emulator.readMemory32(portAddr + 10);
      let name = "";
      if (namePtr) {
        try {
          name = this.emulator.readString(namePtr);
        } catch {
          name = "";
        }
      }

      // Initialize MsgPort structure to sane defaults (NT_MSGPORT, PA_SIGNAL)
      this.emulator.writeMemory32(portAddr + 0, 0); // ln_Succ
      this.emulator.writeMemory32(portAddr + 4, 0); // ln_Pred
      this.emulator.writeMemory(portAddr + 8, 4); // ln_Type = NT_MSGPORT
      this.emulator.writeMemory(portAddr + 9, 0); // ln_Pri
      this.emulator.writeMemory32(portAddr + 10, namePtr); // ln_Name

      // CRITICAL FIX 2026-01-07: ALWAYS set PA_SIGNAL for ALL ports
      // Read existing flags and ensure PA_SIGNAL is set
      const PA_SIGNAL = 0x02;
      const existingFlags = this.emulator.readMemory(portAddr + 14);
      this.emulator.writeMemory(portAddr + 14, existingFlags | PA_SIGNAL);
debugLog(`[ExecLibrary][autoRegisterPort] Set PA_SIGNAL for port "${name}": 0x${existingFlags.toString(16)} -> 0x${(existingFlags | PA_SIGNAL).toString(16)}`);

      // Read the signal bit the door already set - DON'T allocate a new one!
      // The door's CreatePort() already called AllocSignal() and set mp_SigBit.
      // If we allocate a new bit here, Wait() will be waiting for the door's bit
      // but Signal() will signal our new bit - no match, door hangs!
      let sigBit = this.emulator.readMemory(portAddr + 15);
      if (sigBit === 0 || sigBit > 31) {
        // Only allocate if door didn't set one
        sigBit = this.AllocSignal(-1);
        if (sigBit < 0 || sigBit > 31) {
          sigBit = 1;
        }
        this.emulator.writeMemory(portAddr + 15, sigBit);
      }

      // Read SigTask from memory - door may have set it via FindTask(NULL)
      // Only set to current task if door didn't set one
      let sigTask = this.emulator.readMemory32(portAddr + 16);
      console.log(`[ExecLibrary] autoRegisterPort: name="${name}" sigTask=0x${sigTask.toString(16)} currentTask=0x${this.currentTask.address.toString(16)} sigBit=${sigBit}`);
      if (sigTask === 0) {
        sigTask = this.currentTask.address;
        this.emulator.writeMemory32(portAddr + 16, sigTask);
      }

      // CRITICAL FIX 2025-12-30: Door reply ports MUST have sigTask = door task
      // The native AEDoor.library may set sigTask to BBS task (0x88000) when creating
      // the reply port, but Signal() only signals the door task (0x90000).
      // Without this fix, the door never wakes up from Wait() after ReplyMsg.
      const nameLower = name.toLowerCase();
      const isDoorReplyPort =
        nameLower.startsWith("doorreplyport") ||
        nameLower.startsWith("aedoorrp") ||
        nameLower.startsWith("aeserver");
      if (isDoorReplyPort && sigTask !== this.currentTask.address) {
debugLog(
          `[ExecLibrary]   FIXING door reply port sigTask: 0x${sigTask.toString(
            16
          )} -> 0x${this.currentTask.address.toString(16)}`
        );
        sigTask = this.currentTask.address;
        this.emulator.writeMemory32(portAddr + 16, sigTask);
      }

      // Empty message list
      this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head -> Tail
      this.emulator.writeMemory32(portAddr + 24, 0); // lh_Tail
      this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred -> Head
      this.emulator.writeMemory(portAddr + 32, 0); // lh_Type
      this.emulator.writeMemory(portAddr + 33, 0); // l_pad

      const port: MessagePort = {
        address: portAddr,
        name,
        messages: [],
        sigBit,
        sigTask,
        signaled: false,
      };

      this.messagePorts.set(portAddr, port);
debugLog(
        `[ExecLibrary]   Auto-registered port at 0x${portAddr.toString(16)} (${
          name || "private"
        }), sigBit=${sigBit}, sigTask=0x${sigTask.toString(16)}`
      );
      return port;
    } catch (error) {
console.error(
        `[ExecLibrary]   Failed to auto-register port at 0x${portAddr.toString(
          16
        )}:`,
        error
      );
      return null;
    }
  }

  /**
   * SetTaskPri() - LVO -306 (0xFECE)
   *
   * Set the priority of a task.
   *
   * Parameters:
   *   A1 = Task pointer (0 = current task)
   *   D0 = New priority (-128 to +127)
   *
   * Returns:
   *   D0 = Old priority
   */
  setTaskPri(taskAddr: number, newPri: number): number {
    // If task is 0, use current task
    if (taskAddr === 0) {
      taskAddr = this.currentTask.address;
    }

debugLog(
      `[ExecLibrary] SetTaskPri(task=0x${taskAddr.toString(
        16
      )}, newPri=${newPri})`
    );

    // Read old priority from task structure (offset 9 in Task structure)
    const oldPri = this.emulator.readMemory(taskAddr + 9);

    // Write new priority
    this.emulator.writeMemory(taskAddr + 9, newPri & 0xff);

debugLog(`  Old priority: ${oldPri}, New priority: ${newPri}`);

    return oldPri;
  }

  /**
   * AllocSignal() - LVO -330 (0xFFFFFEB6)
   *
   * Allocate a signal bit for inter-process communication.
   *
   * Parameters:
   *   D0 = Signal number to allocate (-1 = any free signal)
   *
   * Returns:
   *   D0 = Signal number (0-31) or -1 if none available
   *
   * On Amiga, signals are used for IPC and synchronization.
   * Each task has 32 signal bits (0-31).
   * Signals 0-15 are typically reserved for system use (CTRL-C, CTRL-D, etc.)
   * User programs get signals 16-31.
   */
  AllocSignal(signalNum: number): number {
    // Convert from signed byte (-1 = 0xFFFFFFFF in 32-bit register)
    const requestedSignal = signalNum < 0 ? -1 : signalNum & 0xff;

debugLog(`[ExecLibrary] AllocSignal(${requestedSignal})`);

    // If specific signal requested
    if (requestedSignal >= 0 && requestedSignal < 32) {
      const mask = 1 << requestedSignal;

      // Check if already allocated
      if (this.allocatedSignals & mask) {
debugLog(`  Signal ${requestedSignal} already allocated!`);
        return -1; // Already allocated
      }

      // Allocate the requested signal
      this.allocatedSignals |= mask;
debugLog(
        `  Allocated signal ${requestedSignal}, mask=0x${this.allocatedSignals.toString(
          16
        )}`
      );
      return requestedSignal;
    }

    // Otherwise, find any free signal - start from 16 (user signals) per AmigaOS convention
    // Some doors check "if signal <= 0" which would incorrectly fail on signal 0
    for (let i = 16; i < 32; i++) {
      const mask = 1 << i;
      if (!(this.allocatedSignals & mask)) {
        // Found a free signal
        this.allocatedSignals |= mask;
debugLog(
          `  Allocated signal ${i}, mask=0x${this.allocatedSignals.toString(
            16
          )}`
        );
        return i;
      }
    }

    // If no user signals available, try system signals (0-15) as fallback
    for (let i = 0; i < 16; i++) {
      const mask = 1 << i;
      if (!(this.allocatedSignals & mask)) {
        this.allocatedSignals |= mask;
debugLog(
          `  Allocated system signal ${i} (fallback), mask=0x${this.allocatedSignals.toString(
            16
          )}`
        );
        return i;
      }
    }

    // No free signals
debugLog(`  No free signals available!`);
    return -1;
  }

  /**
   * Helper to release a previously allocated signal bit
   */
  private freeSignal(signalBit: number): void {
    if (signalBit < 0 || signalBit > 31) {
      return;
    }
    const mask = 1 << signalBit;
    if (this.allocatedSignals & mask) {
      this.allocatedSignals &= ~mask;
debugLog(
        `[ExecLibrary]   Freed signal ${signalBit}, mask=0x${this.allocatedSignals.toString(
          16
        )}`
      );
    }
  }

  /**
   * Reset signal allocation for a fresh door execution context.
   *
   * Called before door execution begins to ensure the door has access to
   * all signal bits. On real Amiga, each task has its own signal allocation,
   * but our emulator uses a shared pool. This resets it for each door.
   */
  resetSignalsForDoor(): void {
debugLog(
      `[ExecLibrary] Resetting signals for door execution (was 0x${this.allocatedSignals.toString(
        16
      )})`
    );
    this.allocatedSignals = 0;
  }

  /**
   * SetSignal() - LVO -306 (0xFFFFFED2)
   *
   * Examine and/or modify the set of signals for the current task.
   *
   * Parameters:
   *   D0 = newSignals: The new values for the signals specified in signalMask
   *   D1 = signalMask: The set of signals to be affected
   *
   * Returns:
   *   D0 = The old values for ALL signals (before any changes)
   *
   * The new signal values are modified as follows:
   *   signals = (signals & ~signalMask) | (newSignals & signalMask)
   *
   * XIM doors use this to clear signals after processing messages.
   */
  setSignal(newSignals: number, signalMask: number): number {
debugLog(
      `[ExecLibrary] SetSignal(newSignals=0x${newSignals.toString(
        16
      )}, signalMask=0x${signalMask.toString(16)})`
    );

    // Get current signal state for the current task
    // In our simplified model, we track signals in currentTask.sigRecvd
    const oldSignals = this.currentTask.sigRecvd;

debugLog(`  Old signals: 0x${oldSignals.toString(16)} (before changes)`);

    // Apply changes: clear bits in mask, then set new bits
    const clearedSignals = oldSignals & ~signalMask;
    const newSignalState = clearedSignals | (newSignals & signalMask);

    this.currentTask.sigRecvd = newSignalState;

debugLog(
      `  New signals: 0x${newSignalState.toString(16)} (after changes)`
    );

    // Return OLD signal values (before any changes)
    return oldSignals;
  }

  /**
   * FindPort() - LVO -390 (0xFFFFFE7A)
   *
   * Find a public message port by name.
   *
   * Parameters:
   *   A1 = Name (C-string pointer)
   *
   * Returns:
   *   D0 = MsgPort pointer (0 if not found)
   *
   * On Amiga, message ports are used for IPC. Doors look for "AEDoorPort%d"
   * where %d is the node number. When found, the door can send messages to
   * the BBS and receive replies.
   */
  findPort(nameAddr: number): number {
    const name = this.emulator.readString(nameAddr);
    const pc = this.emulator.getRegister(CPURegister.PC);
    const debugFindPort = process.env.DEBUG_FINDPORT === "1";
debugLog(`[ExecLibrary][FindPort] pc=0x${pc.toString(16)} "${name}"`);

    // CORRECT IMPLEMENTATION: Search for port in public registry
    // FindPort() should NOT create ports - it only searches for existing ones
    const normalized = name.toLowerCase();
    let portAddr = normalized.length
      ? this.publicPorts.get(normalized)
      : undefined;

    // CRITICAL FIX: Only use fallback for EMPTY searches or generic "AEDoorPort" (no node number)
    // DO NOT use fallback when searching for specific numbered ports like "AEDoorPort1"
    // that don't exist - this breaks duplicate-instance checks in doors
    //
    // Fallback is ONLY for:
    // 1. Empty string searches (normalized.length === 0)
    // 2. Generic "AEDoorPort" (no node number)
    //
    // If searching for "AEDoorPort1" and it doesn't exist, return 0 (NOT AEDoorPort3!)
    const isEmptySearch = !normalized.length;
    const isGenericPort = normalized === "aedoorport"; // No node number
    const shouldUseFallback = isEmptySearch || isGenericPort;

    if ((portAddr === undefined || portAddr === 0) && shouldUseFallback) {
      const globalAny: any = global as any;
      const nodeId =
        globalAny?.currentBbsSession?.nodeId ??
        globalAny?.currentBbsSession?.nodeNumber ??
        1;
      const candidates = [`AEDoorPort${nodeId}`, "AEDoorPort1", "AEDoorPort"];
      for (const candidate of candidates) {
        const addr = this.publicPorts.get(candidate.toLowerCase());
        if (addr !== undefined) {
debugLog(
            `[ExecLibrary]   Fallback matched "${candidate}" at 0x${addr.toString(
              16
            )} (empty/generic search)`
          );
          portAddr = addr;
          break;
        }
      }
    }

    if (portAddr !== undefined) {
debugLog(
        `[ExecLibrary]   Found "${name}" at 0x${portAddr.toString(16)}`
      );
      if (debugFindPort) {
        this.logMsgPortLayout(portAddr, name);
      }
      return portAddr;
    }

    // Check for other known ports (libraries can act as ports)
    if (name.toLowerCase() === "dos.library") {
      const dosLib = this.libraries.get("dos.library");
      if (dosLib) {
debugLog(
          `[ExecLibrary]   Returning dos.library at 0x${dosLib.address.toString(
            16
          )}`
        );
        return dosLib.address;
      }
    }

debugLog(`[ExecLibrary]   Port "${name}" not found - returning NULL`);
    return 0;
  }

  private logMsgPortLayout(portAddr: number, label: string): void {
    const lnNamePtr = this.emulator.readMemory32(portAddr + 10);
    const lnName = lnNamePtr ? this.emulator.readString(lnNamePtr) : "";
    const summary = {
      ln_Succ: this.emulator.readMemory32(portAddr + 0),
      ln_Pred: this.emulator.readMemory32(portAddr + 4),
      ln_Type: this.emulator.readMemory(portAddr + 8),
      ln_Pri: this.emulator.readMemory(portAddr + 9),
      ln_Name: `0x${lnNamePtr.toString(16)} "${lnName}"`,
      mp_Flags: this.emulator.readMemory(portAddr + 14),
      mp_SigBit: this.emulator.readMemory(portAddr + 15),
      mp_SigTask: this.emulator.readMemory32(portAddr + 16),
      lh_Head: this.emulator.readMemory32(portAddr + 20),
      lh_Tail: this.emulator.readMemory32(portAddr + 24),
      lh_TailPred: this.emulator.readMemory32(portAddr + 28),
      lh_Type: this.emulator.readMemory(portAddr + 32),
      l_Pad: this.emulator.readMemory(portAddr + 33),
    };
debugLog(
      `[ExecLibrary]   MsgPort layout for "${label}" @0x${portAddr.toString(
        16
      )}:`,
      summary
    );
  }

  /**
   * Helper: find a public port whose name starts with the given prefix (case-insensitive).
   */
  private getPublicPortByPrefix(prefix: string): number | undefined {
    const lower = prefix.toLowerCase();
    for (const [name, addr] of this.publicPorts.entries()) {
      if (name.startsWith(lower)) {
        return addr;
      }
    }
    return undefined;
  }

  /**
   * Helper: Get port name from port address (for debugging)
   */
  getPortName(portAddr: number): string | undefined {
    if (portAddr === 0) return undefined;

    // Search messagePorts registry
    const port = this.messagePorts.get(portAddr);
    if (port && port.name) {
      return port.name;
    }

    // Search publicPorts registry
    for (const [name, addr] of this.publicPorts.entries()) {
      if (addr === portAddr) {
        return name;
      }
    }

    return undefined;
  }

  /**
   * FindSemaphore() - LVO -306 (0xFFFFFECE)
   *
   * Find a public semaphore by name.
   *
   * Parameters:
   *   A1 = Name (C-string pointer)
   *
   * Returns:
   *   D0 = Semaphore pointer (0 if not found)
   *
   * WHO doors (like RTW) use FindSemaphore() to locate "AEServer.%d" semaphores
   * that contain node status information (multicom protocol).
   */
  findSemaphore(nameAddr: number): number {
    const name = this.emulator.readString(nameAddr);
debugLog(`[ExecLibrary] FindSemaphore("${name}")`);

    // CRITICAL DEBUG: Log ALL calls to see what RTW is looking for
    const fs = require('fs');
    const allSemas = Array.from(this.publicSemaphores.keys()).join(', ');
    fs.appendFileSync('/tmp/nodemgr-init-attempt.txt', `FindSemaphore("${name}") - total: ${this.publicSemaphores.size}\n`);
    if (name.startsWith('AE')) {
      const aeSemas = Array.from(this.publicSemaphores.keys()).filter(k => k.startsWith('AE')).join(', ');
      console.log(`[ExecLibrary] FindSemaphore("${name}") - AE*: ${aeSemas || 'NONE'}`);
      fs.appendFileSync('/tmp/nodemgr-init-attempt.txt', `  AE semaphores: ${aeSemas || 'NONE'}\n`);
    }

    // Search for semaphore in public registry
    const semaAddr = this.publicSemaphores.get(name);

    if (semaAddr !== undefined) {
debugLog(
        `[ExecLibrary]   Found "${name}" at 0x${semaAddr.toString(16)}`
      );
      return semaAddr;
    }

debugLog(
      `[ExecLibrary]   Semaphore "${name}" not found - returning NULL`
    );
    return 0;
  }

  /**
   * AddSemaphore() - LVO -270 (0xFFFFFEF2)
   *
   * Add a semaphore to the public list.
   *
   * Parameters:
   *   A1 = Semaphore structure pointer
   *
   * The semaphore structure starts with a Node header containing the name.
   * Node structure offsets:
   *   +8:  ln_Name (APTR to name string)
   */
  addSemaphore(semaphoreAddr: number): void {
    // Read semaphore name from ln_Name field (offset +8 in Node header)
    const nameAddr = this.emulator.readMemory32(semaphoreAddr + 8);
    const name = this.emulator.readString(nameAddr);

debugLog(
      `[ExecLibrary] AddSemaphore(0x${semaphoreAddr.toString(
        16
      )}) name="${name}"`
    );

    // Add to public semaphores registry
    this.publicSemaphores.set(name, semaphoreAddr);

debugLog(`[ExecLibrary]   Semaphore "${name}" added to public list`);
  }

  /**
   * InitSemaphore() - LVO -348 (0xFFFFFEA4)
   *
   * Initialize a signal semaphore structure.
   *
   * Parameters:
   *   A0 = SignalSemaphore pointer
   *
   * Returns:
   *   None
   *
   * SignalSemaphore structure (48 bytes):
   *   +0:  ss_Link (Node - 14 bytes)
   *   +14: ss_NestCount (WORD - 2 bytes)
   *   +16: ss_WaitQueue (MinList - 12 bytes)
   *   +28: ss_MultipleLink (SemaphoreRequest - 14 bytes)
   *   +42: ss_Owner (pointer - 4 bytes)
   *   +46: ss_QueueCount (WORD - 2 bytes)
   */
  initSemaphore(semaphoreAddr: number): void {
    if (semaphoreAddr === 0) {
debugLog("[ExecLibrary] InitSemaphore(NULL) - ignoring");
      return;
    }

debugLog(`[ExecLibrary] InitSemaphore(0x${semaphoreAddr.toString(16)})`);

    // Initialize Node header (ss_Link)
    this.emulator.writeMemory32(semaphoreAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(semaphoreAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(semaphoreAddr + 8, 0); // ln_Type
    this.emulator.writeMemory(semaphoreAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(semaphoreAddr + 10, 0); // ln_Name

    // Initialize ss_NestCount
    this.emulator.writeMemory16(semaphoreAddr + 14, 0);

    // Initialize ss_WaitQueue (MinList)
    const waitQueueAddr = semaphoreAddr + 16;
    this.emulator.writeMemory32(waitQueueAddr + 0, waitQueueAddr + 4); // lh_Head → Tail
    this.emulator.writeMemory32(waitQueueAddr + 4, 0); // lh_Tail (NULL)
    this.emulator.writeMemory32(waitQueueAddr + 8, waitQueueAddr + 0); // lh_TailPred → Head

    // Initialize ss_MultipleLink (SemaphoreRequest Node)
    this.emulator.writeMemory32(semaphoreAddr + 28, 0); // ln_Succ
    this.emulator.writeMemory32(semaphoreAddr + 32, 0); // ln_Pred
    this.emulator.writeMemory(semaphoreAddr + 36, 0); // ln_Type
    this.emulator.writeMemory(semaphoreAddr + 37, 0); // ln_Pri
    this.emulator.writeMemory32(semaphoreAddr + 38, 0); // ln_Name

    // Initialize ss_Owner
    this.emulator.writeMemory32(semaphoreAddr + 42, 0);

    // Initialize ss_QueueCount
    this.emulator.writeMemory16(semaphoreAddr + 46, 0);

debugLog(`[ExecLibrary]   Semaphore initialized`);
  }

  /**
   * ObtainSemaphore() - LVO -300 (0xFFFFFED4)
   *
   * Acquire exclusive access to a signal semaphore.
   * Supports nesting - same task can obtain multiple times.
   *
   * Parameters:
   *   A0 = SignalSemaphore pointer
   *
   * Returns:
   *   None (task will block if semaphore unavailable)
   *
   * In our single-task BBS emulator, this always succeeds immediately.
   */
  obtainSemaphore(semaphoreAddr: number): void {
    if (semaphoreAddr === 0) {
debugLog("[ExecLibrary] ObtainSemaphore(NULL) - ignoring");
      return;
    }

    // Read current state
    const nestCount = this.emulator.readMemory16(semaphoreAddr + 14);
    const owner = this.emulator.readMemory32(semaphoreAddr + 42);
    const currentTask = this.findTask(0); // 0 = FindTask(NULL) = current task

debugLog(
      `[ExecLibrary] ObtainSemaphore(0x${semaphoreAddr.toString(
        16
      )}) nestCount=${nestCount} owner=0x${owner.toString(16)}`
    );

    // If not owned or owned by current task, increment nest count
    if (owner === 0 || owner === currentTask) {
      this.emulator.writeMemory16(semaphoreAddr + 14, nestCount + 1);
      this.emulator.writeMemory32(semaphoreAddr + 42, currentTask);
debugLog(
        `[ExecLibrary]   Semaphore obtained, new nestCount=${nestCount + 1}`
      );
    } else {
      // In a real system, would block here. In single-task emulator, this shouldn't happen.
console.warn(
        `[ExecLibrary]   WARNING: Semaphore owned by different task! Forcing acquire.`
      );
      this.emulator.writeMemory16(semaphoreAddr + 14, 1);
      this.emulator.writeMemory32(semaphoreAddr + 42, currentTask);
    }
  }

  /**
   * ReleaseSemaphore() - LVO -312 (0xFFFFFEC8)
   *
   * Release a signal semaphore lock.
   *
   * Parameters:
   *   A0 = SignalSemaphore pointer
   *
   * Returns:
   *   None
   *
   * Each ObtainSemaphore() must have a matching ReleaseSemaphore().
   */
  releaseSemaphore(semaphoreAddr: number): void {
    if (semaphoreAddr === 0) {
debugLog("[ExecLibrary] ReleaseSemaphore(NULL) - ignoring");
      return;
    }

    // Read current state
    const nestCount = this.emulator.readMemory16(semaphoreAddr + 14);

debugLog(
      `[ExecLibrary] ReleaseSemaphore(0x${semaphoreAddr.toString(
        16
      )}) nestCount=${nestCount}`
    );

    if (nestCount > 0) {
      const newNestCount = nestCount - 1;
      this.emulator.writeMemory16(semaphoreAddr + 14, newNestCount);

      if (newNestCount === 0) {
        // Fully released, clear owner
        this.emulator.writeMemory32(semaphoreAddr + 42, 0);
debugLog(`[ExecLibrary]   Semaphore fully released`);
      } else {
debugLog(
          `[ExecLibrary]   Semaphore released, new nestCount=${newNestCount}`
        );
      }
    } else {
console.warn(
        `[ExecLibrary]   WARNING: ReleaseSemaphore called on unlocked semaphore!`
      );
    }
  }

  /**
   * AttemptSemaphore() - LVO -588 (0xFFFFFDB4)
   *
   * Non-blocking semaphore lock attempt.
   *
   * Parameters:
   *   A0 = SignalSemaphore pointer
   *
   * Returns:
   *   D0 = TRUE (-1) if obtained, FALSE (0) if unavailable
   */
  attemptSemaphore(semaphoreAddr: number): number {
    if (semaphoreAddr === 0) {
debugLog("[ExecLibrary] AttemptSemaphore(NULL) - returning FALSE");
      return 0;
    }

    // Read current state
    const nestCount = this.emulator.readMemory16(semaphoreAddr + 14);
    const owner = this.emulator.readMemory32(semaphoreAddr + 42);
    const currentTask = this.findTask(0);

debugLog(
      `[ExecLibrary] AttemptSemaphore(0x${semaphoreAddr.toString(
        16
      )}) nestCount=${nestCount} owner=0x${owner.toString(16)}`
    );

    // If not owned or owned by current task, increment nest count
    if (owner === 0 || owner === currentTask) {
      this.emulator.writeMemory16(semaphoreAddr + 14, nestCount + 1);
      this.emulator.writeMemory32(semaphoreAddr + 42, currentTask);
debugLog(
        `[ExecLibrary]   Semaphore obtained, new nestCount=${
          nestCount + 1
        }, returning TRUE`
      );
      return -1; // TRUE
    } else {
      // Owned by different task - return FALSE (don't block)
debugLog(`[ExecLibrary]   Semaphore unavailable, returning FALSE`);
      return 0; // FALSE
    }
  }

  /**
   * RemSemaphore() - LVO -444 (0xFFFFFE44)
   *
   * Remove a semaphore from the public list.
   *
   * Parameters:
   *   A1 = SignalSemaphore pointer
   *
   * Returns:
   *   None
   */
  remSemaphore(semaphoreAddr: number): void {
    if (semaphoreAddr === 0) {
debugLog("[ExecLibrary] RemSemaphore(NULL) - ignoring");
      return;
    }

    // Read semaphore name from ln_Name field (offset +10 in Node header)
    const nameAddr = this.emulator.readMemory32(semaphoreAddr + 10);
    if (nameAddr === 0) {
debugLog(
        `[ExecLibrary] RemSemaphore(0x${semaphoreAddr.toString(
          16
        )}) - no name, not in public list`
      );
      return;
    }

    const name = this.emulator.readString(nameAddr);
debugLog(`[ExecLibrary] RemSemaphore("${name}")`);

    // Remove from public registry
    if (this.publicSemaphores.has(name)) {
      this.publicSemaphores.delete(name);
debugLog(
        `[ExecLibrary]   Semaphore "${name}" removed from public list`
      );
    } else {
debugLog(
        `[ExecLibrary]   Semaphore "${name}" not found in public list`
      );
    }
  }

  /**
   * CreateIORequest() - LVO -504 (0xFFFFFE08)
   *
   * Create an I/O request structure.
   *
   * Parameters:
   *   A0 = MsgPort pointer (reply port)
   *   D0 = Size of I/O request structure
   *
   * Returns:
   *   D0 = IORequest pointer (0 if failed)
   *
   * IOStdReq structure (48 bytes):
   *   +0:  io_Message (Message - 20 bytes)
   *   +20: io_Device (pointer - 4 bytes)
   *   +24: io_Unit (pointer - 4 bytes)
   *   +28: io_Command (UWORD - 2 bytes)
   *   +30: io_Flags (UBYTE - 1 byte)
   *   +31: io_Error (BYTE - 1 byte)
   *   +32: io_Actual (ULONG - 4 bytes)
   *   +36: io_Length (ULONG - 4 bytes)
   *   +40: io_Data (pointer - 4 bytes)
   *   +44: io_Offset (ULONG - 4 bytes)
   */
  createIORequest(portAddr: number, size: number): number {
    if (portAddr === 0) {
debugLog("[ExecLibrary] CreateIORequest(NULL port) - returning NULL");
      return 0;
    }

    if (size < 48) {
debugLog(
        `[ExecLibrary] CreateIORequest: size ${size} too small (minimum 48 bytes) - returning NULL`
      );
      return 0;
    }

debugLog(
      `[ExecLibrary] CreateIORequest(port=0x${portAddr.toString(
        16
      )}, size=${size})`
    );

    // Allocate memory for IORequest
    const ioReqAddr = this.allocMem(size, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR

    if (ioReqAddr === 0) {
console.error(`[ExecLibrary]   CreateIORequest: AllocMem failed`);
      return 0;
    }

    // Initialize io_Message (first 20 bytes)
    // Message structure fields:
    //   +0:  mn_Node.ln_Succ (4 bytes)
    //   +4:  mn_Node.ln_Pred (4 bytes)
    //   +8:  mn_Node.ln_Type (1 byte) - NT_MESSAGE = 5
    //   +9:  mn_Node.ln_Pri (1 byte)
    //   +10: mn_Node.ln_Name (4 bytes)
    //   +14: mn_ReplyPort (4 bytes)
    //   +18: mn_Length (2 bytes)

    this.emulator.writeMemory32(ioReqAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(ioReqAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(ioReqAddr + 8, 5); // ln_Type = NT_MESSAGE
    this.emulator.writeMemory(ioReqAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(ioReqAddr + 10, 0); // ln_Name
    this.emulator.writeMemory32(ioReqAddr + 14, portAddr); // mn_ReplyPort
    this.emulator.writeMemory16(ioReqAddr + 18, size); // mn_Length

    // Initialize IORequest fields
    this.emulator.writeMemory32(ioReqAddr + 20, 0); // io_Device
    this.emulator.writeMemory32(ioReqAddr + 24, 0); // io_Unit
    this.emulator.writeMemory16(ioReqAddr + 28, 0); // io_Command
    this.emulator.writeMemory(ioReqAddr + 30, 0); // io_Flags
    this.emulator.writeMemory(ioReqAddr + 31, 0); // io_Error

    // Initialize IOStdReq extended fields (if size >= 48)
    if (size >= 48) {
      this.emulator.writeMemory32(ioReqAddr + 32, 0); // io_Actual
      this.emulator.writeMemory32(ioReqAddr + 36, 0); // io_Length
      this.emulator.writeMemory32(ioReqAddr + 40, 0); // io_Data
      this.emulator.writeMemory32(ioReqAddr + 44, 0); // io_Offset
    }

debugLog(
      `[ExecLibrary]   IORequest created at 0x${ioReqAddr.toString(16)}`
    );
    return ioReqAddr;
  }

  /**
   * DeleteIORequest() - LVO -510 (0xFFFFFE02)
   *
   * Delete an I/O request structure.
   *
   * Parameters:
   *   A0 = IORequest pointer
   *
   * Returns:
   *   None
   */
  deleteIORequest(ioReqAddr: number): void {
    if (ioReqAddr === 0) {
debugLog("[ExecLibrary] DeleteIORequest(NULL) - ignoring");
      return;
    }

debugLog(`[ExecLibrary] DeleteIORequest(0x${ioReqAddr.toString(16)})`);

    // Read size from mn_Length field
    const size = this.emulator.readMemory16(ioReqAddr + 18);

    // Free memory
    this.freeMem(ioReqAddr, size);
debugLog(`[ExecLibrary]   IORequest deleted`);
  }

  /**
   * DoIO() - LVO -516 (0xFFFFFDFC)
   *
   * Perform synchronous I/O operation.
   *
   * Parameters:
   *   A1 = IORequest pointer
   *
   * Returns:
   *   D0 = io_Error value (0 = success)
   *
   * Blocks until I/O completes. In our BBS emulator, most I/O is
   * handled synchronously anyway, so we just return success.
   */
  doIO(ioReqAddr: number): number {
    if (ioReqAddr === 0) {
debugLog("[ExecLibrary] DoIO(NULL) - returning error");
      return -1; // IOERR_OPENFAIL
    }

    // Read io_Command
    const command = this.emulator.readMemory16(ioReqAddr + 28);
    const device = this.emulator.readMemory32(ioReqAddr + 20);

debugLog(
      `[ExecLibrary] DoIO(0x${ioReqAddr.toString(
        16
      )}) command=${command} device=0x${device.toString(16)}`
    );

    // In a real system, would dispatch to device driver
    // For BBS emulator, most devices don't exist, so we stub this
debugLog(`[ExecLibrary]   DoIO: Stubbed - returning success`);

    // Set io_Error to 0 (success)
    this.emulator.writeMemory(ioReqAddr + 31, 0);

    return 0; // Success
  }

  /**
   * SendIO() - LVO -522 (0xFFFFFDF6)
   *
   * Initiate asynchronous I/O operation.
   *
   * Parameters:
   *   A1 = IORequest pointer
   *
   * Returns:
   *   None (check io_Error and reply port for completion)
   *
   * Returns immediately. Caller must monitor reply port for completion message.
   */
  sendIO(ioReqAddr: number): void {
    if (ioReqAddr === 0) {
debugLog("[ExecLibrary] SendIO(NULL) - ignoring");
      return;
    }

    // Read io_Command
    const command = this.emulator.readMemory16(ioReqAddr + 28);
    const device = this.emulator.readMemory32(ioReqAddr + 20);

debugLog(
      `[ExecLibrary] SendIO(0x${ioReqAddr.toString(
        16
      )}) command=${command} device=0x${device.toString(16)}`
    );

    // In a real system, would dispatch to device driver asynchronously
    // For BBS emulator, we simulate immediate completion

    // Set io_Error to 0 (success)
    this.emulator.writeMemory(ioReqAddr + 31, 0);

    // The IORequest is a struct Message at offset 0 — mn_ReplyPort lives
    // at +14, same as any other message. To match real exec.library
    // semantics (the driver ReplyMsg's the IO when it completes),
    // route through replyMsg() so the waiting task's port-sigBit fires.
    // Without this the AmiExpress RexxMast daemon's Wait(0x6000) on
    // its master + AREXX ports never wakes after the timer.device
    // SendIO it issues during message dispatch, and the script never
    // returns. Doors that SendIO + WaitIO/CheckIO are unaffected
    // because we already mark io_Error=0 above (CheckIO returns -1,
    // WaitIO finds the reply on the port).
    const replyPort = this.emulator.readMemory32(ioReqAddr + 14) >>> 0;
    if (replyPort !== 0) {
      try {
        this.replyMsg(ioReqAddr);
      } catch (err) {
debugLog(
          `[ExecLibrary]   SendIO: replyMsg faulted - ${(err as any)?.message || err}`
        );
      }
    }
debugLog(
      `[ExecLibrary]   SendIO: Stubbed - simulating immediate completion`
    );
  }

  /**
   * CheckIO() - LVO -528 (0xFFFFFDF0)
   *
   * Check if an I/O request has completed.
   *
   * Parameters:
   *   A1 = IORequest pointer
   *
   * Returns:
   *   D0 = 0 if still pending, non-zero if completed
   */
  checkIO(ioReqAddr: number): number {
    if (ioReqAddr === 0) {
debugLog("[ExecLibrary] CheckIO(NULL) - returning completed");
      return -1; // Consider NULL as completed
    }

debugLog(`[ExecLibrary] CheckIO(0x${ioReqAddr.toString(16)})`);

    // In our BBS emulator, I/O completes synchronously
    // So CheckIO always returns "completed"
debugLog(`[ExecLibrary]   CheckIO: Stubbed - returning completed`);
    return -1; // Non-zero = completed
  }

  /**
   * AddHead() - LVO -258 (P2)
   *
   * Add node to head of list.
   *
   * Parameters:
   *   A0 = List pointer
   *   A1 = Node pointer
   *
   * Returns:
   *   None
   *
   * Node structure (14 bytes):
   *   +0:  ln_Succ (pointer - 4 bytes)
   *   +4:  ln_Pred (pointer - 4 bytes)
   *   +8:  ln_Type (byte - 1 byte)
   *   +9:  ln_Pri (byte - 1 byte)
   *   +10: ln_Name (pointer - 4 bytes)
   */
  addHead(listAddr: number, nodeAddr: number): void {
    if (listAddr === 0 || nodeAddr === 0) {
debugLog("[ExecLibrary] AddHead(NULL) - ignoring");
      return;
    }

debugLog(
      `[ExecLibrary] AddHead(list=0x${listAddr.toString(
        16
      )}, node=0x${nodeAddr.toString(16)})`
    );

    // Read current head
    const oldHead = this.emulator.readMemory32(listAddr + 0); // lh_Head

    // Set node links
    this.emulator.writeMemory32(nodeAddr + 0, oldHead); // ln_Succ → old head
    this.emulator.writeMemory32(nodeAddr + 4, listAddr + 0); // ln_Pred → list head

    // Update old head's predecessor
    this.emulator.writeMemory32(oldHead + 4, nodeAddr);

    // Update list head
    this.emulator.writeMemory32(listAddr + 0, nodeAddr);

debugLog(`[ExecLibrary]   Node added to head`);
  }

  /**
   * AddTail() - LVO -264 (P2)
   *
   * Add node to tail of list.
   *
   * Parameters:
   *   A0 = List pointer
   *   A1 = Node pointer
   *
   * Returns:
   *   None
   */
  addTail(listAddr: number, nodeAddr: number): void {
    if (listAddr === 0 || nodeAddr === 0) {
debugLog("[ExecLibrary] AddTail(NULL) - ignoring");
      return;
    }

    // Read current values for debugging
    const oldHead = this.emulator.readMemory32(listAddr + 0);
    let tailPredAddr = this.emulator.readMemory32(listAddr + 8); // lh_TailPred
    const tailAddr = listAddr + 4; // lh_Tail

    // CRITICAL FIX 2026-01-08: Handle uninitialized/corrupted lists
    // If tailPred is 0, invalid, or not properly aligned, the list wasn't initialized properly.
    // Fix it by initializing to an empty list structure first.
    // Node pointers must be at least word-aligned (even address on 68K)
    const isTailPredInvalid =
      tailPredAddr === 0 ||
      tailPredAddr < 0x1000 ||
      (tailPredAddr & 1) !== 0;  // Odd address = not aligned
    if (isTailPredInvalid) {
      debugLog(`[ExecLibrary] AddTail: FIXING corrupted list at 0x${listAddr.toString(16)} (tailPred was 0x${tailPredAddr.toString(16)}, invalid=${tailPredAddr === 0 ? 'null' : tailPredAddr < 0x1000 ? 'low' : 'odd'})`);
      // Initialize empty list: head -> tail, tailPred -> head location
      this.emulator.writeMemory32(listAddr + 0, tailAddr); // lh_Head -> lh_Tail
      this.emulator.writeMemory32(listAddr + 4, 0); // lh_Tail = NULL
      this.emulator.writeMemory32(listAddr + 8, listAddr); // lh_TailPred -> lh_Head
      tailPredAddr = listAddr; // Use the fixed value
    }

    this.logExecDebug(`AddTail: BEFORE list=0x${listAddr.toString(16)} head=0x${oldHead.toString(16)} tailPred=0x${tailPredAddr.toString(16)}`);

debugLog(
      `[ExecLibrary] AddTail(list=0x${listAddr.toString(
        16
      )}, node=0x${nodeAddr.toString(16)}) tailPred=0x${tailPredAddr.toString(16)}`
    );

    // Set node links
    this.emulator.writeMemory32(nodeAddr + 0, tailAddr); // ln_Succ → tail
    this.emulator.writeMemory32(nodeAddr + 4, tailPredAddr); // ln_Pred → old last node

    // Update old last node's successor
    // CRITICAL: For first node in empty list, tailPredAddr points to lh_Head location
    // so this writes to lh_Head, making it point to the new node
    this.emulator.writeMemory32(tailPredAddr + 0, nodeAddr);

    // Update list tail predecessor
    this.emulator.writeMemory32(listAddr + 8, nodeAddr);

    // Verify the write
    const newHead = this.emulator.readMemory32(listAddr + 0);
    this.logExecDebug(`AddTail: AFTER list=0x${listAddr.toString(16)} head=0x${newHead.toString(16)} tailPred=0x${nodeAddr.toString(16)}`);

debugLog(`[ExecLibrary]   Node added to tail (head now 0x${newHead.toString(16)})`);
  }

  /**
   * RemHead() - LVO -234 (P1)
   *
   * Remove and return first node from list.
   *
   * Parameters:
   *   A0 = List pointer
   *
   * Returns:
   *   D0 = Node pointer (0 if list empty)
   */
  remHead(listAddr: number): number {
    if (listAddr === 0) {
debugLog("[ExecLibrary] RemHead(NULL) - returning NULL");
      return 0;
    }

    // Read head node
    const headAddr = this.emulator.readMemory32(listAddr + 0); // lh_Head
    const tailAddr = listAddr + 4; // lh_Tail
    const tailPredAddr = this.emulator.readMemory32(listAddr + 8); // lh_TailPred

    // DEBUG: Log all list values
    this.logExecDebug(`RemHead: list=0x${listAddr.toString(16)} headAddr=0x${headAddr.toString(16)} tailAddr=0x${tailAddr.toString(16)} tailPred=0x${tailPredAddr.toString(16)}`);

    // Check if list is empty (head points to tail)
    if (headAddr === tailAddr) {
debugLog(`[ExecLibrary] RemHead: List empty (head=0x${headAddr.toString(16)} == tail=0x${tailAddr.toString(16)})`);
      return 0;
    }

debugLog(
      `[ExecLibrary] RemHead(list=0x${listAddr.toString(
        16
      )}) → node=0x${headAddr.toString(16)}`
    );

    // Read new head (successor of current head)
    const newHeadAddr = this.emulator.readMemory32(headAddr + 0); // ln_Succ

    // Update list head
    this.emulator.writeMemory32(listAddr + 0, newHeadAddr);

    // Update new head's predecessor
    this.emulator.writeMemory32(newHeadAddr + 4, listAddr + 0);

debugLog(`[ExecLibrary]   Node removed from head`);
    return headAddr;
  }

  /**
   * RemTail() - LVO -240 (P1)
   *
   * Remove and return last node from list.
   *
   * Parameters:
   *   A0 = List pointer
   *
   * Returns:
   *   D0 = Node pointer (0 if list empty)
   */
  remTail(listAddr: number): number {
    if (listAddr === 0) {
debugLog("[ExecLibrary] RemTail(NULL) - returning NULL");
      return 0;
    }

    // Read tail predecessor (last node)
    const tailPredAddr = this.emulator.readMemory32(listAddr + 8); // lh_TailPred
    const headAddr = listAddr + 0; // lh_Head

    // Check if list is empty (tailPred points to head)
    if (tailPredAddr === headAddr) {
debugLog(`[ExecLibrary] RemTail: List empty`);
      return 0;
    }

debugLog(
      `[ExecLibrary] RemTail(list=0x${listAddr.toString(
        16
      )}) → node=0x${tailPredAddr.toString(16)}`
    );

    // Read new tail (predecessor of current tail)
    const newTailPredAddr = this.emulator.readMemory32(tailPredAddr + 4); // ln_Pred

    // Update list tail predecessor
    this.emulator.writeMemory32(listAddr + 8, newTailPredAddr);

    // Update new tail's successor
    const tailAddr = listAddr + 4;
    this.emulator.writeMemory32(newTailPredAddr + 0, tailAddr);

debugLog(`[ExecLibrary]   Node removed from tail`);
    return tailPredAddr;
  }

  /**
   * Remove() - LVO -246 (P1)
   *
   * Remove a node from its list.
   *
   * Parameters:
   *   A1 = Node pointer
   *
   * Returns:
   *   None
   */
  remove(nodeAddr: number): void {
    if (nodeAddr === 0) {
debugLog("[ExecLibrary] Remove(NULL) - ignoring");
      return;
    }

debugLog(`[ExecLibrary] Remove(node=0x${nodeAddr.toString(16)})`);

    // Read node links
    const succAddr = this.emulator.readMemory32(nodeAddr + 0); // ln_Succ
    const predAddr = this.emulator.readMemory32(nodeAddr + 4); // ln_Pred

    // Link predecessor to successor
    this.emulator.writeMemory32(predAddr + 0, succAddr);

    // Link successor to predecessor
    this.emulator.writeMemory32(succAddr + 4, predAddr);

debugLog(`[ExecLibrary]   Node removed from list`);
  }

  /**
   * Insert() - LVO -252 (P1)
   *
   * Insert node into list after specified node.
   *
   * Parameters:
   *   A0 = List pointer
   *   A1 = Node to insert
   *   A2 = Insert after this node (NULL = insert at head)
   *
   * Returns:
   *   None
   */
  insert(listAddr: number, nodeAddr: number, afterAddr: number): void {
    if (listAddr === 0 || nodeAddr === 0) {
debugLog("[ExecLibrary] Insert(NULL) - ignoring");
      return;
    }

debugLog(
      `[ExecLibrary] Insert(list=0x${listAddr.toString(
        16
      )}, node=0x${nodeAddr.toString(16)}, after=0x${afterAddr.toString(16)})`
    );

    // If afterAddr is NULL, insert at head
    if (afterAddr === 0) {
      this.addHead(listAddr, nodeAddr);
      return;
    }

    // Read successor of after node
    const succAddr = this.emulator.readMemory32(afterAddr + 0); // ln_Succ

    // Set new node links
    this.emulator.writeMemory32(nodeAddr + 0, succAddr); // ln_Succ → successor
    this.emulator.writeMemory32(nodeAddr + 4, afterAddr); // ln_Pred → after node

    // Update after node's successor
    this.emulator.writeMemory32(afterAddr + 0, nodeAddr);

    // Update successor's predecessor
    this.emulator.writeMemory32(succAddr + 4, nodeAddr);

debugLog(`[ExecLibrary]   Node inserted`);
  }

  /**
   * Disable() - LVO -162 (P2)
   *
   * Disable interrupts.
   *
   * Parameters:
   *   None
   *
   * Returns:
   *   None
   *
   * In BBS emulator, this is a no-op.
   */
  disable(): void {
debugLog("[ExecLibrary] Disable() - no-op in emulated environment");
  }

  /**
   * Enable() - LVO -168 (P2)
   *
   * Enable interrupts.
   *
   * Parameters:
   *   None
   *
   * Returns:
   *   None
   *
   * In BBS emulator, this is a no-op.
   */
  enable(): void {
debugLog("[ExecLibrary] Enable() - no-op in emulated environment");
  }

  /**
   * AvailMem() - LVO -216
   *
   * Get available memory.
   *
   * Parameters:
   *   D1 = Requirements (memory flags)
   *        MEMF_CHIP (1<<1) = Chip memory
   *        MEMF_FAST (1<<2) = Fast memory
   *        MEMF_LARGEST (1<<17) = Return largest block
   *
   * Returns:
   *   D0 = Available memory in bytes
   *
   * Amiga can handle 128-256MB+ with accelerators.
   * Returns 64MB for web environment (plenty for any door).
   */
  availMem(requirements: number): number {
debugLog(
      `[ExecLibrary] AvailMem(requirements=0x${requirements.toString(16)})`
    );

    // Report 64MB available - Amiga can handle 128-256MB+ with accelerators
    // This signals to doors that memory is not a constraint
    const availableMemory = 64 * 1024 * 1024;

debugLog(
      `[ExecLibrary]   Returning ${availableMemory} bytes (64MB) available`
    );
    return availableMemory;
  }

  // ============================================================================
  // P0 CRITICAL FUNCTIONS
  // ============================================================================

  /**
   * CopyMem() - LVO -624 (V36+) - CORRECTED (was incorrectly at -474)
   *
   * Fast memory copy (aligned, forward copy)
   *
   * Parameters:
   *   A0 = source address
   *   A1 = destination address
   *   D0 = size (bytes)
   *
   * Returns:
   *   None
   *
   * P0 function - Critical for memory operations
   */
  copyMem(sourceAddr: number, destAddr: number, size: number): void {
debugLog(
      `[ExecLibrary] CopyMem(src=0x${sourceAddr.toString(
        16
      )}, dest=0x${destAddr.toString(16)}, size=${size})`
    );

    if (size === 0 || sourceAddr === 0 || destAddr === 0) {
debugLog(`[ExecLibrary]   Invalid parameters, skipping`);
      return;
    }

    // DEBUG: 100-byte CopyMem is the wall door's record-insert. Log src+dst before/after.
    if (size === 100) {
      const srcBytes: number[] = [];
      for (let i = 0; i < Math.min(48, size); i++) srcBytes.push(this.emulator.readMemory(sourceAddr + i));
      const srcAsc = srcBytes.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
      const dstBefore: number[] = [];
      for (let i = 0; i < Math.min(48, size); i++) dstBefore.push(this.emulator.readMemory(destAddr + i));
      const dstBeforeAsc = dstBefore.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
console.log(`[CopyMem-100] src=0x${sourceAddr.toString(16)} dst=0x${destAddr.toString(16)}`);
console.log(`[CopyMem-100]   src[0..47]:      "${srcAsc}"`);
console.log(`[CopyMem-100]   dst[0..47] BEFORE: "${dstBeforeAsc}"`);
    }

    // Perform byte-by-byte copy (could be optimized with Buffer.copy if needed)
    for (let i = 0; i < size; i++) {
      const byte = this.emulator.readMemory(sourceAddr + i);
      this.emulator.writeMemory(destAddr + i, byte);
    }

    if (size === 100) {
      const dstAfter: number[] = [];
      for (let i = 0; i < Math.min(48, size); i++) dstAfter.push(this.emulator.readMemory(destAddr + i));
      const dstAfterAsc = dstAfter.map(b => (b >= 32 && b < 127) ? String.fromCharCode(b) : '.').join('');
console.log(`[CopyMem-100]   dst[0..47] AFTER:  "${dstAfterAsc}"`);
    }

debugLog(`[ExecLibrary]   Copied ${size} bytes`);
  }

  /**
   * CopyMemQuick() - LVO -630 (V36+) - CORRECTED (was incorrectly at -480)
   *
   * Quick memory copy (assumes longword aligned, multiple of 4)
   *
   * Parameters:
   *   A0 = source address
   *   A1 = destination address
   *   D0 = size (bytes, multiple of 4)
   *
   * Returns:
   *   None
   *
   * P0 function - Critical for fast memory operations
   */
  copyMemQuick(sourceAddr: number, destAddr: number, size: number): void {
debugLog(
      `[ExecLibrary] CopyMemQuick(src=0x${sourceAddr.toString(
        16
      )}, dest=0x${destAddr.toString(16)}, size=${size})`
    );

    if (size === 0 || sourceAddr === 0 || destAddr === 0) {
debugLog(`[ExecLibrary]   Invalid parameters, skipping`);
      return;
    }

    // Quick copy using 32-bit reads/writes
    const numLongs = size >> 2; // Divide by 4
    for (let i = 0; i < numLongs; i++) {
      const longword = this.emulator.readMemory32(sourceAddr + i * 4);
      this.emulator.writeMemory32(destAddr + i * 4, longword);
    }

debugLog(`[ExecLibrary]   Copied ${numLongs} longwords (${size} bytes)`);
  }

  /**
   * AllocVec() - LVO -552 (V36+)
   *
   * Allocate memory with automatic size tracking
   *
   * Parameters:
   *   D0 = byteSize (size to allocate)
   *   D1 = requirements (MEMF_* flags)
   *
   * Returns:
   *   D0 = memory pointer, or 0 for failure
   *
   * P0 function - Critical for tracked memory allocation
   *
   * Note: AllocVec prepends 4 bytes before the returned pointer to store size,
   * so FreeVec can free without knowing the size.
   */
  allocVec(byteSize: number, requirements: number): number {
debugLog(
      `[ExecLibrary] AllocVec(size=${byteSize}, requirements=0x${requirements.toString(
        16
      )})`
    );

    if (byteSize === 0) {
debugLog(`[ExecLibrary]   Zero size requested, returning NULL`);
      return 0;
    }

    // Allocate extra 4 bytes for size header
    const totalSize = byteSize + 4;
    const memAddr = this.allocMem(totalSize, requirements);

    if (memAddr === 0) {
debugLog(`[ExecLibrary]   Allocation failed`);
      return 0;
    }

    // Store size in first 4 bytes
    this.emulator.writeMemory32(memAddr, byteSize);

    // Return pointer after size header
    const userAddr = memAddr + 4;
debugLog(
      `[ExecLibrary]   AllocVec → 0x${userAddr.toString(
        16
      )} (${byteSize} bytes)`
    );
    return userAddr;
  }

  /**
   * FreeVec() - LVO -558 (V36+)
   *
   * Free memory allocated by AllocVec()
   *
   * Parameters:
   *   A1 = memoryBlock (pointer returned by AllocVec)
   *
   * Returns:
   *   None
   *
   * P0 function - Critical for freeing tracked memory
   */
  freeVec(memoryBlock: number): void {
    if (memoryBlock === 0) {
debugLog(`[ExecLibrary] FreeVec(NULL) - ignoring`);
      return;
    }

    // Read size from 4 bytes before user pointer
    const headerAddr = memoryBlock - 4;
    const size = this.emulator.readMemory32(headerAddr);

debugLog(
      `[ExecLibrary] FreeVec(0x${memoryBlock.toString(16)}) - size=${size}`
    );

    // Free entire block including header
    const totalSize = size + 4;
    this.freeMem(headerAddr, totalSize);

debugLog(`[ExecLibrary]   Freed ${totalSize} bytes`);
  }

  /**
   * AddPort() - LVO -354 (0xFFFFFE9E)
   *
   * Add a message port to the public list.
   *
   * Parameters:
   *   A1 = MsgPort pointer
   *
   * Returns:
   *   None
   *
   * Makes a port publicly findable via FindPort().
   * The port name is read from the port structure.
   */
  addPort(portAddr: number): void {
    if (portAddr === 0) {
debugLog("[ExecLibrary] AddPort(NULL) - ignoring");
      return;
    }

    // Read port structure to get name
    // MsgPort structure:
    //   +0:  ln_Succ (4 bytes)
    //   +4:  ln_Pred (4 bytes)
    //   +8:  ln_Type (1 byte)
    //   +9:  ln_Pri (1 byte)
    //   +10: ln_Name (4 bytes) - pointer to name string

    const namePtr = this.emulator.readMemory32(portAddr + 10);

    if (namePtr === 0) {
debugLog(
        `[ExecLibrary] AddPort(0x${portAddr.toString(
          16
        )}) - port has no name, not making public`
      );
      return;
    }

    const name = this.emulator.readString(namePtr);
debugLog(
      `[ExecLibrary] AddPort(0x${portAddr.toString(
        16
      )}) - adding public port "${name}"`
    );

    // CRITICAL: Also add to message ports registry (for PutMsg/GetMsg/WaitPort)
    // Read port structure fields
    const sigBit = this.emulator.readMemory(portAddr + 15); // mp_SigBit
    let sigTask = this.emulator.readMemory32(portAddr + 16); // mp_SigTask

    // CRITICAL FIX 2025-12-30: Door reply ports MUST have sigTask = door task
    // The native AEDoor.library may set sigTask to BBS task (0x88000) when creating
    // the reply port, but Signal() only signals the door task (0x90000).
    // Without this fix, the door never wakes up from Wait() after ReplyMsg.
    const nameLower = name.toLowerCase();
    const isDoorReplyPort =
      nameLower.startsWith("doorreplyport") ||
      nameLower.startsWith("aedoorrp") ||
      nameLower.startsWith("aeserver");
    if (isDoorReplyPort) {
      // Fix sigTask if needed
      if (sigTask !== this.currentTask.address) {
debugLog(
          `[ExecLibrary]   FIXING door reply port sigTask: 0x${sigTask.toString(
            16
          )} -> 0x${this.currentTask.address.toString(16)}`
        );
        sigTask = this.currentTask.address;
        // Also fix in memory so native code sees the correct value
        this.emulator.writeMemory32(portAddr + 16, sigTask);
      }
    }

    // CRITICAL FIX 2026-01-07: ALWAYS ensure PA_SIGNAL flag is set for ALL message ports.
    // Without this flag, putMsg won't signal the waiting task when messages arrive.
    // Native 68K code may create ports without PA_SIGNAL, causing doors to hang in Wait().
    // This applies to all ports (AEServer.*, DoorReplyPort*, etc.), not just specific ones.
    const PA_SIGNAL = 0x02;
    const currentFlags = this.emulator.readMemory(portAddr + 14);
    if ((currentFlags & PA_SIGNAL) === 0) {
debugLog(
        `[ExecLibrary]   FIXING port "${name}" flags: adding PA_SIGNAL (0x${currentFlags.toString(
          16
        )} -> 0x${(currentFlags | PA_SIGNAL).toString(16)})`
      );
      this.emulator.writeMemory(portAddr + 14, currentFlags | PA_SIGNAL);
    }

debugLog(
      `[ExecLibrary]   Port sigTask: 0x${sigTask.toString(
        16
      )}, sigBit: ${sigBit}`
    );

    const port = {
      address: portAddr,
      name: name,
      messages: [],
      sigBit: sigBit || 1,
      sigTask: sigTask || this.currentTask.address,
      signaled: false,
    };
    this.messagePorts.set(portAddr, port);

    // Update port structure to mark it as public (ln_Type = NT_MSGPORT = 4)
    this.emulator.writeMemory(portAddr + 8, 4); // NT_MSGPORT

    // Register for FindPort lookups and Exec port list traversal
    this.registerPublicPort(name, portAddr);

debugLog(
      `[ExecLibrary]   Port "${name}" is now public and registered for messaging`
    );
  }

  /**
   * CreateMsgPort() - LVO -666 (0xFFFFFD66)
   *
   * Create a new message port.
   *
   * Parameters:
   *   None
   *
   * Returns:
   *   D0 = MsgPort pointer (0 on failure)
   *
   * Message ports are used for IPC. Doors create a reply port to receive
   * responses from the BBS.
   */
  createMsgPort(ownerTask?: Task, forceSigBit?: number): number {
    const owner = ownerTask || this.currentTask;
debugLog("[ExecLibrary] CreateMsgPort() called");
debugLog(
      `[ExecLibrary]   Owner task: 0x${owner.address.toString(16)} (${
        owner.name
      })`
    );
debugLog(
      `[ExecLibrary]   DEBUG: ownerTask passed=${
        ownerTask ? "yes" : "no"
      }, this.currentTask.address=0x${this.currentTask.address.toString(
        16
      )}, this.bbsTask.address=0x${this.bbsTask.address.toString(16)}`
    );
    // CRITICAL FIX: Allocate 512 bytes (0x200) for MsgPort extended structure
    // Amixlib doors (like GetAnswer) access offsets up to 0x147 (327 bytes) from port base.
    // Zero-filling prevents garbage characters appearing in door output.
    const portAddr = this.allocMem(512, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
    if (portAddr === 0) {
console.warn("[ExecLibrary]   CreateMsgPort failed: AllocMem returned 0");
      return 0;
    }

    // Initialize MsgPort structure
    // struct MsgPort {
    //   struct Node mp_Node;      // 14 bytes
    //   UBYTE mp_Flags;           // 1 byte
    //   UBYTE mp_SigBit;          // 1 byte
    //   struct Task *mp_SigTask;  // 4 bytes
    //   struct List mp_MsgList;   // 14 bytes
    // }

    // mp_Node (14 bytes at offset 0)
    this.emulator.writeMemory32(portAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(portAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(portAddr + 8, 4); // ln_Type (NT_MSGPORT=4)
    this.emulator.writeMemory(portAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(portAddr + 10, 0); // ln_Name

    // mp_Flags (1 byte at offset 14)
    this.emulator.writeMemory(portAddr + 14, 0x02); // PA_SIGNAL

    // mp_SigBit (1 byte at offset 15)
    // If forceSigBit is provided (e.g., 12 for AEDoorPort), use that instead of allocating
    // This is needed because doors hardcode expected signal bits (e.g., bit 12 for AEDoorPort)
    let signalBit: number;
    if (forceSigBit !== undefined && forceSigBit >= 0 && forceSigBit <= 31) {
      signalBit = forceSigBit;
debugLog(
        `[ExecLibrary]   Using forced sigBit=${signalBit} (0x${(
          1 << signalBit
        ).toString(16)})`
      );
    } else {
      signalBit = this.AllocSignal(-1);
      if (signalBit < 0) {
console.warn(
          "[ExecLibrary]   WARNING: No free signals available, falling back to bit 1"
        );
        signalBit = 1;
      }
    }
    this.emulator.writeMemory(portAddr + 15, signalBit);

    // mp_SigTask (4 bytes at offset 16)
    this.emulator.writeMemory32(portAddr + 16, owner.address);

    // mp_MsgList (14 bytes at offset 20)
    // Initialize as empty list
    this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head (points to Tail)
    this.emulator.writeMemory32(portAddr + 24, 0); // lh_Tail (always NULL)
    this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred (points to Head)
    this.emulator.writeMemory(portAddr + 32, 0); // lh_Type
    this.emulator.writeMemory(portAddr + 33, 0); // l_pad

    // Track port in our registry
    const port: MessagePort = {
      address: portAddr,
      name: "", // Private port (CreateMsgPort has no name)
      messages: [],
      sigBit: signalBit,
      sigTask: owner.address,
      signaled: false,
    };
    this.messagePorts.set(portAddr, port);

debugLog(
      `[ExecLibrary] ✅ Created MsgPort at 0x${portAddr.toString(16)}`
    );
debugLog(
      `[ExecLibrary]    mp_Flags: 0x${this.emulator
        .readMemory(portAddr + 14)
        .toString(16)}`
    );
debugLog(
      `[ExecLibrary]    mp_SigBit: ${this.emulator.readMemory(portAddr + 15)}`
    );
debugLog(
      `[ExecLibrary]    mp_SigTask: 0x${this.emulator
        .readMemory32(portAddr + 16)
        .toString(16)}`
    );
debugLog(`[ExecLibrary]    Returning D0 = 0x${portAddr.toString(16)}`);
    return portAddr;
  }

  /**
   * CreatePort() - LVO -372 (0xFFFFFE8C)
   *
   * Create a message port (AmigaOS 1.x API - obsolete but still used by legacy doors).
   * This is the old API that takes name and priority parameters.
   * Modern code should use CreateMsgPort() instead.
   *
   * Parameters:
   *   A0 = name pointer (STRPTR, can be NULL for private port)
   *   D0 = priority (LONG, typically 0)
   *
   * Returns:
   *   D0 = MsgPort address (or 0 if failed)
   */
  createPort(nameAddr: number, priority: number): number {
debugLog("[ExecLibrary] CreatePort() called (AmigaOS 1.x API)");
debugLog(`[ExecLibrary]   name: 0x${nameAddr.toString(16)}`);
debugLog(`[ExecLibrary]   priority: ${priority}`);
debugLog(
      `[ExecLibrary]   Current task: 0x${this.currentTask.address.toString(16)}`
    );
    // CRITICAL FIX: Allocate 512 bytes (0x200) for MsgPort extended structure
    // Amixlib doors (like GetAnswer) access offsets up to 0x147 (327 bytes) from port base.
    // Zero-filling prevents garbage characters appearing in door output.
    const portAddr = this.allocMem(512, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
    if (portAddr === 0) {
console.warn("[ExecLibrary]   CreatePort failed: AllocMem returned 0");
      return 0;
    }

    // Read the port name if provided
    let portName = "";
    if (nameAddr !== 0) {
      portName = this.emulator.readString(nameAddr);
debugLog(`[ExecLibrary]   Port name: "${portName}"`);
    } else {
debugLog(`[ExecLibrary]   Port name: (NULL - private port)`);
    }

    // CRITICAL: Notify door session that CreatePort was called (initialization complete)
    // Door needs pr_CLI set to CLI structure AFTER initialization
    if (this.doorInitCallback) {
      this.doorInitCallback();
    }

    // Initialize MsgPort structure
    // struct MsgPort {
    //   struct Node mp_Node;      // 14 bytes
    //   UBYTE mp_Flags;           // 1 byte
    //   UBYTE mp_SigBit;          // 1 byte
    //   struct Task *mp_SigTask;  // 4 bytes
    //   struct List mp_MsgList;   // 14 bytes
    // }

    // mp_Node (14 bytes at offset 0)
    this.emulator.writeMemory32(portAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(portAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(portAddr + 8, 4); // ln_Type (NT_MSGPORT=4)
    this.emulator.writeMemory(portAddr + 9, priority & 0xff); // ln_Pri (set priority!)
    this.emulator.writeMemory32(portAddr + 10, nameAddr); // ln_Name (pointer to name string)

    // mp_Flags (1 byte at offset 14)
    this.emulator.writeMemory(portAddr + 14, 0x02); // PA_SIGNAL

    // mp_SigBit (1 byte at offset 15)
    this.emulator.writeMemory(portAddr + 15, 1); // Signal bit 1

    // mp_SigTask (4 bytes at offset 16)
    this.emulator.writeMemory32(portAddr + 16, this.currentTask.address);

    // mp_MsgList (14 bytes at offset 20)
    // Initialize as empty list
    this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head (points to Tail)
    this.emulator.writeMemory32(portAddr + 24, 0); // lh_Tail (always NULL)
    this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred (points to Head)
    this.emulator.writeMemory(portAddr + 32, 0); // lh_Type
    this.emulator.writeMemory(portAddr + 33, 0); // l_pad

    // Track port in our registry
    const port: MessagePort = {
      address: portAddr,
      name: portName,
      messages: [],
      sigBit: 1,
      sigTask: this.currentTask.address,
      signaled: false,
    };
    this.messagePorts.set(portAddr, port);

debugLog(
      `[ExecLibrary] ✅ Created MsgPort at 0x${portAddr.toString(
        16
      )} (via CreatePort)`
    );
debugLog(`[ExecLibrary]    mp_Node.ln_Name: "${portName}"`);
debugLog(`[ExecLibrary]    mp_Node.ln_Pri: ${priority}`);
debugLog(
      `[ExecLibrary]    mp_Flags: 0x${this.emulator
        .readMemory(portAddr + 14)
        .toString(16)} (PA_SIGNAL)`
    );
debugLog(
      `[ExecLibrary]    mp_SigBit: ${this.emulator.readMemory(portAddr + 15)}`
    );
debugLog(
      `[ExecLibrary]    mp_SigTask: 0x${this.emulator
        .readMemory32(portAddr + 16)
        .toString(16)}`
    );
debugLog(
      `[ExecLibrary]    Returning D0 = 0x${portAddr.toString(16)} (success)`
    );
    return portAddr;
  }

  /**
   * DeleteMsgPort() - LVO -672 (0xFFFFFD60)
   *
   * Delete a message port.
   *
   * Parameters:
   *   A0 = MsgPort pointer
   *
   * Returns:
   *   Nothing
   */
  deleteMsgPort(portAddr: number): void {
debugLog(`[ExecLibrary] DeleteMsgPort(port=0x${portAddr.toString(16)})`);

    // CRITICAL INSIGHT: portAddr might be in data segment (0x4000-0x5000 range)
    // If so, we need to READ THE POINTER from that address, not use the address directly!
    if (portAddr >= 0x4000 && portAddr < 0x5000) {
      const actualPortAddr = this.emulator.readMemory32(portAddr);
debugLog(
        `[ExecLibrary]   Detected data segment address 0x${portAddr.toString(
          16
        )}`
      );
debugLog(
        `[ExecLibrary]   Reading port pointer from memory: 0x${actualPortAddr.toString(
          16
        )}`
      );

      if (actualPortAddr === 0) {
debugLog(
          `[ExecLibrary]   Port pointer is NULL - DoorStart() never initialized it`
        );
        return;
      }

      // Recurse with actual port address
      return this.deleteMsgPort(actualPortAddr);
    }

    // Check if portAddr is NULL (0) or very small (likely NULL)
    if (portAddr === 0 || portAddr < 0x1000) {
debugLog(
        `[ExecLibrary]   NULL or invalid port address: 0x${portAddr.toString(
          16
        )} - ignoring`
      );
      return;
    }

    // Read the first few bytes of the port structure to see if it's valid
    const portData = {
      ln_Succ: this.emulator.readMemory32(portAddr + 0),
      ln_Pred: this.emulator.readMemory32(portAddr + 4),
      ln_Type: this.emulator.readMemory(portAddr + 8),
      mp_Flags: this.emulator.readMemory(portAddr + 14),
      mp_SigBit: this.emulator.readMemory(portAddr + 15),
    };
debugLog(
      `[ExecLibrary]   Port structure at 0x${portAddr.toString(16)}:`,
      portData
    );

    const port = this.messagePorts.get(portAddr);
    if (!port) {
console.error(
        `[ExecLibrary]   Port not tracked in messagePorts map (address: 0x${portAddr.toString(
          16
        )})`
      );
console.error(
        `[ExecLibrary]   Known ports:`,
        Array.from(this.messagePorts.keys())
          .map((a) => `0x${a.toString(16)}`)
          .join(", ")
      );
      return;
    }

    // Remove from public registry if it has a name
    if (port.name) {
      this.publicPorts.delete(port.name.toLowerCase());
debugLog(`[ExecLibrary]   Removed public port "${port.name}"`);
    }

    this.removePortFromExecList(portAddr);

    // Release signal bit
    this.freeSignal(port.sigBit);

    // Remove from port registry
    this.messagePorts.delete(portAddr);
debugLog(`[ExecLibrary]   Deleted port at 0x${portAddr.toString(16)}`);
  }

  /**
   * Alias for deleteMsgPort - used by AmigaDoorSession cleanup
   */
  deletePort(portAddr: number): void {
    this.deleteMsgPort(portAddr);
  }

  /**
   * Create a public named message port
   * This is a helper method for BBS to create ports that doors can find
   *
   * @param name - Port name (e.g., "AEDoorPort0")
   * @returns Port address
   */
  createPublicPort(
    name: string,
    ownerTask?: Task,
    forceSigBit?: number
  ): number {
debugLog(`[ExecLibrary] Creating public port: "${name}"`);

    // Create port using standard CreateMsgPort
    // Pass forceSigBit if specified (e.g., 12 for AEDoorPort to match door expectations)
    const portAddr = this.createMsgPort(ownerTask, forceSigBit);

    // Write name to port structure (ln_Name at offset 10) and registry entry
    const nameAddr = this.allocMem(name.length + 1, 0);
    this.emulator.writeString(nameAddr, name);
    this.emulator.writeMemory32(portAddr + 10, nameAddr);
    const port = this.messagePorts.get(portAddr);
    if (port) {
      port.name = name;
      this.messagePorts.set(portAddr, port);
    }

    // Add to public registry
    this.registerPublicPort(name, portAddr);

debugLog(
      `[ExecLibrary]   Public port "${name}" created at 0x${portAddr.toString(
        16
      )}`
    );
    return portAddr;
  }

  ensurePublicPort(name: string, forceSigBit?: number): number {
    const existing = this.publicPorts.get(name.toLowerCase());
    if (existing !== undefined) {
      return existing;
    }
    return this.createPublicPort(name, undefined, forceSigBit);
  }

  /**
   * Create AEDoorPort for XIM door communication.
   *
   * CRITICAL: This port MUST be owned by the Door Task (not the BBS task).
   * When BBS sends message via PutMsg(), it Signal()s the door task to wake it up.
   * Using bbsTask signals wrong task causing doors to hang.
   *
   * Also uses sigBit=12 because doors hardcode this in their Wait() mask (0x11000).
   *
   * @param name - Port name (e.g., "AEDoorPort1")
   * @returns Port address
   */
  createAEDoorPort(name: string): number {
    const existing = this.publicPorts.get(name.toLowerCase());
    if (existing !== undefined) {
debugLog(
        `[ExecLibrary] AEDoorPort "${name}" already exists at 0x${existing.toString(
          16
        )}`
      );
      return existing;
    }

    // CRITICAL: Use sigBit=12 because doors hardcode 0x1000 in [a5+0x14]
    // and Wait for 0x11000 = bit 16 (reply) | bit 12 (AEDoorPort)
    const AEDOORPORT_SIGBIT = 12;

    // CRITICAL FIX (Jan 4): Create AEDoorPort with Door Task as owner
    // When BBS sends message via PutMsg(), it Signal()s the door task to wake it up.
    // Previous code used bbsTask which signaled wrong task causing doors to hang.
    // Door must be signaled when messages arrive so Wait() returns.
    // See commit d789b75cd - this was accidentally reverted by a0d0dfb92 refactor
    const portAddr = this.createPublicPort(
      name,
      this.currentTask,  // Door task, not BBS task
      AEDOORPORT_SIGBIT
    );

debugLog(
      `[ExecLibrary] Created AEDoorPort "${name}" at 0x${portAddr.toString(
        16
      )} ` +
        `(sigBit=${AEDOORPORT_SIGBIT}, owner=Door Task 0x${this.currentTask.address.toString(
          16
        )})`
    );

    return portAddr;
  }

  /**
   * Create a lightweight public port for FindPort lookup only.
   * Unlike createPublicPort(), this does NOT allocate a signal bit.
   * Use for bulk port creation like AEServer.0-254 where we don't need signaling.
   *
   * @param name - Port name (e.g., "AEServer.0")
   * @returns Port address
   */
  createLightweightPort(name: string): number {
    // CRITICAL FIX: Allocate 512 bytes (0x200) for MsgPort extended structure
    // Amixlib doors (like GetAnswer) access offsets up to 0x147 (327 bytes) from port base.
    // Standard MsgPort is only 34 bytes, but doors expect extended data area after it.
    // Example: GetAnswer reads from AEDoorPort + 0x147 for user data.
    // Zero-filling prevents garbage characters appearing in door output.
    const portAddr = this.allocMem(512, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
    if (!portAddr) {
console.error(
        `[ExecLibrary] Failed to allocate memory for lightweight port "${name}"`
      );
      return 0;
    }

    // Allocate name string
    const nameAddr = this.allocMem(name.length + 1, 0);
    this.emulator.writeString(nameAddr, name);

    // Write minimal MsgPort structure
    this.emulator.writeMemory32(portAddr + 0, 0); // ln_Succ
    this.emulator.writeMemory32(portAddr + 4, 0); // ln_Pred
    this.emulator.writeMemory(portAddr + 8, 4); // ln_Type = NT_MSGPORT
    this.emulator.writeMemory(portAddr + 9, 0); // ln_Pri
    this.emulator.writeMemory32(portAddr + 10, nameAddr); // ln_Name
    this.emulator.writeMemory(portAddr + 14, 0); // mp_Flags = PA_IGNORE (no signaling)
    this.emulator.writeMemory(portAddr + 15, 0); // mp_SigBit = 0 (unused)
    this.emulator.writeMemory32(portAddr + 16, 0); // mp_SigTask = NULL (no task)

    // Initialize empty message list
    this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head -> lh_Tail
    this.emulator.writeMemory32(portAddr + 24, 0); // lh_Tail
    this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred -> lh_Head
    this.emulator.writeMemory(portAddr + 32, 0); // lh_Type
    this.emulator.writeMemory(portAddr + 33, 0); // l_pad

    // Register in public ports (for FindPort lookup)
    this.registerPublicPort(name, portAddr);

    // Also add to messagePorts map for PutMsg/GetMsg
    this.messagePorts.set(portAddr, {
      address: portAddr,
      name: name,
      messages: [],
      sigBit: 0,
      sigTask: 0,
      signaled: false,
    });

    return portAddr;
  }

  /**
   * PutMsg() - LVO -366 (0xFFFFFE72)
   *
   * Send a message to a port.
   *
   * Parameters:
   *   A0 = MsgPort pointer
   *   A1 = Message pointer
   *
   * Returns:
   *   Nothing
   *
   * The message is queued on the port's message list and the port's task
   * is signaled (if PA_SIGNAL flag set).
   */
  putMsg(
    portAddr: number,
    msgAddr: number,
    options?: { suppressDoorCallback?: boolean }
  ): void {
    const suppressDoorCallback = options?.suppressDoorCallback ?? false;

debugLog(
      `[ExecLibrary] PutMsg(port=0x${portAddr.toString(
        16
      )}, msg=0x${msgAddr.toString(16)})`
    );

    // DEBUG: Trace message content when sending to AEDoorPort to find spurious JH_LI source
    // This helps debug GetAnswer "D" prefix issue
    const pc = this.emulator.getRegister(16); // Program counter
    const portName = this.messagePorts.get(portAddr)?.name || '';
    const originalPortAddr = portAddr;
    let port: MessagePort | undefined = this.messagePorts.get(portAddr);

    if (!port) {
console.warn(
        `[ExecLibrary]   Port 0x${portAddr.toString(
          16
        )} not tracked - attempting auto-registration`
      );
      const autoPort = this.autoRegisterPort(portAddr);
      if (autoPort) {
        port = autoPort;
      }
    }
    if (!port) {
console.error(
        `[ExecLibrary]   Port not found: 0x${portAddr.toString(16)}`
      );
      return;
    }

    // If door is sending a message (not suppressed), clear from repliedMessages
    // This handles when door reuses a message buffer for a new command
debugLog(`[ExecLibrary][PutMsg] DEBUG: suppressDoorCallback=${suppressDoorCallback}, has(0x${msgAddr.toString(16)})=${this.repliedMessages.has(msgAddr)}, repliedMessages.size=${this.repliedMessages.size}`);
    if (!suppressDoorCallback && this.repliedMessages.has(msgAddr)) {
debugLog(
        `[ExecLibrary][PutMsg] Door reusing replied message 0x${msgAddr.toString(
          16
        )} - clearing from repliedMessages`
      );
      this.repliedMessages.delete(msgAddr);
    }

debugLog(
      `[ExecLibrary][PutMsg] port=0x${portAddr.toString(16)} name=${
        port.name ?? "<unnamed>"
      } msg=0x${msgAddr.toString(16)} suppress=${
        suppressDoorCallback ? "yes" : "no"
      }`
    );

    // Avoid rerouting so the door's chosen port is honored.

    // CRITICAL FIX: Do NOT set message type here!
    // The caller (door code or ReplyMsg) must set the appropriate type:
    // - NT_MESSAGE (5) for new messages sent via PutMsg
    // - NT_REPLYMSG (6) for replies sent via ReplyMsg
    // putMsg() should only deliver the message, not modify its type.
    //
    // Bug was: ReplyMsg set NT_REPLYMSG, then putMsg overwrote it to NT_MESSAGE,
    // causing doors to misinterpret replies as new messages and crash.

    // Add message to port's queue
    port.messages.push(msgAddr);
    port.signaled = true;

    // CRITICAL FIX 2026-01-08: Use AddTail() for FIFO message ordering!
    // MsgPort.mp_MsgList is a doubly-linked list starting at offset 20
    // PutMsg() adds to TAIL, GetMsg() removes from HEAD = FIFO (first-in-first-out)
    // Bug was: using AddHead() caused LIFO ordering - INIT sent first but STAT received first
    const msgListAddr = portAddr + 20; // mp_MsgList offset
    this.addTail(msgListAddr, msgAddr);

debugLog(`[ExecLibrary]   ✓ Message added to port list via AddTail()`);
debugLog(
      `[ExecLibrary]   Port now has ${port.messages.length} message(s) in queue`
    );

    // *** CRITICAL: Signal the port's task (if PA_SIGNAL flag set) ***
    // This is the missing piece! The door is waiting for this signal.
    const PA_SIGNAL = 0x02;
    let mp_Flags = this.emulator.readMemory(portAddr + 14);

    // CRITICAL FIX 2026-01-07: If this port was created via createLightweightPort
    // (mp_Flags=0, no PA_SIGNAL), but it's being used as a reply port, upgrade it!
    // Door reply ports MUST have PA_SIGNAL or the door stays stuck in Wait().
    if ((mp_Flags & PA_SIGNAL) === 0) {
      // This port has no PA_SIGNAL - check if it needs it
      const needsSignaling = port.sigTask !== 0 || suppressDoorCallback;
      if (needsSignaling) {
debugLog(
          `[ExecLibrary]   UPGRADING lightweight port "${port.name}" to signaling port`
        );
        mp_Flags = mp_Flags | PA_SIGNAL;
        this.emulator.writeMemory(portAddr + 14, mp_Flags);

        // Also ensure sigTask and sigBit are set
        if (port.sigTask === 0) {
          port.sigTask = this.currentTask.address;
          this.emulator.writeMemory32(portAddr + 16, port.sigTask);
        }

        // CRITICAL FIX 2026-01-07: READ the existing sigBit from port memory!
        // The native 68K code already called AllocSignal() and wrote it to mp_SigBit.
        // If we allocate a NEW bit, Wait() will be waiting for the old bit but
        // Signal() will signal the new bit - they won't match and door hangs!
        const existingSigBit = this.emulator.readMemory(portAddr + 15);
        if (existingSigBit > 0 && existingSigBit <= 31) {
          // Port already has a valid signal bit - use it!
          port.sigBit = existingSigBit;
debugLog(
            `[ExecLibrary]   Using existing sigBit ${existingSigBit} from port structure`
          );
        } else if (port.sigBit === 0) {
          // No valid signal bit - allocate one
          port.sigBit = this.AllocSignal(-1);
          if (port.sigBit < 0 || port.sigBit > 31) {
            port.sigBit = 1;
          }
          this.emulator.writeMemory(portAddr + 15, port.sigBit);
        }
      }
    }

    if (mp_Flags & PA_SIGNAL) {
debugLog(`[ExecLibrary]   Port has PA_SIGNAL flag - signaling task`);
debugLog(
        `[ExecLibrary]   Port sigTask: 0x${port.sigTask.toString(
          16
        )}, sigBit: ${port.sigBit}`
      );

      // CRITICAL FIX 2026-01-20: Port has PA_SIGNAL but sigTask=0!
      // This happens with AquaScan doors - they set PA_SIGNAL but don't set sigTask.
      // Auto-fix by setting sigTask to currentTask (the door waiting for the message).
      if (port.sigTask === 0) {
console.warn(`[ExecLibrary]   WARNING: Port has PA_SIGNAL but no sigTask - auto-fixing to currentTask`);
        port.sigTask = this.currentTask.address;
        this.emulator.writeMemory32(portAddr + 16, port.sigTask);

        // Also ensure sigBit is set
        const existingSigBit = this.emulator.readMemory(portAddr + 15);
        if (existingSigBit > 0 && existingSigBit <= 31) {
          port.sigBit = existingSigBit;
debugLog(`[ExecLibrary]   Using existing sigBit ${existingSigBit} from port`);
        } else if (port.sigBit === 0) {
          port.sigBit = this.AllocSignal(-1);
          if (port.sigBit < 0 || port.sigBit > 31) {
            port.sigBit = 1;
          }
          this.emulator.writeMemory(portAddr + 15, port.sigBit);
debugLog(`[ExecLibrary]   Allocated new sigBit ${port.sigBit}`);
        }
      }

      // Signal the task that owns this port
      if (port.sigTask !== 0) {
        const signalMask = 1 << port.sigBit; // Convert bit number to mask
debugLog(
          `[ExecLibrary]   *** Calling Signal() to wake waiting task ***`
        );
        this.signal(port.sigTask, signalMask);
      } else {
console.error(`[ExecLibrary]   ERROR: Port has PA_SIGNAL but still no sigTask after auto-fix!`);
      }
    } else {
debugLog(
        `[ExecLibrary]   Port does not have PA_SIGNAL flag (no task to signal)`
      );
    }

    // If this is an AEDoorPort, invoke callback for trap-based message processing
    // ONLY invoke for messages TO AEDoorPort (name check), not reply ports
    const isAEDoorPort = port.name?.toLowerCase().startsWith("aedoorport");
    // FIM protocol (FAME BBS doors): PutMsg to FAMEDoorPort<node> routes to
    // FIMProtocol.handleMessage via fimMessageCallback (AmigaDoorSession).
    const isFimPort = port.name?.toLowerCase().startsWith("famedoorport");
    const isDoorTaskPort = originalPortAddr === this.currentTask.msgPort;
    const isDoorReplyPort = port.name
      ?.toLowerCase()
      .startsWith("doorreplyport");
    // express.e doors that bypass aedoor.library (e.g. WarOLM's table-render
    // path) FindPort("AEServer.%d") + PutMsg directly to THIS node's server
    // port. Without invoking the callback here, the message sits in the port
    // queue forever and DT_NAME / DT_LOCATION never reach the XIM handler.
    const isOwnServerPort =
      this.doorPortAddr !== 0 && originalPortAddr === this.doorPortAddr;
    // Multi-node pollers (WarOLM, MultiTop) walk FindPort("AEServer.%d")
    // across every node. For non-current AEServer.<N> we can't answer with
    // that other node's user data, but the door-side callback must still
    // run so it can zero-out the string buffer and reply — otherwise the
    // door's GetMsg returns NULL, clobbers its saved msg-pointer, and the
    // next iteration sends msg=0 and eventually bails.
    const isAEServerPort =
      port.name?.toLowerCase().startsWith("aeserver.") === true;
    if (
      !suppressDoorCallback &&
      this.doorMessageCallback &&
      (isAEDoorPort ||
        isDoorTaskPort ||
        isDoorReplyPort ||
        isOwnServerPort ||
        isAEServerPort)
    ) {
      const label = isAEDoorPort
        ? port.name ?? "AEDoorPort"
        : isOwnServerPort || isAEServerPort
        ? port.name ?? "AEServer"
        : "Door Task Port";
debugLog(
        `[ExecLibrary]   *** Invoking door message callback for port 0x${originalPortAddr.toString(
          16
        )} (${label}) ***`
      );
      this.doorMessageCallback(originalPortAddr, msgAddr);
    }

    // If this is a FAMEDoorPort, invoke the FIM protocol callback.
    if (!suppressDoorCallback && isFimPort && this.fimMessageCallback) {
debugLog(
        `[ExecLibrary]   *** Invoking FIM message callback for port 0x${originalPortAddr.toString(
          16
        )} (${port.name ?? "FAMEDoorPort"}) ***`
      );
      this.fimMessageCallback(msgAddr);
    }
  }

  /**
   * GetMsg() - LVO -372 (0xFFFFFE6C)
   *
   * Get a message from a port.
   *
   * Parameters:
   *   A0 = MsgPort pointer
   *
   * Returns:
   *   D0 = Message pointer (0 if no messages)
   *
   * Removes and returns the first message from the port's queue.
   *
   * Options:
   *   skipReplies: If true, skip NT_REPLYMSG messages (leave them for door to get)
   */
  // Track the actual AEDoorPort address from door's GetMsg calls
  // This captures the door's OWN port, not the one we pre-created
  private lastAEDoorPortAddr: number = 0;

  /**
   * Get the actual AEDoorPort address that the door is polling.
   * This is more reliable than findPort because it captures the door's OWN port.
   */
  getActualDoorPort(): number {
    return this.lastAEDoorPortAddr;
  }

  getMsg(portAddr: number, options?: { skipReplies?: boolean }): number {
    // File-based debug logging
    this.logExecDebug(
      `GetMsg called: port=0x${portAddr.toString(16)} skipReplies=${
        options?.skipReplies || false
      }`
    );
debugLog(`[ExecLibrary] >>> GetMsg(port=0x${portAddr.toString(16)})`);

    const port = this.messagePorts.get(portAddr);
    if (!port) {
      this.logExecDebug(`GetMsg: Port NOT FOUND 0x${portAddr.toString(16)}`);
console.error(
        `[ExecLibrary]   Port not found: 0x${portAddr.toString(16)}`
      );
      return 0;
    }

    // CRITICAL: Track actual AEDoorPort address from door's GetMsg calls
    // The door creates its own AEDoorPort which may have a different address
    // than the one we pre-created. We need to inject messages to the door's port.
    if (port.name.toLowerCase().startsWith('aedoorport') && this.lastAEDoorPortAddr !== portAddr) {
      this.lastAEDoorPortAddr = portAddr;
console.log(`[ExecLibrary] CAPTURED actual AEDoorPort address: 0x${portAddr.toString(16)} (port="${port.name}")`);
    }

    this.logExecDebug(
      `GetMsg: port="${port.name}" has ${port.messages.length} messages`
    );

    // Check if port has messages
    if (port.messages.length === 0) {
      this.logExecDebug(`GetMsg: No messages, returning 0`);
debugLog(`[ExecLibrary]   No messages in port`);
      // Set flag to trigger XIM polling - doors may be waiting for BBS reply while polling GetMsg
      // This is critical for XIM doors that poll GetMsg instead of using Wait()
      this.needsXIMPoll = true;
      debugLog(`[ExecLibrary]   SET needsXIMPoll=true (instance=${this.instanceId})`);
      return 0;
    }

    // DEBUG: We have messages - trace the code path
    this.logExecDebug(`GetMsg: PASSED messages check, messages.length=${port.messages.length}, skipReplies=${options?.skipReplies}`);

    // If skipReplies option is set, only return messages WE didn't put there via ReplyMsg
    // We track replied messages in repliedMessages set
    if (options?.skipReplies) {
      for (let i = 0; i < port.messages.length; i++) {
        const msgAddr = port.messages[i];
        // Check if this message was placed by our ReplyMsg (tracked in repliedMessages)
        if (!this.repliedMessages.has(msgAddr)) {
          // This is a new message from the door, not a reply we sent
          port.messages.splice(i, 1);
debugLog(
            `[ExecLibrary]   Returning door message at 0x${msgAddr.toString(
              16
            )} (skipped ${i} replies), ${port.messages.length} remaining`
          );
          this.protectReturnedMessage(
            msgAddr,
            `GetMsg port=0x${portAddr.toString(16)}`
          );
          if (port.messages.length === 0) {
            port.signaled = false;
          }
          return msgAddr;
        }
      }
      // All messages are our replies, return 0
debugLog(
        `[ExecLibrary]   No door messages in port (${port.messages.length} replies waiting for door)`
      );
      // Set flag to trigger XIM polling - door is waiting for reply processing
      this.needsXIMPoll = true;
      return 0;
    }

    // DEBUG: Reached normal path (skipReplies=false and has messages)
    this.logExecDebug(`GetMsg: Taking NORMAL path - calling remHead for port "${port.name}"`);

    // CRITICAL FIX 2026-01-07: Remove message from BOTH JavaScript array AND memory list!
    // We added via addHead() which updated memory, now we must remove from memory too
    const msgListAddr = portAddr + 20; // mp_MsgList offset
    const msgAddr = this.remHead(msgListAddr); // Remove from memory list

    // DEBUG: Log remHead result
    this.logExecDebug(`GetMsg: remHead returned 0x${msgAddr.toString(16)}`);

    // Also remove from JavaScript array for consistency
    const arrayIndex = port.messages.indexOf(msgAddr);
    if (arrayIndex !== -1) {
      port.messages.splice(arrayIndex, 1);
    }

debugLog(
      `[ExecLibrary]   Returned message 0x${msgAddr.toString(16)} via remHead(), ${
        port.messages.length
      } remaining`
    );
debugLog(
      `[ExecLibrary] GetMsg returning msg=0x${msgAddr.toString(16)} queueLen=${
        port.messages.length
      }`
    );
    if (this.repliedMessages.has(msgAddr)) {
      this.repliedMessages.delete(msgAddr);
    }
    this.protectReturnedMessage(
      msgAddr,
      `GetMsg port=0x${portAddr.toString(16)}`
    );

    // Clear signaled flag if no more messages
    if (port.messages.length === 0) {
      port.signaled = false;
    }

    return msgAddr;
  }

  /**
   * Remove a specific message from a port's queue
   * Used by PutMsg callback to remove the exact message that triggered the callback,
   * since getMsg returns HEAD (oldest) but callback receives newly added message (TAIL).
   */
  removeMessageFromPort(portAddr: number, msgAddr: number): boolean {
    const port = this.messagePorts.get(portAddr);
    if (!port) {
      return false;
    }

    const index = port.messages.indexOf(msgAddr);
    if (index !== -1) {
      port.messages.splice(index, 1);
      debugLog(`[ExecLibrary] removeMessageFromPort: removed 0x${msgAddr.toString(16)} from port 0x${portAddr.toString(16)}, ${port.messages.length} remaining`);

      // Also try to remove from memory linked list (best effort)
      // This ensures both JS array and memory stay in sync
      try {
        const msgListAddr = portAddr + 20; // mp_MsgList offset
        this.removeFromList(msgListAddr, msgAddr);
      } catch {
        // Ignore errors - JS array is already updated
      }

      if (port.messages.length === 0) {
        port.signaled = false;
      }
      return true;
    }
    return false;
  }

  /**
   * Remove a specific node from a list (helper for removeMessageFromPort)
   */
  private removeFromList(listAddr: number, nodeAddr: number): void {
    // Walk the list to find and unlink the node
    // List structure: lh_Head (4), lh_Tail (4), lh_TailPred (4)
    // Node structure: ln_Succ (4), ln_Pred (4), ...
    const head = this.emulator.readMemory32(listAddr);
    let current = head;
    let count = 0;
    const maxIter = 1000;

    while (current && current !== 0 && count < maxIter) {
      if (current === nodeAddr) {
        // Found it - unlink
        const succ = this.emulator.readMemory32(nodeAddr);
        const pred = this.emulator.readMemory32(nodeAddr + 4);
        if (pred) this.emulator.writeMemory32(pred, succ);
        if (succ) this.emulator.writeMemory32(succ + 4, pred);
        return;
      }
      current = this.emulator.readMemory32(current);
      count++;
    }
  }

  /**
   * WaitPort() - LVO -384 (0xFFFFFE80)
   *
   * Wait for a message to arrive at a port.
   *
   * Parameters:
   *   A0 = MsgPort pointer
   *
   * Returns:
   *   D0 = First message pointer (does not remove from queue)
   *
   * In real Amiga, this BLOCKS until a message arrives.
   * In our emulator, we can't block, so we return immediately.
   * If no messages, return 0 and door will loop/retry.
   */
  waitPort(portAddr: number): number {
    let port: MessagePort | undefined = this.messagePorts.get(portAddr);
    if (!port) {
debugLog(
        `[ExecLibrary] >>> WaitPort(port=0x${portAddr.toString(
          16
        )}) - not in registry, auto-registering`
      );
      const autoPort = this.autoRegisterPort(portAddr);
      if (autoPort) {
        port = autoPort;
      }
    }
    if (!port) {
console.error(
        `[ExecLibrary] WaitPort: Failed to register port at 0x${portAddr.toString(
          16
        )}`
      );
      return 0;
    }

    // Check if port has messages
    if (port.messages.length === 0) {
      // No message - would block on real Amiga, we return 0
      // Set flag to trigger XIM polling in execution loop - this is critical for doors
      // that use tight WaitPort loops (Bulls, FR) vs Wait() which pauses (AquaScan)
      this.needsXIMPoll = true;
      return 0;
    }

    // MESSAGE FOUND! Return the head message without removing it.
    // Real WaitPort waits on the signal and returns the first message; GetMsg removes it.
    const msgAddr = port.messages[0];
debugLog(
      `[ExecLibrary] WaitPort returning msg=0x${msgAddr.toString(
        16
      )} queueLen=${port.messages.length}`
    );
    // Clear signaled bit like Exec's Wait would do
    port.signaled = false;
debugLog(
      `[ExecLibrary] ===============================================`
    );
debugLog(`[ExecLibrary] *** WaitPort RETURNS MESSAGE! ***`);
debugLog(
      `[ExecLibrary] ===============================================`
    );
debugLog(`[ExecLibrary]   Port: 0x${portAddr.toString(16)}`);
debugLog(`[ExecLibrary]   Message: 0x${msgAddr.toString(16)}`);
debugLog(`[ExecLibrary]   Queue length: ${port.messages.length}`);
debugLog(
      `[ExecLibrary] ===============================================`
    );
    this.protectReturnedMessage(
      msgAddr,
      `WaitPort port=0x${portAddr.toString(16)}`
    );
    return msgAddr;
  }

  /**
   * Seed a Workbench-style WBStartup message into the current task's pr_MsgPort.
   * Some doors launched without a CLI (pr_CLI==0) expect to fetch this message
   * via GetMsg() to discover their arguments and environment.
   */
  seedWorkbenchStartup(programName: string, args: string[]): number {
    const MEMF_CLEAR = 1 << 16;
    const portAddr = this.currentTask.msgPort;
    const msgSize = 0x28; // sizeof(struct WBStartup) with message header

    const msgAddr = this.allocMem(msgSize, MEMF_CLEAR);
    if (msgAddr === 0) {
console.warn(
        "[ExecLibrary] seedWorkbenchStartup: failed to allocate startup message"
      );
      return 0;
    }

    // Message header (struct Message)
    this.emulator.writeMemory32(msgAddr + 0x00, 0); // ln_Succ
    this.emulator.writeMemory32(msgAddr + 0x04, 0); // ln_Pred
    this.emulator.writeMemory(msgAddr + 0x08, 5); // ln_Type = NT_MESSAGE
    this.emulator.writeMemory(msgAddr + 0x09, 0); // ln_Pri
    this.emulator.writeMemory32(msgAddr + 0x0a, 0); // ln_Name
    this.emulator.writeMemory32(msgAddr + 0x0e, portAddr); // mn_ReplyPort
    this.emulator.writeMemory16(msgAddr + 0x12, msgSize); // mn_Length

    // Build ArgList (struct WBArg { BPTR wa_Lock; STRPTR wa_Name; })
    const safeArgs = args && args.length > 0 ? args : [programName];
    const argListAddr = this.allocMem(safeArgs.length * 8 || 8, MEMF_CLEAR);
    if (argListAddr === 0) {
console.warn(
        "[ExecLibrary] seedWorkbenchStartup: failed to allocate ArgList"
      );
      return msgAddr;
    }

    safeArgs.forEach((arg, idx) => {
      const strAddr = this.allocMem(arg.length + 1, MEMF_CLEAR);
      if (strAddr === 0) {
        return;
      }
      for (let i = 0; i < arg.length; i++) {
        this.emulator.writeMemory(strAddr + i, arg.charCodeAt(i));
      }
      this.emulator.writeMemory(strAddr + arg.length, 0);

      const entryAddr = argListAddr + idx * 8;
      this.emulator.writeMemory32(entryAddr + 0, 0); // wa_Lock (BPTR), leave NULL
      this.emulator.writeMemory32(entryAddr + 4, strAddr); // wa_Name
    });

    // WBStartup payload
    this.emulator.writeMemory32(msgAddr + 0x14, portAddr); // sm_Process (reply task port)
    this.emulator.writeMemory32(msgAddr + 0x18, 0); // sm_Segment (unused)
    this.emulator.writeMemory32(msgAddr + 0x1c, safeArgs.length); // sm_NumArgs
    this.emulator.writeMemory32(msgAddr + 0x20, 0); // sm_ToolWindow
    this.emulator.writeMemory32(msgAddr + 0x24, argListAddr); // sm_ArgList

    this.putMsg(portAddr, msgAddr);
debugLog(
      `[ExecLibrary] Seeded WBStartup message 0x${msgAddr.toString(
        16
      )} -> pr_MsgPort=0x${portAddr.toString(16)} args=[${safeArgs.join(", ")}]`
    );
    return msgAddr;
  }

  /**
   * ReplyMsg() - LVO -378 (0xFFFFFE86)
   *
   * Reply a message back to its sender via the ReplyPort
   *
   * From E sources (express.e:1096, 4368, 4379):
   * - BBS calls ReplyMsg(doormsg) to respond to door
   * - Message is sent back to mn_ReplyPort
   * - Door receives via GetMsg() on its reply port
   *
   * Parameters:
   *   A1 = Message address
   */
  replyMsg(msgAddr: number): void {
    // File-based debug logging for visibility
    this.logExecDebug(`ReplyMsg called: msg=0x${msgAddr.toString(16)}`);

    // ReplyMsg(NULL): real exec.library faults; we silently no-op so
    // a daemon that conditionally zeroes A1 (e.g. AmiExpress RexxMast's
    // dispatch arm with no immediate reply) doesn't trick us into
    // reading bogus memory at address +14 and auto-registering a
    // garbage port. Without this guard the AREXX trace floods with
    // zero-msg autoRegisterPort entries that allocate the wrong
    // sigBit (16/17) for the daemon's master port (real sigBit 13),
    // and the daemon's Wait(0x6000) never wakes from timer.device.
    if (msgAddr === 0) {
debugLog(`[ExecLibrary] ReplyMsg(NULL) - ignoring (defensive)`);
      return;
    }

    // Read reply port from message header
    const replyPortAddr = this.emulator.readMemory32(msgAddr + 14);

    if (replyPortAddr === 0) {
      this.logExecDebug(`ReplyMsg: No reply port in message`);
debugLog(
        `[ExecLibrary] ReplyMsg: No reply port in message 0x${msgAddr.toString(
          16
        )}`
      );
      return;
    }

    this.logExecDebug(`ReplyMsg: replyPort=0x${replyPortAddr.toString(16)}`);

    if (!this.messagePorts.get(replyPortAddr)) {
      this.logExecDebug(`ReplyMsg: Auto-registering reply port`);
debugLog(
        `[ExecLibrary] ReplyMsg: Auto-registering reply port 0x${replyPortAddr.toString(
          16
        )}`
      );
      this.autoRegisterPort(replyPortAddr);
    }
    if (!this.messagePorts.get(replyPortAddr)) {
console.error(
        `[ExecLibrary] ReplyMsg: Unable to register reply port 0x${replyPortAddr.toString(
          16
        )}`
      );
      return;
    }

debugLog(
      `[ExecLibrary][ReplyMsg] msg=0x${msgAddr.toString(
        16
      )} replyPort=0x${replyPortAddr.toString(16)}`
    );

    // CRITICAL: Set message type to NT_REPLYMSG (6) as per autodocs
    // This distinguishes replies from new messages
    // Message.mn_Node.ln_Type is at offset 8
    const NT_REPLYMSG = 6;
    this.emulator.writeMemory(msgAddr + 8, NT_REPLYMSG);

    // CRITICAL FIX 2026-01-20: DO NOT overwrite mn_ReplyPort for native XIM doors!
    // Native AEDoor.library (from 1996 binary in Libs/) uses BIDIRECTIONAL communication
    // on AEDoorPort - the native code sets mn_ReplyPort correctly for its protocol.
    // Overwriting it breaks doors like FR (File Request) that use the native library.
    //
    // Original fix (2026-01-16) was for trapped/TIM doors that might call ReplyMsg incorrectly.
    // But native XIM doors know what they're doing - respect their mn_ReplyPort setting!
    // (If a trapped/TIM door is ever observed in an infinite reply loop, gate the
    // mn_ReplyPort overwrite on that door type rather than re-enabling it globally.)

    // Track replies so host-side polling can skip them on AEDoorPort.
    this.markMessageAsReplied(msgAddr);

    // Send message back to reply port via PutMsg
    console.log(`[ExecLibrary] replyMsg: Putting message 0x${msgAddr.toString(16)} to replyPort 0x${replyPortAddr.toString(16)}`);
    this.putMsg(replyPortAddr, msgAddr, { suppressDoorCallback: true });
    console.log(`[ExecLibrary] replyMsg: Message delivered to replyPort`);

    // NOTE: Doors should poll their own reply port for replies, not AEDoorPort.
    // The standard Exec message flow is:
    // 1. Door sends to AEDoorPort with mn_ReplyPort = door's reply port
    // 2. Express processes and calls ReplyMsg() which sends to door's reply port
    // 3. Door polls its reply port with GetMsg to receive the reply
    //
    // Earlier attempt to also copy to AEDoorPort was removed because:
    // - 68K trap logs showed door correctly polling its reply port (not AEDoorPort)
    // - Copies were being consumed by XIM polling instead of door's GetMsg
    // - Created message clutter without benefiting the door

debugLog(
      `[ExecLibrary] Reply sent to port 0x${replyPortAddr.toString(16)}`
    );
  }

  /**
   * Mark a message as replied (for tracking by host-side polling)
   * This is used by XIM I/O handler to track replies sent via PutMsg
   * so that getMsg with skipReplies option can skip them.
   */
  markMessageAsReplied(msgAddr: number): void {
    this.repliedMessages.add(msgAddr);
  }

  /**
   * Helper: Dump AEDoor message structure for debugging
   */
  private dumpAEDoorMessage(msgAddr: number): void {
    // struct Message (20 bytes)
    const mn_Node = this.emulator.readMemory32(msgAddr + 0);
    const mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
    const mn_Length = this.emulator.readMemory16(msgAddr + 18);

    // jhMessage structure: Message(20) + String[200](0x14) + Data(0xDC) + Command(0xE0)
    const command = this.emulator.readMemory32(msgAddr + 0xe0); // Command at offset 224
    const data = this.emulator.readMemory32(msgAddr + 0xdc); // Data at offset 220

    // Read string at offset 20 (0x14) - first 32 bytes
    let str = "";
    for (let i = 0; i < 32; i++) {
      const ch = this.emulator.readMemory(msgAddr + 0x14 + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

debugLog(`[ExecLibrary] AEDoor Message dump (jhMessage):`);
debugLog(`  mn_ReplyPort: 0x${mn_ReplyPort.toString(16)}`);
debugLog(`  mn_Length: ${mn_Length}`);
debugLog(`  Command (0xE0): ${command}`);
debugLog(`  Data (0xDC): ${data}`);
debugLog(`  String (0x14): "${str}"`);
  }

  /**
   * StackSwap() - LVO -732 (0xFFFFFD28)
   *
   * Swap stacks with a new stack structure. This allows C programs to use
   * a larger stack than the default.
   *
   * Parameters:
   *   A0 = StackSwapStruct pointer
   *
   * Structure:
   *   APTR stk_Lower    (offset 0)  - Lowest byte of new stack
   *   ULONG stk_Upper   (offset 4)  - Upper end of stack (size + Lower)
   *   APTR stk_Pointer  (offset 8)  - Stack pointer at switch point
   *
   * Returns:
   *   Nothing (void)
   *
   * The structure is modified in-place to contain the OLD stack values,
   * allowing restoration by calling StackSwap again with the same structure.
   */
  stackSwap(structAddr: number): void {
debugLog(`[ExecLibrary] StackSwap(struct=0x${structAddr.toString(16)})`);
    const callerPC = this.emulator.getRegister(CPURegister.PC);
debugLog(`[ExecLibrary]   Called from PC=0x${callerPC.toString(16)}`);
    const rawWords: string[] = [];
    for (let offset = 0; offset < 12; offset += 4) {
      const word = this.emulator.readMemory32(structAddr + offset);
      rawWords.push(`0x${word.toString(16)}`);
    }
debugLog(`[ExecLibrary]   Raw struct dump: [${rawWords.join(", ")}]`);

    // Per Amiga NDK docs: "This function will swap the stack of your task with
    // the given values in StackSwap. The StackSwapStruct structure will then
    // contain the values of the old stack such that the old stack can be restored."

    // Read NEW stack values from structure (what caller wants)
    const newLower = this.emulator.readMemory32(structAddr + 0);
    const newUpper = this.emulator.readMemory32(structAddr + 4);
    const newPointer = this.emulator.readMemory32(structAddr + 8);

    // Get OLD stack values (current state)
    const oldPointer = this.emulator.getRegister(15); // Current SP
    const oldLower = this.currentStackLower || newLower;
    const oldUpper = this.currentStackUpper || newUpper;

debugLog(
      `[ExecLibrary]   OLD: Lower=0x${oldLower.toString(
        16
      )}, Upper=0x${oldUpper.toString(16)}, SP=0x${oldPointer.toString(16)}`
    );
debugLog(
      `[ExecLibrary]   NEW: Lower=0x${newLower.toString(
        16
      )}, Upper=0x${newUpper.toString(16)}, SP=0x${newPointer.toString(16)}`
    );

    // Per AmigaOS docs: StackSwap is a symmetric operation
    // Structure is modified in-place with OLD values, allowing restoration
    // Trust the caller - they know their stack requirements

    // Write OLD values to structure
    this.emulator.writeMemory32(structAddr + 0, oldLower);
    this.emulator.writeMemory32(structAddr + 4, oldUpper);
    this.emulator.writeMemory32(structAddr + 8, oldPointer);

    // Set SP to NEW value requested by caller
    this.emulator.setRegister(15, newPointer);
    this.currentStackLower = newLower;
    this.currentStackUpper = newUpper;

debugLog(
      `[ExecLibrary]   Stack swapped! SP now 0x${newPointer.toString(16)}`
    );
  }

  /**
   * Wait() - Wait for one or more signals
   *
   * AmigaDOS function to block until signals are received.
   *
   * Parameters:
   *   D0 = Signal mask (bits to wait for)
   *
   * Returns:
   *   D0 = Signals received
   *
   * In real Amiga, this BLOCKS the calling task until one or more
   * of the specified signals are set by another task/interrupt.
   *
   * We cannot truly block the JS event loop, but we can avoid lying to the
   * caller. When no signals are present we mark the task as waiting and
   * return 0 so the door keeps polling without thinking a signal fired.
   */
  wait(signalMask: number): number {
debugLog(`[ExecLibrary] Wait(signalMask=0x${signalMask.toString(16)})`);
debugLog(
      `[ExecLibrary]   Current sigRecvd: 0x${this.currentTask.sigRecvd.toString(
        16
      )}`
    );

    if (signalMask === 0) {
debugLog("[ExecLibrary]   Wait(0) called, returning immediately");
      return 0;
    }

    const mask = signalMask >>> 0;

    // Check if any requested signals are already received
debugLog(
      `[ExecLibrary]   Wait: checking sigRecvd=0x${this.currentTask.sigRecvd.toString(
        16
      )} & mask=0x${mask.toString(16)}`
    );
    const receivedSignals = this.currentTask.sigRecvd & mask;
debugLog(
      `[ExecLibrary]   Wait: receivedSignals=0x${receivedSignals.toString(16)}`
    );

    if (receivedSignals !== 0) {
      // Signals already present - return immediately
debugLog(
        `[ExecLibrary]   *** Signals already received: 0x${receivedSignals.toString(
          16
        )} ***`
      );
debugLog(`[ExecLibrary]   Returning immediately (no need to wait)`);

      // Clear the returned signals from sigRecvd
      this.currentTask.sigRecvd &= ~receivedSignals;
debugLog(
        `[ExecLibrary]   Cleared signals from sigRecvd, new value: 0x${this.currentTask.sigRecvd.toString(
          16
        )}`
      );
      this.currentTask.sigWait = 0;
      this.currentTask.state = 0; // TS_READY

      return receivedSignals;
    }

    // No signals present - BLOCK the task until signals arrive
debugLog(`[ExecLibrary]   No signals present - BLOCKING task execution`);
debugLog(
      `[ExecLibrary]   Setting sigWait=0x${mask.toString(
        16
      )} (task is now waiting)`
    );

    this.currentTask.sigWait = mask;
    this.currentTask.state = 2; // TS_WAIT
    this.currentTask.isWaiting = true;

    // CRITICAL: Set blocking flag so handleTrap doesn't advance PC
    // This allows Wait() to be re-executed after Signal() wakes the door
    this.isWaitBlocking = true;

    // PAUSE emulator execution until Signal() resumes us
    // When Signal() is called:
    //   1. sigRecvd is set with the signals
    //   2. emulator.resume() is called
    //   3. handleTrap sees isWaitBlocking=true, pushes returnAddr back, keeps PC at trap
    //   4. Next iteration re-executes Wait() trap
    //   5. Wait() finds signals in sigRecvd and returns them
debugLog(
      "[ExecLibrary]   *** PAUSING EMULATOR - waiting for signals ***"
    );
debugLog(
      `[ExecLibrary]   sigWait=0x${mask.toString(
        16
      )} isWaiting=true - Signal() will wake us`
    );

    this.emulator.pause(() => {
debugLog(
        "[ExecLibrary]   *** RESUMED from Wait() - continuing execution ***"
      );
    });

    // Return 0 to indicate no signals yet - door will poll again after resume
    // Don't clear sigWait here - Signal() checks it to know we're waiting
debugLog(`[ExecLibrary]   Returning 0 (waiting for Signal)`);
    return 0;
  }

  /**
   * Signal() - Send signals to a task
   *
   * AmigaDOS function to set signal bits on a task, potentially
   * waking it up if it's Wait()ing.
   *
   * Parameters:
   *   A1 = Task address (or NULL for current task)
   *   D0 = Signal bits to set
   *
   * Returns:
   *   Nothing (void)
   *
   * Implementation:
   * 1. ORs signal bits into task's tc_SigRecvd field
   * 2. If task is waiting (sigWait != 0), checks for signal match
   * 3. If match found AND task is blocked, calls emulator.resume() to wake task
   * 4. Clears sigWait and sets task state to TS_READY
   */
  signal(taskAddr: number, signals: number): void {
debugLog(
      `[ExecLibrary] Signal(task=0x${taskAddr.toString(
        16
      )}, signals=0x${signals.toString(16)})`
    );

    // CRITICAL FIX: In single-task emulation, only signal currentTask (the door) if:
    // 1. taskAddr is 0 (meaning "current task")
    // 2. taskAddr matches currentTask.address (explicitly targeting the door)
    //
    // If taskAddr is different (e.g., BBS task 0x88000 for AEDoorPort), do NOT signal
    // the door. The BBS task is JavaScript code - doorMessageCallback handles it.
    //
    // Bug was: Door calls PutMsg(AEDoorPort) -> AEDoorPort.sigTask = BBS task (0x88000)
    // -> Signal(0x88000) was setting door's sigRecvd to 0x1000 -> Wait() returned
    // immediately with 0x1000 -> door thought AEDoorPort had message -> wrong code path
    if (taskAddr !== 0 && taskAddr !== this.currentTask.address) {
debugLog(
        `[ExecLibrary]   Signal to non-door task 0x${taskAddr.toString(
          16
        )} (BBS task) - skipping door signal`
      );
debugLog(
        `[ExecLibrary]   (Door task is 0x${this.currentTask.address.toString(
          16
        )}, BBS-side handlers will process)`
      );
      return; // Don't signal the door when target is BBS task
    }

debugLog(
      `[ExecLibrary]   Target task: 0x${this.currentTask.address.toString(
        16
      )} (${this.currentTask.name})`
    );
debugLog(
      `[ExecLibrary]   Signal bits to set: 0x${signals.toString(16)}`
    );
debugLog(
      `[ExecLibrary]   Current sigRecvd: 0x${this.currentTask.sigRecvd.toString(
        16
      )}`
    );

    // 1. OR signals into task's tc_SigRecvd field
    const oldSigRecvd = this.currentTask.sigRecvd;
    this.currentTask.sigRecvd |= signals;
    console.log(`[ExecLibrary] Signal APPLIED: sigRecvd 0x${oldSigRecvd.toString(16)} -> 0x${this.currentTask.sigRecvd.toString(16)}, sigWait=0x${this.currentTask.sigWait.toString(16)}, isWaiting=${this.currentTask.isWaiting}`);
debugLog(
      `[ExecLibrary]   sigRecvd: 0x${oldSigRecvd.toString(
        16
      )} -> 0x${this.currentTask.sigRecvd.toString(16)}`
    );
debugLog(
      `[ExecLibrary]   currentTask.sigWait: 0x${this.currentTask.sigWait.toString(
        16
      )}, isWaiting: ${this.currentTask.isWaiting}`
    );

    // 2. Check if task is waiting (sigWait != 0 means TS_WAIT)
    if (this.currentTask.sigWait !== 0) {
debugLog(
        `[ExecLibrary]   Task is waiting for signals: 0x${this.currentTask.sigWait.toString(
          16
        )}`
      );

      // 3. Check if any of the received signals match what task is waiting for
      const matchedSignals =
        this.currentTask.sigRecvd & this.currentTask.sigWait;
      if (matchedSignals !== 0) {
debugLog(
          `[ExecLibrary]   *** SIGNAL MATCH! Matched bits: 0x${matchedSignals.toString(
            16
          )} ***`
        );
debugLog(
          `[ExecLibrary]   *** RESUMING EMULATOR - waking task from Wait() ***`
        );

        // Wake the task if it's blocked in Wait()
        if (this.currentTask.isWaiting) {
          this.currentTask.isWaiting = false;

          // DON'T set D0 or clear sigRecvd here!
          // With the new blocking fix, Wait() will be re-executed after resume.
          // Wait() will find signals in sigRecvd, return them in D0, and clear them.
          // If we did it here, Wait() would see sigRecvd=0 and block again.
debugLog(
            `[ExecLibrary]   *** Wait() will re-execute and find signals in sigRecvd=0x${this.currentTask.sigRecvd.toString(16)} ***`
          );

          this.emulator.resume(); // RESUME emulator execution
        }

        this.currentTask.sigWait = 0;
        this.currentTask.state = 0; // TS_READY
      } else {
debugLog(`[ExecLibrary]   No match yet - task still waiting`);
      }
    } else {
debugLog(
        `[ExecLibrary]   Task not waiting (will receive signal when it calls Wait())`
      );
    }

debugLog(`[ExecLibrary]   Signal operation complete`);
  }

  // ============================================================================
  // PHASE 3: CRITICAL EXEC FUNCTIONS FOR DOOR SUPPORT
  // ============================================================================

  // Forbid nesting counter
  private forbidNest: number = 0;

  /**
   * Forbid - Forbid task rescheduling
   *
   * Prevents other tasks from being scheduled to run by the dispatcher.
   * Calls nest - must call Permit() once for each Forbid().
   * In single-task emulation, this is essentially a no-op but we track nesting.
   */
  forbid(): void {
    this.forbidNest++;
debugLog(`[ExecLibrary] Forbid() - nest level now: ${this.forbidNest}`);
  }

  /**
   * Permit - Permit task rescheduling
   *
   * Allows other tasks to be scheduled after a matching Forbid().
   * Must call exactly once for each Forbid().
   */
  permit(): void {
    if (this.forbidNest > 0) {
      this.forbidNest--;
    }
debugLog(`[ExecLibrary] Permit() - nest level now: ${this.forbidNest}`);
  }

  private registerPublicPort(name: string, portAddr: number): void {
    const normalized = name.toLowerCase();
    this.publicPorts.set(normalized, portAddr);

    const portEntry = this.messagePorts.get(portAddr);
    if (portEntry) {
      portEntry.name = name;
    }

    this.addPortToExecList(portAddr);

    const listAddr = this.getPortListAddr();
    const headPtr = this.emulator.readMemory32(listAddr);
    const tailPred = this.emulator.readMemory32(listAddr + 8);
debugLog(
      `[ExecLibrary]   PortList head=0x${headPtr.toString(
        16
      )} tailPred=0x${tailPred.toString(16)}`
    );
  }

  private getPortListAddr(): number {
    return this.execBase.address + this.PORT_LIST_OFFSET;
  }

  private initializeExecList(listAddr: number): void {
    this.emulator.writeMemory32(listAddr + 0, 0); // lh_Head
    this.emulator.writeMemory32(listAddr + 4, 0); // lh_Tail (= NULL sentinel)
    this.emulator.writeMemory32(listAddr + 8, 0); // lh_TailPred (last node)
    this.emulator.writeMemory(listAddr + 12, 0); // lh_Type
    this.emulator.writeMemory(listAddr + 13, 0); // l_pad
  }

  private addPortToExecList(portAddr: number): void {
    if (portAddr === 0 || this.portsInExecList.has(portAddr)) return;
    const listAddr = this.getPortListAddr();
    const headAddr = listAddr + 0;
    const tailPredAddr = listAddr + 8;

    const currentHead = this.emulator.readMemory32(headAddr);

    if (currentHead === 0) {
      // First node in list
      this.emulator.writeMemory32(portAddr + 0, 0); // ln_Succ
      this.emulator.writeMemory32(portAddr + 4, 0); // ln_Pred
      this.emulator.writeMemory32(headAddr, portAddr); // lh_Head
      this.emulator.writeMemory32(tailPredAddr, portAddr);
    } else {
      // Insert at head
      this.emulator.writeMemory32(portAddr + 0, currentHead);
      this.emulator.writeMemory32(portAddr + 4, 0);
      this.emulator.writeMemory32(currentHead + 4, portAddr);
      this.emulator.writeMemory32(headAddr, portAddr);
    }
    this.portsInExecList.add(portAddr);
  }

  // Public wrapper for the RemPort LVO (-360) vector. AmigaOS spec:
  // unlink the port from ExecBase->PortList (no FreeSignal, no FreeMem
  // — DeletePort() is the wrapper that does the full teardown).
  // Membership-guarded: if the port isn't tracked, this is a no-op
  // rather than a list-corrupting write through bogus succ/pred bytes.
  public remPort(portAddr: number): void {
    if (portAddr === 0 || !this.portsInExecList.has(portAddr)) {
debugLog(
        `[ExecLibrary] RemPort(0x${portAddr.toString(16)}) — not in PortList, ignoring`,
      );
      return;
    }
    this.removePortFromExecList(portAddr);
  }

  private removePortFromExecList(portAddr: number): void {
    const listAddr = this.getPortListAddr();
    const headAddr = listAddr + 0;
    const tailPredAddr = listAddr + 8;

    const succ = this.emulator.readMemory32(portAddr + 0);
    const pred = this.emulator.readMemory32(portAddr + 4);

    if (pred === 0) {
      this.emulator.writeMemory32(headAddr, succ);
    } else {
      this.emulator.writeMemory32(pred + 0, succ);
    }

    if (succ !== 0) {
      this.emulator.writeMemory32(succ + 4, pred);
    } else {
      this.emulator.writeMemory32(tailPredAddr, pred);
    }

    if (this.emulator.readMemory32(headAddr) === 0) {
      this.emulator.writeMemory32(tailPredAddr, 0);
    }
    this.portsInExecList.delete(portAddr);

    const headPtr = this.emulator.readMemory32(headAddr);
    const newTailPred = this.emulator.readMemory32(tailPredAddr);
debugLog(
      `[ExecLibrary]   PortList updated: head=0x${headPtr.toString(
        16
      )} tailPred=0x${newTailPred.toString(16)}`
    );
  }

  // Public wrapper for the FreeSignal LVO (-336) vector. Returns the
  // signal bit to the allocation pool. Safe even if the bit isn't
  // currently allocated (no-op in that case — matches AmigaOS, which
  // ANDs the signal mask without error).
  public freeSignalPublic(signalBit: number): void {
    this.freeSignal(signalBit);
  }

  /**
   * RawDoFmt - Format string with callback (Exec)
   * A0 = format string, A1 = argv pointer, A2 = putch func (ignored here), A3 = putch data (STRPTR*)
   *
   * We emulate Exec's behavior: if a putch callback is supplied, call it per
   * character with D0=char and A3=putData. Otherwise, fall back to the common
   * RawPutChar(bufferPtrPtr) pattern by writing into *(A3) and advancing it.
   */
  rawDoFmt(): number {
    const fmtPtr = this.emulator.getRegister(CPURegister.A0);
    const argvAddr = this.emulator.getRegister(CPURegister.A1);
    const putChFunc = this.emulator.getRegister(CPURegister.A2);
    const putChDataPtr = this.emulator.getRegister(CPURegister.A3);

    const fmt = this.emulator.readString(fmtPtr);
    this.rawDoFmtCount++;
    const formatted = this.formatRawString(fmt, argvAddr);
    if (this.rawDoFmtCount <= 5) {
      // Show what string the %s is reading
      const strPtr = fmt.includes("%s")
        ? this.emulator.readMemory32(argvAddr)
        : 0;
      const strVal = strPtr
        ? this.emulator.readString(strPtr).substring(0, 40)
        : "";
debugLog(
        `[ExecLibrary] RawDoFmt #${this.rawDoFmtCount} fmt="${fmt.substring(
          0,
          30
        )}" A3=0x${putChDataPtr.toString(16)} strPtr=0x${strPtr.toString(
          16
        )} strVal="${strVal}"`
      );
    }

    // If a putch callback is provided, invoke it directly with D0=char and A3=putData.
    // Track A3 across callbacks - callbacks often use move.b d0,(a3)+ to write and increment.
    // Without tracking, the output buffer stays at the same position forever.
    if (putChFunc !== 0) {
      const baseState = this.captureCpuState();
      const returnStub = this.ensureRawDoFmtReturnStub();
      let trackedA3 = putChDataPtr; // Start with initial A3 value

      for (let i = 0; i < formatted.length; i++) {
        trackedA3 = this.invokePutChCallback(
          putChFunc,
          trackedA3, // Use tracked A3 that may have been incremented by callback
          formatted.charCodeAt(i) & 0xff,
          baseState,
          returnStub
        );
      }

      // Write null terminator if the callback was incrementing a pointer
      if (trackedA3 !== putChDataPtr) {
        this.emulator.writeMemory(trackedA3, 0);
      }

      return 0;
    }

    // Honor RawPutChar(bufferPtrPtr) usage when no callback is provided.
    let outPtr = 0;
    let shouldAdvancePointer = false;

    if (putChDataPtr !== 0) {
      const pointed = this.emulator.readMemory32(putChDataPtr);
      if (pointed !== 0) {
        outPtr = pointed;
        shouldAdvancePointer = true;
      }
    }

    if (outPtr === 0) {
      if (this.rawDoFmtScratchPtr === 0) {
        // Allocate a small scratch buffer once (4KB, cleared)
        this.rawDoFmtScratchPtr = this.allocMem(4096, 1 << 16);
      }
      outPtr = this.rawDoFmtScratchPtr;
    }

    for (let i = 0; i < formatted.length; i++) {
      this.emulator.writeMemory(outPtr++, formatted.charCodeAt(i) & 0xff);
    }
    this.emulator.writeMemory(outPtr, 0);
    if (shouldAdvancePointer) {
      this.emulator.writeMemory32(putChDataPtr, outPtr);
    }
    return 0;
  }

  private captureCpuState(): number[] {
    const regs: number[] = [];
    for (let i = CPURegister.D0; i <= CPURegister.SR; i++) {
      regs[i] = this.emulator.getRegister(i as CPURegister);
    }
    return regs;
  }

  private restoreCpuState(regs: number[]): void {
    for (let i = CPURegister.D0; i <= CPURegister.SR; i++) {
      this.emulator.setRegister(i as CPURegister, regs[i]);
    }
    this.emulator.refillPrefetch();
  }

  private ensureRawDoFmtReturnStub(): number {
    if (this.rawDoFmtReturnStub === 0) {
      this.rawDoFmtReturnStub = 0x001fe000; // Scratch area below exit trap
      this.emulator.writeMemory16(this.rawDoFmtReturnStub, 0x4e75); // RTS
    }
    return this.rawDoFmtReturnStub;
  }

  private invokePutChCallback(
    funcAddr: number,
    putChDataPtr: number,
    charCode: number,
    baseState: number[],
    returnStub: number
  ): number {
    // Start from the captured state for each invocation to avoid drift.
    this.restoreCpuState(baseState);

    // Set up call frame
    const spBefore = this.emulator.getRegister(CPURegister.A7) >>> 0;
    const newSp = (spBefore - 4) >>> 0;
    this.emulator.writeMemory32(newSp, returnStub);
    this.emulator.setRegister(CPURegister.A7, newSp);
    this.emulator.setRegister(CPURegister.D0, charCode & 0xff);
    this.emulator.setRegister(CPURegister.A3, putChDataPtr);
    this.emulator.setRegister(CPURegister.PC, funcAddr >>> 0);
    this.emulator.refillPrefetch();

    // Execute until the callback returns or a safety limit is hit
    let returned = false;
    const maxSteps = 1000;
    const DEBUG_CALLBACK = this.rawDoFmtCount <= 3; // Debug first 3 RawDoFmt calls
    for (let steps = 0; steps < maxSteps; steps++) {
      const pcBefore = this.emulator.getRegister(CPURegister.PC);
      const instrWord = this.emulator.readMemory16(pcBefore);

      // Check for ILLEGAL instruction (0x4afc) which indicates library trap
      if (instrWord === 0x4afc) {
        if (DEBUG_CALLBACK) {
debugLog(
            `[ExecLibrary] RawDoFmt callback hit ILLEGAL at pc=0x${pcBefore.toString(
              16
            )} - library trap!`
          );
        }
        // Skip the callback - it's trying to call a library function
        // This is a problem for batch doors that don't have the full emulation loop
        break;
      }

      this.emulator.executeInstruction();
      const pcNow = this.emulator.getRegister(CPURegister.PC);

      if (DEBUG_CALLBACK && steps < 5) {
debugLog(
          `[ExecLibrary] RawDoFmt callback step ${steps}: pc 0x${pcBefore.toString(
            16
          )} -> 0x${pcNow.toString(16)} instr=0x${instrWord.toString(16)}`
        );
      }

      if (pcNow === returnStub) {
        returned = true;
        break;
      }
    }

    if (!returned && DEBUG_CALLBACK) {
      const pcFinal = this.emulator.getRegister(CPURegister.PC);
console.warn(
        `[ExecLibrary] RawDoFmt putch callback did not return within ${maxSteps} steps (func=0x${funcAddr.toString(
          16
        )}) finalPC=0x${pcFinal.toString(16)}`
      );
    }

    // Capture A3 after callback (it may have been incremented by move.b d0,(a3)+)
    const a3After = this.emulator.getRegister(CPURegister.A3);
    if (DEBUG_CALLBACK) {
debugLog(
        `[ExecLibrary] RawDoFmt callback: char='${String.fromCharCode(
          charCode
        )}' (0x${charCode.toString(16)}) A3 0x${putChDataPtr.toString(
          16
        )} -> 0x${a3After.toString(16)} func=0x${funcAddr.toString(16)}`
      );
    }

    // Restore state for continued RawDoFmt processing, but preserve tracked A3
    this.restoreCpuState(baseState);

    // Return the updated A3 value for tracking across callbacks
    return a3After;
  }

  private formatRawString(fmt: string, argvAddr: number): string {
    let result = "";
    let argIndex = 0;
    let i = 0;

    while (i < fmt.length) {
      if (fmt[i] === "%" && i + 1 < fmt.length) {
        // Parse format specifier: %[-][width][.precision][l]type
        i++; // Skip %

        // Check for %%
        if (fmt[i] === "%") {
          result += "%";
          i++;
          continue;
        }

        // Parse flags (- for left align)
        let leftAlign = false;
        if (fmt[i] === "-") {
          leftAlign = true;
          i++;
        }

        // Parse width
        let width = 0;
        while (i < fmt.length && fmt[i] >= "0" && fmt[i] <= "9") {
          width = width * 10 + parseInt(fmt[i], 10);
          i++;
        }

        // Parse precision
        let precision = -1;
        if (i < fmt.length && fmt[i] === ".") {
          i++;
          precision = 0;
          while (i < fmt.length && fmt[i] >= "0" && fmt[i] <= "9") {
            precision = precision * 10 + parseInt(fmt[i], 10);
            i++;
          }
        }

        // Parse long modifier
        let longFormat = false;
        if (i < fmt.length && fmt[i] === "l") {
          longFormat = true;
          i++;
        }

        // Parse type specifier
        if (i >= fmt.length) break;
        const typeSpec = fmt[i];
        i++;

        // Get argument and format it
        let formatted = "";
        switch (typeSpec) {
          case "s": {
            const strPtr = this.emulator.readMemory32(argvAddr + argIndex * 4);
            let str = strPtr ? this.emulator.readString(strPtr) : "";
            // Apply precision (max length for strings)
            if (precision >= 0 && str.length > precision) {
              str = str.substring(0, precision);
            }
            formatted = str;
            argIndex++;
            break;
          }
          case "d":
          case "i": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            // Sign extend for signed display
            const signedVal = val > 0x7fffffff ? val - 0x100000000 : val;
            formatted = signedVal.toString(10);
            argIndex++;
            break;
          }
          case "u": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            formatted = (val >>> 0).toString(10);
            argIndex++;
            break;
          }
          case "x": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            formatted = (val >>> 0).toString(16);
            argIndex++;
            break;
          }
          case "X": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            formatted = (val >>> 0).toString(16).toUpperCase();
            argIndex++;
            break;
          }
          case "c": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            formatted = String.fromCharCode(val & 0xff);
            argIndex++;
            break;
          }
          default: {
            // Unknown specifier - just output it
            formatted = "%" + typeSpec;
            break;
          }
        }

        // Apply width padding
        if (width > 0 && formatted.length < width) {
          const padding = " ".repeat(width - formatted.length);
          if (leftAlign) {
            formatted = formatted + padding;
          } else {
            formatted = padding + formatted;
          }
        }

        result += formatted;
      } else {
        result += fmt[i];
        i++;
      }
    }

    return result;
  }

  /**
   * Cleanup method for RAM optimization - called when door session ends
   * Releases all tracked allocations to prevent memory leaks between doors
   */
  cleanup(): void {
    this.allocations.clear();
    this.allocVecBlocks?.clear();
    this.messagePorts.clear();
    this.publicPorts.clear();
    this.freeList = [];
    this.allocatedSignals = 0;
  }
}

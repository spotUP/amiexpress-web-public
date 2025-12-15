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
import * as path from "path";
import { notifySysop } from "../../utils/sysop-alert.util";

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

  // Memory allocation tracking
  private allocations: Map<number, number> = new Map(); // address -> size
  private allocVecBlocks?: Map<number, { size: number; headerAddr: number }>; // AllocVec tracking
  // Start allocations at 0x100000 (1MB) to avoid overlap with door code segments
  // Door code starts at 0x1000 and large doors can exceed 100KB
  private nextFreeMemory: number = 0x100000;
  // Free list for simple reuse
  private freeList: { addr: number; size: number }[] = [];

  // Message port tracking
  private messagePorts: Map<number, MessagePort> = new Map(); // address -> port
  private publicPorts: Map<string, number> = new Map(); // lower-case name -> address
  private nextPortAddress: number = 0x0a0000; // Start at 640KB (between Task and library stubs)

  // Semaphore tracking
  private publicSemaphores: Map<string, number> = new Map(); // name -> address

  // Signal allocation tracking (32 signals, bits 0-31)
  private allocatedSignals: number = 0; // Bitmask of allocated signals

  // Standard signal bit definitions (from exec/tasks.h)
  private static readonly SIGBREAKB_CTRL_C = 12; // Bit number for CTRL-C
  private static readonly SIGBREAKF_CTRL_C = 1 << 12; // Signal mask (0x1000)

  // Door message callback - called when door sends message to AEDoorPort
  private doorMessageCallback:
    | ((portAddr: number, msgAddr: number) => void)
    | null = null;

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
  // Standard library addresses (for stubs) - AFTER door code range
  private readonly EXEC_BASE_ADDR = 0x080000; // ExecBase at 512KB (after door code)
  private readonly DOS_LIB_ADDR = 0x0B0000; // DOS.library at 704KB
  private readonly AEDOOR_LIB_ADDR = 0x0C0000; // AEDoor.library at 768KB
  private readonly ICON_LIB_ADDR = 0x0D0000; // icon.library at 832KB
  private readonly INTUITION_LIB_ADDR = 0x0E0000; // intuition.library at 896KB
  private readonly GRAPHICS_LIB_ADDR = 0x0E8000; // graphics.library at 928KB
  private readonly UTILITY_LIB_ADDR = 0x0F0000; // utility.library at 960KB
  private nextStubLibraryAddr = 0x0F8000; // fallback base for unknown stub libraries
  private readonly PORT_LIST_OFFSET = 392;
  private currentStackLower = 0;
  private currentStackUpper = 0;
  private rawDoFmtCount = 0;
  private rawDoFmtScratchPtr = 0;
  private rawDoFmtReturnStub = 0;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;

    // Initialize ExecBase structure
    this.execBase = {
      address: this.EXEC_BASE_ADDR,
      version: 40, // Kickstart 3.1 exec.library 40.10
      revision: 10,
      idString: 0, // TODO: Create version string
      softVer: 40, // Kickstart 3.1
      thisTask: 0, // Will be set when creating task
      libList: 0, // TODO: Create list
      taskReady: 0, // TODO: Create list
      eclockFrequency: 709379, // PAL E-clock frequency
    };

    // Create current task (the door itself)
    // Task is at 0x090000 - after ExecBase (0x080000) but before library stubs (0x0B0000+)
    const taskMsgPortAddr = 0x09005c; // Process msg port at task + 0x5C
    this.currentTask = {
      address: 0x090000, // Task/Process structure at 576KB
      name: "Door Task",
      node: 0x090000,
      sigRecvd: 0, // No signals received yet
      sigWait: 0, // Not waiting for signals (0 = TS_READY)
      state: 0, // TS_READY
      msgPort: taskMsgPortAddr, // Message port for Process structure
      isWaiting: false, // Not blocked in Wait()
    };
    this.execBase.thisTask = this.currentTask.address;

    // Register the task's message port
    this.messagePorts.set(taskMsgPortAddr, {
      address: taskMsgPortAddr,
      name: "Door Task Port",
      messages: [],
      sigBit: 0,
      sigTask: this.currentTask.address,
      signaled: false,
    });

    console.log("[ExecLibrary] Initialized");
    console.log(
      `[ExecLibrary] ExecBase at 0x${this.execBase.address.toString(16)}`
    );
  }

  /**
   * Track current stack bounds for StackSwap symmetry.
   */
  setStackBounds(lower: number, size: number): void {
    this.currentStackLower = lower >>> 0;
    this.currentStackUpper = (lower + size) >>> 0;
    console.log(
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
   * Set callback for when door sends message to AEDoorPort
   * This allows AmigaDoorSession to process messages via trap interception
   * instead of polling GetMsg()
   */
  setDoorMessageCallback(
    callback: (portAddr: number, msgAddr: number) => void
  ): void {
    this.doorMessageCallback = callback;
  }

  recordWaitPortReturn(returnAddr: number): void {
    console.log(
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
      console.log(
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
    console.log("[ExecLibrary] Creating ExecBase structure...");

    // ROM loaded but its exception handlers expect fully booted system
    // Override with our simple handlers that skip instructions
    this.setupExceptionVectors();

    // Write ExecBase pointer at 0x000004 (absolute address 4)
    this.emulator.writeMemory32(0x000004, this.execBase.address);
    console.log(
      `[ExecLibrary] Wrote ExecBase pointer at 0x000004 -> 0x${this.execBase.address.toString(
        16
      )}`
    );

    // Create stub function for unknown system vectors
    // Some programs (like GetAnswer) load function pointers from low memory
    // We create a stub that just does RTS (return immediately)
    // MUST be in chip RAM (0x000000-0x1FFFFF) - using area after exception handlers
    const STUB_FUNCTION_ADDR = 0x180f00; // After exception handlers (0x180000-0x180800)
    this.emulator.writeMemory16(STUB_FUNCTION_ADDR, 0x4e75); // RTS instruction
    console.log(
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
      console.log(
        `[ExecLibrary] Stub vector at 0x${addr
          .toString(16)
          .padStart(4, "0")} -> 0x${STUB_FUNCTION_ADDR.toString(16)}`
      );
    }

    // Write ExecBase structure to memory
    this.writeExecBaseToMemory();

    // Write current task structure
    this.writeTaskToMemory(this.currentTask);

    console.log("[ExecLibrary] ExecBase initialized successfully");
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
    console.log("[ExecLibrary] Setting up exception vectors...");

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
    console.log(`[ExecLibrary] Handler 4 at 0x${handler4Addr.toString(16)}: [${verifyWord0.toString(16)}, ${verifyWord1.toString(16)}, ${verifyWord2.toString(16)}] (expected: 5aaf, 2, 4e73)`);

    console.log("[ExecLibrary] Exception vectors initialized (0x00-0xFF)");
    console.log(
      `[ExecLibrary] Exception handlers at 0x${EXCEPTION_HANDLER_BASE.toString(
        16
      )}`
    );
    console.log(
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

    console.log(
      `[ExecLibrary] ExecBase structure written to 0x${addr.toString(16)}`
    );
    console.log(
      `[ExecLibrary]   Version: ${this.execBase.version}.${this.execBase.revision}`
    );
    console.log(
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

    console.log(
      `[ExecLibrary] Task/Process structure written to 0x${task.address.toString(
        16
      )}`
    );
    console.log(`[ExecLibrary]   pr_MsgPort at 0x${msgPortAddr.toString(16)}`);
  }

  /**
   * OpenLibrary(name, version) -> library base or NULL
   *
   * Opens a library and returns its base address.
   * Returns NULL if library cannot be opened.
   *
   * Implementation: Return stub library structures for known libraries
   */
  // Callback for when a library is opened (used to install traps)
  private onLibraryOpened: ((name: string, addr: number) => void) | null = null;

  /**
   * Set callback for when a library is opened
   */
  setLibraryOpenedCallback(
    callback: (name: string, addr: number) => void
  ): void {
    this.onLibraryOpened = callback;
  }

  /**
   * Set the library loader for hybrid native library support
   */
  setLibraryLoader(libraryLoader: any, useNativeLibraries: boolean): void {
    this.libraryLoader = libraryLoader;
    this.useNativeLibraries = useNativeLibraries;
    console.log(
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
    minVersion: number
  ): { success: boolean; address: number; isNative: boolean } {
    console.log(`[ExecLibrary] Hybrid OpenLibrary("${name}", ${minVersion})`);

    // Try real native library first if enabled
    if (this.useNativeLibraries && this.libraryLoader) {
      const realLibrary = this.libraryLoader.loadLibrary(name, minVersion);
      if (realLibrary) {
        console.log(
          `[ExecLibrary] ✅ Loaded REAL ${name} at 0x${realLibrary.baseAddress.toString(
            16
          )}`
        );

        // If a placeholder already exists (from preregistration), upgrade it to the real base
        const existing = this.libraries.get(name) || this.libraries.get(name.toLowerCase());
        if (existing) {
          existing.address = realLibrary.baseAddress;
          existing.version = realLibrary.version || existing.version;
          existing.revision = 0;
          existing.openCount = (existing.openCount || 0) + 1;
          this.writeLibraryToMemory(existing);
          console.log(
            `[ExecLibrary]   Upgraded placeholder for ${name} -> real base 0x${existing.address.toString(
              16
            )}, count=${existing.openCount}`
          );

          // Notify callback with the real address
          if (this.onLibraryOpened) {
            this.onLibraryOpened(name, realLibrary.baseAddress);
          }

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
        if (this.onLibraryOpened) {
          this.onLibraryOpened(name, realLibrary.baseAddress);
        }

        return {
          success: true,
          address: realLibrary.baseAddress,
          isNative: true,
        };
      } else {
        console.log(`[ExecLibrary] ⚠️ Real library not found, using stub`);
      }
    }

    // Fall back to stub library
    const stubAddr = this.openLibraryStub(name, minVersion);
    if (stubAddr !== 0) {
      return { success: true, address: stubAddr, isNative: false };
    }

    console.log(`[ExecLibrary] ❌ Failed to open ${name}`);
    return { success: false, address: 0, isNative: false };
  }

  /**
   * Open stub library (original implementation)
   */
  private openLibraryStub(name: string, version: number): number {
    const existing =
      this.libraries.get(name) || this.libraries.get(name.toLowerCase());
    if (existing) {
      existing.openCount++;
      if (version > existing.version) {
        existing.version = version;
        existing.revision = 0;
        this.writeLibraryToMemory(existing);
      }
      console.log(
        `[ExecLibrary]   Reusing registered ${name} at 0x${existing.address.toString(
          16
        )}, count=${existing.openCount}`
      );
      return existing.address;
    }

    // Create library structure based on name
    let libAddr = 0;
    let libVersion = 0;
    let libRevision = 0;

    switch (name.toLowerCase()) {
      case "exec.library":
        libAddr = this.EXEC_BASE_ADDR;
        libVersion = 37;
        libRevision = 175;
        break;

      case "dos.library":
        libAddr = this.DOS_LIB_ADDR;
        libVersion = 37;
        libRevision = 0;
        break;

      case "aedoor.library":
        libAddr = this.AEDOOR_LIB_ADDR;
        libVersion = 2; // V-AWAIT door requires version 2+
        libRevision = 0;
        break;

      case "icon.library":
        libAddr = this.ICON_LIB_ADDR;
        libVersion = 36;
        libRevision = 0;
        break;

      case "intuition.library":
        libAddr = this.INTUITION_LIB_ADDR;
        libVersion = 36;
        libRevision = 0;
        this.fillStubJumpTable(libAddr, 64);
        break;

      case "graphics.library":
        libAddr = this.GRAPHICS_LIB_ADDR;
        libVersion = 36;
        libRevision = 0;
        // Minimal graphics.library stub: fill jump table with RTS
        this.fillStubJumpTable(libAddr, 64);
        break;

      case "utility.library":
        libAddr = this.UTILITY_LIB_ADDR;
        libVersion = 37;
        libRevision = 0;
        this.fillStubJumpTable(libAddr, 64);
        break;

      default:
        libAddr = this.nextStubLibraryAddr;
        this.nextStubLibraryAddr += 0x010000;
        libVersion = version;
        libRevision = 0;
        console.log(
          `[ExecLibrary]   Opened generic stub library "${name}" at 0x${libAddr.toString(
            16
          )}`
        );
        break;
    }

    // Check version requirement (allow graceful upgrade for stubs)
    if (version > libVersion) {
      console.log(
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
    const lower = name.toLowerCase();
    if (lower !== name) {
      this.libraries.set(lower, lib);
    }

    // Write library structure to memory
    this.writeLibraryToMemory(lib);

    console.log(
      `[ExecLibrary]   Opened STUB ${name} at 0x${libAddr.toString(
        16
      )}, v${libVersion}.${libRevision}`
    );

    // Notify callback (used to install library traps)
    if (this.onLibraryOpened) {
      this.onLibraryOpened(name, libAddr);
    }

    return libAddr;
  }

  /**
   * Handle library function calls (for trap handling)
   * This allows ExecLibrary to be called from AmigaDosEnvironment trap handler
   */
  handleCall(offset: number): boolean {
    console.log(`[ExecLibrary] handleCall(offset=${offset})`);

    // Handle common Exec.library functions - CORRECTED LVOs from exec.library.lvos.i
    switch (offset) {
      case -552: // _LVOOpenLibrary
        console.log(
          `[ExecLibrary]   *** OpenLibrary trap called (LVO -552) ***`
        );
        // FIXED: A0 = register 8 (not 12 which is A4)
        const nameAddr = this.emulator.getRegister(8); // A0
        const version = this.emulator.getRegister(0); // D0
        const libResult = this.openLibrary(nameAddr, version);
        this.emulator.setRegister(0, libResult); // Return library base in D0
        return true;

      case -414: // _LVOCloseLibrary (CORRECTED from wrong -36)
        console.log(
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
        console.log(`[ExecLibrary]   FindTask trap called`);
        // FIXED: A1 = register 9 (not 13 which is A5)
        const nameAddr2 = this.emulator.getRegister(9); // A1
        const result = this.findTask(nameAddr2);
        this.emulator.setRegister(0, result);
        return true;

      case -198: // _LVOAllocMem ✓
        console.log(`[ExecLibrary]   AllocMem trap called`);
        const size = this.emulator.getRegister(0); // D0
        const flags = this.emulator.getRegister(1); // D1
        const allocResult = this.allocMem(size, flags);
        this.emulator.setRegister(0, allocResult);
        return true;

      case -210: // _LVOFreeMem ✓
        console.log(`[ExecLibrary]   FreeMem trap called`);
        // Note: FreeMem uses A1 for address, D0 for size per AmigaOS spec
        const addr = this.emulator.getRegister(9); // A1 = memory block
        const freeSize = this.emulator.getRegister(0); // D0 = size
        this.freeMem(addr, freeSize);
        this.emulator.setRegister(0, 0);
        return true;

      case -390: // _LVOFindPort ✓
        console.log(`[ExecLibrary]   FindPort trap called`);
        // FIXED: A1 = register 9 (not 13 which is A5)
        const portNameAddr = this.emulator.getRegister(9); // A1
        const portNameStr = portNameAddr
          ? this.emulator.readString(portNameAddr)
          : "<null>";
        console.log(
          `[ExecLibrary][Trap][FindPort] A1=0x${portNameAddr.toString(
            16
          )} "${portNameStr}"`
        );
        const portResult = this.findPort(portNameAddr);
        this.emulator.setRegister(0, portResult);
        return true;

      case -282: // _LVOSetTaskPri (P2)
        console.log(
          `[ExecLibrary]   *** SetTaskPri trap called (LVO -282) ***`
        );
        // FIXED: A1 = register 9 (not 13 which is A5)
        const taskAddr = this.emulator.getRegister(9); // A1
        const newPri = this.emulator.getRegister(0); // D0
        const priResult = this.setTaskPri(taskAddr, newPri);
        this.emulator.setRegister(0, priResult);
        return true;

      // *** P1 SEMAPHORE FUNCTIONS (Phase B) ***
      case -300: // _LVOObtainSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: ObtainSemaphore() (LVO -300) ***`);
        const obtainSemAddr = this.emulator.getRegister(8); // A0
        this.obtainSemaphore(obtainSemAddr);
        return true;

      case -312: // _LVOReleaseSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: ReleaseSemaphore() (LVO -312) ***`);
        const releaseSemAddr = this.emulator.getRegister(8); // A0
        this.releaseSemaphore(releaseSemAddr);
        return true;

      case -348: // _LVOInitSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: InitSemaphore() (LVO -348) ***`);
        const initSemAddr = this.emulator.getRegister(8); // A0
        this.initSemaphore(initSemAddr);
        return true;

      case -432: // _LVOFindSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: FindSemaphore() (LVO -432) ***`);
        const findSemNameAddr = this.emulator.getRegister(9); // A1
        const findSemResult = this.findSemaphore(findSemNameAddr);
        this.emulator.setRegister(0, findSemResult);
        return true;

      case -438: // _LVOAddSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: AddSemaphore() (LVO -438) ***`);
        const addSemAddr = this.emulator.getRegister(9); // A1
        this.addSemaphore(addSemAddr);
        return true;

      case -444: // _LVORemSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: RemSemaphore() (LVO -444) ***`);
        const remSemAddr = this.emulator.getRegister(9); // A1
        this.remSemaphore(remSemAddr);
        return true;

      case -588: // _LVOAttemptSemaphore - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: AttemptSemaphore() (LVO -588) ***`);
        const attemptSemAddr = this.emulator.getRegister(8); // A0
        const attemptResult = this.attemptSemaphore(attemptSemAddr);
        this.emulator.setRegister(0, attemptResult);
        return true;

      case -330: // _LVOAllocSignal ✓
        console.log(`[ExecLibrary]   AllocSignal trap called`);
        const sigNum = this.emulator.getRegister(0); // D0
        const sigResult = this.AllocSignal(sigNum);
        this.emulator.setRegister(0, sigResult);
        return true;

      case -306: // _LVOSetSignal ✓
        console.log(`[ExecLibrary]   SetSignal trap called`);
        const newSignals = this.emulator.getRegister(0); // D0
        const signalMask = this.emulator.getRegister(1); // D1
        const oldSignals = this.setSignal(newSignals, signalMask);
        this.emulator.setRegister(0, oldSignals);
        return true;

      // *** P1 I/O REQUEST FUNCTIONS (Phase B) ***
      case -504: // _LVOCreateIORequest - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: CreateIORequest() (LVO -504) ***`);
        const createIOPort = this.emulator.getRegister(8); // A0
        const createIOSize = this.emulator.getRegister(0); // D0
        const createIOResult = this.createIORequest(createIOPort, createIOSize);
        this.emulator.setRegister(0, createIOResult);
        return true;

      case -510: // _LVODeleteIORequest - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: DeleteIORequest() (LVO -510) ***`);
        const deleteIOAddr = this.emulator.getRegister(8); // A0
        this.deleteIORequest(deleteIOAddr);
        return true;

      case -516: // _LVODoIO - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: DoIO() (LVO -516) ***`);
        const doIOAddr = this.emulator.getRegister(9); // A1
        const doIOResult = this.doIO(doIOAddr);
        this.emulator.setRegister(0, doIOResult);
        return true;

      case -522: // _LVOSendIO - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: SendIO() (LVO -522) ***`);
        const sendIOAddr = this.emulator.getRegister(9); // A1
        this.sendIO(sendIOAddr);
        return true;

      case -528: // _LVOCheckIO - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: CheckIO() (LVO -528) ***`);
        const checkIOAddr = this.emulator.getRegister(9); // A1
        const checkIOResult = this.checkIO(checkIOAddr);
        this.emulator.setRegister(0, checkIOResult);
        return true;

      // *** P2 LIST OPERATIONS (Phase C) ***
      case -234: // _LVORemHead - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: RemHead() (LVO -234) ***`);
        const remHeadList = this.emulator.getRegister(8); // A0
        const remHeadResult = this.remHead(remHeadList);
        this.emulator.setRegister(0, remHeadResult);
        return true;

      case -240: // _LVORemTail - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: RemTail() (LVO -240) ***`);
        const remTailList = this.emulator.getRegister(8); // A0
        const remTailResult = this.remTail(remTailList);
        this.emulator.setRegister(0, remTailResult);
        return true;

      case -246: // _LVORemove - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: Remove() (LVO -246) ***`);
        const removeNode = this.emulator.getRegister(9); // A1
        this.remove(removeNode);
        return true;

      case -252: // _LVOInsert - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: Insert() (LVO -252) ***`);
        const insertList = this.emulator.getRegister(8); // A0
        const insertNode = this.emulator.getRegister(9); // A1
        const insertAfter = this.emulator.getRegister(10); // A2
        this.insert(insertList, insertNode, insertAfter);
        return true;

      case -258: // _LVOAddHead - P2
        console.log(`[ExecLibrary] *** INTERCEPTED: AddHead() (LVO -258) ***`);
        const addHeadList = this.emulator.getRegister(8); // A0
        const addHeadNode = this.emulator.getRegister(9); // A1
        this.addHead(addHeadList, addHeadNode);
        return true;

      case -264: // _LVOAddTail - P2
        console.log(`[ExecLibrary] *** INTERCEPTED: AddTail() (LVO -264) ***`);
        const addTailList = this.emulator.getRegister(8); // A0
        const addTailNode = this.emulator.getRegister(9); // A1
        this.addTail(addTailList, addTailNode);
        return true;

      // *** P2 TASK CONTROL & MEMORY (Phase C) ***
      case -162: // _LVODisable - P2
        console.log(`[ExecLibrary] *** INTERCEPTED: Disable() (LVO -162) ***`);
        this.disable();
        return true;

      case -168: // _LVOEnable - P2
        console.log(`[ExecLibrary] *** INTERCEPTED: Enable() (LVO -168) ***`);
        this.enable();
        return true;

      case -174: // _LVOForbid - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: Forbid() (LVO -174) ***`);
        this.forbid();
        return true;

      case -180: // _LVOPermit - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: Permit() (LVO -180) ***`);
        this.permit();
        return true;

      case -210: // _LVOAvailMem - P1
        console.log(`[ExecLibrary] *** INTERCEPTED: AvailMem() (LVO -210) ***`);
        const availMemReq = this.emulator.getRegister(1); // D1
        const availMemResult = this.availMem(availMemReq);
        this.emulator.setRegister(0, availMemResult);
        return true;

      // *** CRITICAL MISSING CASES FOR XIM DOORS ***
      case -372: // _LVOGetMsg - used by XIM doors
        console.log(`[ExecLibrary] *** INTERCEPTED: GetMsg() (LVO -372) ***`);
        // FIXED: A0 = register 8 (not 12 which is A4)
        const portAddr = this.emulator.getRegister(8); // A0
        const msgResult = this.getMsg(portAddr);
        this.emulator.setRegister(0, msgResult); // Return message in D0
        return true;

      case -384: // _LVOWaitPort - Door will loop on this
        console.log(`[ExecLibrary] *** INTERCEPTED: WaitPort() (LVO -384) ***`);
        // FIXED: A0 = register 8 (not 12 which is A4)
        const waitPortAddr = this.emulator.getRegister(8); // A0
        const waitResult = this.waitPort(waitPortAddr);
        this.emulator.setRegister(0, waitResult);
        return true;

      // *** P0 CRITICAL MEMORY FUNCTIONS ***
      case -474: // _LVOCopyMem - Fast memory copy
        console.log(`[ExecLibrary] *** INTERCEPTED: CopyMem() (LVO -474) ***`);
        const copySource = this.emulator.getRegister(8); // A0
        const copyDest = this.emulator.getRegister(9); // A1
        const copyLength = this.emulator.getRegister(0); // D0
        this.copyMem(copySource, copyDest, copyLength);
        return true;

      case -480: // _LVOCopyMemQuick - Quick memory copy (aligned)
        console.log(`[ExecLibrary] *** INTERCEPTED: CopyMemQuick() (LVO -480) ***`);
        const quickSource = this.emulator.getRegister(8); // A0
        const quickDest = this.emulator.getRegister(9); // A1
        const quickLength = this.emulator.getRegister(0); // D0
        this.copyMemQuick(quickSource, quickDest, quickLength);
        return true;

      case -684: // _LVOAllocVec - P0 CRITICAL (CORRECTED from -552)
        console.log(`[ExecLibrary] *** INTERCEPTED: AllocVec() (LVO -684) ***`);
        const vecSize = this.emulator.getRegister(0); // D0
        const vecFlags = this.emulator.getRegister(1); // D1
        const vecResult = this.allocVec(vecSize, vecFlags);
        this.emulator.setRegister(0, vecResult);
        return true;

      case -690: // _LVOFreeVec - P0 CRITICAL (CORRECTED from -558)
        console.log(`[ExecLibrary] *** INTERCEPTED: FreeVec() (LVO -690) ***`);
        const vecAddr = this.emulator.getRegister(9); // A1
        this.freeVec(vecAddr);
        return true;

      default:
        // COMPREHENSIVE STUB IMPLEMENTATION FOR ALL UNIMPLEMENTED FUNCTIONS
        console.warn(`[exec.library] STUB: Unimplemented function at LVO ${offset}`);

        // Exec library functions return pointers (non-zero) or 0 for failure
        // Default: Return 0 (failure) in D0
        this.emulator.setRegister(CPURegister.D0, 0);

        const d0 = this.emulator.getRegister(CPURegister.D0);
        const d1 = this.emulator.getRegister(CPURegister.D1);
        const a0 = this.emulator.getRegister(CPURegister.A0);
        const a1 = this.emulator.getRegister(CPURegister.A1);
        console.warn(`[exec.library]   Context: D0=0x${d0.toString(16)} D1=0x${d1.toString(16)} A0=0x${a0.toString(16)} A1=0x${a1.toString(16)}`);
        console.warn(`[exec.library]   Returning D0=0 (failure) - door should handle gracefully`);

        return true; // Return true to indicate we handled it (with a stub)
    }
  }

  openLibrary(nameAddr: number, version: number): number {
    // Read library name from memory
    const name = this.emulator.readString(nameAddr);
    const pc = this.emulator.getRegister(CPURegister.PC);
    console.log(
      `[ExecLibrary][OpenLibrary] pc=0x${pc.toString(
        16
      )} "${name}" v${version}`
    );

    // Use hybrid approach
    const result = this.openLibraryHybrid(name, version);

    if (result.success) {
      console.log(
        `[ExecLibrary]   Hybrid OpenLibrary SUCCESS - ${
          result.isNative ? "NATIVE" : "STUB"
        } library at 0x${result.address.toString(16)}`
      );
      return result.address;
    } else {
      console.log(`[ExecLibrary]   Hybrid OpenLibrary FAILED - returning NULL`);
      return 0;
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
          console.log(
            `[ExecLibrary] CloseLibrary(${name}) ignored (kept resident)`
          );
          return;
        }

        lib.openCount--;
        console.log(
          `[ExecLibrary] CloseLibrary(${name}), count=${lib.openCount}`
        );

        if (lib.openCount <= 0) {
          this.libraries.delete(name);
          console.log(`[ExecLibrary]   Library ${name} fully closed`);
        }
        return;
      }
    }

    console.log(
      `[ExecLibrary] CloseLibrary(0x${libAddr.toString(16)}) - unknown library`
    );
  }

  /**
   * Load real AEDoor.library binary from disk
   * This loads the actual compiled Amiga library and copies it into emulated memory
   */
  loadRealAEDoorLibrary(): boolean {
    try {
      console.log(`[ExecLibrary] ============================================`);
      console.log(`[ExecLibrary] Loading REAL AEDoor.library binary`);
      console.log(`[ExecLibrary] Using LibraryLoader for proper HUNK parsing`);
      console.log(`[ExecLibrary] ============================================`);

      // Use LibraryLoader if available, fall back to manual load
      if (this.libraryLoader) {
        const loadedLib = this.libraryLoader.loadLibrary("AEDoor.library", 0);

        if (loadedLib) {
          console.log(`[ExecLibrary] ✅ AEDoor.library loaded via LibraryLoader`);
          console.log(`[ExecLibrary]   Base address: 0x${loadedLib.baseAddress.toString(16)}`);
          console.log(`[ExecLibrary]   Jump table entries: ${loadedLib.jumpTable.size}`);
          console.log(`[ExecLibrary]   Code segments: ${loadedLib.codeSegments.length}`);
          console.log(`[ExecLibrary]   Data segments: ${loadedLib.dataSegments.length}`);

          // Register in libraries list
          const lib: LibraryNode = {
            address: loadedLib.baseAddress,
            name: "AEDoor.library",
            version: loadedLib.version,
            revision: 0,
            openCount: 0,
            negSize: 30, // Standard Amiga library header size
            posSize: 34,
          };
          this.libraries.set("AEDoor.library", lib);
          this.libraries.set("aedoor.library", lib);
          this.writeLibraryToMemory(lib);

          console.log(`[ExecLibrary] ✅ AEDoor.library registered in library list`);
          console.log(`[ExecLibrary] ============================================`);
          return true;
        } else {
          console.log(`[ExecLibrary] ⚠️  LibraryLoader failed, trying fallback`);
        }
      }

      // Fallback: Manual load (basic, for compatibility)
      console.log(`[ExecLibrary] Using fallback manual loader`);

      const candidates: string[] = [];
      try {
        const { config } = require("../../config");
        const dataDir = config.getConfig().dataDir;
        candidates.push(path.join(dataDir, "Libs", "AEDoor.library"));
        candidates.push(path.join(path.resolve(dataDir, ".."), "Libs", "AEDoor.library"));
      } catch (err) {
        // config not available in some test contexts
      }
      candidates.push(path.join(process.cwd(), "Libs", "AEDoor.library"));

      const libPath = candidates.find(p => fs.existsSync(p));

      if (!libPath) {
        const msg = `[ExecLibrary] ❌ ERROR: AEDoor.library not found`;
        console.log(msg);
        console.log(`[ExecLibrary] Searched: ${candidates.join(", ")}`);
        try {
          const globalAny: any = global as any;
          const session = globalAny?.currentBbsSession;
          notifySysop(session, msg);
        } catch (_) {
          /* ignore */
        }
        return false;
      }

      console.log(`[ExecLibrary] Found: ${libPath}`);
      const binary = fs.readFileSync(libPath);
      console.log(`[ExecLibrary] Read ${binary.length} bytes`);

      // Manual HUNK load (basic - just copy code section)
      // NOTE: This doesn't handle relocations properly!
      const codeStart = 0x20; // From hexdump analysis
      const codeSize = 0x3f0;  // ~1KB code+data
      const destAddr = this.AEDOOR_LIB_ADDR;

      for (let i = 0; i < codeSize && codeStart + i < binary.length; i++) {
        this.emulator.writeMemory(destAddr + i, binary[codeStart + i]);
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

      console.log(`[ExecLibrary] ⚠️  Fallback load complete (basic, no relocations)`);
      console.log(`[ExecLibrary]   Base: 0x${destAddr.toString(16)}, Size: ${codeSize} bytes`);
      console.log(`[ExecLibrary] ============================================`);
      return true;

    } catch (error) {
      console.log(`[ExecLibrary] ❌ ERROR loading AEDoor.library:`, error);
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
      console.log(
        `[ExecLibrary] FindTask(NULL) -> 0x${this.currentTask.address.toString(
          16
        )} (current task)`
      );
      return this.currentTask.address;
    }

    const name = this.emulator.readString(nameAddr);
    console.log(`[ExecLibrary] FindTask("${name}")`);

    // For now, only support finding current task
    if (name === this.currentTask.name) {
      return this.currentTask.address;
    }

    console.log(`[ExecLibrary]   Task not found`);
    return 0; // NULL
  }

  /**
   * AllocMem(size, flags) -> memory address or NULL
   *
   * Allocates memory block of specified size
   */
  allocMem(size: number, flags: number): number {
    // Align size to 4-byte boundary
    const alignedSize = (size + 3) & ~3;

    // Try to reuse a free block of sufficient size (first-fit)
    let addr = 0;
    for (let i = 0; i < this.freeList.length; i++) {
      const block = this.freeList[i];
      if (block.size >= alignedSize) {
        addr = block.addr;
        this.freeList.splice(i, 1);
        break;
      }
    }

    // Fallback to bump allocator
    if (addr === 0) {
      addr = this.nextFreeMemory;
      this.nextFreeMemory += alignedSize;
    }

    // Track allocation
    this.allocations.set(addr, alignedSize);

    // Clear memory if MEMF_CLEAR flag is set (bit 16)
    if (flags & (1 << 16)) {
      for (let i = 0; i < alignedSize; i++) {
        this.emulator.writeMemory(addr + i, 0);
      }
    }

    console.log(
      `[ExecLibrary] AllocMem(${size}, 0x${flags.toString(
        16
      )}) -> 0x${addr.toString(16)}`
    );
    return addr;
  }

  /**
   * FreeMem(address, size)
   *
   * Frees previously allocated memory
   */
  freeMem(addr: number, size: number): void {
    try {
      // Generic protection: skip freeing host-owned jhMessage buffers
      if (this.protectedMessages.has(addr)) {
        console.log(
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
      console.log(
        `[ExecLibrary] FreeMem(0x${addr.toString(
          16
        )}, ${size}) - freed ${allocation} bytes`
      );

      // Simple stack-like reuse: if freeing the topmost block, rewind bump pointer
      if (addr + allocation === this.nextFreeMemory) {
        this.nextFreeMemory = addr;
      } else {
        this.freeList.push({ addr, size: allocation });
      }
    } else {
      console.log(
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
    console.log(
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

    console.log(
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

  /**
   * Get library base address by name
   */
  getLibraryBase(name: string): number {
    const lib =
      this.libraries.get(name) || this.libraries.get(name.toLowerCase());
    return lib ? lib.address : 0;
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
    console.log(
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
    if (portAddr === 0) {
      return null;
    }

    const existing = this.messagePorts.get(portAddr);
    if (existing) {
      return existing;
    }

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
      this.emulator.writeMemory(portAddr + 14, 0x02); // mp_Flags = PA_SIGNAL

      // Allocate a signal bit; fall back to bit 1
      let sigBit = this.AllocSignal(-1);
      if (sigBit < 0 || sigBit > 31) {
        sigBit = 1;
      }
      this.emulator.writeMemory(portAddr + 15, sigBit);

      // Set SigTask to current door task
      this.emulator.writeMemory32(portAddr + 16, this.currentTask.address);

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
        sigTask: this.currentTask.address,
        signaled: false,
      };

      this.messagePorts.set(portAddr, port);
      console.log(
        `[ExecLibrary]   Auto-registered port at 0x${portAddr.toString(16)} (${
          name || "private"
        }), sigBit=${sigBit}, sigTask=0x${this.currentTask.address.toString(16)}`
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

    console.log(
      `[ExecLibrary] SetTaskPri(task=0x${taskAddr.toString(
        16
      )}, newPri=${newPri})`
    );

    // Read old priority from task structure (offset 9 in Task structure)
    const oldPri = this.emulator.readMemory(taskAddr + 9);

    // Write new priority
    this.emulator.writeMemory(taskAddr + 9, newPri & 0xff);

    console.log(`  Old priority: ${oldPri}, New priority: ${newPri}`);

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

    console.log(`[ExecLibrary] AllocSignal(${requestedSignal})`);

    // If specific signal requested
    if (requestedSignal >= 0 && requestedSignal < 32) {
      const mask = 1 << requestedSignal;

      // Check if already allocated
      if (this.allocatedSignals & mask) {
        console.log(`  Signal ${requestedSignal} already allocated!`);
        return -1; // Already allocated
      }

      // Allocate the requested signal
      this.allocatedSignals |= mask;
      console.log(
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
        console.log(
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
        console.log(
          `  Allocated system signal ${i} (fallback), mask=0x${this.allocatedSignals.toString(
            16
          )}`
        );
        return i;
      }
    }

    // No free signals
    console.log(`  No free signals available!`);
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
      console.log(
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
    console.log(
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
    console.log(
      `[ExecLibrary] SetSignal(newSignals=0x${newSignals.toString(
        16
      )}, signalMask=0x${signalMask.toString(16)})`
    );

    // Get current signal state for the current task
    // In our simplified model, we track signals in currentTask.sigRecvd
    const oldSignals = this.currentTask.sigRecvd;

    console.log(
      `  Old signals: 0x${oldSignals.toString(16)} (before changes)`
    );

    // Apply changes: clear bits in mask, then set new bits
    const clearedSignals = oldSignals & ~signalMask;
    const newSignalState = clearedSignals | (newSignals & signalMask);

    this.currentTask.sigRecvd = newSignalState;

    console.log(
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
    console.log(
      `[ExecLibrary][FindPort] pc=0x${pc.toString(16)} "${name}"`
    );

    // CORRECT IMPLEMENTATION: Search for port in public registry
    // FindPort() should NOT create ports - it only searches for existing ones
    const normalized = name.toLowerCase();
    let portAddr = normalized.length
      ? this.publicPorts.get(normalized)
      : undefined;

    // Compatibility: some doors pass an empty string; fall back to AEDoorPort
    if (portAddr === undefined || portAddr === 0) {
      const globalAny: any = global as any;
      const nodeId =
        globalAny?.currentBbsSession?.nodeId ??
        globalAny?.currentBbsSession?.nodeNumber ??
        1;
      const candidates = [
        `AEDoorPort${nodeId}`,
        "AEDoorPort1",
        "AEDoorPort",
      ];
      for (const candidate of candidates) {
        const addr = this.publicPorts.get(candidate.toLowerCase());
        if (addr !== undefined) {
          console.log(
            `[ExecLibrary]   Fallback matched "${candidate}" at 0x${addr.toString(
              16
            )}`
          );
          portAddr = addr;
          break;
        }
      }
    }

    if (portAddr !== undefined) {
      console.log(
        `[ExecLibrary]   Found "${name}" at 0x${portAddr.toString(16)}`
      );
      return portAddr;
    }

    // Check for other known ports (libraries can act as ports)
    if (name.toLowerCase() === "dos.library") {
      const dosLib = this.libraries.get("dos.library");
      if (dosLib) {
        console.log(
          `[ExecLibrary]   Returning dos.library at 0x${dosLib.address.toString(
            16
          )}`
        );
        return dosLib.address;
      }
    }

    console.log(`[ExecLibrary]   Port "${name}" not found - returning NULL`);
    return 0;
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
    console.log(`[ExecLibrary] FindSemaphore("${name}")`);

    // Search for semaphore in public registry
    const semaAddr = this.publicSemaphores.get(name);

    if (semaAddr !== undefined) {
      console.log(
        `[ExecLibrary]   Found "${name}" at 0x${semaAddr.toString(16)}`
      );
      return semaAddr;
    }

    console.log(
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

    console.log(
      `[ExecLibrary] AddSemaphore(0x${semaphoreAddr.toString(
        16
      )}) name="${name}"`
    );

    // Add to public semaphores registry
    this.publicSemaphores.set(name, semaphoreAddr);

    console.log(`[ExecLibrary]   Semaphore "${name}" added to public list`);
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
      console.log('[ExecLibrary] InitSemaphore(NULL) - ignoring');
      return;
    }

    console.log(`[ExecLibrary] InitSemaphore(0x${semaphoreAddr.toString(16)})`);

    // Initialize Node header (ss_Link)
    this.emulator.writeMemory32(semaphoreAddr + 0, 0);  // ln_Succ
    this.emulator.writeMemory32(semaphoreAddr + 4, 0);  // ln_Pred
    this.emulator.writeMemory(semaphoreAddr + 8, 0);    // ln_Type
    this.emulator.writeMemory(semaphoreAddr + 9, 0);    // ln_Pri
    this.emulator.writeMemory32(semaphoreAddr + 10, 0); // ln_Name

    // Initialize ss_NestCount
    this.emulator.writeMemory16(semaphoreAddr + 14, 0);

    // Initialize ss_WaitQueue (MinList)
    const waitQueueAddr = semaphoreAddr + 16;
    this.emulator.writeMemory32(waitQueueAddr + 0, waitQueueAddr + 4); // lh_Head → Tail
    this.emulator.writeMemory32(waitQueueAddr + 4, 0);                 // lh_Tail (NULL)
    this.emulator.writeMemory32(waitQueueAddr + 8, waitQueueAddr + 0); // lh_TailPred → Head

    // Initialize ss_MultipleLink (SemaphoreRequest Node)
    this.emulator.writeMemory32(semaphoreAddr + 28, 0); // ln_Succ
    this.emulator.writeMemory32(semaphoreAddr + 32, 0); // ln_Pred
    this.emulator.writeMemory(semaphoreAddr + 36, 0);   // ln_Type
    this.emulator.writeMemory(semaphoreAddr + 37, 0);   // ln_Pri
    this.emulator.writeMemory32(semaphoreAddr + 38, 0); // ln_Name

    // Initialize ss_Owner
    this.emulator.writeMemory32(semaphoreAddr + 42, 0);

    // Initialize ss_QueueCount
    this.emulator.writeMemory16(semaphoreAddr + 46, 0);

    console.log(`[ExecLibrary]   Semaphore initialized`);
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
      console.log('[ExecLibrary] ObtainSemaphore(NULL) - ignoring');
      return;
    }

    // Read current state
    const nestCount = this.emulator.readMemory16(semaphoreAddr + 14);
    const owner = this.emulator.readMemory32(semaphoreAddr + 42);
    const currentTask = this.findTask(0); // 0 = FindTask(NULL) = current task

    console.log(`[ExecLibrary] ObtainSemaphore(0x${semaphoreAddr.toString(16)}) nestCount=${nestCount} owner=0x${owner.toString(16)}`);

    // If not owned or owned by current task, increment nest count
    if (owner === 0 || owner === currentTask) {
      this.emulator.writeMemory16(semaphoreAddr + 14, nestCount + 1);
      this.emulator.writeMemory32(semaphoreAddr + 42, currentTask);
      console.log(`[ExecLibrary]   Semaphore obtained, new nestCount=${nestCount + 1}`);
    } else {
      // In a real system, would block here. In single-task emulator, this shouldn't happen.
      console.warn(`[ExecLibrary]   WARNING: Semaphore owned by different task! Forcing acquire.`);
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
      console.log('[ExecLibrary] ReleaseSemaphore(NULL) - ignoring');
      return;
    }

    // Read current state
    const nestCount = this.emulator.readMemory16(semaphoreAddr + 14);

    console.log(`[ExecLibrary] ReleaseSemaphore(0x${semaphoreAddr.toString(16)}) nestCount=${nestCount}`);

    if (nestCount > 0) {
      const newNestCount = nestCount - 1;
      this.emulator.writeMemory16(semaphoreAddr + 14, newNestCount);

      if (newNestCount === 0) {
        // Fully released, clear owner
        this.emulator.writeMemory32(semaphoreAddr + 42, 0);
        console.log(`[ExecLibrary]   Semaphore fully released`);
      } else {
        console.log(`[ExecLibrary]   Semaphore released, new nestCount=${newNestCount}`);
      }
    } else {
      console.warn(`[ExecLibrary]   WARNING: ReleaseSemaphore called on unlocked semaphore!`);
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
      console.log('[ExecLibrary] AttemptSemaphore(NULL) - returning FALSE');
      return 0;
    }

    // Read current state
    const nestCount = this.emulator.readMemory16(semaphoreAddr + 14);
    const owner = this.emulator.readMemory32(semaphoreAddr + 42);
    const currentTask = this.findTask(0);

    console.log(`[ExecLibrary] AttemptSemaphore(0x${semaphoreAddr.toString(16)}) nestCount=${nestCount} owner=0x${owner.toString(16)}`);

    // If not owned or owned by current task, increment nest count
    if (owner === 0 || owner === currentTask) {
      this.emulator.writeMemory16(semaphoreAddr + 14, nestCount + 1);
      this.emulator.writeMemory32(semaphoreAddr + 42, currentTask);
      console.log(`[ExecLibrary]   Semaphore obtained, new nestCount=${nestCount + 1}, returning TRUE`);
      return -1; // TRUE
    } else {
      // Owned by different task - return FALSE (don't block)
      console.log(`[ExecLibrary]   Semaphore unavailable, returning FALSE`);
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
      console.log('[ExecLibrary] RemSemaphore(NULL) - ignoring');
      return;
    }

    // Read semaphore name from ln_Name field (offset +10 in Node header)
    const nameAddr = this.emulator.readMemory32(semaphoreAddr + 10);
    if (nameAddr === 0) {
      console.log(`[ExecLibrary] RemSemaphore(0x${semaphoreAddr.toString(16)}) - no name, not in public list`);
      return;
    }

    const name = this.emulator.readString(nameAddr);
    console.log(`[ExecLibrary] RemSemaphore("${name}")`);

    // Remove from public registry
    if (this.publicSemaphores.has(name)) {
      this.publicSemaphores.delete(name);
      console.log(`[ExecLibrary]   Semaphore "${name}" removed from public list`);
    } else {
      console.log(`[ExecLibrary]   Semaphore "${name}" not found in public list`);
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
      console.log('[ExecLibrary] CreateIORequest(NULL port) - returning NULL');
      return 0;
    }

    if (size < 48) {
      console.log(`[ExecLibrary] CreateIORequest: size ${size} too small (minimum 48 bytes) - returning NULL`);
      return 0;
    }

    console.log(`[ExecLibrary] CreateIORequest(port=0x${portAddr.toString(16)}, size=${size})`);

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

    this.emulator.writeMemory32(ioReqAddr + 0, 0);     // ln_Succ
    this.emulator.writeMemory32(ioReqAddr + 4, 0);     // ln_Pred
    this.emulator.writeMemory(ioReqAddr + 8, 5);       // ln_Type = NT_MESSAGE
    this.emulator.writeMemory(ioReqAddr + 9, 0);       // ln_Pri
    this.emulator.writeMemory32(ioReqAddr + 10, 0);    // ln_Name
    this.emulator.writeMemory32(ioReqAddr + 14, portAddr); // mn_ReplyPort
    this.emulator.writeMemory16(ioReqAddr + 18, size); // mn_Length

    // Initialize IORequest fields
    this.emulator.writeMemory32(ioReqAddr + 20, 0);    // io_Device
    this.emulator.writeMemory32(ioReqAddr + 24, 0);    // io_Unit
    this.emulator.writeMemory16(ioReqAddr + 28, 0);    // io_Command
    this.emulator.writeMemory(ioReqAddr + 30, 0);      // io_Flags
    this.emulator.writeMemory(ioReqAddr + 31, 0);      // io_Error

    // Initialize IOStdReq extended fields (if size >= 48)
    if (size >= 48) {
      this.emulator.writeMemory32(ioReqAddr + 32, 0);  // io_Actual
      this.emulator.writeMemory32(ioReqAddr + 36, 0);  // io_Length
      this.emulator.writeMemory32(ioReqAddr + 40, 0);  // io_Data
      this.emulator.writeMemory32(ioReqAddr + 44, 0);  // io_Offset
    }

    console.log(`[ExecLibrary]   IORequest created at 0x${ioReqAddr.toString(16)}`);
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
      console.log('[ExecLibrary] DeleteIORequest(NULL) - ignoring');
      return;
    }

    console.log(`[ExecLibrary] DeleteIORequest(0x${ioReqAddr.toString(16)})`);

    // Read size from mn_Length field
    const size = this.emulator.readMemory16(ioReqAddr + 18);

    // Free memory
    this.freeMem(ioReqAddr, size);
    console.log(`[ExecLibrary]   IORequest deleted`);
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
      console.log('[ExecLibrary] DoIO(NULL) - returning error');
      return -1; // IOERR_OPENFAIL
    }

    // Read io_Command
    const command = this.emulator.readMemory16(ioReqAddr + 28);
    const device = this.emulator.readMemory32(ioReqAddr + 20);

    console.log(`[ExecLibrary] DoIO(0x${ioReqAddr.toString(16)}) command=${command} device=0x${device.toString(16)}`);

    // In a real system, would dispatch to device driver
    // For BBS emulator, most devices don't exist, so we stub this
    console.log(`[ExecLibrary]   DoIO: Stubbed - returning success`);

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
      console.log('[ExecLibrary] SendIO(NULL) - ignoring');
      return;
    }

    // Read io_Command
    const command = this.emulator.readMemory16(ioReqAddr + 28);
    const device = this.emulator.readMemory32(ioReqAddr + 20);

    console.log(`[ExecLibrary] SendIO(0x${ioReqAddr.toString(16)}) command=${command} device=0x${device.toString(16)}`);

    // In a real system, would dispatch to device driver asynchronously
    // For BBS emulator, we simulate immediate completion

    // Set io_Error to 0 (success)
    this.emulator.writeMemory(ioReqAddr + 31, 0);

    // In a real system, would send reply message to port when complete
    // For now, we just mark as complete
    console.log(`[ExecLibrary]   SendIO: Stubbed - simulating immediate completion`);
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
      console.log('[ExecLibrary] CheckIO(NULL) - returning completed');
      return -1; // Consider NULL as completed
    }

    console.log(`[ExecLibrary] CheckIO(0x${ioReqAddr.toString(16)})`);

    // In our BBS emulator, I/O completes synchronously
    // So CheckIO always returns "completed"
    console.log(`[ExecLibrary]   CheckIO: Stubbed - returning completed`);
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
      console.log('[ExecLibrary] AddHead(NULL) - ignoring');
      return;
    }

    console.log(`[ExecLibrary] AddHead(list=0x${listAddr.toString(16)}, node=0x${nodeAddr.toString(16)})`);

    // Read current head
    const oldHead = this.emulator.readMemory32(listAddr + 0); // lh_Head

    // Set node links
    this.emulator.writeMemory32(nodeAddr + 0, oldHead);      // ln_Succ → old head
    this.emulator.writeMemory32(nodeAddr + 4, listAddr + 0); // ln_Pred → list head

    // Update old head's predecessor
    this.emulator.writeMemory32(oldHead + 4, nodeAddr);

    // Update list head
    this.emulator.writeMemory32(listAddr + 0, nodeAddr);

    console.log(`[ExecLibrary]   Node added to head`);
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
      console.log('[ExecLibrary] AddTail(NULL) - ignoring');
      return;
    }

    console.log(`[ExecLibrary] AddTail(list=0x${listAddr.toString(16)}, node=0x${nodeAddr.toString(16)})`);

    // Read current tail predecessor
    const tailPredAddr = this.emulator.readMemory32(listAddr + 8); // lh_TailPred
    const tailAddr = listAddr + 4; // lh_Tail

    // Set node links
    this.emulator.writeMemory32(nodeAddr + 0, tailAddr);      // ln_Succ → tail
    this.emulator.writeMemory32(nodeAddr + 4, tailPredAddr);  // ln_Pred → old last node

    // Update old last node's successor
    this.emulator.writeMemory32(tailPredAddr + 0, nodeAddr);

    // Update list tail predecessor
    this.emulator.writeMemory32(listAddr + 8, nodeAddr);

    console.log(`[ExecLibrary]   Node added to tail`);
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
      console.log('[ExecLibrary] RemHead(NULL) - returning NULL');
      return 0;
    }

    // Read head node
    const headAddr = this.emulator.readMemory32(listAddr + 0); // lh_Head
    const tailAddr = listAddr + 4; // lh_Tail

    // Check if list is empty (head points to tail)
    if (headAddr === tailAddr) {
      console.log(`[ExecLibrary] RemHead: List empty`);
      return 0;
    }

    console.log(`[ExecLibrary] RemHead(list=0x${listAddr.toString(16)}) → node=0x${headAddr.toString(16)}`);

    // Read new head (successor of current head)
    const newHeadAddr = this.emulator.readMemory32(headAddr + 0); // ln_Succ

    // Update list head
    this.emulator.writeMemory32(listAddr + 0, newHeadAddr);

    // Update new head's predecessor
    this.emulator.writeMemory32(newHeadAddr + 4, listAddr + 0);

    console.log(`[ExecLibrary]   Node removed from head`);
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
      console.log('[ExecLibrary] RemTail(NULL) - returning NULL');
      return 0;
    }

    // Read tail predecessor (last node)
    const tailPredAddr = this.emulator.readMemory32(listAddr + 8); // lh_TailPred
    const headAddr = listAddr + 0; // lh_Head

    // Check if list is empty (tailPred points to head)
    if (tailPredAddr === headAddr) {
      console.log(`[ExecLibrary] RemTail: List empty`);
      return 0;
    }

    console.log(`[ExecLibrary] RemTail(list=0x${listAddr.toString(16)}) → node=0x${tailPredAddr.toString(16)}`);

    // Read new tail (predecessor of current tail)
    const newTailPredAddr = this.emulator.readMemory32(tailPredAddr + 4); // ln_Pred

    // Update list tail predecessor
    this.emulator.writeMemory32(listAddr + 8, newTailPredAddr);

    // Update new tail's successor
    const tailAddr = listAddr + 4;
    this.emulator.writeMemory32(newTailPredAddr + 0, tailAddr);

    console.log(`[ExecLibrary]   Node removed from tail`);
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
      console.log('[ExecLibrary] Remove(NULL) - ignoring');
      return;
    }

    console.log(`[ExecLibrary] Remove(node=0x${nodeAddr.toString(16)})`);

    // Read node links
    const succAddr = this.emulator.readMemory32(nodeAddr + 0); // ln_Succ
    const predAddr = this.emulator.readMemory32(nodeAddr + 4); // ln_Pred

    // Link predecessor to successor
    this.emulator.writeMemory32(predAddr + 0, succAddr);

    // Link successor to predecessor
    this.emulator.writeMemory32(succAddr + 4, predAddr);

    console.log(`[ExecLibrary]   Node removed from list`);
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
      console.log('[ExecLibrary] Insert(NULL) - ignoring');
      return;
    }

    console.log(`[ExecLibrary] Insert(list=0x${listAddr.toString(16)}, node=0x${nodeAddr.toString(16)}, after=0x${afterAddr.toString(16)})`);

    // If afterAddr is NULL, insert at head
    if (afterAddr === 0) {
      this.addHead(listAddr, nodeAddr);
      return;
    }

    // Read successor of after node
    const succAddr = this.emulator.readMemory32(afterAddr + 0); // ln_Succ

    // Set new node links
    this.emulator.writeMemory32(nodeAddr + 0, succAddr);   // ln_Succ → successor
    this.emulator.writeMemory32(nodeAddr + 4, afterAddr);  // ln_Pred → after node

    // Update after node's successor
    this.emulator.writeMemory32(afterAddr + 0, nodeAddr);

    // Update successor's predecessor
    this.emulator.writeMemory32(succAddr + 4, nodeAddr);

    console.log(`[ExecLibrary]   Node inserted`);
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
    console.log('[ExecLibrary] Disable() - no-op in emulated environment');
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
    console.log('[ExecLibrary] Enable() - no-op in emulated environment');
  }

  /**
   * AvailMem() - LVO -210 (P1)
   *
   * Get available memory.
   *
   * Parameters:
   *   D1 = Requirements (memory flags)
   *
   * Returns:
   *   D0 = Available memory in bytes
   *
   * Returns a reasonable amount for BBS operations.
   */
  availMem(requirements: number): number {
    console.log(`[ExecLibrary] AvailMem(requirements=0x${requirements.toString(16)})`);

    // Return 8MB available (plenty for any BBS door)
    const availableMemory = 8 * 1024 * 1024;

    console.log(`[ExecLibrary]   Returning ${availableMemory} bytes available`);
    return availableMemory;
  }

  // ============================================================================
  // P0 CRITICAL FUNCTIONS
  // ============================================================================

  /**
   * CopyMem() - LVO -474 (V36+)
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
    console.log(`[ExecLibrary] CopyMem(src=0x${sourceAddr.toString(16)}, dest=0x${destAddr.toString(16)}, size=${size})`);

    if (size === 0 || sourceAddr === 0 || destAddr === 0) {
      console.log(`[ExecLibrary]   Invalid parameters, skipping`);
      return;
    }

    // Perform byte-by-byte copy (could be optimized with Buffer.copy if needed)
    for (let i = 0; i < size; i++) {
      const byte = this.emulator.readMemory(sourceAddr + i);
      this.emulator.writeMemory(destAddr + i, byte);
    }

    console.log(`[ExecLibrary]   Copied ${size} bytes`);
  }

  /**
   * CopyMemQuick() - LVO -480 (V36+)
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
    console.log(`[ExecLibrary] CopyMemQuick(src=0x${sourceAddr.toString(16)}, dest=0x${destAddr.toString(16)}, size=${size})`);

    if (size === 0 || sourceAddr === 0 || destAddr === 0) {
      console.log(`[ExecLibrary]   Invalid parameters, skipping`);
      return;
    }

    // Quick copy using 32-bit reads/writes
    const numLongs = size >> 2; // Divide by 4
    for (let i = 0; i < numLongs; i++) {
      const longword = this.emulator.readMemory32(sourceAddr + (i * 4));
      this.emulator.writeMemory32(destAddr + (i * 4), longword);
    }

    console.log(`[ExecLibrary]   Copied ${numLongs} longwords (${size} bytes)`);
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
    console.log(`[ExecLibrary] AllocVec(size=${byteSize}, requirements=0x${requirements.toString(16)})`);

    if (byteSize === 0) {
      console.log(`[ExecLibrary]   Zero size requested, returning NULL`);
      return 0;
    }

    // Allocate extra 4 bytes for size header
    const totalSize = byteSize + 4;
    const memAddr = this.allocMem(totalSize, requirements);

    if (memAddr === 0) {
      console.log(`[ExecLibrary]   Allocation failed`);
      return 0;
    }

    // Store size in first 4 bytes
    this.emulator.writeMemory32(memAddr, byteSize);

    // Return pointer after size header
    const userAddr = memAddr + 4;
    console.log(`[ExecLibrary]   AllocVec → 0x${userAddr.toString(16)} (${byteSize} bytes)`);
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
      console.log(`[ExecLibrary] FreeVec(NULL) - ignoring`);
      return;
    }

    // Read size from 4 bytes before user pointer
    const headerAddr = memoryBlock - 4;
    const size = this.emulator.readMemory32(headerAddr);

    console.log(`[ExecLibrary] FreeVec(0x${memoryBlock.toString(16)}) - size=${size}`);

    // Free entire block including header
    const totalSize = size + 4;
    this.freeMem(headerAddr, totalSize);

    console.log(`[ExecLibrary]   Freed ${totalSize} bytes`);
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
      console.log("[ExecLibrary] AddPort(NULL) - ignoring");
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
      console.log(
        `[ExecLibrary] AddPort(0x${portAddr.toString(
          16
        )}) - port has no name, not making public`
      );
      return;
    }

    const name = this.emulator.readString(namePtr);
    console.log(
      `[ExecLibrary] AddPort(0x${portAddr.toString(
        16
      )}) - adding public port "${name}"`
    );

    // CRITICAL: Also add to message ports registry (for PutMsg/GetMsg/WaitPort)
    // Read port structure fields
    const sigBit = this.emulator.readMemory(portAddr + 15); // mp_SigBit
    const sigTask = this.emulator.readMemory32(portAddr + 16); // mp_SigTask

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

    console.log(
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
  createMsgPort(): number {
    console.log("[ExecLibrary] CreateMsgPort() called");
    console.log(
      `[ExecLibrary]   Current task: 0x${this.currentTask.address.toString(16)}`
    );
    console.log(
      `[ExecLibrary]   Next port address: 0x${this.nextPortAddress.toString(
        16
      )}`
    );

    // Allocate memory for MsgPort structure (34 bytes)
    const portAddr = this.nextPortAddress;
    this.nextPortAddress += 0x100; // Space for port + message queue

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
    let signalBit = this.AllocSignal(-1);
    if (signalBit < 0) {
      console.warn(
        "[ExecLibrary]   WARNING: No free signals available, falling back to bit 1"
      );
      signalBit = 1;
    }
    this.emulator.writeMemory(portAddr + 15, signalBit);

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
      name: "", // Private port (CreateMsgPort has no name)
      messages: [],
      sigBit: signalBit,
      sigTask: this.currentTask.address,
      signaled: false,
    };
    this.messagePorts.set(portAddr, port);

    console.log(
      `[ExecLibrary] ✅ Created MsgPort at 0x${portAddr.toString(16)}`
    );
    console.log(
      `[ExecLibrary]    mp_Flags: 0x${this.emulator
        .readMemory(portAddr + 14)
        .toString(16)}`
    );
    console.log(
      `[ExecLibrary]    mp_SigBit: ${this.emulator.readMemory(portAddr + 15)}`
    );
    console.log(
      `[ExecLibrary]    mp_SigTask: 0x${this.emulator
        .readMemory32(portAddr + 16)
        .toString(16)}`
    );
    console.log(`[ExecLibrary]    Returning D0 = 0x${portAddr.toString(16)}`);
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
    console.log("[ExecLibrary] CreatePort() called (AmigaOS 1.x API)");
    console.log(`[ExecLibrary]   name: 0x${nameAddr.toString(16)}`);
    console.log(`[ExecLibrary]   priority: ${priority}`);
    console.log(
      `[ExecLibrary]   Current task: 0x${this.currentTask.address.toString(16)}`
    );
    console.log(
      `[ExecLibrary]   Next port address: 0x${this.nextPortAddress.toString(
        16
      )}`
    );

    // Allocate memory for MsgPort structure (34 bytes)
    const portAddr = this.nextPortAddress;
    this.nextPortAddress += 0x100; // Space for port + message queue

    // Read the port name if provided
    let portName = "";
    if (nameAddr !== 0) {
      portName = this.emulator.readString(nameAddr);
      console.log(`[ExecLibrary]   Port name: "${portName}"`);
    } else {
      console.log(`[ExecLibrary]   Port name: (NULL - private port)`);
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

    console.log(
      `[ExecLibrary] ✅ Created MsgPort at 0x${portAddr.toString(
        16
      )} (via CreatePort)`
    );
    console.log(`[ExecLibrary]    mp_Node.ln_Name: "${portName}"`);
    console.log(`[ExecLibrary]    mp_Node.ln_Pri: ${priority}`);
    console.log(
      `[ExecLibrary]    mp_Flags: 0x${this.emulator
        .readMemory(portAddr + 14)
        .toString(16)} (PA_SIGNAL)`
    );
    console.log(
      `[ExecLibrary]    mp_SigBit: ${this.emulator.readMemory(portAddr + 15)}`
    );
    console.log(
      `[ExecLibrary]    mp_SigTask: 0x${this.emulator
        .readMemory32(portAddr + 16)
        .toString(16)}`
    );
    console.log(
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
    console.log(`[ExecLibrary] DeleteMsgPort(port=0x${portAddr.toString(16)})`);

    // CRITICAL INSIGHT: portAddr might be in data segment (0x4000-0x5000 range)
    // If so, we need to READ THE POINTER from that address, not use the address directly!
    if (portAddr >= 0x4000 && portAddr < 0x5000) {
      const actualPortAddr = this.emulator.readMemory32(portAddr);
      console.log(
        `[ExecLibrary]   Detected data segment address 0x${portAddr.toString(
          16
        )}`
      );
      console.log(
        `[ExecLibrary]   Reading port pointer from memory: 0x${actualPortAddr.toString(
          16
        )}`
      );

      if (actualPortAddr === 0) {
        console.log(
          `[ExecLibrary]   Port pointer is NULL - DoorStart() never initialized it`
        );
        return;
      }

      // Recurse with actual port address
      return this.deleteMsgPort(actualPortAddr);
    }

    // Check if portAddr is NULL (0) or very small (likely NULL)
    if (portAddr === 0 || portAddr < 0x1000) {
      console.log(
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
    console.log(
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
      console.log(`[ExecLibrary]   Removed public port "${port.name}"`);
    }

    this.removePortFromExecList(portAddr);

    // Release signal bit
    this.freeSignal(port.sigBit);

    // Remove from port registry
    this.messagePorts.delete(portAddr);
    console.log(`[ExecLibrary]   Deleted port at 0x${portAddr.toString(16)}`);
  }

  /**
   * Create a public named message port
   * This is a helper method for BBS to create ports that doors can find
   *
   * @param name - Port name (e.g., "AEDoorPort0")
   * @returns Port address
   */
  createPublicPort(name: string): number {
    console.log(`[ExecLibrary] Creating public port: "${name}"`);

    // Create port using standard CreateMsgPort
    const portAddr = this.createMsgPort();

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

    console.log(
      `[ExecLibrary]   Public port "${name}" created at 0x${portAddr.toString(
        16
      )}`
    );
    return portAddr;
  }

  ensurePublicPort(name: string): number {
    const existing = this.publicPorts.get(name.toLowerCase());
    if (existing !== undefined) {
      return existing;
    }
    return this.createPublicPort(name);
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
    // Allocate port structure (34 bytes for MsgPort)
    const portAddr = this.allocMem(34, 0x10001); // MEMF_PUBLIC | MEMF_CLEAR
    if (!portAddr) {
      console.error(`[ExecLibrary] Failed to allocate memory for lightweight port "${name}"`);
      return 0;
    }

    // Allocate name string
    const nameAddr = this.allocMem(name.length + 1, 0);
    this.emulator.writeString(nameAddr, name);

    // Write minimal MsgPort structure
    this.emulator.writeMemory32(portAddr + 0, 0);     // ln_Succ
    this.emulator.writeMemory32(portAddr + 4, 0);     // ln_Pred
    this.emulator.writeMemory(portAddr + 8, 4);       // ln_Type = NT_MSGPORT
    this.emulator.writeMemory(portAddr + 9, 0);       // ln_Pri
    this.emulator.writeMemory32(portAddr + 10, nameAddr); // ln_Name
    this.emulator.writeMemory(portAddr + 14, 0);      // mp_Flags = PA_IGNORE (no signaling)
    this.emulator.writeMemory(portAddr + 15, 0);      // mp_SigBit = 0 (unused)
    this.emulator.writeMemory32(portAddr + 16, 0);    // mp_SigTask = NULL (no task)

    // Initialize empty message list
    this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head -> lh_Tail
    this.emulator.writeMemory32(portAddr + 24, 0);             // lh_Tail
    this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred -> lh_Head
    this.emulator.writeMemory(portAddr + 32, 0);               // lh_Type
    this.emulator.writeMemory(portAddr + 33, 0);               // l_pad

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

    console.log(
      `[ExecLibrary] PutMsg(port=0x${portAddr.toString(
        16
      )}, msg=0x${msgAddr.toString(16)})`
    );

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

    console.log(
      `[ExecLibrary][PutMsg] port=0x${portAddr.toString(
        16
      )} name=${port.name ?? "<unnamed>"} msg=0x${msgAddr.toString(
        16
      )} suppress=${suppressDoorCallback ? "yes" : "no"}`
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

    // CRITICAL: Write message to memory structure so door can see it!
    // MsgPort.mp_MsgList.lh_Head is at offset 20
    const listHeadOffset = 20;
    this.emulator.writeMemory32(portAddr + listHeadOffset, msgAddr);

    console.log(`[ExecLibrary]   ✓ Message queued to port memory structure`);
    console.log(
      `[ExecLibrary]   ✓ Wrote message address 0x${msgAddr.toString(
        16
      )} to port+20 (mp_MsgList.lh_Head)`
    );
    console.log(
      `[ExecLibrary]   Port now has ${port.messages.length} message(s) in queue`
    );

    // *** CRITICAL: Signal the port's task (if PA_SIGNAL flag set) ***
    // This is the missing piece! The door is waiting for this signal.
    const mp_Flags = this.emulator.readMemory(portAddr + 14);
    const PA_SIGNAL = 0x02;

    if (mp_Flags & PA_SIGNAL) {
      console.log(`[ExecLibrary]   Port has PA_SIGNAL flag - signaling task`);
      console.log(
        `[ExecLibrary]   Port sigTask: 0x${port.sigTask.toString(
          16
        )}, sigBit: ${port.sigBit}`
      );

      // Signal the task that owns this port
      if (port.sigTask !== 0) {
        const signalMask = 1 << port.sigBit; // Convert bit number to mask
        console.log(
          `[ExecLibrary]   *** Calling Signal() to wake waiting task ***`
        );
        this.signal(port.sigTask, signalMask);
      } else {
        console.warn(`[ExecLibrary]   WARNING: Port has no sigTask set!`);
      }
    } else {
      console.log(
        `[ExecLibrary]   Port does not have PA_SIGNAL flag (no task to signal)`
      );
    }

    // If this is an AEDoorPort, invoke callback for trap-based message processing
    // ONLY invoke for messages TO AEDoorPort (name check), not reply ports
    const isAEDoorPort = port.name?.toLowerCase().startsWith("aedoorport");
    const isDoorTaskPort = originalPortAddr === this.currentTask.msgPort;
    const isDoorReplyPort = port.name?.toLowerCase().startsWith("doorreplyport");
    if (
      !suppressDoorCallback &&
      this.doorMessageCallback &&
      (isAEDoorPort || isDoorTaskPort || isDoorReplyPort)
    ) {
      const label = isAEDoorPort ? port.name ?? "AEDoorPort" : "Door Task Port";
      console.log(
        `[ExecLibrary]   *** Invoking door message callback for port 0x${originalPortAddr.toString(
          16
        )} (${label}) ***`
      );
      this.doorMessageCallback(originalPortAddr, msgAddr);
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
   */
  getMsg(portAddr: number): number {
    console.log(`[ExecLibrary] >>> GetMsg(port=0x${portAddr.toString(16)})`);

    const port = this.messagePorts.get(portAddr);
    if (!port) {
      console.error(
        `[ExecLibrary]   Port not found: 0x${portAddr.toString(16)}`
      );
      return 0;
    }

    // Check if port has messages
    if (port.messages.length === 0) {
      console.log(`[ExecLibrary]   No messages in port`);
      return 0;
    }

    // Dequeue first message
    const msgAddr = port.messages.shift()!;
    console.log(
      `[ExecLibrary]   Returning message at 0x${msgAddr.toString(16)}, ${
        port.messages.length
      } remaining`
    );
    console.log(
      `[ExecLibrary] GetMsg returning msg=0x${msgAddr.toString(
        16
      )} queueLen=${port.messages.length}`
    );
    this.protectReturnedMessage(msgAddr, `GetMsg port=0x${portAddr.toString(16)}`);

    // Clear signaled flag if no more messages
    if (port.messages.length === 0) {
      port.signaled = false;
    }

    return msgAddr;
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
      console.log(
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
      if (port.messages.length === 0) {
        return 0;
      }
    }

    // MESSAGE FOUND! Return the head message without removing it.
    // Real WaitPort waits on the signal and returns the first message; GetMsg removes it.
    const msgAddr = port.messages[0];
    console.log(
      `[ExecLibrary] WaitPort returning msg=0x${msgAddr.toString(
        16
      )} queueLen=${port.messages.length}`
    );
    // Clear signaled bit like Exec's Wait would do
    port.signaled = false;
    console.log(
      `[ExecLibrary] ===============================================`
    );
    console.log(`[ExecLibrary] *** WaitPort RETURNS MESSAGE! ***`);
    console.log(
      `[ExecLibrary] ===============================================`
    );
    console.log(`[ExecLibrary]   Port: 0x${portAddr.toString(16)}`);
    console.log(`[ExecLibrary]   Message: 0x${msgAddr.toString(16)}`);
    console.log(`[ExecLibrary]   Queue length: ${port.messages.length}`);
    console.log(
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
    console.log(
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
    // Read reply port from message header
    const replyPortAddr = this.emulator.readMemory32(msgAddr + 14);

    if (replyPortAddr === 0) {
      console.log(
        `[ExecLibrary] ReplyMsg: No reply port in message 0x${msgAddr.toString(
          16
        )}`
      );
      return;
    }

    if (!this.messagePorts.get(replyPortAddr)) {
      console.log(
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

    console.log(
      `[ExecLibrary][ReplyMsg] msg=0x${msgAddr.toString(
        16
      )} replyPort=0x${replyPortAddr.toString(16)}`
    );

    // CRITICAL: Set message type to NT_REPLYMSG (6) as per autodocs
    // This distinguishes replies from new messages
    // Message.mn_Node.ln_Type is at offset 8
    const NT_REPLYMSG = 6;
    this.emulator.writeMemory(msgAddr + 8, NT_REPLYMSG);

    // Send message back to reply port via PutMsg
    this.putMsg(replyPortAddr, msgAddr, { suppressDoorCallback: true });

    console.log(`[ExecLibrary] Reply sent`);
  }

  /**
   * Helper: Dump AEDoor message structure for debugging
   */
  private dumpAEDoorMessage(msgAddr: number): void {
    // struct Message (20 bytes)
    const mn_Node = this.emulator.readMemory32(msgAddr + 0);
    const mn_ReplyPort = this.emulator.readMemory32(msgAddr + 14);
    const mn_Length = this.emulator.readMemory16(msgAddr + 18);

    // AEDoor message extension
    const command = this.emulator.readMemory32(msgAddr + 20);
    const data = this.emulator.readMemory32(msgAddr + 24);

    // Read string (first 32 bytes)
    let str = "";
    for (let i = 0; i < 32; i++) {
      const ch = this.emulator.readMemory(msgAddr + 28 + i);
      if (ch === 0) break;
      str += String.fromCharCode(ch);
    }

    console.log(`[ExecLibrary] AEDoor Message dump:`);
    console.log(`  mn_ReplyPort: 0x${mn_ReplyPort.toString(16)}`);
    console.log(`  mn_Length: ${mn_Length}`);
    console.log(`  command: ${command}`);
    console.log(`  data: ${data}`);
    console.log(`  string: "${str}"`);
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
    console.log(`[ExecLibrary] StackSwap(struct=0x${structAddr.toString(16)})`);
    const callerPC = this.emulator.getRegister(CPURegister.PC);
    console.log(`[ExecLibrary]   Called from PC=0x${callerPC.toString(16)}`);
    const rawWords: string[] = [];
    for (let offset = 0; offset < 12; offset += 4) {
      const word = this.emulator.readMemory32(structAddr + offset);
      rawWords.push(`0x${word.toString(16)}`);
    }
    console.log(`[ExecLibrary]   Raw struct dump: [${rawWords.join(", ")}]`);

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

    console.log(
      `[ExecLibrary]   OLD: Lower=0x${oldLower.toString(
        16
      )}, Upper=0x${oldUpper.toString(16)}, SP=0x${oldPointer.toString(16)}`
    );
    console.log(
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

    console.log(
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
    console.log(`[ExecLibrary] Wait(signalMask=0x${signalMask.toString(16)})`);
    console.log(
      `[ExecLibrary]   Current sigRecvd: 0x${this.currentTask.sigRecvd.toString(
        16
      )}`
    );

    if (signalMask === 0) {
      console.log("[ExecLibrary]   Wait(0) called, returning immediately");
      return 0;
    }

    const mask = signalMask >>> 0;

    // Check if any requested signals are already received
    const receivedSignals = this.currentTask.sigRecvd & mask;

    if (receivedSignals !== 0) {
      // Signals already present - return immediately
      console.log(
        `[ExecLibrary]   *** Signals already received: 0x${receivedSignals.toString(
          16
        )} ***`
      );
      console.log(`[ExecLibrary]   Returning immediately (no need to wait)`);

      // Clear the returned signals from sigRecvd
      this.currentTask.sigRecvd &= ~receivedSignals;
      console.log(
        `[ExecLibrary]   Cleared signals from sigRecvd, new value: 0x${this.currentTask.sigRecvd.toString(
          16
        )}`
      );
      this.currentTask.sigWait = 0;
      this.currentTask.state = 0; // TS_READY

      return receivedSignals;
    }

    // No signals present - BLOCK the task until signals arrive
    console.log(
      `[ExecLibrary]   No signals present - BLOCKING task execution`
    );
    console.log(
      `[ExecLibrary]   Setting sigWait=0x${mask.toString(
        16
      )} (task is now waiting)`
    );

    this.currentTask.sigWait = mask;
    this.currentTask.state = 2; // TS_WAIT
    this.currentTask.isWaiting = true;

    // PAUSE emulator execution until Signal() resumes us
    // IMPORTANT: We return 0 now, but keep sigWait set so Signal() knows we're waiting.
    // Signal() will:
    //   1. Check sigWait to see if task is waiting
    //   2. Set sigRecvd with the signals
    //   3. Call emulator.resume()
    // The door's polling loop will call Wait() again and find signals in sigRecvd.
    console.log("[ExecLibrary]   *** PAUSING EMULATOR - waiting for signals ***");
    console.log(`[ExecLibrary]   sigWait=0x${mask.toString(16)} isWaiting=true - Signal() will wake us`);

    this.emulator.pause(() => {
      console.log("[ExecLibrary]   *** RESUMED from Wait() - continuing execution ***");
    });

    // Return 0 to indicate no signals yet - door will poll again after resume
    // Don't clear sigWait here - Signal() checks it to know we're waiting
    console.log(`[ExecLibrary]   Returning 0 (waiting for Signal)`);
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
    console.log(
      `[ExecLibrary] Signal(task=0x${taskAddr.toString(
        16
      )}, signals=0x${signals.toString(16)})`
    );

    // If task is NULL (0), signal current task
    // For now, we only support signaling the current task (the door)
    if (taskAddr !== 0 && taskAddr !== this.currentTask.address) {
      console.warn(
        `[ExecLibrary]   WARNING: Cannot signal task 0x${taskAddr.toString(
          16
        )} (not current task)`
      );
      return;
    }

    console.log(
      `[ExecLibrary]   Target task: 0x${this.currentTask.address.toString(
        16
      )} (${this.currentTask.name})`
    );
    console.log(
      `[ExecLibrary]   Signal bits to set: 0x${signals.toString(16)}`
    );
    console.log(
      `[ExecLibrary]   Current sigRecvd: 0x${this.currentTask.sigRecvd.toString(
        16
      )}`
    );

    // 1. OR signals into task's tc_SigRecvd field
    this.currentTask.sigRecvd |= signals;
    console.log(
      `[ExecLibrary]   New sigRecvd: 0x${this.currentTask.sigRecvd.toString(
        16
      )}`
    );

    // 2. Check if task is waiting (sigWait != 0 means TS_WAIT)
    if (this.currentTask.sigWait !== 0) {
      console.log(
        `[ExecLibrary]   Task is waiting for signals: 0x${this.currentTask.sigWait.toString(
          16
        )}`
      );

      // 3. Check if any of the received signals match what task is waiting for
      const matchedSignals =
        this.currentTask.sigRecvd & this.currentTask.sigWait;
      if (matchedSignals !== 0) {
        console.log(
          `[ExecLibrary]   *** SIGNAL MATCH! Matched bits: 0x${matchedSignals.toString(
            16
          )} ***`
        );
        console.log(`[ExecLibrary]   *** RESUMING EMULATOR - waking task from Wait() ***`);

        // Wake the task if it's blocked in Wait()
        if (this.currentTask.isWaiting) {
          this.currentTask.isWaiting = false;
          this.emulator.resume(); // RESUME emulator execution
        }

        this.currentTask.sigWait = 0;
        this.currentTask.state = 0; // TS_READY
      } else {
        console.log(`[ExecLibrary]   No match yet - task still waiting`);
      }
    } else {
      console.log(
        `[ExecLibrary]   Task not waiting (will receive signal when it calls Wait())`
      );
    }

    console.log(`[ExecLibrary]   Signal operation complete`);
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
    console.log(`[ExecLibrary] Forbid() - nest level now: ${this.forbidNest}`);
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
    console.log(`[ExecLibrary] Permit() - nest level now: ${this.forbidNest}`);
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
    console.log(
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

    const headPtr = this.emulator.readMemory32(headAddr);
    const newTailPred = this.emulator.readMemory32(tailPredAddr);
    console.log(
      `[ExecLibrary]   PortList updated: head=0x${headPtr.toString(
        16
      )} tailPred=0x${newTailPred.toString(16)}`
    );
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
    if (this.rawDoFmtCount <= 3) {
      console.log(
        `[ExecLibrary] RawDoFmt #${this.rawDoFmtCount} fmt="${fmt}" argv=0x${argvAddr.toString(
          16
        )} putch=0x${putChFunc.toString(16)} data=0x${putChDataPtr.toString(16)}`
      );
    }
    const formatted = this.formatRawString(fmt, argvAddr);

    // If a putch callback is provided, invoke it directly with D0=char and A3=putData.
    if (putChFunc !== 0) {
      const baseState = this.captureCpuState();
      const returnStub = this.ensureRawDoFmtReturnStub();
      for (let i = 0; i < formatted.length; i++) {
        this.invokePutChCallback(
          putChFunc,
          putChDataPtr,
          formatted.charCodeAt(i) & 0xff,
          baseState,
          returnStub
        );
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
  ): void {
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
    for (let steps = 0; steps < maxSteps; steps++) {
      this.emulator.executeInstruction();
      const pcNow = this.emulator.getRegister(CPURegister.PC);
      if (pcNow === returnStub) {
        returned = true;
        break;
      }
    }

    if (!returned) {
      console.warn(
        `[ExecLibrary] RawDoFmt putch callback did not return within ${maxSteps} steps (func=0x${funcAddr.toString(
          16
        )})`
      );
    }

    // Restore state for continued RawDoFmt processing
    this.restoreCpuState(baseState);
  }

  private formatRawString(fmt: string, argvAddr: number): string {
    let result = "";
    let argIndex = 0;

    for (let i = 0; i < fmt.length; i++) {
      if (fmt[i] === "%" && i + 1 < fmt.length) {
        const spec = fmt[i + 1];
        let longFormat = false;

        if (spec === "l" && i + 2 < fmt.length) {
          longFormat = true;
          i++;
        }

        const actualSpec = longFormat ? fmt[i + 1] : spec;

        switch (actualSpec) {
          case "s": {
            const strPtr = this.emulator.readMemory32(argvAddr + argIndex * 4);
            const str = this.emulator.readString(strPtr);
            result += str;
            argIndex++;
            i++;
            break;
          }
          case "d":
          case "u": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += (val | 0).toString(10);
            argIndex++;
            i++;
            break;
          }
          case "x":
          case "X": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += val.toString(16);
            argIndex++;
            i++;
            break;
          }
          case "c": {
            const val = this.emulator.readMemory32(argvAddr + argIndex * 4);
            result += String.fromCharCode(val & 0xff);
            argIndex++;
            i++;
            break;
          }
          case "%": {
            result += "%";
            i++;
            break;
          }
          default: {
            result += fmt[i];
            break;
          }
        }
      } else {
        result += fmt[i];
      }
    }

    return result;
  }

}

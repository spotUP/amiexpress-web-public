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
  sigRecvd: number; // Signals received (bits OR'd together)
  sigWait: number; // Signals waiting for (0 = not waiting)
  state: number; // Task state (TS_READY, TS_WAIT, etc.)
  msgPort: number; // Message port address (for Process structure)
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
  private nextFreeMemory: number = 0x080000; // Start allocating at 512KB

  // Message port tracking
  private messagePorts: Map<number, MessagePort> = new Map(); // address -> port
  private publicPorts: Map<string, number> = new Map(); // lower-case name -> address
  private nextPortAddress: number = 0x0a0000; // Start at 640KB

  // Semaphore tracking
  private publicSemaphores: Map<string, number> = new Map(); // name -> address

  // Signal allocation tracking (32 signals, bits 0-31)
  private allocatedSignals: number = 0; // Bitmask of allocated signals

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

  // Standard library addresses (for stubs)
  private readonly EXEC_BASE_ADDR = 0x010000; // ExecBase at 64KB
  private readonly DOS_LIB_ADDR = 0x020000; // DOS.library at 128KB
  private readonly AEDOOR_LIB_ADDR = 0x030000; // AEDoor.library at 192KB
  private readonly ICON_LIB_ADDR = 0x040000; // icon.library at 256KB
  private readonly INTUITION_LIB_ADDR = 0x050000; // intuition.library at 320KB
  private readonly UTILITY_LIB_ADDR = 0x070000; // utility.library at 448KB
  private readonly PORT_LIST_OFFSET = 392;

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;

    // Initialize ExecBase structure
    this.execBase = {
      address: this.EXEC_BASE_ADDR,
      version: 37, // Kickstart 2.04+
      revision: 175, // Standard revision
      idString: 0, // TODO: Create version string
      softVer: 37, // Kickstart 2.04
      thisTask: 0, // Will be set when creating task
      libList: 0, // TODO: Create list
      taskReady: 0, // TODO: Create list
      eclockFrequency: 709379, // PAL E-clock frequency
    };

    // Create current task (the door itself)
    const taskMsgPortAddr = 0x07005c; // Process msg port at task + 0x5C
    this.currentTask = {
      address: 0x070000, // Task structure at 448KB
      name: "Door Task",
      node: 0x070000,
      sigRecvd: 0, // No signals received yet
      sigWait: 0, // Not waiting for signals (0 = TS_READY)
      state: 0, // TS_READY
      msgPort: taskMsgPortAddr, // Message port for Process structure
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
      `[ExecLibrary] Storing WaitPort return address 0x${returnAddr.toString(16)}`
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
    const STUB_FUNCTION_ADDR = 0xf00f00;
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

    // Exception handler code location (high memory, won't conflict with door)
    const EXCEPTION_HANDLER_BASE = 0xf00000;

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

        // Check if already opened
        const existing = this.libraries.get(name);
        if (existing) {
          existing.openCount++;
          console.log(
            `[ExecLibrary]   Already open, count=${existing.openCount}`
          );
          return { success: true, address: existing.address, isNative: false };
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
        break;

      case "utility.library":
        libAddr = this.UTILITY_LIB_ADDR;
        libVersion = 37;
        libRevision = 0;
        break;

      default:
        console.log(`[ExecLibrary]   Unknown library: ${name}`);
        return 0; // NULL
    }

    // Check version requirement
    if (version > libVersion) {
      console.log(
        `[ExecLibrary]   Version ${version} > available ${libVersion}, returning NULL`
      );
      return 0; // NULL
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

    // Handle common Exec.library functions
    switch (offset) {
      case -30: // OpenLibrary
        // OpenLibrary is handled through the main openLibrary method
        // This is a trap call, so we need to get parameters from registers
        console.log(`[ExecLibrary]   OpenLibrary trap called`);
        // The actual OpenLibrary logic is handled in openLibrary() method
        // which gets called by the trap handler
        return true;

      case -36: // CloseLibrary
        console.log(`[ExecLibrary]   CloseLibrary trap called`);
        // Get library address from A1 register
        const libAddr = this.emulator.getRegister(13); // A1
        if (libAddr !== 0) {
          this.closeLibrary(libAddr);
          this.emulator.setRegister(0, 0); // Return 0 (success)
        }
        return true;

      case -294: // FindTask
        console.log(`[ExecLibrary]   FindTask trap called`);
        // Get name pointer from A1 register
        const nameAddr = this.emulator.getRegister(13); // A1
        const result = this.findTask(nameAddr);
        this.emulator.setRegister(0, result); // Return task address in D0
        return true;

      case -198: // AllocMem
        console.log(`[ExecLibrary]   AllocMem trap called`);
        const size = this.emulator.getRegister(0); // D0
        const flags = this.emulator.getRegister(1); // D1
        const allocResult = this.allocMem(size, flags);
        this.emulator.setRegister(0, allocResult); // Return memory address in D0
        return true;

      case -210: // FreeMem
        console.log(`[ExecLibrary]   FreeMem trap called`);
        const addr = this.emulator.getRegister(0); // D0
        const freeSize = this.emulator.getRegister(1); // D1
        this.freeMem(addr, freeSize);
        this.emulator.setRegister(0, 0); // Return 0 (success)
        return true;

      case -390: // FindPort
        console.log(`[ExecLibrary]   FindPort trap called`);
        const portNameAddr = this.emulator.getRegister(13); // A1
        const portResult = this.findPort(portNameAddr);
        this.emulator.setRegister(0, portResult); // Return port address in D0
        return true;

      case -306: // SetTaskPri
        console.log(`[ExecLibrary]   SetTaskPri trap called`);
        const taskAddr = this.emulator.getRegister(13); // A1
        const newPri = this.emulator.getRegister(0); // D0
        const priResult = this.setTaskPri(taskAddr, newPri);
        this.emulator.setRegister(0, priResult); // Return old priority in D0
        return true;

      case -330: // AllocSignal
        console.log(`[ExecLibrary]   AllocSignal trap called`);
        const sigNum = this.emulator.getRegister(0); // D0
        const sigResult = this.AllocSignal(sigNum);
        this.emulator.setRegister(0, sigResult); // Return signal number in D0
        return true;

      default:
        console.log(
          `[ExecLibrary]   Unknown exec.library function offset: ${offset}`
        );
        return false;
    }
  }

  openLibrary(nameAddr: number, version: number): number {
    // Read library name from memory
    const name = this.emulator.readString(nameAddr);

    console.log(`[ExecLibrary] OpenLibrary("${name}", ${version})`);

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
      const libPath = path.join(process.cwd(), "Libs", "AEDoor.library");
      console.log(`[ExecLibrary] Loading real AEDoor.library from: ${libPath}`);

      if (!fs.existsSync(libPath)) {
        console.log(
          `[ExecLibrary] ERROR: AEDoor.library not found at ${libPath}`
        );
        return false;
      }

      const binary = fs.readFileSync(libPath);
      console.log(
        `[ExecLibrary] Read ${binary.length} bytes from AEDoor.library`
      );

      // Parse Amiga hunk format
      let offset = 0;

      // Skip to HUNK_CODE (0x000003E9) after header
      // The library starts at offset 0x20 based on hexdump
      const codeStart = 0x20;
      const codeSize = 0x3f0; // ~1KB of code+data

      // Copy the library code to AEDOOR_LIB_ADDR
      const destAddr = this.AEDOOR_LIB_ADDR;
      console.log(
        `[ExecLibrary] Copying library code to 0x${destAddr.toString(16)}`
      );

      for (let i = 0; i < codeSize && codeStart + i < binary.length; i++) {
        this.emulator.writeMemory(destAddr + i, binary[codeStart + i]);
      }

      console.log(`[ExecLibrary] AEDoor.library loaded successfully`);
      console.log(`[ExecLibrary]   Base address: 0x${destAddr.toString(16)}`);
      console.log(`[ExecLibrary]   Code size: ${codeSize} bytes`);

      // The library has a jump table at negative offsets from the base
      // LVO offsets are at: -30 (CreateComm), -36 (DeleteComm), etc.
      // These are RTS instructions (0x4E75) or JMP instructions

      return true;
    } catch (error) {
      console.log(`[ExecLibrary] ERROR loading AEDoor.library:`, error);
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

    const addr = this.nextFreeMemory;
    this.nextFreeMemory += alignedSize;

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
    const allocation = this.allocations.get(addr);
    if (allocation) {
      this.allocations.delete(addr);
      console.log(
        `[ExecLibrary] FreeMem(0x${addr.toString(
          16
        )}, ${size}) - freed ${allocation} bytes`
      );
    } else {
      console.log(
        `[ExecLibrary] FreeMem(0x${addr.toString(16)}, ${size}) - not tracked`
      );
    }
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
    const lib = this.libraries.get(name);
    return lib ? lib.address : 0;
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
      const mpFlags = this.emulator.readMemory(portAddr + 14);
      const sigBitRaw = this.emulator.readMemory(portAddr + 15);
      const sigTaskRaw = this.emulator.readMemory32(portAddr + 16);
      const namePtr = this.emulator.readMemory32(portAddr + 10);
      let name = "";
      if (namePtr) {
        try {
          name = this.emulator.readString(namePtr);
        } catch {
          name = "";
        }
      }

      const port: MessagePort = {
        address: portAddr,
        name,
        messages: [],
        sigBit: typeof sigBitRaw === "number" ? sigBitRaw : 0,
        sigTask: sigTaskRaw || this.currentTask.address,
        signaled: false,
      };

      this.messagePorts.set(portAddr, port);
      console.log(
        `[ExecLibrary]   Auto-registered port at 0x${portAddr.toString(
          16
        )} (${name || "private"})`
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

    // Otherwise, find any free signal (0-31)
    for (let i = 0; i < 32; i++) {
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
    console.log(`[ExecLibrary] FindPort("${name}")`);

    // CORRECT IMPLEMENTATION: Search for port in public registry
    // FindPort() should NOT create ports - it only searches for existing ones
    const portAddr = this.publicPorts.get(name.toLowerCase());

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
      name: "", // Private port (no name)
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

    // Get the port from registry
    const port = this.messagePorts.get(portAddr);
    if (!port) {
      throw new Error(`Failed to create public port "${name}"`);
    }

    // Set the name
    port.name = name;

    // Write name to port structure (ln_Name at offset 10)
    // Allocate memory for name string
    const nameAddr = this.allocMem(name.length + 1, 0);
    this.emulator.writeString(nameAddr, name);
    this.emulator.writeMemory32(portAddr + 10, nameAddr);

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

    // CRITICAL: Set message type to NT_MESSAGE (5) as per autodocs
    // Message.mn_Node.ln_Type is at offset 8
    const NT_MESSAGE = 5;
    this.emulator.writeMemory(msgAddr + 8, NT_MESSAGE);

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
    const isAEDoorPort = port.name?.startsWith("AEDoorPort");
    const isDoorTaskPort = originalPortAddr === this.currentTask.msgPort;
    if (
      !suppressDoorCallback &&
      this.doorMessageCallback &&
      (isAEDoorPort || isDoorTaskPort)
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
    console.log(`[ExecLibrary] GetMsg(port=0x${portAddr.toString(16)})`);

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
        `[ExecLibrary] WaitPort: Port at 0x${portAddr.toString(
          16
        )} not in registry, auto-registering`
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
      return 0;
    }

    // MESSAGE FOUND! Remove from queue and return it (mirrors Exec behavior where WaitPort returns the message)
    const msgAddr = port.messages.shift() as number;
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

    console.log(`[ExecLibrary] ReplyMsg(msg=0x${msgAddr.toString(16)})`);
    console.log(`[ExecLibrary]   Reply Port: 0x${replyPortAddr.toString(16)}`);

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
    const oldLower = 0xfd000; // Standard CLI stack lower bound
    const oldUpper = 0xfe000; // Standard CLI stack upper bound (4KB)

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

    // No signals present - in real Amiga, task would block here
    // Mark the task as waiting and return 0 to indicate "still waiting"
    console.log(
      `[ExecLibrary]   No signals present - task would block on real Amiga`
    );
    console.log(
      `[ExecLibrary]   Setting sigWait=0x${mask.toString(
        16
      )} (task is now waiting)`
    );

    this.currentTask.sigWait = mask;
    this.currentTask.state = 2; // TS_WAIT

    console.log("[ExecLibrary]   Returning 0 (no signals yet)");
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
   * This would normally set the signal bits in the task structure
   * and wake the task if it's blocked in Wait().
   *
   * Our stub implementation just logs the operation.
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
        console.log(`[ExecLibrary]   *** Task should wake from Wait() now ***`);
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

  /**
   * CopyMem - General purpose memory copy
   * A0 = source address
   * A1 = dest address
   * D0 = size (bytes)
   *
   * Copies memory from source to dest. Handles arbitrary lengths and alignments.
   * Does NOT support overlapping copies.
   */
  copyMem(source: number, dest: number, size: number): void {
    console.log(
      `[ExecLibrary] CopyMem(src=0x${source.toString(
        16
      )}, dst=0x${dest.toString(16)}, size=${size})`
    );

    if (size === 0) {
      return;
    }

    // Byte-by-byte copy (simple but works for all alignments)
    for (let i = 0; i < size; i++) {
      const byte = this.emulator.readMemory(source + i);
      this.emulator.writeMemory(dest + i, byte);
    }
  }

  /**
   * CopyMemQuick - Optimized memory copy for aligned data
   * A0 = source address (must be longword aligned)
   * A1 = dest address (must be longword aligned)
   * D0 = size (must be multiple of 4)
   *
   * Optimized version that requires longword alignment.
   * Does NOT support overlapping copies.
   */
  copyMemQuick(source: number, dest: number, size: number): void {
    console.log(
      `[ExecLibrary] CopyMemQuick(src=0x${source.toString(
        16
      )}, dst=0x${dest.toString(16)}, size=${size})`
    );

    if (size === 0) {
      return;
    }

    // Verify alignment
    if (source % 4 !== 0 || dest % 4 !== 0 || size % 4 !== 0) {
      console.warn(
        `[ExecLibrary]   WARNING: CopyMemQuick requires longword alignment!`
      );
      // Fall back to byte copy
      this.copyMem(source, dest, size);
      return;
    }

    // Longword copy (4 bytes at a time)
    for (let i = 0; i < size; i += 4) {
      const long = this.emulator.readMemory32(source + i);
      this.emulator.writeMemory32(dest + i, long);
    }
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
   * AllocVec - Allocate memory and track size (V36+)
   * D0 = byteSize
   * D1 = attributes (MEMF_PUBLIC, MEMF_CHIP, MEMF_CLEAR, etc.)
   * Returns: D0 = memory block address (or 0 on failure)
   *
   * Like AllocMem but tracks the size internally so FreeVec doesn't need size.
   * We store size in a hidden header before the returned pointer.
   */
  allocVec(byteSize: number, attributes: number): number {
    console.log(
      `[ExecLibrary] AllocVec(size=${byteSize}, attrs=0x${attributes.toString(
        16
      )})`
    );

    if (byteSize === 0) {
      console.log(`[ExecLibrary]   Zero-size allocation - returning NULL`);
      return 0;
    }

    // Allocate extra 4 bytes for size header
    const totalSize = byteSize + 4;
    const headerAddr = this.allocMem(totalSize, attributes);

    if (headerAddr === 0) {
      console.log(`[ExecLibrary]   Allocation failed - out of memory`);
      return 0;
    }

    // Write size to header (first 4 bytes)
    this.emulator.writeMemory32(headerAddr, byteSize);

    // Return pointer after header
    const userAddr = headerAddr + 4;
    console.log(
      `[ExecLibrary]   Allocated at 0x${userAddr.toString(
        16
      )} (header at 0x${headerAddr.toString(16)})`
    );

    return userAddr;
  }

  /**
   * FreeVec - Free memory allocated by AllocVec (V36+)
   * A1 = memory block address (or NULL)
   *
   * Frees memory allocated by AllocVec. Size is retrieved from hidden header.
   * Passing NULL is safe (does nothing).
   */
  freeVec(memoryBlock: number): void {
    console.log(`[ExecLibrary] FreeVec(addr=0x${memoryBlock.toString(16)})`);

    if (memoryBlock === 0) {
      console.log(`[ExecLibrary]   NULL pointer - nothing to free`);
      return;
    }

    // Read size from header (4 bytes before user pointer)
    const headerAddr = memoryBlock - 4;
    const size = this.emulator.readMemory32(headerAddr);

    console.log(`[ExecLibrary]   Size from header: ${size} bytes`);

    // Free including header
    const totalSize = size + 4;
    this.freeMem(headerAddr, totalSize);

    console.log(
      `[ExecLibrary]   Freed ${totalSize} bytes at 0x${headerAddr.toString(16)}`
    );
  }
}

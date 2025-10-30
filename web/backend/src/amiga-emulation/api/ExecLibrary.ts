/**
 * Exec.library Emulation for XIM Door Execution
 *
 * Following vAmiga's ExecBase structure and Amiga Exec.library API
 * Reference: Docs/vAmiga/Core/Misc/OSDebugger/OSDebuggerTypes.h
 *
 * This implements the core Exec.library functions that doors use,
 * WITHOUT full hardware emulation or ROM boot.
 */

import { MoiraEmulator } from './MoiraEmulator';

/**
 * ExecBase structure (616 bytes for V36+)
 * Located at address pointed to by 0x000004
 */
interface ExecBaseStructure {
  address: number;           // Where ExecBase lives in memory

  // Library node (34 bytes)
  version: number;           // lib_Version (20): Major version
  revision: number;          // lib_Revision (22): Minor revision
  idString: number;          // lib_IdString (24): Pointer to version string

  // ExecBase specific
  softVer: number;           // SoftVer (34): Kickstart version
  thisTask: number;          // ThisTask (276): Current task pointer

  // Lists
  libList: number;           // LibList (378): Head of library list
  taskReady: number;         // TaskReady (406): Ready tasks

  // V36 additions
  eclockFrequency: number;   // ex_EClockFrequency (568): E-clock freq
}

/**
 * Library structure (34 bytes)
 */
interface LibraryNode {
  address: number;           // Where library lives
  name: string;              // Library name
  version: number;           // Version
  revision: number;          // Revision
  openCount: number;         // Number of opens
  negSize: number;           // Jump table size (negative offset)
  posSize: number;           // Data size (positive offset)
}

/**
 * Task structure (minimal)
 */
interface Task {
  address: number;
  name: string;
  node: number;
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

  // Standard library addresses (for stubs)
  private readonly EXEC_BASE_ADDR = 0x010000;    // ExecBase at 64KB
  private readonly DOS_LIB_ADDR = 0x020000;       // DOS.library at 128KB
  private readonly AEDOOR_LIB_ADDR = 0x030000;    // AEDoor.library at 192KB
  private readonly ICON_LIB_ADDR = 0x040000;      // icon.library at 256KB
  private readonly INTUITION_LIB_ADDR = 0x050000; // intuition.library at 320KB

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;

    // Initialize ExecBase structure
    this.execBase = {
      address: this.EXEC_BASE_ADDR,
      version: 37,        // Kickstart 2.04+
      revision: 175,      // Standard revision
      idString: 0,        // TODO: Create version string
      softVer: 37,        // Kickstart 2.04
      thisTask: 0,        // Will be set when creating task
      libList: 0,         // TODO: Create list
      taskReady: 0,       // TODO: Create list
      eclockFrequency: 709379, // PAL E-clock frequency
    };

    // Create current task (the door itself)
    this.currentTask = {
      address: 0x070000,  // Task structure at 448KB
      name: 'Door Task',
      node: 0x070000,
    };
    this.execBase.thisTask = this.currentTask.address;

    console.log('[ExecLibrary] Initialized');
    console.log(`[ExecLibrary] ExecBase at 0x${this.execBase.address.toString(16)}`);
  }

  /**
   * Initialize the Exec system
   * - Create ExecBase structure in memory
   * - Set pointer at 0x000004
   * - Create initial task
   */
  initialize(): void {
    console.log('[ExecLibrary] Creating ExecBase structure...');

    // Write ExecBase pointer at 0x000004 (absolute address 4)
    this.emulator.writeMemory32(0x000004, this.execBase.address);
    console.log(`[ExecLibrary] Wrote ExecBase pointer at 0x000004 -> 0x${this.execBase.address.toString(16)}`);

    // Write ExecBase structure to memory
    this.writeExecBaseToMemory();

    // Write current task structure
    this.writeTaskToMemory(this.currentTask);

    console.log('[ExecLibrary] ExecBase initialized successfully');
  }

  /**
   * Write ExecBase structure to emulator memory
   * Following the structure from vAmiga
   */
  private writeExecBaseToMemory(): void {
    const addr = this.execBase.address;

    // Library node header (34 bytes)
    // For now, minimal initialization
    this.emulator.writeMemory16(addr + 20, this.execBase.version);   // lib_Version
    this.emulator.writeMemory16(addr + 22, this.execBase.revision);  // lib_Revision
    this.emulator.writeMemory32(addr + 24, this.execBase.idString);  // lib_IdString

    // ExecBase specific fields
    this.emulator.writeMemory16(addr + 34, this.execBase.softVer);   // SoftVer
    this.emulator.writeMemory32(addr + 276, this.execBase.thisTask); // ThisTask
    this.emulator.writeMemory32(addr + 378, this.execBase.libList);  // LibList

    // V36 additions
    this.emulator.writeMemory32(addr + 568, this.execBase.eclockFrequency); // ex_EClockFrequency

    console.log(`[ExecLibrary] ExecBase structure written to 0x${addr.toString(16)}`);
    console.log(`[ExecLibrary]   Version: ${this.execBase.version}.${this.execBase.revision}`);
    console.log(`[ExecLibrary]   ThisTask: 0x${this.execBase.thisTask.toString(16)}`);
  }

  /**
   * Write Task structure to memory
   */
  private writeTaskToMemory(task: Task): void {
    // Minimal task structure for now
    // TODO: Implement full task structure when needed
    console.log(`[ExecLibrary] Task structure at 0x${task.address.toString(16)}: ${task.name}`);
  }

  /**
   * OpenLibrary(name, version) -> library base or NULL
   *
   * Opens a library and returns its base address.
   * Returns NULL if library cannot be opened.
   *
   * Implementation: Return stub library structures for known libraries
   */
  openLibrary(nameAddr: number, version: number): number {
    // Read library name from memory
    const name = this.emulator.readString(nameAddr);

    console.log(`[ExecLibrary] OpenLibrary("${name}", ${version})`);

    // Check if library is already open
    const existing = this.libraries.get(name);
    if (existing) {
      existing.openCount++;
      console.log(`[ExecLibrary]   Already open, count=${existing.openCount}`);
      return existing.address;
    }

    // Create library structure based on name
    let libAddr = 0;
    let libVersion = 0;
    let libRevision = 0;

    switch (name.toLowerCase()) {
      case 'exec.library':
        libAddr = this.EXEC_BASE_ADDR;
        libVersion = 37;
        libRevision = 175;
        break;

      case 'dos.library':
        libAddr = this.DOS_LIB_ADDR;
        libVersion = 37;
        libRevision = 0;
        break;

      case 'aedoor.library':
        libAddr = this.AEDOOR_LIB_ADDR;
        libVersion = 1;
        libRevision = 0;
        break;

      case 'icon.library':
        libAddr = this.ICON_LIB_ADDR;
        libVersion = 36;
        libRevision = 0;
        break;

      case 'intuition.library':
        libAddr = this.INTUITION_LIB_ADDR;
        libVersion = 36;
        libRevision = 0;
        break;

      default:
        console.log(`[ExecLibrary]   Unknown library: ${name}`);
        return 0; // NULL
    }

    // Check version requirement
    if (version > libVersion) {
      console.log(`[ExecLibrary]   Version ${version} > available ${libVersion}, returning NULL`);
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

    console.log(`[ExecLibrary]   Opened at 0x${libAddr.toString(16)}, v${libVersion}.${libRevision}`);
    return libAddr;
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
        console.log(`[ExecLibrary] CloseLibrary(${name}), count=${lib.openCount}`);

        if (lib.openCount <= 0) {
          this.libraries.delete(name);
          console.log(`[ExecLibrary]   Library ${name} fully closed`);
        }
        return;
      }
    }

    console.log(`[ExecLibrary] CloseLibrary(0x${libAddr.toString(16)}) - unknown library`);
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
      console.log(`[ExecLibrary] FindTask(NULL) -> 0x${this.currentTask.address.toString(16)} (current task)`);
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
        this.emulator.writeMemory8(addr + i, 0);
      }
    }

    console.log(`[ExecLibrary] AllocMem(${size}, 0x${flags.toString(16)}) -> 0x${addr.toString(16)}`);
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
      console.log(`[ExecLibrary] FreeMem(0x${addr.toString(16)}, ${size}) - freed ${allocation} bytes`);
    } else {
      console.log(`[ExecLibrary] FreeMem(0x${addr.toString(16)}, ${size}) - not tracked`);
    }
  }

  /**
   * Write Library structure to memory
   */
  private writeLibraryToMemory(lib: LibraryNode): void {
    const addr = lib.address;

    // Write library node header
    this.emulator.writeMemory16(addr + 16, lib.negSize);   // lib_NegSize
    this.emulator.writeMemory16(addr + 18, lib.posSize);   // lib_PosSize
    this.emulator.writeMemory16(addr + 20, lib.version);   // lib_Version
    this.emulator.writeMemory16(addr + 22, lib.revision);  // lib_Revision
    this.emulator.writeMemory16(addr + 32, lib.openCount); // lib_OpenCnt

    console.log(`[ExecLibrary]   Library structure written: ${lib.name} v${lib.version}.${lib.revision}`);
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
}

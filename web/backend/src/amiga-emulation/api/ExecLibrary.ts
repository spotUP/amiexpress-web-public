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
import * as fs from 'fs';
import * as path from 'path';

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
  sigRecvd: number;      // Signals received (bits OR'd together)
  sigWait: number;       // Signals waiting for (0 = not waiting)
  state: number;         // Task state (TS_READY, TS_WAIT, etc.)
}

/**
 * Message Port structure
 * Used for inter-process communication
 */
interface MessagePort {
  address: number;           // Port address in memory
  name: string;              // Port name (if public)
  messages: number[];        // Queue of message addresses
  sigBit: number;            // Signal bit
  sigTask: number;           // Task to signal
  signaled: boolean;         // Has message arrived
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
  private publicPorts: Map<string, number> = new Map(); // name -> address
  private nextPortAddress: number = 0x0A0000; // Start at 640KB

  // Door message callback - called when door sends message to AEDoorPort
  private doorMessageCallback: ((portAddr: number, msgAddr: number) => void) | null = null;

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
      sigRecvd: 0,        // No signals received yet
      sigWait: 0,         // Not waiting for signals (0 = TS_READY)
      state: 0,           // TS_READY
    };
    this.execBase.thisTask = this.currentTask.address;

    console.log('[ExecLibrary] Initialized');
    console.log(`[ExecLibrary] ExecBase at 0x${this.execBase.address.toString(16)}`);
  }

  /**
   * Set callback for when door sends message to AEDoorPort
   * This allows AmigaDoorSession to process messages via trap interception
   * instead of polling GetMsg()
   */
  setDoorMessageCallback(callback: (portAddr: number, msgAddr: number) => void): void {
    this.doorMessageCallback = callback;
  }

  /**
   * Initialize the Exec system
   * - Create ExecBase structure in memory
   * - Set pointer at 0x000004
   * - Create initial task
   * - Override ROM exception vectors with simple handlers
   */
  initialize(): void {
    console.log('[ExecLibrary] Creating ExecBase structure...');

    // ROM loaded but its exception handlers expect fully booted system
    // Override with our simple handlers that skip instructions
    this.setupExceptionVectors();

    // Write ExecBase pointer at 0x000004 (absolute address 4)
    this.emulator.writeMemory32(0x000004, this.execBase.address);
    console.log(`[ExecLibrary] Wrote ExecBase pointer at 0x000004 -> 0x${this.execBase.address.toString(16)}`);

    // Create stub function for unknown system vectors
    // Some programs (like GetAnswer) load function pointers from low memory
    // We create a stub that just does RTS (return immediately)
    const STUB_FUNCTION_ADDR = 0xF00F00;
    this.emulator.writeMemory16(STUB_FUNCTION_ADDR, 0x4E75);  // RTS instruction
    console.log(`[ExecLibrary] Created stub function at 0x${STUB_FUNCTION_ADDR.toString(16)}`);

    // Point common low memory vectors to stub function
    // These might be used by C runtime or BBS-specific code
    const LOW_MEMORY_VECTORS = [
      0x00F4,  // Used by GetAnswer door
      0x00F8,  // Potential related vector
      0x00FC,  // Potential related vector
    ];

    for (const addr of LOW_MEMORY_VECTORS) {
      this.emulator.writeMemory32(addr, STUB_FUNCTION_ADDR);
      console.log(`[ExecLibrary] Stub vector at 0x${addr.toString(16).padStart(4, '0')} -> 0x${STUB_FUNCTION_ADDR.toString(16)}`);
    }

    // Write ExecBase structure to memory
    this.writeExecBaseToMemory();

    // Write current task structure
    this.writeTaskToMemory(this.currentTask);

    console.log('[ExecLibrary] ExecBase initialized successfully');
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
    console.log('[ExecLibrary] Setting up exception vectors...');

    // Exception handler code location (high memory, won't conflict with door)
    const EXCEPTION_HANDLER_BASE = 0xF00000;

    // Create exception handlers that skip the offending instruction
    for (let i = 0; i < 64; i++) {
      const handlerAddr = EXCEPTION_HANDLER_BASE + (i * 32);

      // Exception handler code:
      // ADDQ.L #2, 2(SP)    ; Skip 2 bytes (most 68000 instructions are 2+ bytes)
      // RTE                 ; Return from exception
      //
      // This increments the return PC by 2, skipping the instruction that caused the exception

      // ADDQ.L #2, 2(SP) = 0x5AAF 0x0002
      this.emulator.writeMemory16(handlerAddr + 0, 0x5AAF);
      this.emulator.writeMemory16(handlerAddr + 2, 0x0002);

      // RTE = 0x4E73
      this.emulator.writeMemory16(handlerAddr + 4, 0x4E73);

      // Write the handler address to the exception vector
      const vectorAddr = i * 4;
      this.emulator.writeMemory32(vectorAddr, handlerAddr);
    }

    console.log('[ExecLibrary] Exception vectors initialized (0x00-0xFF)');
    console.log(`[ExecLibrary] Exception handlers at 0x${EXCEPTION_HANDLER_BASE.toString(16)}`);
    console.log('[ExecLibrary] Handlers skip offending instruction (+2 bytes) and RTE');
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
  // Callback for when a library is opened (used to install traps)
  private onLibraryOpened: ((name: string, addr: number) => void) | null = null;

  /**
   * Set callback for when a library is opened
   */
  setLibraryOpenedCallback(callback: (name: string, addr: number) => void): void {
    this.onLibraryOpened = callback;
  }

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

    // Notify callback (used to install library traps)
    if (this.onLibraryOpened) {
      this.onLibraryOpened(name, libAddr);
    }

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
   * Load real AEDoor.library binary from disk
   * This loads the actual compiled Amiga library and copies it into emulated memory
   */
  loadRealAEDoorLibrary(): boolean {
    try {
      const libPath = path.join(process.cwd(), 'Libs', 'AEDoor.library');
      console.log(`[ExecLibrary] Loading real AEDoor.library from: ${libPath}`);

      if (!fs.existsSync(libPath)) {
        console.log(`[ExecLibrary] ERROR: AEDoor.library not found at ${libPath}`);
        return false;
      }

      const binary = fs.readFileSync(libPath);
      console.log(`[ExecLibrary] Read ${binary.length} bytes from AEDoor.library`);

      // Parse Amiga hunk format
      let offset = 0;

      // Skip to HUNK_CODE (0x000003E9) after header
      // The library starts at offset 0x20 based on hexdump
      const codeStart = 0x20;
      const codeSize = 0x3F0; // ~1KB of code+data

      // Copy the library code to AEDOOR_LIB_ADDR
      const destAddr = this.AEDOOR_LIB_ADDR;
      console.log(`[ExecLibrary] Copying library code to 0x${destAddr.toString(16)}`);

      for (let i = 0; i < codeSize && (codeStart + i) < binary.length; i++) {
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
        this.emulator.writeMemory(addr + i, 0);
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

  /**
   * Get library base address by name
   */
  getLibraryBase(name: string): number {
    const lib = this.libraries.get(name);
    return lib ? lib.address : 0;
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

    console.log(`[ExecLibrary] SetTaskPri(task=0x${taskAddr.toString(16)}, newPri=${newPri})`);

    // Read old priority from task structure (offset 9 in Task structure)
    const oldPri = this.emulator.readMemory(taskAddr + 9);

    // Write new priority
    this.emulator.writeMemory(taskAddr + 9, newPri & 0xFF);

    console.log(`  Old priority: ${oldPri}, New priority: ${newPri}`);

    return oldPri;
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
    const portAddr = this.publicPorts.get(name);

    if (portAddr !== undefined) {
      console.log(`[ExecLibrary]   Found "${name}" at 0x${portAddr.toString(16)}`);
      return portAddr;
    }

    // Check for other known ports (libraries can act as ports)
    if (name.toLowerCase() === 'dos.library') {
      const dosLib = this.libraries.get('dos.library');
      if (dosLib) {
        console.log(`[ExecLibrary]   Returning dos.library at 0x${dosLib.address.toString(16)}`);
        return dosLib.address;
      }
    }

    console.log(`[ExecLibrary]   Port "${name}" not found - returning NULL`);
    return 0;
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
    console.log('[ExecLibrary] CreateMsgPort()');

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
    this.emulator.writeMemory32(portAddr + 0, 0);  // ln_Succ
    this.emulator.writeMemory32(portAddr + 4, 0);  // ln_Pred
    this.emulator.writeMemory(portAddr + 8, 0);     // ln_Type (NT_MSGPORT=4)
    this.emulator.writeMemory(portAddr + 9, 0);     // ln_Pri
    this.emulator.writeMemory32(portAddr + 10, 0); // ln_Name

    // mp_Flags (1 byte at offset 14)
    this.emulator.writeMemory(portAddr + 14, 0x02); // PA_SIGNAL

    // mp_SigBit (1 byte at offset 15)
    this.emulator.writeMemory(portAddr + 15, 1); // Signal bit 1

    // mp_SigTask (4 bytes at offset 16)
    this.emulator.writeMemory32(portAddr + 16, this.currentTask.address);

    // mp_MsgList (14 bytes at offset 20)
    // Initialize as empty list
    this.emulator.writeMemory32(portAddr + 20, portAddr + 24); // lh_Head (points to Tail)
    this.emulator.writeMemory32(portAddr + 24, 0);              // lh_Tail (always NULL)
    this.emulator.writeMemory32(portAddr + 28, portAddr + 20); // lh_TailPred (points to Head)
    this.emulator.writeMemory(portAddr + 32, 0);                // lh_Type
    this.emulator.writeMemory(portAddr + 33, 0);                // l_pad

    // Track port in our registry
    const port: MessagePort = {
      address: portAddr,
      name: '',  // Private port (no name)
      messages: [],
      sigBit: 1,
      sigTask: this.currentTask.address,
      signaled: false
    };
    this.messagePorts.set(portAddr, port);

    console.log(`[ExecLibrary]   Created MsgPort at 0x${portAddr.toString(16)}`);
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
      console.log(`[ExecLibrary]   Detected data segment address 0x${portAddr.toString(16)}`);
      console.log(`[ExecLibrary]   Reading port pointer from memory: 0x${actualPortAddr.toString(16)}`);

      if (actualPortAddr === 0) {
        console.log(`[ExecLibrary]   Port pointer is NULL - DoorStart() never initialized it`);
        return;
      }

      // Recurse with actual port address
      return this.deleteMsgPort(actualPortAddr);
    }

    // Check if portAddr is NULL (0) or very small (likely NULL)
    if (portAddr === 0 || portAddr < 0x1000) {
      console.log(`[ExecLibrary]   NULL or invalid port address: 0x${portAddr.toString(16)} - ignoring`);
      return;
    }

    // Read the first few bytes of the port structure to see if it's valid
    const portData = {
      ln_Succ: this.emulator.readMemory32(portAddr + 0),
      ln_Pred: this.emulator.readMemory32(portAddr + 4),
      ln_Type: this.emulator.readMemory(portAddr + 8),
      mp_Flags: this.emulator.readMemory(portAddr + 14),
      mp_SigBit: this.emulator.readMemory(portAddr + 15)
    };
    console.log(`[ExecLibrary]   Port structure at 0x${portAddr.toString(16)}:`, portData);

    const port = this.messagePorts.get(portAddr);
    if (!port) {
      console.error(`[ExecLibrary]   Port not tracked in messagePorts map (address: 0x${portAddr.toString(16)})`);
      console.error(`[ExecLibrary]   Known ports:`, Array.from(this.messagePorts.keys()).map(a => `0x${a.toString(16)}`).join(', '));
      return;
    }

    // Remove from public registry if it has a name
    if (port.name) {
      this.publicPorts.delete(port.name);
      console.log(`[ExecLibrary]   Removed public port "${port.name}"`);
    }

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
    this.publicPorts.set(name, portAddr);

    console.log(`[ExecLibrary]   Public port "${name}" created at 0x${portAddr.toString(16)}`);
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
  putMsg(portAddr: number, msgAddr: number): void {
    console.log(`[ExecLibrary] PutMsg(port=0x${portAddr.toString(16)}, msg=0x${msgAddr.toString(16)})`);

    const port = this.messagePorts.get(portAddr);
    if (!port) {
      console.error(`[ExecLibrary]   Port not found: 0x${portAddr.toString(16)}`);
      return;
    }

    // Add message to port's queue
    port.messages.push(msgAddr);
    port.signaled = true;

    // CRITICAL: Write message to memory structure so door can see it!
    // MsgPort.mp_MsgList.lh_Head is at offset 20
    const listHeadOffset = 20;
    this.emulator.writeMemory32(portAddr + listHeadOffset, msgAddr);

    console.log(`[ExecLibrary]   ✓ Message queued to port memory structure`);
    console.log(`[ExecLibrary]   ✓ Wrote message address 0x${msgAddr.toString(16)} to port+20 (mp_MsgList.lh_Head)`);
    console.log(`[ExecLibrary]   Port now has ${port.messages.length} message(s) in queue`);

    // *** CRITICAL: Signal the port's task (if PA_SIGNAL flag set) ***
    // This is the missing piece! The door is waiting for this signal.
    const mp_Flags = this.emulator.readMemory(portAddr + 14);
    const PA_SIGNAL = 0x02;

    if (mp_Flags & PA_SIGNAL) {
      console.log(`[ExecLibrary]   Port has PA_SIGNAL flag - signaling task`);
      console.log(`[ExecLibrary]   Port sigTask: 0x${port.sigTask.toString(16)}, sigBit: ${port.sigBit}`);

      // Signal the task that owns this port
      if (port.sigTask !== 0) {
        const signalMask = 1 << port.sigBit; // Convert bit number to mask
        console.log(`[ExecLibrary]   *** Calling Signal() to wake waiting task ***`);
        this.signal(port.sigTask, signalMask);
      } else {
        console.warn(`[ExecLibrary]   WARNING: Port has no sigTask set!`);
      }
    } else {
      console.log(`[ExecLibrary]   Port does not have PA_SIGNAL flag (no task to signal)`);
    }

    // If this is an AEDoorPort, invoke callback for trap-based message processing
    // ONLY invoke for messages TO AEDoorPort (name check), not reply ports
    const isAEDoorPort = port.name?.startsWith('AEDoorPort');
    if (isAEDoorPort) {
      console.log(`[ExecLibrary]   *** This is ${port.name} - invoking door message callback ***`);
      if (this.doorMessageCallback) {
        this.doorMessageCallback(portAddr, msgAddr);
      } else {
        console.warn(`[ExecLibrary]   WARNING: No door message callback set!`);
        this.dumpAEDoorMessage(msgAddr);
      }
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
      console.error(`[ExecLibrary]   Port not found: 0x${portAddr.toString(16)}`);
      return 0;
    }

    // Check if port has messages
    if (port.messages.length === 0) {
      console.log(`[ExecLibrary]   No messages in port`);
      return 0;
    }

    // Dequeue first message
    const msgAddr = port.messages.shift()!;
    console.log(`[ExecLibrary]   Returning message at 0x${msgAddr.toString(16)}, ${port.messages.length} remaining`);

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
    const port = this.messagePorts.get(portAddr);
    if (!port) {
      console.error(`[ExecLibrary] WaitPort: Port not found: 0x${portAddr.toString(16)}`);
      return 0;
    }

    // Check if port has messages
    if (port.messages.length === 0) {
      // No message - would block on real Amiga, we return 0
      return 0;
    }

    // MESSAGE FOUND! Return first message WITHOUT removing it
    const msgAddr = port.messages[0];
    console.log(`[ExecLibrary] ===============================================`);
    console.log(`[ExecLibrary] *** WaitPort RETURNS MESSAGE! ***`);
    console.log(`[ExecLibrary] ===============================================`);
    console.log(`[ExecLibrary]   Port: 0x${portAddr.toString(16)}`);
    console.log(`[ExecLibrary]   Message: 0x${msgAddr.toString(16)}`);
    console.log(`[ExecLibrary]   Queue length: ${port.messages.length}`);
    console.log(`[ExecLibrary] ===============================================`);
    return msgAddr;
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
    let str = '';
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

    // Read the new stack values from the structure
    const newLower = this.emulator.readMemory32(structAddr + 0);
    const newUpper = this.emulator.readMemory32(structAddr + 4);
    const newPointer = this.emulator.readMemory32(structAddr + 8);

    console.log(`[ExecLibrary]   New stack: Lower=0x${newLower.toString(16)}, Upper=0x${newUpper.toString(16)}, Pointer=0x${newPointer.toString(16)}`);

    // Get current stack pointer from A7 (SP)
    const oldPointer = this.emulator.getRegister(15);

    // For simplicity, we'll assume the old stack bounds are what we set up initially
    // In a real implementation, we'd track these in the Task structure
    const oldLower = 0xFD000;   // Default stack lower bound (from door setup)
    const oldUpper = 0xFE000;   // Default stack upper bound (4KB stack)

    console.log(`[ExecLibrary]   Old stack: Lower=0x${oldLower.toString(16)}, Upper=0x${oldUpper.toString(16)}, Pointer=0x${oldPointer.toString(16)}`);

    // Write the old stack values back to the structure
    this.emulator.writeMemory32(structAddr + 0, oldLower);
    this.emulator.writeMemory32(structAddr + 4, oldUpper);
    this.emulator.writeMemory32(structAddr + 8, oldPointer);

    // Switch to the new stack by setting SP (A7)
    this.emulator.setRegister(15, newPointer);

    console.log(`[ExecLibrary]   Stack swapped! SP now 0x${newPointer.toString(16)}`);
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
   * In our emulator, we can't truly block, so we implement a stub
   * that returns immediately with the signal mask, simulating success.
   * This allows the door to continue execution.
   */
  wait(signalMask: number): number {
    console.log(`[ExecLibrary] Wait(signalMask=0x${signalMask.toString(16)})`);
    console.log(`[ExecLibrary]   Current sigRecvd: 0x${this.currentTask.sigRecvd.toString(16)}`);

    // Check if any requested signals are already received
    const receivedSignals = this.currentTask.sigRecvd & signalMask;

    if (receivedSignals !== 0) {
      // Signals already present - return immediately
      console.log(`[ExecLibrary]   *** Signals already received: 0x${receivedSignals.toString(16)} ***`);
      console.log(`[ExecLibrary]   Returning immediately (no need to wait)`);

      // Clear the returned signals from sigRecvd
      this.currentTask.sigRecvd &= ~receivedSignals;
      console.log(`[ExecLibrary]   Cleared signals from sigRecvd, new value: 0x${this.currentTask.sigRecvd.toString(16)}`);

      return receivedSignals;
    }

    // No signals present - in real Amiga, task would block here
    // In our emulator, we can't truly block, so we mark the task as waiting
    // and return 0 to indicate "would block"
    console.log(`[ExecLibrary]   No signals present - task would block on real Amiga`);
    console.log(`[ExecLibrary]   Setting sigWait=0x${signalMask.toString(16)} (task is now waiting)`);

    this.currentTask.sigWait = signalMask;
    this.currentTask.state = 2; // TS_WAIT

    // In our emulator, we return immediately with the mask
    // The door's polling loop will continue until Signal() is called
    console.log(`[ExecLibrary]   Returning mask=0x${signalMask.toString(16)} (emulator: non-blocking)`);
    return signalMask;
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
    console.log(`[ExecLibrary] Signal(task=0x${taskAddr.toString(16)}, signals=0x${signals.toString(16)})`);

    // If task is NULL (0), signal current task
    // For now, we only support signaling the current task (the door)
    if (taskAddr !== 0 && taskAddr !== this.currentTask.address) {
      console.warn(`[ExecLibrary]   WARNING: Cannot signal task 0x${taskAddr.toString(16)} (not current task)`);
      return;
    }

    console.log(`[ExecLibrary]   Target task: 0x${this.currentTask.address.toString(16)} (${this.currentTask.name})`);
    console.log(`[ExecLibrary]   Signal bits to set: 0x${signals.toString(16)}`);
    console.log(`[ExecLibrary]   Current sigRecvd: 0x${this.currentTask.sigRecvd.toString(16)}`);

    // 1. OR signals into task's tc_SigRecvd field
    this.currentTask.sigRecvd |= signals;
    console.log(`[ExecLibrary]   New sigRecvd: 0x${this.currentTask.sigRecvd.toString(16)}`);

    // 2. Check if task is waiting (sigWait != 0 means TS_WAIT)
    if (this.currentTask.sigWait !== 0) {
      console.log(`[ExecLibrary]   Task is waiting for signals: 0x${this.currentTask.sigWait.toString(16)}`);

      // 3. Check if any of the received signals match what task is waiting for
      const matchedSignals = this.currentTask.sigRecvd & this.currentTask.sigWait;
      if (matchedSignals !== 0) {
        console.log(`[ExecLibrary]   *** SIGNAL MATCH! Matched bits: 0x${matchedSignals.toString(16)} ***`);
        console.log(`[ExecLibrary]   *** Task should wake from Wait() now ***`);
        // Task will wake when Wait() checks sigRecvd next
      } else {
        console.log(`[ExecLibrary]   No match yet - task still waiting`);
      }
    } else {
      console.log(`[ExecLibrary]   Task not waiting (will receive signal when it calls Wait())`);
    }

    console.log(`[ExecLibrary]   Signal operation complete`);
  }
}

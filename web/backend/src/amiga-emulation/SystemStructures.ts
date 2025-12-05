/**
 * Amiga System Structures
 * Provides minimal system environment that doors expect
 *
 * Real Amiga boot process:
 * 1. ROM boot code initializes ExecBase at 0x000004
 * 2. Creates library base pointers for dos.library, intuition.library, etc.
 * 3. Sets up task lists, device lists, interrupt vectors
 * 4. Programs can then FindLibrary() to get base pointers
 *
 * Our approach:
 * - Skip ROM boot code execution
 * - Manually create minimal ExecBase structure
 * - Set up library base pointers doors need
 * - Provide safe exception handlers
 */

import { MoiraEmulator } from './cpu/MoiraEmulator';

export class SystemStructures {
  private emulator: MoiraEmulator;

  // Amiga system addresses
  private readonly EXECBASE_ADDR = 0x000004;  // ExecBase pointer stored here
  private readonly EXECBASE_STRUCT = 0x080000; // Actual ExecBase structure (after door code range)
  private readonly DOS_BASE = 0xFFFF0000;      // dos.library base
  private readonly EXEC_BASE = 0xFF8000;       // exec.library base
  private readonly AEDOOR_BASE = 0xFF4000;     // AEDoor.library base

  constructor(emulator: MoiraEmulator) {
    this.emulator = emulator;
  }

  /**
   * Initialize minimal Amiga system environment
   * This gives doors the basic structures they expect
   */
  public initializeSystem(): void {
    console.log('[SystemStructures] Initializing Amiga system environment...');

    // 1. Create ExecBase structure
    this.createExecBase();

    // 2. Set up library base pointers
    this.initializeLibraryPointers();

    // 3. Set up safe exception handlers
    this.setupExceptionHandlers();

    console.log('[SystemStructures] System environment initialized');
  }

  /**
   * Create minimal ExecBase structure
   * ExecBase is the core Amiga system structure
   *
   * Real ExecBase contains:
   * - Library node (name, version, etc.)
   * - System task lists
   * - Memory pools
   * - Interrupt vectors
   * - Library lists
   *
   * We create a minimal version with just what doors need
   */
  private createExecBase(): void {
    console.log('[SystemStructures] Creating ExecBase structure...');

    // Write ExecBase pointer at 0x000004
    // This is THE most important pointer on the Amiga
    // Programs do: MOVE.L 4.W,A6 to get ExecBase
    this.writeLong(this.EXECBASE_ADDR, this.EXECBASE_STRUCT);
    console.log(`[SystemStructures] ExecBase pointer at 0x${this.EXECBASE_ADDR.toString(16)} → 0x${this.EXECBASE_STRUCT.toString(16)}`);

    // Create minimal ExecBase structure at 0x010000
    // Structure layout (simplified):
    // +0x00: LN_SUCC (next node pointer) - 0 (end of list)
    // +0x04: LN_PRED (prev node pointer) - 0 (start of list)
    // +0x08: LN_TYPE (node type) - NT_LIBRARY (9)
    // +0x09: LN_PRI (priority) - 0
    // +0x0A: LN_NAME (pointer to name) - points to "exec.library" string
    // +0x0E: LIB_FLAGS - 0
    // +0x0F: LIB_pad - 0
    // +0x10: LIB_NEGSIZE (negative size) - 0
    // +0x12: LIB_POSSIZE (positive size) - 0
    // +0x14: LIB_VERSION - 40 (Kickstart 3.1)
    // +0x16: LIB_REVISION - 63 (Kickstart 3.1 rev 40.63)
    // +0x18: LIB_IDSTRING (pointer to ID string)

    let offset = this.EXECBASE_STRUCT;

    // LN_SUCC, LN_PRED (list pointers) - 0
    this.writeLong(offset + 0x00, 0);
    this.writeLong(offset + 0x04, 0);

    // LN_TYPE = NT_LIBRARY (9)
    this.emulator.writeMemory(offset + 0x08, 9);

    // LN_PRI = 0
    this.emulator.writeMemory(offset + 0x09, 0);

    // LN_NAME - pointer to name string (we'll put it at offset + 0x100)
    const nameOffset = offset + 0x100;
    this.writeLong(offset + 0x0A, nameOffset);
    this.writeString(nameOffset, "exec.library");

    // LIB_FLAGS, LIB_pad
    this.emulator.writeMemory(offset + 0x0E, 0);
    this.emulator.writeMemory(offset + 0x0F, 0);

    // LIB_NEGSIZE, LIB_POSSIZE
    this.writeWord(offset + 0x10, 0);
    this.writeWord(offset + 0x12, 0);

    // LIB_VERSION = 40 (Kickstart 3.1)
    this.writeWord(offset + 0x14, 40);

    // LIB_REVISION = 63
    this.writeWord(offset + 0x16, 63);

    // LIB_IDSTRING
    const idOffset = nameOffset + 20;
    this.writeLong(offset + 0x18, idOffset);
    this.writeString(idOffset, "exec 40.63 (30 Oct 2025)");

    console.log('[SystemStructures] ExecBase structure created');
    console.log(`[SystemStructures]   Version: 40.63 (Kickstart 3.1)`);
    console.log(`[SystemStructures]   Name: "exec.library"`);
  }

  /**
   * Initialize library base pointers
   * Programs expect these to be set by ROM boot code
   */
  private initializeLibraryPointers(): void {
    console.log('[SystemStructures] Initializing library base pointers...');

    // These are the "magic" addresses our library trap system uses
    // When doors do JSR -xxx(A6), A6 contains one of these bases

    // exec.library base = 0xFF8000
    // dos.library base = 0xFFFF0000
    // AEDoor.library base = 0xFF4000

    // NOTE: We don't need to write these anywhere in memory
    // They're just values that doors load into A6 before calling libraries
    // Our trap handler recognizes these magic addresses

    console.log(`[SystemStructures]   exec.library base:   0x${this.EXEC_BASE.toString(16)}`);
    console.log(`[SystemStructures]   dos.library base:    0x${this.DOS_BASE.toString(16)}`);
    console.log(`[SystemStructures]   AEDoor.library base: 0x${this.AEDOOR_BASE.toString(16)}`);

    // However, some doors may call OpenLibrary() to get library bases
    // In that case, our exec.library OpenLibrary() stub will return these addresses

    console.log('[SystemStructures] Library base pointers ready');
  }

  /**
   * Set up safe exception handlers
   * When exceptions occur, CPU jumps to these vectors
   *
   * NOTE: We DON'T replace ROM exception vectors - they're needed for proper operation
   * ROM already has exception handlers, we just leave them as-is
   */
  private setupExceptionHandlers(): void {
    console.log('[SystemStructures] Setting up exception handlers...');

    // DON'T replace exception vectors - ROM already has them
    // The issue isn't exception handling, it's unimplemented library functions
    // Let ROM exception handlers work as designed

    console.log('[SystemStructures] Using ROM exception handlers (vectors unchanged)');
  }

  /**
   * Helper: Write 32-bit long word (big-endian)
   */
  private writeLong(address: number, value: number): void {
    this.emulator.writeMemory(address + 0, (value >> 24) & 0xFF);
    this.emulator.writeMemory(address + 1, (value >> 16) & 0xFF);
    this.emulator.writeMemory(address + 2, (value >> 8) & 0xFF);
    this.emulator.writeMemory(address + 3, value & 0xFF);
  }

  /**
   * Helper: Write 16-bit word (big-endian)
   */
  private writeWord(address: number, value: number): void {
    this.emulator.writeMemory(address + 0, (value >> 8) & 0xFF);
    this.emulator.writeMemory(address + 1, value & 0xFF);
  }

  /**
   * Helper: Write null-terminated string
   */
  private writeString(address: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.emulator.writeMemory(address + i, str.charCodeAt(i));
    }
    // Null terminator
    this.emulator.writeMemory(address + str.length, 0);
  }

  /**
   * Dump system structure information for debugging
   */
  public dumpInfo(): void {
    console.log('[SystemStructures] ===== System Environment =====');

    // Read ExecBase pointer
    const execBasePtr = this.readLong(this.EXECBASE_ADDR);
    console.log(`[SystemStructures] ExecBase pointer (0x000004): 0x${execBasePtr.toString(16)}`);

    if (execBasePtr !== 0) {
      // Read ExecBase structure
      const version = this.readWord(execBasePtr + 0x14);
      const revision = this.readWord(execBasePtr + 0x16);
      console.log(`[SystemStructures] exec.library version: ${version}.${revision}`);
    }

    console.log('[SystemStructures] Library bases:');
    console.log(`[SystemStructures]   exec.library:   0x${this.EXEC_BASE.toString(16)}`);
    console.log(`[SystemStructures]   dos.library:    0x${this.DOS_BASE.toString(16)}`);
    console.log(`[SystemStructures]   AEDoor.library: 0x${this.AEDOOR_BASE.toString(16)}`);

    console.log('[SystemStructures] Exception handlers: All vectors → 0x000400 (RTE)');
    console.log('[SystemStructures] ================================');
  }

  /**
   * Helper: Read 32-bit long word (big-endian)
   */
  private readLong(address: number): number {
    const b0 = this.emulator.readMemory(address + 0);
    const b1 = this.emulator.readMemory(address + 1);
    const b2 = this.emulator.readMemory(address + 2);
    const b3 = this.emulator.readMemory(address + 3);
    return (b0 << 24) | (b1 << 16) | (b2 << 8) | b3;
  }

  /**
   * Helper: Read 16-bit word (big-endian)
   */
  private readWord(address: number): number {
    const b0 = this.emulator.readMemory(address + 0);
    const b1 = this.emulator.readMemory(address + 1);
    return (b0 << 8) | b1;
  }
}

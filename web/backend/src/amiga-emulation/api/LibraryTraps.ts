/**
 * Library Call Trapping for Amiga Door Execution
 *
 * Amiga libraries use JSR to negative offsets from the library base.
 * Example: JSR -30(A6) calls OpenLibrary
 *
 * We intercept these calls by placing ILLEGAL instructions at the
 * vector addresses, which trigger exceptions that we can handle.
 *
 * This allows doors to call library functions without needing the
 * actual library code in memory.
 */

import { MoiraEmulator } from '../cpu/MoiraEmulator';
import { ExecLibrary } from './ExecLibrary';

/**
 * Library function vector entry
 */
interface LibraryVector {
  offset: number;      // Negative offset from library base
  name: string;        // Function name (for logging)
  handler: (emulator: MoiraEmulator, library: any) => number; // Returns D0
}

/**
 * Exec.library function vectors
 * Reference: Amiga ROM Kernel Reference Manual & exec.library FD file
 * LVO = Library Vector Offset (in bytes from library base)
 */
const EXEC_VECTORS: LibraryVector[] = [
  {
    offset: -552,  // LVO -552 (0xFDD8)
    name: 'OpenLibrary',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9);   // A1
      const version = emu.getRegister(0);    // D0
      return lib.openLibrary(nameAddr, version);
    }
  },
  {
    offset: -414,  // LVO -414 (0xFE62)
    name: 'CloseLibrary',
    handler: (emu, lib: ExecLibrary) => {
      const libAddr = emu.getRegister(9);    // A1
      lib.closeLibrary(libAddr);
      return 0;  // No return value
    }
  },
  {
    offset: -132,  // LVO -132 (0xFF7C)
    name: 'Forbid',
    handler: (emu, lib: ExecLibrary) => {
      console.log('[ExecLibrary] Forbid() - stub (no-op)');
      return 0;
    }
  },
  {
    offset: -138,  // LVO -138 (0xFF76)
    name: 'Permit',
    handler: (emu, lib: ExecLibrary) => {
      console.log('[ExecLibrary] Permit() - stub (no-op)');
      return 0;
    }
  },
  {
    offset: -198,  // LVO -198 (0xFF3A)
    name: 'AllocMem',
    handler: (emu, lib: ExecLibrary) => {
      const size = emu.getRegister(0);       // D0
      const flags = emu.getRegister(1);      // D1
      return lib.allocMem(size, flags);
    }
  },
  {
    offset: -210,  // LVO -210 (0xFF2E)
    name: 'FreeMem',
    handler: (emu, lib: ExecLibrary) => {
      const memAddr = emu.getRegister(9);    // A1
      const size = emu.getRegister(0);       // D0
      lib.freeMem(memAddr, size);
      return 0;
    }
  },
  {
    offset: -294,  // LVO -294 (0xFED6)
    name: 'FindTask',
    handler: (emu, lib: ExecLibrary) => {
      const nameAddr = emu.getRegister(9);   // A1
      return lib.findTask(nameAddr);
    }
  },
];

/**
 * Library trap handler
 *
 * Manages interception of library calls via ILLEGAL instructions
 * placed at library vector addresses.
 */
export class LibraryTraps {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;

  // Map of trap address -> vector entry
  private trapMap: Map<number, LibraryVector> = new Map();

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
  }

  /**
   * Install trap vectors for a library
   *
   * Builds a map of vector addresses to handlers.
   * No memory modification needed - we intercept at execution time.
   */
  installExecVectors(): void {
    const execBase = this.execLibrary.getExecBaseAddress();
    console.log(`[LibraryTraps] Installing Exec.library vectors at base 0x${execBase.toString(16)}`);

    for (const vector of EXEC_VECTORS) {
      const trapAddr = execBase + vector.offset;

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${EXEC_VECTORS.length} Exec.library vectors`);
  }

  /**
   * Handle a trapped library call
   *
   * Called when PC is at a library vector address BEFORE execution.
   * We execute our handler instead of the (nonexistent) library code.
   *
   * @param pc - Current program counter
   * @returns true if this is a library call and was handled
   */
  handleTrap(pc: number): boolean {
    const vector = this.trapMap.get(pc);

    if (!vector) {
      return false;  // Not a library trap
    }

    console.log(`[LibraryTraps] Intercepted: ${vector.name}() at PC=0x${pc.toString(16)}`);

    // Call the handler
    const result = vector.handler(this.emulator, this.execLibrary);

    // Set return value in D0
    this.emulator.setRegister(0, result);

    console.log(`[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`);

    // Simulate RTS: Pop return address from stack and jump to it
    const sp = this.emulator.getRegister(15);  // A7 (stack pointer)
    const returnAddr = this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4);     // Pop 4 bytes from stack
    this.emulator.setRegister(16, returnAddr); // Set PC to return address

    console.log(`[LibraryTraps] Returning to 0x${returnAddr.toString(16)}`);

    return true;  // Trap handled
  }

  /**
   * Check if an address is a library trap
   */
  isTrapAddress(addr: number): boolean {
    return this.trapMap.has(addr);
  }
}

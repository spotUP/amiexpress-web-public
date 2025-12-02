/**
 * BBS API Library for SIM Doors
 *
 * Implements the 0x790 BBS API calling convention used by SIM doors like WHO.
 *
 * Memory Layout:
 *   0x790 - Function pointer to BBS API dispatcher
 *   0x794 - Parameter block #1 (32 bytes)
 *   0x79c - Parameter block #2 (32 bytes)
 *
 * Calling Convention:
 *   - Door loads function pointer from 0x790 into A0
 *   - Door pushes parameter block address to stack
 *   - Door calls jsr (a0)
 *   - Dispatcher reads param block ptr from 4(sp)
 *   - Dispatcher returns success/failure in D0
 *
 * Based on WHO door analysis (Documentation/4-Door-Developers/WHO_BBS_API_ANALYSIS.md)
 */

import type { AmigaDoorSession } from '../AmigaDoorSession';
import type { MoiraEmulator } from '../cpu/MoiraEmulator';

export class BbsApiLibrary {
  private session: AmigaDoorSession;
  private emulator: MoiraEmulator;

  constructor(session: AmigaDoorSession, emulator: MoiraEmulator) {
    this.session = session;
    this.emulator = emulator;
  }

  /**
   * Main BBS API dispatcher
   *
   * Called when door executes:
   *   movea.l 0x790.l, a0
   *   jsr (a0)
   *
   * Stack layout:
   *   (sp)   = Return address (from jsr)
   *   4(sp)  = Pointer to parameter block
   *
   * Returns:
   *   D0 = 1 for success, 0 for failure
   */
  public dispatch(): number {
    try {
      const sp = this.emulator.getRegister(15); // A7/SP
      const paramBlockPtr = this.emulator.readMemory32(sp + 4);

      console.log(`\n[BBS API] Dispatcher called`);
      console.log(`[BBS API] Parameter block at: 0x${paramBlockPtr.toString(16)}`);
      console.log(`[BBS API] Stack pointer: 0x${sp.toString(16)}`);

      // Read and log parameter block contents (32 bytes = 8 longs)
      console.log(`[BBS API] Parameter block contents:`);
      for (let i = 0; i < 8; i++) {
        const offset = i * 4;
        const value = this.emulator.readMemory32(paramBlockPtr + offset);
        console.log(`[BBS API]   [+0x${offset.toString(16).padStart(2, '0')}] = 0x${value.toString(16).padStart(8, '0')}`);
      }

      // Also try reading as words (might be function code in first word)
      const word0 = this.emulator.readMemory16(paramBlockPtr + 0);
      const word1 = this.emulator.readMemory16(paramBlockPtr + 2);
      console.log(`[BBS API] First words: 0x${word0.toString(16).padStart(4, '0')}, 0x${word1.toString(16).padStart(4, '0')}`);

      // Return success for now
      console.log(`[BBS API] Returning success (D0 = 1)\n`);
      return 1;

    } catch (error) {
      console.error(`[BBS API] Error in dispatcher:`, error);
      return 0; // Failure
    }
  }

  /**
   * Allocate memory for BBS function table and parameter blocks
   * Called during LibraryManager initialization
   */
  public static setupLowMemory(emulator: MoiraEmulator): void {
    const BBS_FUNCTION_TABLE_BASE = 0x790;
    const BBS_PARAM_BLOCK_1 = 0x794;
    const BBS_PARAM_BLOCK_2 = 0x79c;

    console.log(`[BBS API] Setting up low-memory region 0x790-0x800`);

    // Initialize parameter blocks with zeros (32 bytes each)
    for (let i = 0; i < 32; i += 4) {
      emulator.writeMemory32(BBS_PARAM_BLOCK_1 + i, 0);
      emulator.writeMemory32(BBS_PARAM_BLOCK_2 + i, 0);
    }

    // Note: Function pointer at 0x790 will be set by LibraryManager
    // when it allocates the TRAP handler

    console.log(`[BBS API] Low-memory setup complete`);
  }
}

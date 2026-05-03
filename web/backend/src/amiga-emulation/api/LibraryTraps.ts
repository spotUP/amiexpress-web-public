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

import { MoiraEmulator } from "../cpu/MoiraEmulator";
import { ExecLibrary } from "./ExecLibrary";
import { AEDoorLibrary } from "./AEDoorLibrary";
import { DosLibrary } from "./DosLibrary";
import { IconLibrary } from "./IconLibrary";
import { UtilityLibrary } from "./UtilityLibrary";
import {
  MathFFPLibrary,
  MathTransLibrary,
  MathIEEEDoubBasLibrary,
  MathIEEEDoubTransLibrary,
  MathIEEESingBasLibrary,
  MathIEEESingTransLibrary,
} from "./MathLibrary";
import { IntuitionLibrary } from "./IntuitionLibrary";
import { BsdSocketLibrary } from "./BsdSocketLibrary";
import { AmiSSLMasterLibrary, AmiSSLLibrary } from "./AmiSSLLibrary";
import { EXEC_LVO_MAP, DOS_LVO_MAP } from "../constants/lvo-map";
import { getLvoName } from "../constants/lvo-names.generated";
import { debugLog } from "../../utils/debug-log";
import * as fs from "fs";
import * as amigafs from "../../utils/amigafs";
import * as path from "path";

// Cache the env-var check at module load. Hot-path conditional logging
// (handleTrap fires per Amiga library call) reads this hundreds of times
// per second; reading process.env each time would be slower.
const DEBUG_ENABLED = process.env.DEBUG_68K === '1' || process.env.DEBUG_68K === 'true';

// Import all library vectors from separate files
import {
  LibraryVector,
  AEDOOR_VECTORS,
  DOS_VECTORS,
  ICON_VECTORS,
  UTILITY_VECTORS,
  MATHFFP_VECTORS,
  MATHTRANS_VECTORS,
  MATHIEEEDOUBBAS_VECTORS,
  MATHIEEEDOUBTRANS_VECTORS,
  MATHIEEESINGBAS_VECTORS,
  MATHIEEESINGTRANS_VECTORS,
  INTUITION_VECTORS,
  EXEC_VECTORS,
  BSDSOCKET_VECTORS,
  AMISSLMASTER_VECTORS,
  AMISSL_VECTORS,
  DREAMDOOR_VECTORS,
} from "./library-vectors";
import { DreamDoorLibrary } from "./DreamDoorLibrary";

// Performance: Verbose logging is disabled by default
// Set DEBUG_LIBRARY_TRAPS=1 to enable detailed library call tracing
const DEBUG_LIBRARY_TRAPS = process.env.DEBUG_LIBRARY_TRAPS === "1";

// Global named object registry for utility.library (exported for use in utility-vectors.ts)
export const namedObjectRegistry = new Map<string, number>();
export const namedObjectState = { nextAddr: 0x00200000 }; // Wrap in object to allow mutation

/**
 * Library trap handler
 *
 * Manages interception of library calls via ILLEGAL instructions
 * placed at library vector addresses.
 */
export class LibraryTraps {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private aedoorLibrary: AEDoorLibrary | null = null;
  private dosLibrary: DosLibrary | null = null;
  private iconLibrary: IconLibrary | null = null;
  private utilityLibrary: UtilityLibrary | null = null;
  private mathFFPLibrary: MathFFPLibrary | null = null;
  private mathTransLibrary: MathTransLibrary | null = null;
  private mathIEEEDoubBasLibrary: MathIEEEDoubBasLibrary | null = null;
  private mathIEEEDoubTransLibrary: MathIEEEDoubTransLibrary | null = null;
  private mathIEEESingBasLibrary: MathIEEESingBasLibrary | null = null;
  private mathIEEESingTransLibrary: MathIEEESingTransLibrary | null = null;
  private intuitionLibrary: IntuitionLibrary | null = null;
  private bsdSocketLibrary: BsdSocketLibrary | null = null;
  private amisslMasterLibrary: AmiSSLMasterLibrary | null = null;
  private amisslLibrary: AmiSSLLibrary | null = null;
  private dreamDoorLibrary: DreamDoorLibrary | null = null;

  // Map of trap address -> vector entry
  private trapMap: Map<number, LibraryVector> = new Map();

  // Map of trap address -> library instance
  private libraryMap: Map<number, any> = new Map();

  // NEW: Map of offset -> array of vector entries (for offset-based trap detection)
  // Multiple libraries can use the same offset (e.g., -30 for Supervisor in Exec, Open in DOS)
  private offsetMap: Map<number, LibraryVector[]> = new Map();

  // NEW: Map of offset -> array of library instances (parallel to offsetMap)
  private offsetLibraryMap: Map<number, any[]> = new Map();

  // Optional callback for monitoring library calls
  private onLibraryCall?: (functionName: string, pc: number) => void;

  // Parsed offsets from dev/docs/LVOs.i (libName -> offsets)
  private lvoOffsetsByLibrary: Map<string, number[]> = new Map();

  /**
   * Helper to identify which library a trap belongs to for logging
   */
  private getLibraryName(library: any): string {
    if (!library) {
      return "unknown";
    }
    if (library === this.execLibrary) {
      return "exec.library";
    }
    if (library === this.dosLibrary) {
      return "dos.library";
    }
    if (library === this.aedoorLibrary) {
      return "AEDoor.library";
    }
    if (library === this.iconLibrary) {
      return "icon.library";
    }
    if (library === this.utilityLibrary) {
      return "utility.library";
    }
    if (library === this.mathFFPLibrary) {
      return "mathffp.library";
    }
    if (library === this.mathTransLibrary) {
      return "mathtrans.library";
    }
    if (library === this.mathIEEEDoubBasLibrary) {
      return "mathieeedoubbas.library";
    }
    if (library === this.mathIEEEDoubTransLibrary) {
      return "mathieeedoubtrans.library";
    }
    if (library === this.mathIEEESingBasLibrary) {
      return "mathieeesingbas.library";
    }
    if (library === this.mathIEEESingTransLibrary) {
      return "mathieeesingtrans.library";
    }
    if (library === this.intuitionLibrary) {
      return "intuition.library";
    }
    if (library === this.bsdSocketLibrary) {
      return "bsdsocket.library";
    }
    if (library === this.amisslMasterLibrary) {
      return "amisslmaster.library";
    }
    if (library === this.amisslLibrary) {
      return "amissl.library";
    }
    if ((library as any).libraryName) {
      return (library as any).libraryName;
    }
    return "unknown";
  }

  constructor(emulator: MoiraEmulator, execLibrary: ExecLibrary) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.loadLvoOffsetsFromFile();
  }

  /**
   * Set callback for monitoring library calls
   */
  setLibraryCallMonitor(
    callback: (functionName: string, pc: number) => void
  ): void {
    this.onLibraryCall = callback;
  }

  /**
   * Set the AEDoor.library instance
   */
  setAEDoorLibrary(lib: AEDoorLibrary): void {
    this.aedoorLibrary = lib;
  }

  /**
   * Set the DOS.library instance
   */
  setDOSLibrary(lib: DosLibrary): void {
    this.dosLibrary = lib;
  }

  /**
   * Set the icon.library instance
   */
  setIconLibrary(lib: IconLibrary): void {
    this.iconLibrary = lib;
  }

  /**
   * Set the utility.library instance
   */
  setUtilityLibrary(lib: UtilityLibrary): void {
    this.utilityLibrary = lib;
  }

  /**
   * Set the mathffp.library instance
   */
  setMathFFPLibrary(lib: MathFFPLibrary): void {
    this.mathFFPLibrary = lib;
  }

  /**
   * Set the mathtrans.library instance
   */
  setMathTransLibrary(lib: MathTransLibrary): void {
    this.mathTransLibrary = lib;
  }

  /**
   * Set the mathieeedoubbas.library instance
   */
  setMathIEEEDoubBasLibrary(lib: MathIEEEDoubBasLibrary): void {
    this.mathIEEEDoubBasLibrary = lib;
  }

  /**
   * Set the mathieeedoubtrans.library instance
   */
  setMathIEEEDoubTransLibrary(lib: MathIEEEDoubTransLibrary): void {
    this.mathIEEEDoubTransLibrary = lib;
  }

  /**
   * Set the mathieeesingbas.library instance
   */
  setMathIEEESingBasLibrary(lib: MathIEEESingBasLibrary): void {
    this.mathIEEESingBasLibrary = lib;
  }

  /**
   * Set the mathieeesingtrans.library instance
   */
  setMathIEEESingTransLibrary(lib: MathIEEESingTransLibrary): void {
    this.mathIEEESingTransLibrary = lib;
  }

  /**
   * Set the intuition.library instance
   */
  setIntuitionLibrary(lib: IntuitionLibrary): void {
    this.intuitionLibrary = lib;
  }

  /**
   * Set the bsdsocket.library instance
   */
  setBsdSocketLibrary(lib: BsdSocketLibrary): void {
    this.bsdSocketLibrary = lib;
  }

  /**
   * Set the amisslmaster.library instance
   */
  setAmiSSLMasterLibrary(lib: AmiSSLMasterLibrary): void {
    this.amisslMasterLibrary = lib;
  }

  /**
   * Set the amissl.library instance
   */
  setAmiSSLLibrary(lib: AmiSSLLibrary): void {
    this.amisslLibrary = lib;
  }

  /**
   * Set the dreamdoor.library instance
   */
  setDreamDoorLibrary(lib: DreamDoorLibrary): void {
    this.dreamDoorLibrary = lib;
  }

  /**
   * Register a custom trap handler at a specific address
   *
   * Used for non-library traps like BBS API dispatcher at 0x790
   *
   * @param address - Memory address where trap will be triggered
   * @param name - Descriptive name for the trap
   * @param handler - Function to call when trap is triggered
   * @param library - Optional library instance for context
   */
  registerCustomTrap(
    address: number,
    name: string,
    handler: (emu: MoiraEmulator) => number,
    library?: any
  ): void {
    const vector: LibraryVector = {
      offset: 0, // Not used for custom traps
      name: name,
      handler: handler,
    };

    this.trapMap.set(address, vector);
    if (library) {
      this.libraryMap.set(address, library);
    }

console.log(
      `[LibraryTraps] Registered custom trap '${name}' at 0x${address.toString(16)}`
    );
  }

  /**
   * Verify all installed ILLEGAL instructions are still in place.
   * Returns the number of verified traps and any that failed.
   */
  verifyIllegalInstructions(): { verified: number; failed: number; failedAddrs: number[] } {
    let verified = 0;
    let failed = 0;
    const failedAddrs: number[] = [];

    for (const [addr] of this.trapMap) {
      try {
        const opcode = this.emulator.readMemory16(addr);
        if (opcode === 0x4AFC) {
          verified++;
        } else {
          failed++;
          failedAddrs.push(addr);
console.error(
            `[LibraryTraps] VERIFICATION FAILED at 0x${addr.toString(16)}: expected 0x4AFC, got 0x${opcode.toString(16)}`
          );
        }
      } catch (e) {
        failed++;
        failedAddrs.push(addr);
console.error(
          `[LibraryTraps] VERIFICATION ERROR at 0x${addr.toString(16)}: ${e}`
        );
      }
    }

    if (failed > 0) {
console.error(
        `[LibraryTraps] VERIFICATION: ${verified} OK, ${failed} FAILED!`
      );
    } else {
console.log(
        `[LibraryTraps] VERIFICATION: All ${verified} ILLEGAL instructions verified OK`
      );
    }

    return { verified, failed, failedAddrs };
  }

  /**
   * Sync all registered trap addresses to MOIRA's C++ trap set.
   * This enables high-performance batch execution using executeUntilTrap().
   *
   * The C++ code uses an unordered_set for O(1) lookup of trap addresses,
   * allowing tight loop execution that only stops when a trap is hit.
   *
   * Call this AFTER all library vectors are installed.
   */
  syncTrapAddressesToMoira(): void {
    // First clear any existing trap addresses
    this.emulator.clearTrapAddresses();

    let count = 0;
    for (const [addr] of this.trapMap) {
      this.emulator.addTrapAddress(addr);
      count++;
    }

console.log(
      `[LibraryTraps] Synced ${count} trap addresses to MOIRA for batch execution`
    );
  }

  /**
   * Get the number of registered trap addresses
   */
  getTrapCount(): number {
    return this.trapMap.size;
  }

  /**
   * Install trap vectors for a library
   *
   * Writes ILLEGAL instruction (0x4AFC) at each vector address.
   * When door calls JSR -offset(A6), it hits ILLEGAL and we intercept.
   */
  installExecVectors(): void {
    const execBase = this.execLibrary.getExecBaseAddress();
console.log(
      `[LibraryTraps] Installing Exec.library vectors at base 0x${execBase.toString(
        16
      )}`
    );

    for (const vector of EXEC_VECTORS) {
      const trapAddr = execBase + vector.offset;

      // CRITICAL FIX: Write ILLEGAL instruction at vector address!
      // This is how we intercept library calls - when door does JSR -offset(A6),
      // it jumps to trapAddr which contains ILLEGAL, triggering our handler.
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Verify the write succeeded
      const verify = this.emulator.readMemory16(trapAddr);
      if (verify !== 0x4AFC) {
console.error(`[LibraryTraps] FAILED to write ILLEGAL at 0x${trapAddr.toString(16)}: got 0x${verify.toString(16)}`);
      }

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.execLibrary);

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.execLibrary);

      const name =
        vector.name ||
        EXEC_LVO_MAP[vector.offset] ||
        `exec@${vector.offset.toString(16)}`;
console.log(
        `  [${name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

console.log(
      `[LibraryTraps] Installed ${EXEC_VECTORS.length} Exec.library vectors`
    );

    // Stub any remaining Exec LVOs from LVOs.i so unknown calls fail gracefully
    this.installStubVectorsForLibrary(
      "exec.library",
      execBase,
      this.execLibrary
    );
  }

  /**
   * Install DOS.library vectors
   */
  installDOSVectors(): void {
    if (!this.dosLibrary) {
console.error(
        "[LibraryTraps] Cannot install DOS vectors: library not set"
      );
      return;
    }

    const dosBase = this.execLibrary.getLibraryBase("dos.library");
    if (dosBase === 0) {
console.error(
        "[LibraryTraps] Cannot install DOS vectors: library not opened"
      );
      return;
    }

console.log(
      `[LibraryTraps] Installing dos.library vectors at base 0x${dosBase.toString(
        16
      )}`
    );

    for (const vector of DOS_VECTORS) {
      const trapAddr = dosBase + vector.offset;

      // CRITICAL FIX: Write ILLEGAL instruction at vector address!
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.dosLibrary);

      // NEW: Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.dosLibrary);

      const name =
        vector.name ||
        DOS_LVO_MAP[vector.offset] ||
        `dos@${vector.offset.toString(16)}`;
console.log(
        `  [${name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

console.log(
      `[LibraryTraps] Installed ${DOS_VECTORS.length} dos.library vectors`
    );

    this.installStubVectorsForLibrary("dos.library", dosBase, this.dosLibrary);
  }

  /**
   * Install AEDoor.library vectors - DISABLED (2025-12-16)
   *
   * ARCHITECTURAL FIX:
   * Use the REAL native AEDoor.library binary for ALL functions.
   * Do NOT trap any AEDoor functions - let the native binary execute.
   *
   * The native binary correctly creates DIFace structures and handles
   * all door communication via XIM protocol (PutMsg/GetMsg to AEDoorPort).
   *
   * The native library's jump table is set up by ExecLibrary.loadRealAEDoorLibrary()
   * which creates JMP instructions at negative offsets pointing to the actual
   * function code in the loaded library binary.
   *
   * See: Documentation/7-Reference Sources/disasm/aedoor_library_disasm.asm
   */
  installAEDoorVectors(): void {
    if (!this.aedoorLibrary) {
console.error(
        "[LibraryTraps] Cannot install AEDoor vectors: library not set"
      );
      return;
    }

    const aedoorBase = this.execLibrary.getLibraryBase("AEDoor.library");
    if (aedoorBase === 0) {
console.error(
        "[LibraryTraps] Cannot install AEDoor vectors: library not opened"
      );
      return;
    }

console.log(
      `[LibraryTraps] ============================================`
    );
console.log(
      `[LibraryTraps] AEDoor.library vectors: TRAP MODE (TypeScript handlers)`
    );
console.log(
      `[LibraryTraps] Base address: 0x${aedoorBase.toString(16)}`
    );
console.log(
      `[LibraryTraps] Installing ${AEDOOR_VECTORS.length} trap handlers...`
    );
console.log(
      `[LibraryTraps] ============================================`
    );

    for (const vector of AEDOOR_VECTORS) {
      const trapAddr = aedoorBase + vector.offset;

      // DEBUG: Read what's at the address BEFORE we write
      const beforeWrite = this.emulator.readMemory16(trapAddr);

      // Write ILLEGAL instruction at vector address to trigger trap
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // DEBUG: Verify the write succeeded
      const afterWrite = this.emulator.readMemory16(trapAddr);
      const writeSucceeded = afterWrite === 0x4AFC;

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.aedoorLibrary);

      // Also store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.aedoorLibrary);

      // Log with before/after to diagnose trap installation issues
      const beforeStr = beforeWrite === 0x4EF9 ? "JMP" : beforeWrite === 0x4AFC ? "ILLEGAL" : `0x${beforeWrite.toString(16)}`;
      const status = writeSucceeded ? "OK" : "FAILED";
console.log(
        `  [${vector.name}] 0x${trapAddr.toString(16)} (offset ${vector.offset}): was ${beforeStr} -> now ${afterWrite === 0x4AFC ? "ILLEGAL" : `0x${afterWrite.toString(16)}`} [${status}]`
      );
    }

console.log(
      `[LibraryTraps] Installed ${AEDOOR_VECTORS.length} AEDoor.library vectors`
    );
  }

  /**
   * Install icon.library vectors
   */
  installIconVectors(): void {
    if (!this.iconLibrary) {
console.error(
        "[LibraryTraps] Cannot install icon vectors: library not set"
      );
      return;
    }

    const iconBase = this.execLibrary.getLibraryBase("icon.library");
    if (iconBase === 0) {
console.error(
        "[LibraryTraps] Cannot install icon vectors: library not opened"
      );
      return;
    }

console.log(
      `[LibraryTraps] Installing icon.library vectors at base 0x${iconBase.toString(
        16
      )}`
    );

    for (const vector of ICON_VECTORS) {
      const trapAddr = iconBase + vector.offset;

      // Write ILLEGAL instruction at vector address to trigger trap
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // VERIFY the write succeeded
      const verify = this.emulator.readMemory16(trapAddr);
      if (verify !== 0x4AFC) {
        console.error(`[LibraryTraps] FAILED to write ILLEGAL at icon.${vector.name} (0x${trapAddr.toString(16)}): got 0x${verify.toString(16)}`);
      }

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.iconLibrary);

      // Store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.iconLibrary);

console.log(
        `  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        }) [VERIFIED: 0x${verify.toString(16)}]`
      );
    }

    // Final verification - dump memory at GetDiskObject address
    const getDiskObjAddr = iconBase + (-30);
    const opcode = this.emulator.readMemory16(getDiskObjAddr);
console.log(`[LibraryTraps] *** icon.library GetDiskObject at 0x${getDiskObjAddr.toString(16)} contains: 0x${opcode.toString(16)} (should be 0x4AFC) ***`);

console.log(`[LibraryTraps] *** icon.library FULLY OPERATIONAL - ALL traps installed and ready ***`);

console.log(
      `[LibraryTraps] Installed ${ICON_VECTORS.length} icon.library vectors`
    );
  }

  /**
   * Install intuition.library vectors
   */
  installIntuitionVectors(): void {
    if (!this.intuitionLibrary) {
console.error(
        "[LibraryTraps] Cannot install intuition vectors: library not set"
      );
      return;
    }

    const intuitionBase = this.execLibrary.getLibraryBase("intuition.library");
    if (intuitionBase === 0) {
console.error(
        "[LibraryTraps] Cannot install intuition vectors: library not opened"
      );
      return;
    }

console.log(
      `[LibraryTraps] Installing intuition.library vectors at base 0x${intuitionBase.toString(
        16
      )}`
    );

    for (const vector of INTUITION_VECTORS) {
      const trapAddr = intuitionBase + vector.offset;

      // Write ILLEGAL instruction at vector address to trigger trap
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.intuitionLibrary);

      // Store mapping by offset (array-based to handle collisions)
      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.intuitionLibrary);

console.log(
        `  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

console.log(
      `[LibraryTraps] Installed ${INTUITION_VECTORS.length} intuition.library vectors`
    );
  }

  /**
   * Install utility.library vectors
   */
  installUtilityVectors(): void {
    if (!this.utilityLibrary) {
console.error(
        "[LibraryTraps] Cannot install utility vectors: library not set"
      );
      return;
    }

    const utilityBase = this.execLibrary.getLibraryBase("utility.library");
    if (utilityBase === 0) {
console.error(
        "[LibraryTraps] Cannot install utility vectors: library not opened"
      );
      return;
    }

console.log(
      `[LibraryTraps] Installing utility.library vectors at base 0x${utilityBase.toString(
        16
      )}`
    );

    for (const vector of UTILITY_VECTORS) {
      const trapAddr = utilityBase + vector.offset;

      // Write ILLEGAL instruction at vector address
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      // Store mapping of address to handler
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.utilityLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.utilityLibrary);

console.log(
        `  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${
          vector.offset
        })`
      );
    }

console.log(
      `[LibraryTraps] Installed ${UTILITY_VECTORS.length} utility.library vectors`
    );

    // Add stub vectors for other utility functions
    this.installStubVectorsForLibrary(
      "utility.library",
      utilityBase,
      this.utilityLibrary
    );
  }

  /**
   * Install mathffp.library vectors
   */
  installMathFFPVectors(): void {
    if (!this.mathFFPLibrary) {
console.error("[LibraryTraps] Cannot install mathffp vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathffp.library");
    if (mathBase === 0) {
console.error("[LibraryTraps] Cannot install mathffp vectors: library not opened");
      return;
    }

console.log(`[LibraryTraps] Installing mathffp.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHFFP_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathFFPLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathFFPLibrary);
    }

console.log(`[LibraryTraps] Installed ${MATHFFP_VECTORS.length} mathffp.library vectors`);
  }

  /**
   * Install mathtrans.library vectors
   */
  installMathTransVectors(): void {
    if (!this.mathTransLibrary) {
console.error("[LibraryTraps] Cannot install mathtrans vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathtrans.library");
    if (mathBase === 0) {
console.error("[LibraryTraps] Cannot install mathtrans vectors: library not opened");
      return;
    }

console.log(`[LibraryTraps] Installing mathtrans.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHTRANS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathTransLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathTransLibrary);
    }

console.log(`[LibraryTraps] Installed ${MATHTRANS_VECTORS.length} mathtrans.library vectors`);
  }

  /**
   * Install mathieeedoubbas.library vectors
   */
  installMathIEEEDoubBasVectors(): void {
    if (!this.mathIEEEDoubBasLibrary) {
console.error("[LibraryTraps] Cannot install mathieeedoubbas vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeedoubbas.library");
    if (mathBase === 0) {
console.error("[LibraryTraps] Cannot install mathieeedoubbas vectors: library not opened");
      return;
    }

console.log(`[LibraryTraps] Installing mathieeedoubbas.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEEDOUBBAS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEEDoubBasLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEEDoubBasLibrary);
    }

console.log(`[LibraryTraps] Installed ${MATHIEEEDOUBBAS_VECTORS.length} mathieeedoubbas.library vectors`);
  }

  /**
   * Install mathieeedoubtrans.library vectors
   */
  installMathIEEEDoubTransVectors(): void {
    if (!this.mathIEEEDoubTransLibrary) {
console.error("[LibraryTraps] Cannot install mathieeedoubtrans vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeedoubtrans.library");
    if (mathBase === 0) {
console.error("[LibraryTraps] Cannot install mathieeedoubtrans vectors: library not opened");
      return;
    }

console.log(`[LibraryTraps] Installing mathieeedoubtrans.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEEDOUBTRANS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEEDoubTransLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEEDoubTransLibrary);
    }

console.log(`[LibraryTraps] Installed ${MATHIEEEDOUBTRANS_VECTORS.length} mathieeedoubtrans.library vectors`);
  }

  /**
   * Install mathieeesingbas.library vectors
   */
  installMathIEEESingBasVectors(): void {
    if (!this.mathIEEESingBasLibrary) {
console.error("[LibraryTraps] Cannot install mathieeesingbas vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeesingbas.library");
    if (mathBase === 0) {
console.error("[LibraryTraps] Cannot install mathieeesingbas vectors: library not opened");
      return;
    }

console.log(`[LibraryTraps] Installing mathieeesingbas.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEESINGBAS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEESingBasLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEESingBasLibrary);
    }

console.log(`[LibraryTraps] Installed ${MATHIEEESINGBAS_VECTORS.length} mathieeesingbas.library vectors`);
  }

  /**
   * Install mathieeesingtrans.library vectors
   */
  installMathIEEESingTransVectors(): void {
    if (!this.mathIEEESingTransLibrary) {
console.error("[LibraryTraps] Cannot install mathieeesingtrans vectors: library not set");
      return;
    }

    const mathBase = this.execLibrary.getLibraryBase("mathieeesingtrans.library");
    if (mathBase === 0) {
console.error("[LibraryTraps] Cannot install mathieeesingtrans vectors: library not opened");
      return;
    }

console.log(`[LibraryTraps] Installing mathieeesingtrans.library vectors at base 0x${mathBase.toString(16)}`);

    for (const vector of MATHIEEESINGTRANS_VECTORS) {
      const trapAddr = mathBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.mathIEEESingTransLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.mathIEEESingTransLibrary);
    }

console.log(`[LibraryTraps] Installed ${MATHIEEESINGTRANS_VECTORS.length} mathieeesingtrans.library vectors`);
  }

  /**
   * Install bsdsocket.library vectors
   */
  installBsdSocketVectors(): void {
    if (!this.bsdSocketLibrary) {
      console.error("[LibraryTraps] Cannot install bsdsocket vectors: library not set");
      return;
    }

    const socketBase = this.execLibrary.getLibraryBase("bsdsocket.library");
    if (socketBase === 0) {
      console.error("[LibraryTraps] Cannot install bsdsocket vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing bsdsocket.library vectors at base 0x${socketBase.toString(16)}`);
    this.bsdSocketLibrary.baseAddress = socketBase;

    for (const vector of BSDSOCKET_VECTORS) {
      const trapAddr = socketBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.bsdSocketLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.bsdSocketLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${BSDSOCKET_VECTORS.length} bsdsocket.library vectors`);
  }

  /**
   * Install amisslmaster.library vectors
   */
  installAmiSSLMasterVectors(): void {
    if (!this.amisslMasterLibrary) {
      console.error("[LibraryTraps] Cannot install amisslmaster vectors: library not set");
      return;
    }

    const sslBase = this.execLibrary.getLibraryBase("amisslmaster.library");
    if (sslBase === 0) {
      console.error("[LibraryTraps] Cannot install amisslmaster vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing amisslmaster.library vectors at base 0x${sslBase.toString(16)}`);
    this.amisslMasterLibrary.baseAddress = sslBase;

    for (const vector of AMISSLMASTER_VECTORS) {
      const trapAddr = sslBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.amisslMasterLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.amisslMasterLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${AMISSLMASTER_VECTORS.length} amisslmaster.library vectors`);
  }

  /**
   * Install amissl.library vectors
   */
  installAmiSSLVectors(): void {
    if (!this.amisslLibrary) {
      console.error("[LibraryTraps] Cannot install amissl vectors: library not set");
      return;
    }

    const sslBase = this.execLibrary.getLibraryBase("amissl.library");
    if (sslBase === 0) {
      console.error("[LibraryTraps] Cannot install amissl vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing amissl.library vectors at base 0x${sslBase.toString(16)}`);
    this.amisslLibrary.baseAddress = sslBase;

    for (const vector of AMISSL_VECTORS) {
      const trapAddr = sslBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.amisslLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.amisslLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${AMISSL_VECTORS.length} amissl.library vectors`);
  }

  /**
   * Install dreamdoor.library vectors (DayDream BBS compatibility)
   */
  installDreamDoorVectors(): void {
    if (!this.dreamDoorLibrary) {
      console.error("[LibraryTraps] Cannot install dreamdoor vectors: library not set");
      return;
    }

    const dreamdoorBase = this.execLibrary.getLibraryBase("dreamdoor.library");
    if (dreamdoorBase === 0) {
      console.error("[LibraryTraps] Cannot install dreamdoor vectors: library not opened");
      return;
    }

    console.log(`[LibraryTraps] Installing dreamdoor.library vectors at base 0x${dreamdoorBase.toString(16)}`);

    for (const vector of DREAMDOOR_VECTORS) {
      const trapAddr = dreamdoorBase + vector.offset;
      this.emulator.writeMemory16(trapAddr, 0x4AFC);
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, this.dreamDoorLibrary);

      if (!this.offsetMap.has(vector.offset)) {
        this.offsetMap.set(vector.offset, []);
        this.offsetLibraryMap.set(vector.offset, []);
      }
      this.offsetMap.get(vector.offset)!.push(vector);
      this.offsetLibraryMap.get(vector.offset)!.push(this.dreamDoorLibrary);

      console.log(`  [${vector.name}] Vector at 0x${trapAddr.toString(16)} (offset ${vector.offset})`);
    }

    console.log(`[LibraryTraps] Installed ${DREAMDOOR_VECTORS.length} dreamdoor.library vectors`);
  }

  /**
   * Install stub handlers for any remaining LVOs we know about for a library.
   * Uses offsets parsed from dev/docs/LVOs.i and only installs if not already trapped.
   */
  installStubVectorsForLibrary(
    libName: string,
    baseAddr: number,
    libraryInstance: any = null
  ): void {
    const normalized = libName.toLowerCase();
    const offsets = this.lvoOffsetsByLibrary.get(normalized);
    if (!offsets || offsets.length === 0 || baseAddr === 0) {
      return;
    }

    let added = 0;
    for (const offset of offsets) {
      const trapAddr = baseAddr + offset;
      if (this.trapMap.has(trapAddr)) {
        continue;
      }
      // CRITICAL FIX: Write ILLEGAL instruction at vector address!
      this.emulator.writeMemory16(trapAddr, 0x4AFC);

      const vector: LibraryVector = {
        offset,
        name: getLvoName(normalized, offset) || `${normalized}-stub`,
        handler: (emu: MoiraEmulator) => {
console.log(
            `[LibraryTraps] Stubbed ${normalized} ${getLvoName(normalized, offset) || `offset ${offset}`} at PC=0x${trapAddr.toString(
              16
            )}`
          );
          return emu.getRegister(0);
        },
      };
      this.trapMap.set(trapAddr, vector);
      this.libraryMap.set(trapAddr, libraryInstance);

      if (!this.offsetMap.has(offset)) {
        this.offsetMap.set(offset, []);
        this.offsetLibraryMap.set(offset, []);
      }
      this.offsetMap.get(offset)!.push(vector);
      this.offsetLibraryMap.get(offset)!.push(libraryInstance);
      added++;
    }

    if (added > 0) {
console.log(
        `[LibraryTraps] Stubbed ${added} LVOs for ${normalized} from LVOs.i`
      );
    }
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

    // Trace ALL trap calls — fires per-library-call, very hot path. Gated
    // behind DEBUG_68K so normal mode doesn't pay the disk-I/O cost.
    // Was previously unconditional ("TEMP" for DM door debugging) and
    // contributed to the ~118ms gap conftop saw between banner #1 and the
    // form-feed clear-screen.
    if (vector) {
      debugLog(`[TRAP] ${vector.name} at PC=0x${pc.toString(16)}`);
    }

    // DEBUG: Log AEDoor-related calls to trace trap matching. Same hot-path
    // concerns as above — gated.
    if (DEBUG_ENABLED) {
      const aedoorBase = this.execLibrary.getLibraryBase("AEDoor.library");
      if (aedoorBase !== 0) {
        const offset = pc - aedoorBase;
        if (offset >= -200 && offset <= 0) {
          const a6 = this.emulator.getRegister(14); // A6
          const instrAtPC = this.emulator.readMemory16(pc);
          const matched = vector ? "MATCHED" : "NOT IN TRAPMAP";
          debugLog(`[LibraryTraps] AEDoor call? PC=0x${pc.toString(16)} offset=${offset} A6=0x${a6.toString(16)} instr=0x${instrAtPC.toString(16)} [${matched}]`);
        }
      }
    }

    if (!vector) {
      // BUG FIX: Don't do broad range checking - it's catching ROM execution!
      // Only do specific library checks for addresses we actually know about
      const execBase = this.emulator.readMemory32(0x4);
      const dosBase = this.execLibrary.getLibraryBase("dos.library");

      // Check if PC is very close to known library bases (more restrictive)
      const execOffset = pc - execBase;
      const dosOffset = dosBase ? pc - dosBase : 0;

      // Only trigger if PC is in the ACTUAL library vector range, not ROM space
      // Exec.library vectors are roughly from -700 to -30 from ExecBase
      if (pc >= execBase - 700 && pc < execBase && execOffset <= -30) {
        const execFnName = getLvoName('exec.library', execOffset) || `unknown(${execOffset})`;
console.error(`[LibraryTraps] *** UNIMPLEMENTED EXEC FUNCTION: ${execFnName} ***`);
console.error(`[LibraryTraps]   PC: 0x${pc.toString(16)}`);
console.error(`[LibraryTraps]   ExecBase: 0x${execBase.toString(16)}`);
console.error(`[LibraryTraps]   LVO offset: ${execOffset} = ${execFnName}`);
console.error(
          `[LibraryTraps]   This is likely a missing Exec.library function!`
        );

        // DETAILED TRACING: Show door execution context
console.error(`[LibraryTraps] *** DOOR EXECUTION CONTEXT ***`);

        // Get door execution context
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
        const a4 = this.emulator.getRegister(12); // A4 = data segment (FIXED: was 4, should be 12!)
        const a5 = this.emulator.getRegister(13); // FIXED: was 5, should be 13
        const a6 = this.emulator.getRegister(14); // FIXED: was 6, should be 14
        const a7 = this.emulator.getRegister(15); // SP (FIXED: was 7, should be 15)
        const sp = this.emulator.getRegister(15);

console.error(`[LibraryTraps]   Registers:`);
console.error(
          `[LibraryTraps]     D0: 0x${d0.toString(16)}, D1: 0x${d1.toString(
            16
          )}`
        );
console.error(
          `[LibraryTraps]     A0: 0x${a0.toString(16)}, A1: 0x${a1.toString(
            16
          )}`
        );
console.error(
          `[LibraryTraps]     A4: 0x${a4.toString(16)} (data segment)`
        );
console.error(
          `[LibraryTraps]     A5: 0x${a5.toString(16)}, A6: 0x${a6.toString(
            16
          )}`
        );
console.error(`[LibraryTraps]     A7(SP): 0x${a7.toString(16)}`);

        if (pc >= execBase && pc <= execBase + 0x1000) {
          const libOffset = pc - execBase;
console.error(
            `[LibraryTraps]   ROM/Exec space: PC=0x${pc.toString(
              16
            )} (offset +0x${libOffset.toString(16)})`
          );
        } else {
console.error(
            `[LibraryTraps]   OTHER space: PC=0x${pc.toString(16)}`
          );
        }

        // Continue execution anyway (simulate RTS with D0=0)
        this.emulator.setRegister(0, 0); // D0 = 0 (failure)
        const returnAddr = this.emulator.readMemory32(sp);
        this.emulator.setRegister(15, sp + 4);
        this.emulator.setRegister(16, returnAddr);
        this.emulator.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC
console.error(
          `[LibraryTraps]   Simulated RTS with D0=0, returning to 0x${returnAddr.toString(
            16
          )}`
        );
        return true;
      }

      // DOS.library check - more restrictive range
      if (dosBase && pc >= dosBase - 300 && pc < dosBase && dosOffset <= -30) {
        const offset = pc - dosBase;
        const dosFnName = getLvoName('dos.library', offset) || `unknown(${offset})`;
console.error(`[LibraryTraps] *** UNIMPLEMENTED DOS FUNCTION: ${dosFnName} ***`);
console.error(
          `[LibraryTraps]   PC: 0x${pc.toString(16)}, LVO: ${offset} = ${dosFnName}`
        );
        // Simulate RTS with D0=0
        this.emulator.setRegister(0, 0);
        const sp = this.emulator.getRegister(15);
        const returnAddr = this.emulator.readMemory32(sp);
        this.emulator.setRegister(15, sp + 4);
        this.emulator.setRegister(16, returnAddr);
        this.emulator.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC
        return true;
      }

      // If we get here, PC is NOT a library trap - return false to let execution continue
      return false;
    }

    const library = this.libraryMap.get(pc);
    const libraryName = this.getLibraryName(library);

    if (DEBUG_LIBRARY_TRAPS) {
console.log(
        `[LibraryTraps] *** INTERCEPTED: ${libraryName}.${vector.name}() at PC=0x${pc.toString(
          16
        )} ***`
      );

      // DETAILED TRACING: Show door context on library calls for debugging
      if (
        vector.name === "OpenLibrary" ||
        vector.name === "AllocMem" ||
        vector.name === "SetSignal" ||
        vector.name === "CreatePool" ||
        vector.name === "AllocPooled"
      ) {
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
        const a4 = this.emulator.getRegister(12); // A4 = data segment
        const a6 = this.emulator.getRegister(14);

console.log(`[LibraryTraps]   Door state during ${vector.name}():`);
console.log(`[LibraryTraps]     A4: 0x${a4.toString(16)}`);
console.log(
          `[LibraryTraps]     D0: 0x${d0.toString(16)}, D1: 0x${d1.toString(16)}`
        );
console.log(
          `[LibraryTraps]     A0: 0x${a0.toString(16)}, A1: 0x${a1.toString(16)}`
        );
      }

      // Highlight output-related AEDoor functions
      if (
        vector.name === "WriteStr" ||
        vector.name === "Prompt" ||
        vector.name === "SendCmd"
      ) {
console.log(
          `[LibraryTraps] OUTPUT FUNCTION: ${vector.name}() - this should produce terminal output`
        );
      }

      // Additional AEDoor-specific tracing
      if (libraryName === "AEDoor.library") {
        const d0 = this.emulator.getRegister(0);
        const d1 = this.emulator.getRegister(1);
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
        const a4 = this.emulator.getRegister(4);
console.log(
          `[LibraryTraps][AEDoor] offset=${vector.offset} d0=0x${d0.toString(
            16
          )} d1=0x${d1.toString(16)} a0=0x${a0.toString(
            16
          )} a1=0x${a1.toString(16)} a4=0x${a4.toString(16)}`
        );
      }
    }

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, pc);
    }

    // CRITICAL: Save return address AND pop stack BEFORE calling handler!
    // Some handlers (like StackSwap) modify the stack pointer. We must read
    // and pop the return address from the ORIGINAL stack before the handler runs.
    const sp = this.emulator.getRegister(15); // A7 (stack pointer)
    const a6 = this.emulator.getRegister(14); // A6 (library base)
    const a6Before = a6; // CRITICAL: Save A6 before trap handler
    const returnAddr = this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4); // Pop return address from ORIGINAL stack
    const spAfter = this.emulator.getRegister(15);

    if (process.env.AEDOOR_TRACE === "1" && vector.name === "PutMsg") {
      const aedoorBase = this.execLibrary.getLibraryBase("aedoor.library");
      const inAedoor =
        aedoorBase !== 0 &&
        returnAddr >= aedoorBase &&
        returnAddr < aedoorBase + 0x1000;
      if (inAedoor) {
        const a0 = this.emulator.getRegister(8);
        const a1 = this.emulator.getRegister(9);
console.log(
          `[AEDOOR_TRACE] PutMsg trap return=0x${returnAddr.toString(
            16
          )} a6=0x${a6.toString(16)} a0=0x${a0.toString(
            16
          )} a1=0x${a1.toString(16)} sp=0x${sp.toString(16)}`
        );
      }
    }

    // STACK CORRUPTION DETECTION: Validate return address looks reasonable
    // Most door code is in range 0x1000-0x100000, return addresses outside suggest corruption
    const libName = this.getLibraryName(library);
    if (returnAddr < 0x1000 || returnAddr > 0x1000000) {
      console.error(`[LibraryTraps][STACK_CORRUPT] ${libName}::${vector.name} - Invalid return address!`);
      console.error(`  PC when trapped: 0x${pc.toString(16)}`);
      console.error(`  SP: 0x${sp.toString(16)}`);
      console.error(`  Return address at [SP]: 0x${returnAddr.toString(16)} (INVALID - outside [0x1000-0x1000000])`);
      console.error(`  A6 (library base): 0x${a6.toString(16)}`);
      console.error(`  Stack contents at SP:`);
      for (let i = 0; i < 8; i++) {
        const val = this.emulator.readMemory32(sp + i * 4);
        console.error(`    [SP+${i * 4}]: 0x${val.toString(16)}`);
      }
    }

    let lockTraceReturnAddr = 0;
    if (libName === "dos.library" && vector.name === "Lock") {
      const aedoorBase = this.execLibrary.getLibraryBase("AEDoor.library") || 0;
      lockTraceReturnAddr = returnAddr;
      const a4Before = this.emulator.getRegister(12);
      const a5Before = this.emulator.getRegister(13);
      let opcode = 0;
      const bytes: number[] = [];
      try {
        const op0 = this.emulator.readMemory(returnAddr);
        const op1 = this.emulator.readMemory(returnAddr + 1);
        opcode = (op0 << 8) | op1;
        for (let i = 0; i < 16; i++) {
          bytes.push(this.emulator.readMemory(returnAddr + i));
        }
      } catch (err) {
        console.error(`[LibraryTraps][LockTrace] Failed to read opcode at returnAddr=0x${returnAddr.toString(16)}: ${err}`);
      }
console.log(
        `[LibraryTraps][LockTrace] sp=0x${sp.toString(16)} spAfter=0x${spAfter.toString(
          16
        )} returnAddr=0x${returnAddr.toString(
          16
        )} opcode=0x${opcode.toString(16)} a4=0x${a4Before.toString(
          16
        )} a5=0x${a5Before.toString(16)} a6=0x${a6.toString(
          16
        )} aedoorBase=0x${aedoorBase.toString(16)} bytes=${bytes
          .map((b) => b.toString(16).padStart(2, "0"))
          .join(" ")}`
      );
    }

    if (DEBUG_LIBRARY_TRAPS) {
console.log(
        `[LibraryTraps]   SP before pop: 0x${sp.toString(
          16
        )}, A6: 0x${a6.toString(16)}`
      );
console.log(
        `[LibraryTraps]   Return address at SP: 0x${returnAddr.toString(16)}`
      );
console.log(`[LibraryTraps]   SP after pop: 0x${spAfter.toString(16)}`);

      // DEBUG: Dump stack contents where A6 should be saved
      // MOVEM.L (SP)+,D0-D7/A0-A6 reads A6 from SP+56
      // (D0-D7 = 8 regs = 32 bytes, A0-A5 = 6 regs = 24 bytes, total offset = 56)
      const a6OnStack = this.emulator.readMemory32(spAfter + 56);
console.log(
        `[LibraryTraps]   A6 value saved on stack at SP+56 (0x${(
          spAfter + 56
        ).toString(16)}): 0x${a6OnStack.toString(16)}`
      );
    }

    // Also dump the surrounding stack to see the pattern
    if (DEBUG_LIBRARY_TRAPS) {
console.log(`[LibraryTraps]   Stack dump (after return address pop):`);
      for (let i = 0; i < 15; i++) {
        const regValue = this.emulator.readMemory32(spAfter + i * 4);
        const regName = i < 8 ? `D${i}` : `A${i - 8}`;
console.log(
          `[LibraryTraps]     SP+${i * 4} (${regName}): 0x${regValue.toString(
            16
          )}`
        );
      }
    }

    // Call the handler with the correct library instance
    // Note: Handler may now modify SP (e.g., StackSwap), but we've already popped the return address
    // Pass returnAddr to handler for functions like Supervisor() that need it
    const prevD0 = this.emulator.getRegister(0);
    const prevSr = this.emulator.getRegister(17);
    const spBeforeHandler = this.emulator.getRegister(15);
    const result = (vector.handler as any)(this.emulator, library, returnAddr);
    const preserveRegs = vector.name === "Forbid" || vector.name === "Permit";

    // CRITICAL: Check if Wait() is blocking - if so, don't advance PC
    // Wait() will be re-executed after Signal() wakes the door
    if (library === this.execLibrary && this.execLibrary.consumeIsWaitBlocking()) {
      // Wait() is blocking - push return address back onto stack and keep PC at trap
      const sp = this.emulator.getRegister(15);
      this.emulator.writeMemory32(sp - 4, returnAddr);
      this.emulator.setRegister(15, sp - 4);
      // Keep PC at the current trap address so Wait() is called again after Signal()
      this.emulator.setRegister(16, pc);
      this.emulator.refillPrefetch();
console.log(`[LibraryTraps] Wait() BLOCKING - PC stays at trap 0x${pc.toString(16)}, returnAddr pushed back`);
      return true;
    }

    // CRITICAL: Check for SP corruption immediately after handler
    const spAfterHandler = this.emulator.getRegister(15);
    if (lockTraceReturnAddr !== 0) {
      const a4After = this.emulator.getRegister(12);
      const a5After = this.emulator.getRegister(13);
      const a6After = this.emulator.getRegister(14);
console.log(
        `[LibraryTraps][LockTrace] after handler sp=0x${spAfterHandler.toString(
          16
        )} returnAddr=0x${lockTraceReturnAddr.toString(
          16
        )} a4=0x${a4After.toString(16)} a5=0x${a5After.toString(
          16
        )} a6=0x${a6After.toString(16)}`
      );
    }
    if (spAfterHandler === 0xfffffffa || spAfterHandler < 0x1000) {
console.error(`\n*** SP CORRUPTION DETECTED ***`);
console.error(`  Function: ${vector.name}()`);
console.error(`  SP before handler: 0x${spBeforeHandler.toString(16)}`);
console.error(`  SP after handler:  0x${spAfterHandler.toString(16)} *** CORRUPTED ***`);
console.error(`  Return address: 0x${returnAddr.toString(16)}`);
console.error(`  D0 result: 0x${result.toString(16)}`);
console.error(`  THIS IS THE BUG! ${vector.name}() corrupted SP!`);
    }

    // Set return value in D0 unless the call should preserve the caller state
    if (!preserveRegs) {
      this.emulator.setRegister(0, result);
    } else {
      this.emulator.setRegister(0, prevD0);
    }

    // CRITICAL FIX: Restore A6 register after trap handler
    // M68K calling convention requires A6 to be preserved across function calls
    // For library calls, A6 MUST contain the library base address
    // Determine which library this offset belongs to and restore A6 to that library's base
    // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
    let properA6 = a6Before; // Default: restore to original value

    // Determine library base from the library instance
    // Fallback addresses must match ExecLibrary.ts memory layout (0x080000+)
    // CRITICAL: ALL libraries with trap handlers must be included here
    if (library === this.execLibrary) {
      properA6 = this.execLibrary.getLibraryBase("exec.library") || 0x080000;
    } else if (library === this.dosLibrary) {
      properA6 = this.execLibrary.getLibraryBase("dos.library") || 0x0B0000;
    } else if (library === this.aedoorLibrary) {
      properA6 = this.execLibrary.getLibraryBase("AEDoor.library") || 0x0C0000;
    } else if (library === this.iconLibrary) {
      properA6 = this.execLibrary.getLibraryBase("icon.library") || 0x0D0000;
    } else if (library === this.utilityLibrary) {
      properA6 = this.execLibrary.getLibraryBase("utility.library") || 0x0E0000;
    } else if (library === this.mathFFPLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathffp.library") || 0x0F0000;
    } else if (library === this.mathTransLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathtrans.library") || 0x100000;
    } else if (library === this.mathIEEEDoubBasLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeedoubbas.library") || 0x110000;
    } else if (library === this.mathIEEEDoubTransLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeedoubtrans.library") || 0x120000;
    } else if (library === this.mathIEEESingBasLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeesingbas.library") || 0x130000;
    } else if (library === this.mathIEEESingTransLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeesingtrans.library") || 0x140000;
    } else if (library === this.intuitionLibrary) {
      properA6 = this.execLibrary.getLibraryBase("intuition.library") || 0x150000;
    }

    this.emulator.setRegister(14, properA6);
    if (DEBUG_LIBRARY_TRAPS) {
      const a6AfterRestore = this.emulator.getRegister(14);
console.log(
        `[LibraryTraps]   A6 restored: 0x${a6Before.toString(
          16
        )} -> 0x${properA6.toString(16)} (${vector.name} library base)`
      );
      if (a6AfterRestore !== properA6) {
console.log(
          `[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x${properA6.toString(
            16
          )}, Got: 0x${a6AfterRestore.toString(16)}`
        );
      }
    }

    // CRITICAL FIX: Update Status Register condition codes after setting D0
    // Library functions return values in D0, and the calling code expects
    // the Z and N flags to be set based on the return value (like TST.L D0 would do)
    //
    // M68K SR format: Bits 15-8 = system byte, Bits 4-0 = CCR (X N Z V C)
    if (preserveRegs) {
      this.emulator.setRegister(17, prevSr); // Preserve SR for void calls
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] ${vector.name}() preserved SR: 0x${prevSr
            .toString(16)
            .padStart(4, "0")}`
        );
      }
    } else {
      const sr = this.emulator.getRegister(17); // Get current SR
      let newSr = sr & 0xfff0; // Clear N, Z, V, C flags (bits 0-3), preserve X flag (bit 4)

      // Set Z flag if result is zero
      if (result === 0) {
        newSr |= 0x04; // Set Z flag (bit 2)
      }

      // Set N flag if result is negative (bit 31 set for 32-bit value)
      if (result & 0x80000000) {
        newSr |= 0x08; // Set N flag (bit 3)
      }

      // V (overflow) and C (carry) are cleared for library returns

      this.emulator.setRegister(17, newSr); // Update SR

      if (DEBUG_LIBRARY_TRAPS) {
        // Verify SR was actually set
        const verifySr = this.emulator.getRegister(17);
console.log(
          `[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`
        );
console.log(
          `[LibraryTraps]   Set SR to: 0x${newSr
            .toString(16)
            .padStart(4, "0")} (Z=${newSr & 0x04 ? 1 : 0} N=${
            newSr & 0x08 ? 1 : 0
          })`
        );
console.log(
          `[LibraryTraps]   Verified SR: 0x${verifySr
            .toString(16)
            .padStart(4, "0")} (Z=${verifySr & 0x04 ? 1 : 0})`
        );
      }
    }

    // Set PC to return address
    // EXCEPTIONS: Supervisor() and Exit() set PC themselves, so check if it was changed
    const forcedReturn =
      library === this.execLibrary ? this.execLibrary.consumeForcedReturn() : false;
    const execJump =
      library === this.execLibrary ? this.execLibrary.consumeTrapJump() : null;
    const currentPC = this.emulator.getRegister(16);
    if (forcedReturn) {
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] ExecLibrary forced return to 0x${currentPC.toString(16)}`
        );
      }
      return true;
    }
    if (execJump) {
      const execJumpPc = execJump.pc;
      const spNow = this.emulator.getRegister(15);
      this.execLibrary.setTrapReturnContext(returnAddr, spNow, execJump.name);
      this.emulator.writeMemory32(spNow - 4, returnAddr);
      this.emulator.setRegister(15, spNow - 4);
      this.emulator.setRegister(16, execJumpPc);
      this.emulator.refillPrefetch();
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] ExecLibrary jump to 0x${execJumpPc.toString(
            16
          )} with return 0x${returnAddr.toString(16)}`
        );
      }
    } else if (vector.name === "Supervisor") {
      // Supervisor already set PC to the supervisor function, don't overwrite it
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] Supervisor: PC already set to 0x${currentPC.toString(
            16
          )}, not setting return address`
        );
      }
    } else if (vector.name === "Exit") {
      // Exit() already set PC to exit trap address (0xFFFF00), don't overwrite it
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] Exit: PC already set to 0x${currentPC.toString(
            16
          )} (exit trap), not setting return address`
        );
      }
    } else {
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] Setting PC to return address 0x${returnAddr.toString(
            16
          )}`
        );
      }
      this.emulator.setRegister(16, returnAddr);
      // CRITICAL: Refill prefetch queue after changing PC!
      // Without this, MOIRA executes stale instructions from the old PC location
      this.emulator.refillPrefetch();
      if (DEBUG_LIBRARY_TRAPS) {
        const verifyPC = this.emulator.getRegister(16);
console.log(
          `[LibraryTraps] Verified PC is now: 0x${verifyPC.toString(16)}`
        );

        // Also check what instruction is at return address
        const op0 = this.emulator.readMemory(returnAddr);
        const op1 = this.emulator.readMemory(returnAddr + 1);
        const opcode = (op0 << 8) | op1;
console.log(
          `[LibraryTraps] Instruction at return address: 0x${opcode
            .toString(16)
            .padStart(4, "0")}`
        );
      }
    }

    // CRITICAL FIX: Refill instruction prefetch queue!
    // After setting PC, we MUST refill the prefetch queue to synchronize
    // queue.ird and queue.irc with the new PC location.
    // The fixed refillPrefetch() now properly sets IRD and IRC without executing.
    this.emulator.refillPrefetch();

    if (DEBUG_LIBRARY_TRAPS) {
      // Verify final register state
      const finalSp = this.emulator.getRegister(15);
      const finalA6 = this.emulator.getRegister(14);

console.log(`[LibraryTraps] Returning to 0x${returnAddr.toString(16)}`);
console.log(
        `[LibraryTraps]   Final SP: 0x${finalSp.toString(
          16
        )}, Final A6: 0x${finalA6.toString(16)}`
      );
    }

    return true; // Trap handled
  }

  /**
   * Check if an address is a library trap
   */
  isTrapAddress(addr: number): boolean {
    return this.trapMap.has(addr);
  }

  /**
   * NEW: Check if an offset matches a known library vector
   */
  isTrapOffset(offset: number): boolean {
    return this.offsetMap.has(offset);
  }

  /**
   * NEW: Handle a trap by offset (when A6 is corrupted)
   * @param offset - Library vector offset (e.g., -30 for Supervisor)
   * @param baseAddr - The A6 value (library base address, may be corrupted)
   */
  handleTrapByOffset(offset: number, baseAddr: number): boolean {
    const vectors = this.offsetMap.get(offset);
    const libraries = this.offsetLibraryMap.get(offset);

    if (!vectors || vectors.length === 0) {
console.error(`[LibraryTraps] *** NO HANDLER for offset ${offset} ***`);
      return false;
    }

    // Multiple vectors can share the same offset (collision)
    // For now, use the first one (Exec.library functions installed first)
    // TODO: More sophisticated collision resolution if needed
    const vector = vectors[0];
    const library = libraries![0];
    const libraryName = this.getLibraryName(library);

    if (DEBUG_LIBRARY_TRAPS) {
console.log(
        `[LibraryTraps] Intercepted: ${libraryName}.${vector.name}() at offset ${offset} (A6=0x${baseAddr.toString(
          16
        )})`
      );
    }

    // Notify monitor if callback is set
    if (this.onLibraryCall) {
      this.onLibraryCall(vector.name, baseAddr + offset);
    }

    // Pop return address from stack (same as handleTrap)
    const sp = this.emulator.getRegister(15); // A7 (stack pointer)
    const a6 = this.emulator.getRegister(14); // A6 (library base)
    const a6Before = a6; // CRITICAL: Save A6 before trap handler
    const returnAddr = this.emulator.readMemory32(sp);
    this.emulator.setRegister(15, sp + 4); // Pop return address
    const spAfter = this.emulator.getRegister(15);

    if (DEBUG_LIBRARY_TRAPS) {
console.log(
        `[LibraryTraps]   SP before pop: 0x${sp.toString(
          16
        )}, A6: 0x${a6.toString(16)}`
      );
console.log(
        `[LibraryTraps]   Return address at SP: 0x${returnAddr.toString(16)}`
      );
console.log(`[LibraryTraps]   SP after pop: 0x${spAfter.toString(16)}`);
    }

    // Call the handler
    const result = (vector.handler as any)(this.emulator, library, returnAddr);

    // Set return value in D0
    this.emulator.setRegister(0, result);

    // CRITICAL FIX: Restore A6 register after trap handler
    // M68K calling convention requires A6 to be preserved across function calls
    // For library calls, A6 MUST contain the library base address
    // Determine which library this offset belongs to and restore A6 to that library's base
    // This fixes crash at iteration 35,444 where A6=0x0 caused jump to 0xffffd6
    let properA6 = a6Before; // Default: restore to original value

    // Determine library base from the library instance
    // Fallback addresses must match ExecLibrary.ts memory layout (0x080000+)
    // CRITICAL: ALL libraries with trap handlers must be included here
    if (library === this.execLibrary) {
      properA6 = this.execLibrary.getLibraryBase("exec.library") || 0x080000;
    } else if (library === this.dosLibrary) {
      properA6 = this.execLibrary.getLibraryBase("dos.library") || 0x0B0000;
    } else if (library === this.aedoorLibrary) {
      properA6 = this.execLibrary.getLibraryBase("AEDoor.library") || 0x0C0000;
    } else if (library === this.iconLibrary) {
      properA6 = this.execLibrary.getLibraryBase("icon.library") || 0x0D0000;
    } else if (library === this.utilityLibrary) {
      properA6 = this.execLibrary.getLibraryBase("utility.library") || 0x0E0000;
    } else if (library === this.mathFFPLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathffp.library") || 0x0F0000;
    } else if (library === this.mathTransLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathtrans.library") || 0x100000;
    } else if (library === this.mathIEEEDoubBasLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeedoubbas.library") || 0x110000;
    } else if (library === this.mathIEEEDoubTransLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeedoubtrans.library") || 0x120000;
    } else if (library === this.mathIEEESingBasLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeesingbas.library") || 0x130000;
    } else if (library === this.mathIEEESingTransLibrary) {
      properA6 = this.execLibrary.getLibraryBase("mathieeesingtrans.library") || 0x140000;
    } else if (library === this.intuitionLibrary) {
      properA6 = this.execLibrary.getLibraryBase("intuition.library") || 0x150000;
    }

    this.emulator.setRegister(14, properA6);
    if (DEBUG_LIBRARY_TRAPS) {
      const a6After = this.emulator.getRegister(14);
console.log(
        `[LibraryTraps]   A6 restored: 0x${a6Before.toString(
          16
        )} -> 0x${properA6.toString(16)} (${vector.name} library base)`
      );
      if (a6After !== properA6) {
console.log(
          `[LibraryTraps]   *** WARNING: A6 restoration failed! Expected: 0x${properA6.toString(
            16
          )}, Got: 0x${a6After.toString(16)}`
        );
      }
    }

    // Update Status Register condition codes
    const sr = this.emulator.getRegister(17);
    let newSr = sr & 0xfff0; // Clear N, Z, V, C flags

    // Set Z flag if result is zero
    if (result === 0) {
      newSr |= 0x04; // Set Z flag (bit 2)
    }

    // Set N flag if result is negative (bit 31 set)
    if (result & 0x80000000) {
      newSr |= 0x08; // Set N flag (bit 3)
    }

    this.emulator.setRegister(17, newSr);

    if (DEBUG_LIBRARY_TRAPS) {
console.log(
        `[LibraryTraps] ${vector.name}() returned 0x${result.toString(16)}`
      );
console.log(
        `[LibraryTraps]   Set SR to: 0x${newSr
          .toString(16)
          .padStart(4, "0")} (Z=${newSr & 0x04 ? 1 : 0} N=${
          newSr & 0x08 ? 1 : 0
        })`
      );
    }

    // Set PC to return address
    // EXCEPTIONS: Supervisor() and Exit() set PC themselves
    const currentPC = this.emulator.getRegister(16);
    if (vector.name === "Supervisor") {
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] Supervisor: PC already set to 0x${currentPC.toString(
            16
          )}, not setting return address`
        );
      }
    } else if (vector.name === "Exit") {
      if (DEBUG_LIBRARY_TRAPS) {
console.log(
          `[LibraryTraps] Exit: PC already set to 0x${currentPC.toString(
            16
          )} (exit trap), not setting return address`
        );
      }
    } else {
      this.emulator.setRegister(16, returnAddr);
      this.emulator.refillPrefetch(); // CRITICAL: Refill prefetch after changing PC
    }

    return true;
  }

  /**
   * Load the LVO definitions from dev/docs/LVOs.i so we can stub missing vectors.
   */
  private loadLvoOffsetsFromFile(): void {
    const candidates = [
      // Primary location: Documentation tree (where the file actually lives)
      path.resolve(process.cwd(), "Documentation/7-Reference Sources/LVOs.i"),
      path.resolve(process.cwd(), "../Documentation/7-Reference Sources/LVOs.i"),
      path.resolve(process.cwd(), "../../Documentation/7-Reference Sources/LVOs.i"),
      path.resolve(__dirname, "../../../../Documentation/7-Reference Sources/LVOs.i"),
      path.resolve(__dirname, "../../../../../Documentation/7-Reference Sources/LVOs.i"),
      // Legacy/optional location
      path.resolve(process.cwd(), "dev/docs/LVOs.i"),
      path.resolve(process.cwd(), "../dev/docs/LVOs.i"),
      path.resolve(process.cwd(), "../../dev/docs/LVOs.i"),
      path.resolve(__dirname, "../../../../dev/docs/LVOs.i"),
      path.resolve(__dirname, "../../../../../dev/docs/LVOs.i"),
    ];

    let data: string | null = null;
    for (const candidate of candidates) {
      try {
        if (amigafs.existsSync(candidate)) {
          data = amigafs.readFileSync(candidate, "utf8") as string;
console.log(`[LibraryTraps] Loaded LVOs from ${candidate}`);
          break;
        }
      } catch {
        // ignore and try next
      }
    }

    if (!data) {
console.warn("[LibraryTraps] LVOs.i not found; stub vectors disabled");
      return;
    }

    let currentLib = "";
    const libRegex = /\*+ LVOs for ([^*]+?) \*/i;
    const lvoRegex = /equ\s+(-?\d+)/i;

    for (const rawLine of data.split(/\r?\n/)) {
      const line = rawLine.trim();
      const libMatch = line.match(libRegex);
      if (libMatch) {
        currentLib = libMatch[1].trim().toLowerCase();
        if (!this.lvoOffsetsByLibrary.has(currentLib)) {
          this.lvoOffsetsByLibrary.set(currentLib, []);
        }
        continue;
      }

      if (!currentLib || line.length === 0 || line.startsWith(";")) {
        continue;
      }

      const lvoMatch = line.match(lvoRegex);
      if (lvoMatch) {
        const offset = parseInt(lvoMatch[1], 10);
        const list = this.lvoOffsetsByLibrary.get(currentLib)!;
        if (!list.includes(offset)) {
          list.push(offset);
        }
      }
    }
  }
}

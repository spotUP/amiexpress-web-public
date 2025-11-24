// DoorLoader.ts
// Extracted from AmigaDoorSession.ts - Phase 3: Door Loading and Execution
// Handles Amiga door binary loading, HUNK parsing, and CPU register setup
// 2025-11-20

import { MoiraEmulator } from "./cpu/MoiraEmulator.js";
import { HunkLoader } from "./loader/HunkLoader.js";
import { ExecLibrary } from "./api/ExecLibrary.js";
import { DoorConfig } from "./DoorTypes.js";
import * as fs from "fs";
import * as path from "path";
import { notifySysop } from "../utils/sysop-alert.util.js";

export class DoorLoader {
  private emulator: MoiraEmulator;
  private execLibrary: ExecLibrary;
  private config: DoorConfig;
  private isBullsDoor: boolean = false;

  constructor(
    emulator: MoiraEmulator,
    execLibrary: ExecLibrary,
    config: DoorConfig
  ) {
    this.emulator = emulator;
    this.execLibrary = execLibrary;
    this.config = config;
    this.isBullsDoor = path
      .basename(config.executablePath)
      .toLowerCase()
      .includes("bull");
  }

  /**
   * Load door executable into emulator memory
   */
  async loadDoor(): Promise<void> {
    // Read door binary
    let binary: Buffer;
    try {
      binary = fs.readFileSync(this.config.executablePath);
    } catch (error) {
      console.error(
        `[DoorLoader] ERROR reading door executable: ${
          (error as Error).message
        }`
      );
      notifySysop(
        this.config.bbsSession,
        `[DoorLoader] Door file missing: ${this.config.executablePath}`
      );
      throw error;
    }
    console.log(`[DoorLoader] Door binary size: ${binary.length} bytes`);

    // Parse Amiga HUNK format
    const hunkLoader = new HunkLoader();
    const hunkFile = hunkLoader.parse(Buffer.from(binary));

    console.log(`[DoorLoader] Parsed ${hunkFile.segments.length} segments:`);
    for (let i = 0; i < hunkFile.segments.length; i++) {
      const seg = hunkFile.segments[i];
      console.log(
        `  Segment ${i}: ${seg.type.toUpperCase()} at 0x${seg.address.toString(
          16
        )}, size=${seg.size} bytes`
      );
    }

    // Load segments into memory
    hunkLoader.load(this.emulator, hunkFile);

    console.log(
      `[DoorLoader] Door loaded at entry point: 0x${hunkFile.entryPoint.toString(
        16
      )}`
    );

    // Set up CPU for door execution
    this.setupCpuRegisters(hunkFile);

    // Set up Bulls-specific execution if needed
    if (this.isBullsDoor) {
      await this.setupBullsExecution();
    }

    // Prefill the 68000 instruction queue
    this.emulator.refillPrefetch();
  }

  /**
   * Set up CPU registers for door execution
   */
  private setupCpuRegisters(hunkFile: any): void {
    console.log("[DoorLoader] Setting up CPU registers...");

    // Set CPU to SUPERVISOR MODE (bit 13 of SR) to allow privileged instructions
    // SR = 0x2700 = supervisor mode with interrupts disabled
    this.emulator.setRegister(17, 0x2700); // SR (Status Register)
    console.log(`  SR: 0x2700 (supervisor mode)`);

    // Set up A6 register with ExecBase (standard Amiga convention)
    const execBaseAddr = this.execLibrary.getExecBaseAddress();
    this.emulator.setRegister(14, execBaseAddr); // A6 = ExecBase
    console.log(`  A6 (ExecBase): 0x${execBaseAddr.toString(16)}`);

    // Set up command-line arguments for SAS/C startup
    // SAS/C c.o expects: D0 = length of FULL command line, A0 = pointer to FULL command line
    // The full command line is "progname arg1 arg2..." (NO leading space!)
    // The startup code will parse this into argc/argv
    const nodeId = this.config.bbsSession?.nodeId || 0;
    const progName = path.basename(this.config.executablePath);
    const customArgs =
      this.config.args && this.config.args.length > 0
        ? this.config.args
        : [nodeId.toString()];
    const argString = [progName, ...customArgs].join(" ").trim();
    const ARG_STRING_ADDR = 0x0f0100;

    // Write argument string to memory
    for (let i = 0; i < argString.length; i++) {
      this.emulator.writeMemory(ARG_STRING_ADDR + i, argString.charCodeAt(i));
    }
    this.emulator.writeMemory(ARG_STRING_ADDR + argString.length, 0); // Null terminator

    // Set D0 = length of FULL command line, A0 = pointer to command line
    // This is the AmigaDOS/SAS-C calling convention for CLI programs
    this.emulator.setRegister(0, argString.length); // D0 = full command line length
    this.emulator.setRegister(8, ARG_STRING_ADDR); // A0 = full command line
    console.log(`  D0 (arg length): ${argString.length}`);
    console.log(
      `  A0 (arg string): 0x${ARG_STRING_ADDR.toString(16)} = "${argString}"`
    );

    // Set A1 to end of CODE segment (SAS/C startup code uses this for initialization)
    // The startup code copies initialization data from end of CODE to BSS
    if (hunkFile.segments.length > 0) {
      // Find the first segment (CODE segment)
      const codeSegment = hunkFile.segments[0];
      const codeEnd = codeSegment.address + codeSegment.size;
      this.emulator.setRegister(9, codeEnd); // A1 = end of CODE
      console.log(`  A1 (end of CODE): 0x${codeEnd.toString(16)}`);
    }

    // Set PC to REAL HUNK ENTRY POINT
    console.log(
      `[BULLS-FIX] Setting PC to HUNK entry point 0x${hunkFile.entryPoint.toString(
        16
      )}`
    );
    this.emulator.setRegister(16, hunkFile.entryPoint);

    // Configure stack
    this.setupStack();
  }

  /**
   * Set up stack for door execution
   */
  private setupStack(): void {
    // Set SP and push exit address LAST
    // CRITICAL: Stack must be where door's StackSwapStruct expects it
    // Doors have compiled-in stack addresses, typically around 0xFE000
    // This matches what the WHO door's StackSwapStruct contains (0xFD000-0xFE000)
    // Allocate at standard Amiga location used by CLI programs
    const initialSP = 0xfe000; // Standard CLI stack location
    const finalSP = 0xfdffc; // 4-byte aligned (0xFDFFC % 4 = 0)

    // Push exit address to stack (for when door does RTS)
    // According to AmigaDOS docs: "Assembly programs should place a return code in D0,
    // and execute an RTS instruction with their original stack ptr."
    // We provide an address that will be detected as program exit
    const exitTrapAddress = 0xffff00; // Special address to detect program exit

    // Fill top of stack with exit trap addresses
    // When program returns (RTS), it will pop return address from stack
    // We fill multiple locations to catch the return no matter where SP ends up
    // The C startup code will push/pop things, so we need coverage
    // CRITICAL: RTW/WHO doors need coverage ABOVE finalSP too (up to SP+60)
    for (let offset = -64; offset < 64; offset += 4) {
      this.emulator.writeMemory32(finalSP + offset, exitTrapAddress);
    }
    console.log(
      `  Exit trap addresses: 0x${exitTrapAddress.toString(16)} from 0x${(
        finalSP - 64
      ).toString(16)} to 0x${(finalSP + 60).toString(16)}`
    );

    // NOTE: SP+0xAC already contains exit trap (0xFFFF00) from loop above
    // Bulls checks this location - leaving it as-is for now
    console.log(
      `  SP+0xAC: 0x${(finalSP + 0xac).toString(16)} contains exit trap value`
    );

    // CRITICAL: Initialize stack-based code that door expects
    // Door executes JSR (3682,A7) at PC=0x1248 (instruction 198)
    // At that time, SP=0xFDFF8, so it jumps to: 0xFDFF8 + 0xE62 = 0xFEE5A
    // JSR (d16,An) jumps TO that address, doesn't load FROM it!
    // So we need EXECUTABLE CODE at 0xFEE5A, not a pointer!
    const STACK_FN_OFFSET = 0xe62;

    // Write RTS instruction at multiple locations to cover SP variations
    // Door might have SP anywhere from finalSP-16 to finalSP+16
    for (let offset = -16; offset <= 16; offset += 2) {
      const stubAddr = finalSP + STACK_FN_OFFSET + offset;
      this.emulator.writeMemory16(stubAddr, 0x4e75); // RTS
    }
    console.log(
      `  Stack function stubs (RTS): 0x${(
        finalSP +
        STACK_FN_OFFSET -
        16
      ).toString(16)} to 0x${(finalSP + STACK_FN_OFFSET + 16).toString(16)}`
    );

    // Set SP LAST
    this.emulator.setRegister(15, finalSP); // A7 (SP)
    console.log(`  SP: 0x${finalSP.toString(16)}`);

    // DEBUG: What is the current PC after all setup?
    const currentPC = this.emulator.getRegister(16);
    console.log(`[PC-DEBUG] PC after setup: 0x${currentPC.toString(16)}`);

    // NOTE: A0 already points to argument string (set above)
    // Do NOT overwrite A0 - SAS/C startup needs it to parse argc/argv!
    // Doors will call FindPort() themselves to find AEDoorPort

    console.log(`[DoorLoader] CPU configured for door execution`);
    console.log("[DoorLoader] Door ready to execute!");

    // Verify final state before execution
    const verifyFinalSP = this.emulator.getRegister(15);
    const verifyFinalPC = this.emulator.getRegister(16);
    const verifyFinalA0 = this.emulator.getRegister(8);
    console.log(
      `[DoorLoader] Door ready: SP=0x${verifyFinalSP.toString(
        16
      )}, PC=0x${verifyFinalPC.toString(16)}, A0=0x${verifyFinalA0.toString(
        16
      )}`
    );
  }

  /**
   * Set up Bulls-specific execution
   */
  private async setupBullsExecution(): Promise<void> {
    console.log(`[BULLS-FORCE] 🔧 Initializing Bulls for proper execution`);
    console.log(
      `[BULLS-FORCE]   Bulls Code segment: 0x1000-0x4b3f (19,228 bytes)`
    );
    console.log(
      `[BULLS-FORCE]   Bulls Data segment: 0x5c00-0x8b5f (27,876 bytes)`
    );

    // CRITICAL: Allow Bulls to execute naturally from HUNK entry point 0x13E9
    // Let startup code set A4 via LEA $984,A4 instruction
    console.log(
      "[BULLS-FORCE] Allowing natural Bulls startup from HUNK entry point..."
    );

    console.log(
      `[BULLS-FORCE] ✅ Bulls execution initialized - natural startup flow`
    );
  }
}

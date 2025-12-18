import * as fs from "fs";
import * as amigafs from "../../utils/amigafs";
import path from "path";

// Performance: Verbose 68K debugging is disabled by default
// Set DEBUG_68K=1 to enable detailed execution tracing
const DEBUG_68K = process.env.DEBUG_68K === "1";

// TypeScript interface for Moira WebAssembly module

export interface MoiraModule {
  MoiraCPU: new (memSize: number) => MoiraCPU;
}

export interface MoiraCPU {
  setMemoryByte(addr: number, value: number): void;
  getMemoryByte(addr: number): number;
  loadProgram(program: Uint8Array, address: number): void;
  loadROM(romData: Uint8Array): void;
  resetCPU(): void;
  executeCycles(cycles: number): number;
  executeInstruction(): number;
  getRegister(reg: number): number;
  setRegister(reg: number, value: number): void;
  getCycles(): number;
  delete(): void;
  // Debug control (toggle at runtime)
  setDebug?(enabled: boolean): void;
  setDebugInstructions?(enabled: boolean): void;
  setDebugRegisters?(enabled: boolean): void;
  setDebugPrefetch?(enabled: boolean): void;
  setDebugMemory?(enabled: boolean): void;
  setDebugLibraryCalls?(enabled: boolean): void;
  setDebugStack?(enabled: boolean): void;
  setDebugBranches?(enabled: boolean): void;
  getDebug?(): boolean;
  getDebugInstructions?(): boolean;
  // Breakpoint control
  addBreakpoint?(addr: number): void;
  removeBreakpoint?(addr: number): void;
  clearBreakpoints?(): void;
  hasBreakpointHit?(): boolean;
  getLastBreakpoint?(): number;
  clearBreakpointHit?(): void;
  // Memory watch
  addWatchAddress?(addr: number): void;
  clearWatchAddresses?(): void;
  setWatchRange?(start: number, end: number): void;
  // Instruction counting
  setMaxInstructions?(max: number): void;
  getInstructionCount?(): number;
  resetInstructionCount?(): void;
  // Debug helpers
  getCurrentOpcode?(): number;
  dumpRegisters?(): void;
  dumpStack?(words: number): void;
  // Execution trace buffer
  enableTrace?(enabled: boolean): void;
  isTraceEnabled?(): boolean;
  clearTrace?(): void;
  dumpTrace?(): void;
  getTraceEntry?(index: number): number;
  // Memory corruption detection
  enableMemoryProtection?(start: number, end: number): void;
  disableMemoryProtection?(): void;
  isMemoryProtectionEnabled?(): boolean;
  hasCorruptionDetected?(): boolean;
  getLastCorruptedAddress?(): number;
  clearCorruptionFlag?(): void;
  // Stack monitoring
  setStackBounds?(base: number, limit: number): void;
  hasStackOverflow?(): boolean;
  getMaxStackDepth?(): number;
  clearStackOverflow?(): void;
  // Jump/call tracking
  enableCallTracking?(enabled: boolean): void;
  isCallTrackingEnabled?(): boolean;
  getCallStackDepth?(): number;
  getCallStackEntry?(index: number): number;
  getCallSite?(index: number): number;
  dumpCallStack?(): void;
  clearCallStack?(): void;
  // Wild pointer detection
  setValidMemoryRange?(start: number, end: number): void;
  hasWildAccessDetected?(): boolean;
  getLastWildAccess?(): number;
  clearWildAccessFlag?(): void;
  // Statistics
  getReadCount?(): number;
  getWriteCount?(): number;
  getJsrCount?(): number;
  getRtsCount?(): number;
  getBranchCount?(): number;
  getTrapCount?(): number;
  resetStatistics?(): void;
  dumpStatistics?(): void;

  // ========== MOIRA NATIVE DEBUGGER ==========
  // Native Breakpoints (uses Moira's built-in debugger)
  nativeSetBreakpoint?(addr: number): void;
  nativeRemoveBreakpoint?(addr: number): void;
  nativeEnableBreakpoint?(addr: number): void;
  nativeDisableBreakpoint?(addr: number): void;
  nativeClearAllBreakpoints?(): void;
  nativeBreakpointCount?(): number;
  // Native Watchpoints (memory access monitoring)
  nativeSetWatchpoint?(addr: number): void;
  nativeRemoveWatchpoint?(addr: number): void;
  nativeEnableWatchpoint?(addr: number): void;
  nativeDisableWatchpoint?(addr: number): void;
  nativeClearAllWatchpoints?(): void;
  nativeWatchpointCount?(): number;
  // Native Catchpoints (exception catching)
  nativeSetCatchpoint?(vector: number): void;
  nativeRemoveCatchpoint?(vector: number): void;
  nativeClearAllCatchpoints?(): void;
  nativeCatchpointCount?(): number;
  // Native Step Control
  nativeStepInto?(): void;
  nativeStepOver?(): void;
  // Native Instruction Logging (256-entry circular buffer)
  nativeEnableLogging?(): void;
  nativeDisableLogging?(): void;
  nativeLoggedInstructions?(): number;
  nativeClearLog?(): void;
  nativeGetLogEntryPC?(index: number): number;
  // Native Disassembler
  nativeDisassemble?(addr: number): string;
  nativeDisassembleSize?(addr: number): number;
  nativeDisassembleSR?(): string;
  // Debug Event Flags (check after execution)
  hasNativeBreakpointHit?(): boolean;
  getNativeBreakpointAddr?(): number;
  clearNativeBreakpointHit?(): void;
  hasNativeWatchpointHit?(): boolean;
  getNativeWatchpointAddr?(): number;
  clearNativeWatchpointHit?(): void;
  hasNativeCatchpointHit?(): boolean;
  getNativeCatchpointVector?(): number;
  clearNativeCatchpointHit?(): void;
  // Instruction Info
  getInstrInfo?(opcode: number): number;
}

// CPU Register indices
export enum CPURegister {
  D0 = 0,
  D1 = 1,
  D2 = 2,
  D3 = 3,
  D4 = 4,
  D5 = 5,
  D6 = 6,
  D7 = 7,
  A0 = 8,
  A1 = 9,
  A2 = 10,
  A3 = 11,
  A4 = 12,
  A5 = 13,
  A6 = 14,
  A7 = 15,
  PC = 16, // Program Counter
  SR = 17, // Status Register
}

export class MoiraEmulator {
  private module: MoiraModule | null = null;
  private cpu: MoiraCPU | null = null;

  // Wait() blocking state
  private waitingForSignal: boolean = false;
  private waitingForSignalMask: number = 0;

  // Prompt() pause/resume state
  private paused: boolean = false;
  private resumeCallback: (() => void) | null = null;

  constructor(private memorySize: number = 16 * 1024 * 1024) {} // 16MB for full 24-bit address space (Amiga standard)

  // Track CODE regions for self-modifying code support
  private codeRegions: Array<{ start: number; end: number }> = [];
  // Optional watchpoints to log writes to specific addresses
  private watchedAddresses: number[] = [];
  private watchedLogPath: string | null = null;
  private watchedOffsetsFromA4: number[] = [];

  setWatchpoints(addresses: number[], logPath?: string, offsetsFromA4: number[] = []): void {
    this.watchedAddresses = addresses;
    this.watchedOffsetsFromA4 = offsetsFromA4;
    this.watchedLogPath = logPath ?? null;
  }

  /**
   * Check whether the underlying WASM CPU has been instantiated.
   */
  isInitialized(): boolean {
    return this.cpu !== null;
  }

  /**
   * Check if CPU is blocked in Wait() call
   */
  isWaitingForSignal(): boolean {
    return this.waitingForSignal;
  }

  /**
   * Get the signal mask the CPU is waiting for
   */
  getWaitingSignalMask(): number {
    return this.waitingForSignalMask;
  }

  /**
   * Set Wait() blocking state
   * When true, execution loop should pause
   */
  setWaitingForSignal(waiting: boolean, signalMask: number): void {
    this.waitingForSignal = waiting;
    this.waitingForSignalMask = signalMask;
    if (waiting) {
      console.log(
        `[MoiraEmulator] CPU now BLOCKED in Wait(0x${signalMask.toString(16)})`
      );
    } else {
      console.log(`[MoiraEmulator] CPU RESUMED from Wait()`);
    }
  }

  /**
   * Check if emulator is paused waiting for async input
   */
  isPaused(): boolean {
    return this.paused;
  }

  /**
   * Pause emulator execution (for async input handling)
   * @param resumeCallback Called when resume() is invoked
   */
  pause(resumeCallback?: () => void): void {
    this.paused = true;
    this.resumeCallback = resumeCallback || null;
    console.log("[MoiraEmulator] Emulator PAUSED (waiting for async input)");
  }

  /**
   * Resume emulator execution after pause
   */
  resume(): void {
    console.log("[MoiraEmulator] Emulator RESUMING from pause");
    this.paused = false;
    if (this.resumeCallback) {
      const callback = this.resumeCallback;
      this.resumeCallback = null;
      callback();
    }
  }

  async initialize(): Promise<void> {
    // Load the WASM module
    const candidates = [
      path.join(__dirname, "build", "moira.js"),
      path.resolve(
        __dirname,
        "..",
        "..",
        "..",
        "src",
        "amiga-emulation",
        "cpu",
        "build",
        "moira.js"
      ),
      path.resolve(
        process.cwd(),
        "src",
        "amiga-emulation",
        "cpu",
        "build",
        "moira.js"
      ),
    ];
    let moiraPath = "";
    let createMoiraModule: any = null;
    for (const candidate of candidates) {
      if (amigafs.existsSync(candidate)) {
        moiraPath = candidate;
        createMoiraModule = require(candidate);
        break;
      }
    }
    if (!createMoiraModule) {
      throw new Error(
        `Failed to locate moira.js. Tried: ${candidates.join(", ")}`
      );
    }
    this.module = await createMoiraModule();
    if (!this.module) throw new Error("Failed to load Moira module");
    this.cpu = new this.module.MoiraCPU(this.memorySize);
    console.log(`[MoiraEmulator] moira.js loaded from ${moiraPath}`);
    // Don't reset yet - wait until ROM is loaded
  }

  loadROM(romData: Uint8Array): void {
    if (!this.cpu || !this.module) throw new Error("Emulator not initialized");

    // Convert Uint8Array to Emscripten vector
    const vec = new (this.module as any).VectorUint8();
    for (let i = 0; i < romData.length; i++) {
      vec.push_back(romData[i]);
    }

    this.cpu.loadROM(vec);
    vec.delete();

    console.log(`[MoiraEmulator] ROM loaded (${romData.length} bytes)`);
    console.log(`[MoiraEmulator] ROM mapped to 0xF80000-0xFFFFFF`);
    console.log(`[MoiraEmulator] Exception vectors copied to 0x000000`);
  }

  loadProgram(binary: Uint8Array, address: number = 0x1000): void {
    if (!this.cpu || !this.module) throw new Error("Emulator not initialized");

    // Convert Uint8Array to Emscripten vector
    const vec = new (this.module as any).VectorUint8();
    for (let i = 0; i < binary.length; i++) {
      vec.push_back(binary[i]);
    }

    this.cpu.loadProgram(vec, address);
    vec.delete(); // Clean up the temporary vector
  }

  execute(cycles: number = 1000): number {
    if (!this.cpu) throw new Error("Emulator not initialized");
    // Log first 5 execute calls to debug
    if (!this.executeCallCount) this.executeCallCount = 0;
    this.executeCallCount++;
    if (this.executeCallCount <= 5) {
      const pc = this.cpu.getRegister(16);
      const sp = this.cpu.getRegister(15);
      console.log(
        `[MoiraEmulator] execute() call #${
          this.executeCallCount
        }: PC=0x${pc.toString(16)}, SP=0x${sp.toString(16)}, cycles=${cycles}`
      );
    }
    return this.cpu.executeCycles(cycles);
  }

  /**
   * Execute exactly ONE instruction (returns cycles consumed)
   * CRITICAL: This is the proper way to execute instructions at instruction boundaries.
   * It calls MOIRA's execute() with NO parameters, which executes exactly one complete
   * instruction regardless of how many CPU cycles it requires.
   *
   * This is the ROOT solution for:
   * - Ensuring multi-cycle instructions (DBRA, MOVEM, MULU, etc.) complete fully
   * - Allowing library trap checks between every instruction
   * - Preventing mid-batch JSR execution bugs
   */
  executeInstruction(): number {
    if (!this.cpu) throw new Error("Emulator not initialized");

    // DEBUG: Verify method exists
    if (typeof (this.cpu as any).executeInstruction !== "function") {
      console.error(
        "[MoiraEmulator] CRITICAL: executeInstruction() method not found on WASM CPU!"
      );
      console.error(
        "[MoiraEmulator] Available methods:",
        Object.keys(this.cpu)
      );
      console.error("[MoiraEmulator] Falling back to execute(20)");
      return (this.cpu as any).executeCycles(20);
    }

    return this.cpu.executeInstruction();
  }

  private executeCallCount?: number;

  reset(): void {
    if (!this.cpu) throw new Error("Emulator not initialized");
    this.cpu.resetCPU();
  }

  getRegister(reg: CPURegister): number {
    if (!this.cpu) throw new Error("Emulator not initialized");
    const value = this.cpu.getRegister(reg);

    // CRITICAL: Mask PC to 24-bit address space (0x000000 - 0xFFFFFF)
    // Moira can return values outside this range during batch execution
    if (reg === CPURegister.PC) {
      return value & 0xffffff;
    }

    return value;
  }

  setRegister(reg: CPURegister, value: number): void {
    if (!this.cpu) throw new Error("Emulator not initialized");
    // DEBUG: Log D0 sets
    if (reg === 0 && value === 0x20000) {
      console.log(
        `[MoiraEmulator.ts] setRegister(D0, 0x${value.toString(16)}) called`
      );
    }
    this.cpu.setRegister(reg, value);
    if (reg === 0 && value === 0x20000) {
      const verify = this.cpu.getRegister(0);
      console.log(
        `[MoiraEmulator.ts] After setRegister, getRegister(D0) returns: 0x${verify.toString(
          16
        )}`
      );
    }
  }

  readMemory(address: number): number {
    if (!this.cpu) throw new Error("Emulator not initialized");
    return this.cpu.getMemoryByte(address);
  }

  writeMemory(address: number, value: number): void {
    if (!this.cpu) throw new Error("Emulator not initialized");

    // DEBUG: Catch writes to debug marker address 0xDEB000-0xDEB003
    if (address >= 0xdeb000 && address <= 0xdeb003) {
      console.log(`[DEBUG-MARKER] Write to 0x${address.toString(16)} = 0x${value.toString(16).padStart(2, '0')}`);
    }

    // ULTRATHINK: Detect writes to ROM region (0xF80000-0xFFFFFF)
    // ROM should be READ-ONLY! Any writes indicate a bug
    if (address >= 0xf80000 && address <= 0xffffff) {
      console.error(`!!! ROM WRITE DETECTED !!!`);
      console.error(`  Address: 0x${address.toString(16)}`);
      console.error(`  Value: 0x${value.toString(16)}`);
      console.error(`  Stack trace:`);
      console.trace();
      // Allow write for now to see what happens, but log it
    }

    // SELF-MODIFYING CODE SUPPORT: Check if writing to code region
    // Only check during execution (PC > 0), not during HUNK loading
    const pc = this.getRegister(16);
    if (pc > 0) {
      const isCodeWrite = this.isCodeAddress(address);
      if (isCodeWrite) {
        // If writing to code near PC (within 64KB), refill prefetch queue
        if (Math.abs(address - pc) < 0x10000) {
          console.log(`[Self-Mod Code] Write to code at 0x${address.toString(16)}, PC=0x${pc.toString(16)} - refilling prefetch`);
          this.cpu.setMemoryByte(address, value);
          this.refillPrefetch(); // Invalidate instruction cache
          return;
        }
      }
    }

    this.cpu.setMemoryByte(address, value);

    // Watchpoint logging for debugging tricky doors (e.g., Bulls counters)
    if (this.watchedAddresses.length > 0 || this.watchedOffsetsFromA4.length > 0) {
      const a4 = this.getRegister(CPURegister.A4);
      const targets = new Set<number>(this.watchedAddresses);
      for (const off of this.watchedOffsetsFromA4) {
        targets.add(a4 + off);
      }
      if (targets.has(address)) {
        const msg = `[MoiraEmulator][WATCH] write @0x${address.toString(
          16
        )} = 0x${(value & 0xff).toString(16)} PC=0x${pc.toString(
          16
        )} A4=0x${a4.toString(16)}\n`;
        if (this.watchedLogPath) {
          try {
            fs.appendFileSync(this.watchedLogPath, msg, { encoding: "utf8" });
          } catch {
            /* ignore logging errors */
          }
        } else {
          console.log(msg.trimEnd());
        }
      }
    }
  }

  /**
   * Register a code region for self-modifying code detection
   */
  registerCodeRegion(start: number, size: number): void {
    const end = start + size - 1;
    this.codeRegions.push({ start, end });
    console.log(`[Self-Mod Code] Registered CODE region: 0x${start.toString(16)}-0x${end.toString(16)} (${size} bytes)`);
  }

  /**
   * Check if an address is in a code region
   */
  private isCodeAddress(addr: number): boolean {
    for (const region of this.codeRegions) {
      if (addr >= region.start && addr <= region.end) {
        return true;
      }
    }
    return false;
  }

  getCycles(): number {
    if (!this.cpu) throw new Error("Emulator not initialized");
    return this.cpu.getCycles();
  }

  // Helper methods for 16-bit and 32-bit memory access
  readMemory16(address: number): number {
    const high = this.readMemory(address);
    const low = this.readMemory(address + 1);
    return (high << 8) | low;
  }

  readMemory32(address: number): number {
    const high = this.readMemory16(address);
    const low = this.readMemory16(address + 2);
    const value = ((high << 16) | low) >>> 0; // Unsigned 32-bit

    // DEBUG: Track reads from 0xf0081 to see when it returns garbage
    if (address === 0xf0081) {
      console.log(`[MEMORY-READ] readMemory32(0xf0081) = 0x${value.toString(16).padStart(8, '0')}`);
      if (value === 0xfffec8) {
        console.error(`[MEMORY-READ] ERROR: Got garbage value 0xfffec8 instead of 0x77686f00!`);
      }
    }

    return value;
  }

  writeMemory16(address: number, value: number): void {
    this.writeMemory(address, (value >> 8) & 0xff);
    this.writeMemory(address + 1, value & 0xff);
  }

  writeMemory32(address: number, value: number): void {
    this.writeMemory16(address, (value >> 16) & 0xffff);
    this.writeMemory16(address + 2, value & 0xffff);
  }

  /**
   * Write a buffer to memory efficiently (bulk write)
   * Optimized for large data transfers (file I/O, etc.) - avoids per-byte overhead
   * @param address Starting address in emulator memory
   * @param buffer Buffer containing data to write
   */
  writeMemoryBuffer(address: number, buffer: Buffer): void {
    if (!this.cpu) throw new Error("Emulator not initialized");

    // Quick bounds check for ROM region (single check for entire buffer)
    const endAddr = address + buffer.length - 1;
    if (address >= 0xf80000 || endAddr >= 0xf80000) {
      console.error(`!!! ROM WRITE DETECTED (bulk) !!! Range: 0x${address.toString(16)}-0x${endAddr.toString(16)}`);
    }

    // Direct bulk write without per-byte overhead
    for (let i = 0; i < buffer.length; i++) {
      this.cpu.setMemoryByte(address + i, buffer[i]);
    }
  }

  /**
   * Read a null-terminated string from memory
   * @param address Starting address
   * @param maxLength Maximum length to read (default 256)
   * @returns The string read from memory
   */
  readString(address: number, maxLength: number = 256): string {
    const bytes: number[] = [];
    for (let i = 0; i < maxLength; i++) {
      const byte = this.readMemory(address + i);
      if (byte === 0) break; // Null terminator
      bytes.push(byte);
    }
    return String.fromCharCode(...bytes);
  }

  /**
   * Write a null-terminated string to memory
   * @param address Starting address
   * @param str String to write
   */
  writeString(address: number, str: string): void {
    for (let i = 0; i < str.length; i++) {
      this.writeMemory(address + i, str.charCodeAt(i));
    }
    this.writeMemory(address + str.length, 0); // Null terminator
  }

  /**
   * Refill the instruction prefetch queue
   * CRITICAL: Must be called after changing PC to ensure Moira executes the correct instruction!
   */
  refillPrefetch(): void {
    if (!this.cpu) throw new Error("Emulator not initialized");
    // Call refillPrefetch on WASM CPU if available
    // TypeScript doesn't have type definitions for this C++ method
    if (typeof (this.cpu as any).refillPrefetch === "function") {
      if (DEBUG_68K) {
        const pcBefore = this.cpu.getRegister(16);
        console.log(`[MOIRA] refillPrefetch() called at PC=0x${pcBefore.toString(16)}`);
      }
      (this.cpu as any).refillPrefetch();
    } else {
      console.warn(`[MOIRA] refillPrefetch() not available in WASM module!`);
    }
  }

  /**
   * Set library trap handler
   */
  private libraryTrapHandler: ((pc: number) => boolean) | null = null;

  setLibraryTrapHandler(handler: (pc: number) => boolean): void {
    this.libraryTrapHandler = handler;
    console.log("[MoiraEmulator] Library trap handler registered");
  }

  /**
   * Handle ILLEGAL instruction (0x4AFC).
   * This is called by the main execution loop when ILLEGAL is detected.
   */
  handleIllegal(pc: number): boolean {
    if (DEBUG_68K) {
      console.log(
        `[MoiraEmulator] *** ILLEGAL instruction detected at PC=0x${pc.toString(
          16
        )} ***`
      );
    }

    if (this.libraryTrapHandler) {
      const handled = this.libraryTrapHandler(pc);
      if (handled) {
        if (DEBUG_68K) {
          console.log("[MoiraEmulator] ✅ Library trap handled by LibraryTraps");
        }
        this.refillPrefetch();
        return true;
      }
    }

    // Fallback: Simulate RTS with D0=0 for unhandled ILLEGAL
    if (DEBUG_68K) {
      console.log(
        "[MoiraEmulator] Unhandled ILLEGAL - simulating RTS (D0=0)"
      );
    }
    this.setRegister(CPURegister.D0, 0);

    // Pop return address and continue
    const sp = this.getRegister(CPURegister.A7);
    const returnAddr = this.readMemory32(sp);
    this.setRegister(CPURegister.A7, sp + 4);
    this.setRegister(CPURegister.PC, returnAddr);
    this.refillPrefetch();

    return true;
  }

  /**
   * Handle ILLEGAL instruction (0x4AFC)
   * Routes to LibraryTraps when PC is at library vector address
   */
  private handleIllegalInstruction(): boolean {
    if (!this.libraryTrapHandler) {
      console.log(
        "[MoiraEmulator] ILLEGAL instruction - no library trap handler"
      );
      return false;
    }

    const pc = this.getRegister(CPURegister.PC);
    console.log(
      `[MoiraEmulator] ILLEGAL instruction at PC=0x${pc.toString(16)}`
    );

    // Route to LibraryTraps
    const handled = this.libraryTrapHandler(pc);
    if (handled) {
      console.log("[MoiraEmulator] Library trap handled");
      return true;
    }

    // Default ILLEGAL handling - simulate RTS
    console.log("[MoiraEmulator] ILLEGAL - simulating RTS (D0=0)");
    this.setRegister(CPURegister.D0, 0);

    // Pop return address and continue
    const sp = this.getRegister(CPURegister.A7);
    const returnAddr = this.readMemory32(sp);
    this.setRegister(CPURegister.A7, sp + 4);
    this.setRegister(CPURegister.PC, returnAddr);
    this.refillPrefetch();

    return true;
  }

  cleanup(): void {
    if (this.cpu) {
      this.cpu.delete();
      this.cpu = null;
    }
  }
}
